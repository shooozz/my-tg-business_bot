"""Canboso Buyer API v2.2.0 provider.

Real spec: https://canboso.com/api/swagger/ (loaded via swagger-ui-init.js).
Endpoints live under /api/v2/telegram-buyer/. Auth is the buyer key
(a tgb_... value) sent either as the x-buyer-key header or the `key`
query parameter. Prices come back in VND or USD depending on the wallet
mode tied to the key; we normalize to USDT for dedup and markup.
"""
import asyncio
import time
from typing import List, Dict, Any, Optional
from urllib.parse import quote

import httpx

from .base import BaseProvider, ProviderError, Product, Order


def _accounts_to_text(delivery: Dict[str, Any]) -> str:
    """Render Canboso delivery.accounts[] as readable text for the customer."""
    accs = (delivery or {}).get('accounts') or []
    if not accs:
        return ''
    blocks = []
    for a in accs:
        lines = []
        if a.get('user'):
            lines.append(f"Логин: {a['user']}")
        if a.get('password'):
            lines.append(f"Пароль: {a['password']}")
        if a.get('verifyEmail'):
            lines.append(f"Почта восстановления: {a['verifyEmail']}")
        if a.get('expiryText'):
            lines.append(f"Срок: {a['expiryText']}")
        if a.get('otherInfo'):
            lines.append(a['otherInfo'])
        blocks.append('\n'.join(lines))
    return '\n---\n'.join(blocks)


class CanbosoProvider(BaseProvider):
    """Canboso Buyer API provider."""

    def __init__(self, api_key: str, config: Dict[str, Any] = None):
        super().__init__(api_key, config)
        self.base_url = 'https://canboso.com'
        self.http = httpx.AsyncClient(timeout=40)
        self._rate_state = {'get': 0.0, 'post': 0.0}
        self._lock = asyncio.Lock()

    @property
    def rate_limits(self) -> Dict[str, float]:
        # 30 req/min per buyer key on GET buckets -> 2.0s spacing.
        # 60 req/min on purchase -> 1.0s spacing. Be conservative.
        return {'get': 2.0, 'post': 1.0}

    async def _request(self, method: str, path: str, body: Dict = None,
                       idempotency_key: str = None) -> Dict:
        async with self._lock:
            bucket = 'post' if method == 'POST' else 'get'
            wait = self._rate_state[bucket] - time.time()
            if wait > 0:
                await asyncio.sleep(wait)
            self._rate_state[bucket] = time.time() + self.rate_limits[bucket]

            headers = {'x-buyer-key': self.api_key}
            if idempotency_key:
                headers['Idempotency-Key'] = idempotency_key

            params = body if method == 'GET' else None
            json_body = body if method != 'GET' else None

            try:
                r = await self.http.request(
                    method,
                    f'{self.base_url}{path}',
                    headers=headers,
                    params=params,
                    json=json_body,
                )
            except httpx.HTTPError as e:
                raise ProviderError('network_error', True, 60, str(e))

            if r.status_code >= 400:
                try:
                    error_data = r.json()
                    code = error_data.get('code') or error_data.get('message') or 'supplier_error'
                except ValueError:
                    code = 'supplier_error'

                delay = max(12, int(r.headers.get('Retry-After', '12')))
                if r.status_code == 429:
                    self._rate_state[bucket] = time.time() + delay
                    code = 'rate_limited'

                retry = r.status_code in (429, 500, 502, 503, 504) or code == 'rate_limited'
                raise ProviderError(code, retry, delay, r.text)

            return r.json()

    async def get_products(self) -> List[Product]:
        """Fetch all products from Canboso and normalize prices to USDT."""
        from ..db import setting as _setting

        vnd_to_usdt = float(_setting('vnd_to_usdt_rate', '0.00004'))

        data = await self._request('GET', '/api/v2/telegram-buyer/products',
                                   body={'key': self.api_key})

        products = []
        items = data.get('products', []) if isinstance(data, dict) else []

        for p in items:
            price_obj = p.get('price', {}) or {}
            amount = float(price_obj.get('amount', 0) or 0)
            currency = (price_obj.get('currency') or 'USD').upper()
            if currency == 'VND':
                price_usdt = round(amount * vnd_to_usdt, 4)
            else:  # USD ≈ USDT
                price_usdt = round(amount, 4)

            avail = p.get('availability', {}) or {}
            # null availability means the supplier does not count stock.
            available = 100 if avail.get('available') is None else int(avail.get('available') or 0)
            in_stock = available > 0

            product_id = p.get('productId') or p.get('id') or ''
            req = p.get('purchaseRequirements') or {}
            if req.get('slotMonths'):
                continue  # needs slot_months input the bots don't collect yet
            ptype = (p.get('productType') or 'account').lower()

            products.append(Product(
                code=product_id,
                name=p.get('name', 'Без названия'),
                description=p.get('description', '') or '',
                price_usdt=price_usdt,
                category=_canboso_category(p),
                in_stock=in_stock,
                min_quantity=1,
                max_quantity=max(1, available) if available else 1,
                provider_data={
                    **p,
                    'available': available,
                    'delivery_type': 'automatic' if ptype == 'account' else 'manual',
                    'image': f"{self.base_url}{p['image']}" if str(p.get('image', '')).startswith('/') else p.get('image', ''),
                    'price_usdt_normalized': price_usdt,
                    'currency': currency,
                    'purchase_requirements': req,
                },
            ))

        return products

    async def create_order(self, product_code: str, quantity: int,
                           customer_data: Dict[str, Any]) -> Order:
        """Purchase via Canboso. customer_data carries buyer_input and slot fields."""
        body: Dict[str, Any] = {
            'key': self.api_key,
            'product_id': product_code,
            'quantity': quantity,
        }
        # The bot collects buyer data in Jaha's buyer_input shape; translate it.
        items = (customer_data.get('buyer_input') or {}).get('items') or []
        email = next((i.get('email') for i in items if i.get('email')), None)
        if email and 'customer_email' not in customer_data:
            customer_data = {**customer_data, 'customer_email': email}
        accounts = [i.get('text') or i.get('email') for i in items if i.get('text') or i.get('email')]
        if accounts and len(accounts) == quantity and 'customer_accounts' not in customer_data:
            customer_data = {**customer_data, 'customer_accounts': accounts}
        if 'customer_email' in customer_data:
            body['customer_email'] = customer_data['customer_email']
        if 'slot_months' in customer_data:
            body['slot_months'] = customer_data['slot_months']
        if 'customer_accounts' in customer_data:
            body['customer_accounts'] = customer_data['customer_accounts']

        idempotency_key = customer_data.get('order_id') or ''
        data = await self._request('POST', '/api/v2/telegram-buyer/purchase',
                                   body=body, idempotency_key=idempotency_key)

        order_data = data.get('order', data)
        payment = data.get('payment') or {}
        delivery = data.get('delivery') or {}
        delivery_text = _accounts_to_text(delivery)
        instructions = ''
        if payment.get('amountText'):
            instructions = f"Оплачено: {payment.get('amountText')}"

        return Order(
            order_number=str(order_data.get('orderCode') or order_data.get('order_id', '')),
            status=self.normalize_status(order_data.get('status', 'pending')),
            delivery=delivery_text,
            instructions=instructions,
            provider_data=data,
        )

    async def get_order(self, order_number: str) -> Order:
        """Look up a single order by orderCode via the history endpoint."""
        data = await self._request('GET', '/api/v2/telegram-buyer/orders',
                                   body={'key': self.api_key, 'orderCode': order_number})
        orders = data.get('orders', []) if isinstance(data, dict) else []
        if not orders:
            raise ProviderError('order_not_found', False, 60, f'No order {order_number}')
        o = orders[0]
        return Order(
            order_number=str(o.get('orderCode') or order_number),
            status=self.normalize_status(o.get('status', 'processing')),
            delivery=None,
            instructions=None,
            provider_data=o,
        )

    async def get_balance(self) -> float:
        """Get wallet balance; returns USDT-equivalent for dashboard comparison."""
        from ..db import setting as _setting
        vnd_to_usdt = float(_setting('vnd_to_usdt_rate', '0.00004'))

        data = await self._request('GET', '/api/v2/telegram-buyer/balance',
                                   body={'key': self.api_key})
        currency = (data.get('walletCurrency') or 'USD').upper()
        balance = float(data.get('balance') or 0)
        if currency == 'VND':
            return round(balance * vnd_to_usdt, 4)
        return round(balance, 4)

    def normalize_status(self, provider_status: str) -> str:
        """Map Canboso statuses to unified statuses."""
        s = (provider_status or '').lower()
        canboso_map = {
            'pending': 'pending',
            'created': 'pending',
            'paid': 'processing',
            'processing': 'processing',
            'waiting_seller': 'processing',
            'in_progress': 'processing',
            'delivered': 'completed',
            'completed': 'completed',
            'success': 'completed',
            'invited': 'completed',
            'failed': 'failed',
            'error': 'failed',
            'cancelled': 'failed',
            'canceled': 'failed',
            'refunded': 'refunded',
            'refund': 'refunded',
        }
        return canboso_map.get(s, 'processing')


def _canboso_category(p: Dict[str, Any]) -> str:
    """Derive a category name from a Canboso product."""
    pt = (p.get('productType') or '').lower()
    if pt == 'slot':
        return 'Слоты'
    if pt == 'upgrade_account':
        return 'Прокачка аккаунтов'
    return 'Аккаунты'
