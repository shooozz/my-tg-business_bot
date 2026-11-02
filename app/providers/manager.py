"""Provider manager for handling multiple suppliers."""
import os
from typing import Dict, Optional, List

from .base import BaseProvider, Product, Order, ProviderError
from .jaha import JahaProvider
from .canboso import CanbosoProvider


class ProviderManager:
    """Manages multiple API providers."""

    def __init__(self):
        self.providers: Dict[str, BaseProvider] = {}
        self.default_provider: Optional[str] = None
        self._load_providers()

    def _load_providers(self):
        """Load providers from environment variables."""
        # Jaha provider
        jaha_key = os.getenv('JAHA_API_KEY')
        if jaha_key:
            self.providers['jaha'] = JahaProvider(jaha_key)
            if not self.default_provider:
                self.default_provider = 'jaha'

        # Canboso provider
        canboso_key = os.getenv('CANBOSO_API_KEY')
        if canboso_key:
            self.providers['canboso'] = CanbosoProvider(canboso_key)
            if not self.default_provider:
                self.default_provider = 'canboso'

    def get_provider(self, name: Optional[str] = None) -> BaseProvider:
        """Get provider by name or default."""
        provider_name = name or self.default_provider
        if not provider_name or provider_name not in self.providers:
            raise ValueError(f'Provider not configured: {provider_name}')
        return self.providers[provider_name]

    def list_providers(self) -> Dict[str, Dict[str, any]]:
        """List all configured providers with their status."""
        return {
            name: {
                'name': name,
                'enabled': True,
                'is_default': name == self.default_provider
            }
            for name in self.providers
        }

    async def get_all_products(self) -> Dict[str, List[Product]]:
        """Fetch products from all providers."""
        result = {}
        for name, provider in self.providers.items():
            try:
                result[name] = await provider.get_products()
            except ProviderError as e:
                # Log error but continue with other providers
                result[name] = []
        return result

    async def get_products(self, provider_name: Optional[str] = None) -> List[Product]:
        """Get products from specific or default provider."""
        provider = self.get_provider(provider_name)
        return await provider.get_products()

    async def create_order(self, product_code: str, quantity: int, customer_data: Dict,
                          provider_name: Optional[str] = None) -> tuple[str, Order]:
        """Create order with specific or default provider."""
        provider = self.get_provider(provider_name)
        order = await provider.create_order(product_code, quantity, customer_data)
        return provider.name, order

    async def get_order(self, provider_name: str, order_number: str) -> Order:
        """Get order status from specific provider."""
        provider = self.get_provider(provider_name)
        return await provider.get_order(order_number)

    async def get_balance(self, provider_name: Optional[str] = None) -> float:
        """Get balance from specific or default provider."""
        provider = self.get_provider(provider_name)
        return await provider.get_balance()

    async def get_all_balances(self) -> Dict[str, float]:
        """Get balances from all providers."""
        result = {}
        for name, provider in self.providers.items():
            try:
                result[name] = await provider.get_balance()
            except ProviderError:
                result[name] = 0.0
        return result


# Global instance
_manager: Optional[ProviderManager] = None


def get_manager() -> ProviderManager:
    """Get or create global provider manager instance."""
    global _manager
    if _manager is None:
        _manager = ProviderManager()
    return _manager
