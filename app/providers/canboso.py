"""Canboso API provider implementation."""
import asyncio
import time
from typing import List, Dict, Any

import httpx

from .base import BaseProvider, ProviderError, Product, Order


class CanbosoProvider(BaseProvider):
    """Canboso API provider."""

    def __init__(self, api_key: str, config: Dict[str, Any] = None):
        super().__init__(api_key, config)
        self.base_url = 'https://canboso.com/api'
        self.http = httpx.AsyncClient(timeout=40)
        self._rate_state = {'get': 0.0, 'post': 0.0}
        self._lock = asyncio.Lock()

    @property
    def rate_limits(self) -> Dict[str, float]:
        # Conservative defaults - adjust based on Canboso documentation
        return {'get': 1.0, 'post': 2.0}

    async def _request(self, method: str, path: str, body: Dict = None):
        """Make rate-limited request to Canboso API."""
        async with self._lock:
            bucket = 'post' if method == 'POST' else 'get'
            wait = self._rate_state[bucket] - time.time()
            if wait > 0:
                await asyncio.sleep(wait)
            self._rate_state[bucket] = time.time() + self.rate_limits[bucket]

            headers = {'Authorization': f'Bearer {self.api_key}'}

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
                    error_data = r.json()
                    code = error_data.get('code') or error_data.get('error', 'supplier_error')
                except ValueError:
                    code = 'supplier_error'

                delay = max(60, int(r.headers.get('Retry-After', '60')))
                if r.status_code == 429:
                    self._rate_state[bucket] = time.time() + delay

                retry = r.status_code in (429, 500, 502, 503, 504)
                raise ProviderError(code, retry, delay, r.text)

            return r.json()

    async def get_products(self) -> List[Product]:
        """
        Fetch all products from Canboso.
        NOTE: Adjust endpoint and response structure based on actual Canboso API documentation.
        """
        # Placeholder - adjust based on actual API
        data = await self._request('GET', '/products')

        products = []
        items = data.get('products', []) if isinstance(data, dict) else data

        for p in items:
            products.append(Product(
                code=p.get('id') or p.get('code') or str(p.get('product_id', '')),
                name=p.get('name', 'Unnamed Product'),
                description=p.get('description', ''),
                price_usdt=float(p.get('price', 0)),
                category=p.get('category', 'Другое'),
                in_stock=p.get('available', True),
                min_quantity=p.get('min_quantity', 1),
                max_quantity=p.get('max_quantity', 1),
                provider_data=p
            ))

        return products

    async def create_order(self, product_code: str, quantity: int, customer_data: Dict[str, Any]) -> Order:
        """
        Create order via Canboso.
        NOTE: Adjust payload structure based on actual Canboso API documentation.
        """
        body = {
            'product_id': product_code,
            'quantity': quantity,
            **customer_data
        }

        data = await self._request('POST', '/orders', body)

        # Adjust based on actual response structure
        order_data = data.get('order', data)

        return Order(
            order_number=str(order_data.get('id') or order_data.get('order_id', '')),
            status=self.normalize_status(order_data.get('status', 'pending')),
            delivery=order_data.get('delivery') or order_data.get('delivery_info'),
            instructions=order_data.get('instructions') or order_data.get('notes'),
            provider_data=order_data
        )

    async def get_order(self, order_number: str) -> Order:
        """Get order status from Canboso."""
        data = await self._request('GET', f'/orders/{order_number}')

        order_data = data.get('order', data)

        return Order(
            order_number=str(order_data.get('id') or order_data.get('order_id', '')),
            status=self.normalize_status(order_data.get('status', 'processing')),
            delivery=order_data.get('delivery') or order_data.get('delivery_info'),
            instructions=order_data.get('instructions') or order_data.get('notes'),
            provider_data=order_data
        )

    async def get_balance(self) -> float:
        """Get balance from Canboso."""
        try:
            data = await self._request('GET', '/account/balance')
            return float(data.get('balance', 0))
        except ProviderError:
            # If balance endpoint doesn't exist, return 0
            return 0.0

    def normalize_status(self, provider_status: str) -> str:
        """Map Canboso statuses to unified statuses."""
        canboso_map = {
            'pending': 'pending',
            'created': 'pending',
            'processing': 'processing',
            'in_progress': 'processing',
            'delivered': 'completed',
            'completed': 'completed',
            'success': 'completed',
            'failed': 'failed',
            'error': 'failed',
            'cancelled': 'failed',
            'canceled': 'failed',
            'refunded': 'refunded',
            'refund': 'refunded',
        }
        return canboso_map.get(provider_status.lower(), 'processing')
