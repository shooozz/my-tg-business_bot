// Shapes returned by app/main.py. Keep in sync with the backend.

export interface ProductData {
  title?: string
  description?: string
  category?: string
  price_usdt?: number
  available?: number
  delivery_type?: string
  image?: string
  emoji?: string
}

export interface Product {
  id: number
  code: string
  data: ProductData
  visible: number
  stars: number
  provider: string
  category_id: number | null
  name_locked: number
  description_locked: number
  price_locked: number
  category_locked: number
  base_price_usdt: number
  best_offering_id: number | null
}

export interface Category {
  id: number
  name: string
  slug: string
  parent_id: number | null
  sort_order: number
  auto_update: number
  markup_percent: number | null
}

export interface Order {
  id: string
  user_id: number
  product_id: number
  stars: number
  state: string
  supplier_number: string | null
  error: string | null
  provider: string
  created: number
}

export interface Message { id: number; author: string; text: string; created: number }
export interface Ticket { id: number; user_id: number; state: string; created: number; messages: Message[] }
export interface Audit { id: number; actor: string; action: string; created: number }

export interface Dashboard {
  products: Product[]
  orders: Order[]
  tickets: Ticket[]
  categories: Category[]
  audit: Audit[]
  balance: string
  balances: Record<string, number>
  providers: Record<string, { name: string; is_default: boolean }>
  catalog_sync: string
  catalog_error: string
  pending_messages: number
  configured: Record<'shop' | 'admin' | 'support', boolean>
  supplier_configured: boolean
  markup_percent: number
  usdt_to_stars_rate: number
  vnd_to_usdt_rate: number
  sync_period: number
  auto_publish: boolean
  rub_rate: number
  rub_rate_locked?: boolean
  pay_stars_enabled: boolean
  pay_crypto_enabled: boolean
  pay_crypto_token?: string
  pay_rub_enabled: boolean
  pay_rub_provider: string
  pay_rub_api_key?: string
  offering_count: number
  unmatched_count: number
}

export interface Offering {
  id: number
  product_id: number | null
  provider: string
  provider_product_id: string
  name: string
  price_usdt: number
  available: number
  in_stock: number
  delivery_type: string
  fetched_at: number
}

export interface PublicProduct {
  id: number
  code?: string
  name: string
  description: string
  stars: number
  category_id: number | null
  delivery_type: string
  image: string
  emoji: string
  price_usdt: number
  price_rub: number
  available: number
}

export interface PublicCategory { id: number; name: string; product_count: number; emoji?: string; description?: string }

export interface PublicService {
  id: number
  name: string
  slug: string
  description: string
  image: string
  emoji: string
  sort_order: number
  product_count: number
}

export interface PublicCollection {
  id: number
  name: string
  slug: string
  description: string
  image: string
  collection_type: string
  limit_count: number
  sort_order: number
}
