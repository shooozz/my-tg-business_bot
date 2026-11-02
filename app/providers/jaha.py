"""Jaha Digital Shop provider implementation."""
import asyncio
import time
from typing import List, Dict, Any
from urllib.parse import quote

import httpx

from .base import BaseProvider, ProviderError, Product, Order


class JahaProvider(BaseProvider):
    """Jaha API provider."""

    def __init__(self, api_key: str, config: Dict[str, Any] = None):
        super().__init__(api_key, config)
        self.base_url = 'https://api.jahadigital.shop/v1'
        self.http = httpx.AsyncClient(timeout=40)
        self._rate_state = {'get': 0.0, 'post': 0.0}
        self._lock = asyncio.Lock()

    @property
    def rate_limits(self) -> Dict[str, float]:
        return {'get': 0.65, 'post': 6.2}

    async def _request(self, method: str, path: str, body: Dict = None, idempotency_key: str = None):
        """Make rate-limited request to Jaha API."""
        async with self._lock:
            bucket = 'post' if method == 'POST' else 'get'
            wait = self._rate_state[bucket] - time.time()
            if wait > 0:
                await asyncio.sleep(wait)
            self._rate_state[bucket] = time.time() + self.rate_limits[bucket]

            headers = {'Authorization': f'Bearer {self.api_key}'}
            if idempotency_key:
                headers['Idempotency-Key'] = idempotency_key

            try:
                r = await self.http.request(
                    method,
                    f'{self.base_url}{path}',
                    headers=headers,
                    json=body
                )
            except httpx.HTTPError as e:
                raise ProviderError('network_error', True, 60, str(e))

            if r.status_code >= 400:
                try:
                    code = r.json().get('code', 'supplier_error')
                except ValueError:
                    code = 'supplier_error'

                delay = max(60, int(r.headers.get('Retry-After', '60')))
                if r.status_code == 429:
                    self._rate_state[bucket] = time.time() + delay

                retry = r.status_code in (429, 500, 502, 503, 504) or code in (
                    'request_in_progress',
                    'insufficient_balance'
                )
                raise ProviderError(code, retry, delay, r.text)

            return r.json()

    async def get_products(self) -> List[Product]:
        """Fetch all products from Jaha."""
        cursor, products = None, []

        while True:
            path = '/products?limit=100&current_only=true'
            if cursor:
                path += f'&cursor={quote(cursor, safe="")}'

            page = await self._request('GET', path)

            for p in page['products']:
                products.append(Product(
                    code=p['code'],
                    name=p['name'],
                    description=p.get('description', ''),
                    price_usdt=float(p['price_usdt']),
                    category=p.get('category', 'Другое'),
                    in_stock=p.get('in_stock', True),
                    min_quantity=p.get('min_quantity', 1),
                    max_quantity=p.get('max_quantity', 1),
                    provider_data=p
                ))

            cursor = page.get('next_cursor')
            if not cursor:
                break

        return products

    async def create_order(self, product_code: str, quantity: int, customer_data: Dict[str, Any]) -> Order:
        """Create order via Jaha."""
        body = {
            'product_code': product_code,
            'quantity': quantity,
            **customer_data
        }

        idempotency_key = customer_data.get('order_id', '')
        data = await self._request('POST', '/orders', body, idempotency_key)
        order_data = data['order']

        return Order(
            order_number=order_data['order_number'],
            status=self.normalize_status(order_data['status']),
            delivery=order_data.get('delivery'),
            instructions=order_data.get('instructions'),
            provider_data=order_data
        )

    async def get_order(self, order_number: str) -> Order:
        """Get order status from Jaha."""
        path = f'/orders/{quote(order_number, safe="")}?include_additions=true'
        data = await self._request('GET', path)
        order_data = data['order']

        return Order(
            order_number=order_data['order_number'],
            status=self.normalize_status(order_data['status']),
            delivery=order_data.get('delivery'),
            instructions=order_data.get('instructions'),
            provider_data=order_data
        )

    async def get_balance(self) -> float:
        """Get USDT balance from Jaha."""
        data = await self._request('GET', '/account')
        return float(data['account']['balance_usdt'])

    def normalize_status(self, provider_status: str) -> str:
        """Map Jaha statuses to unified statuses."""
        jaha_map = {
            'invoice': 'pending',
            'paid': 'processing',
            'processing': 'processing',
            'manual_review': 'processing',
            'partially_completed': 'processing',
            'completed': 'completed',
            'failed': 'failed',
            'cancelled': 'failed',
            'refunded': 'refunded',
        }
        return jaha_map.get(provider_status.lower(), 'processing')
