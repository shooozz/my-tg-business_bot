"""Base provider interface for all supplier APIs."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Dict, Any, List


@dataclass
class Product:
    """Unified product representation."""
    code: str
    name: str
    description: str
    price_usdt: float
    category: str
    in_stock: bool
    min_quantity: int = 1
    max_quantity: int = 1
    provider_data: Dict[str, Any] = None

    def __post_init__(self):
        if self.provider_data is None:
            self.provider_data = {}


@dataclass
class Order:
    """Unified order representation."""
    order_number: str
    status: str  # pending, processing, completed, failed, refunded
    delivery: Optional[str] = None
    instructions: Optional[str] = None
    provider_data: Dict[str, Any] = None

    def __post_init__(self):
        if self.provider_data is None:
            self.provider_data = {}


class ProviderError(Exception):
    """Provider API error with retry logic."""
    def __init__(self, code: str, retry: bool = False, delay: int = 60, message: str = ''):
        self.code = code
        self.retry = retry
        self.delay = delay
        self.message = message
        super().__init__(message or code)


class BaseProvider(ABC):
    """Abstract base class for all API providers."""

    def __init__(self, api_key: str, config: Dict[str, Any] = None):
        self.api_key = api_key
        self.config = config or {}
        self.name = self.__class__.__name__.replace('Provider', '').lower()

    @abstractmethod
    async def get_products(self) -> List[Product]:
        """Fetch all available products from the provider."""
        pass

    @abstractmethod
    async def create_order(self, product_code: str, quantity: int, customer_data: Dict[str, Any]) -> Order:
        """Create a new order with the provider."""
        pass

    @abstractmethod
    async def get_order(self, order_number: str) -> Order:
        """Get order status and details."""
        pass

    @abstractmethod
    async def get_balance(self) -> float:
        """Get account balance in USDT."""
        pass

    @property
    @abstractmethod
    def rate_limits(self) -> Dict[str, float]:
        """Return rate limits: {'get': seconds, 'post': seconds}."""
        pass

    def normalize_status(self, provider_status: str) -> str:
        """Convert provider-specific status to unified status."""
        # Common mapping - override in specific providers if needed
        status_map = {
            'pending': 'pending',
            'paid': 'processing',
            'processing': 'processing',
            'manual_review': 'processing',
            'partially_completed': 'processing',
            'completed': 'completed',
            'failed': 'failed',
            'cancelled': 'failed',
            'refunded': 'refunded',
        }
        return status_map.get(provider_status.lower(), 'processing')
