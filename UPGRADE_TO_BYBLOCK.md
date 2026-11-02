# Обновление до ByBlock Multi-Provider Platform

## Что нового

### 🎨 Ребрендинг в ByBlock
- Новый логотип и фирменный стиль
- Зелёная цветовая схема
- Профессиональный современный дизайн

### 🌓 Светлая и тёмная темы
- Переключатель тем в правом верхнем углу
- Сохранение выбора в localStorage
- Автоматическое применение при входе

### ⚡ Система множественных провайдеров
- Поддержка Jaha и Canboso API
- Унифицированный интерфейс для всех провайдеров
- Простое добавление новых провайдеров
- Автоматическое управление rate limits
- Балансы по всем провайдерам

## Изменения в коде

### Новые файлы
- `app/providers/` — система провайдеров
  - `base.py` — базовый интерфейс
  - `jaha.py` — Jaha provider
  - `canboso.py` — Canboso provider
  - `manager.py` — менеджер провайдеров
- `app/static/theme.js` — переключение тем
- `UPGRADE_TO_BYBLOCK.md` — этот файл

### Изменённые файлы
- `app/main.py` — интеграция провайдеров в API
- `app/core.py` — обновлённые функции работы с поставщиками
- `app/bots.py` — поддержка множественных провайдеров в ботах
- `app/db.py` — колонка `provider` в таблицах `products` и `orders`
- `app/static/style.css` — новый дизайн с темами
- `app/static/index.html` — обновлённый интерфейс
- `.env.example` — добавлен `CANBOSO_API_KEY`

### Изменения в базе данных
```sql
ALTER TABLE products ADD COLUMN provider TEXT DEFAULT 'jaha';
ALTER TABLE orders ADD COLUMN provider TEXT DEFAULT 'jaha';
```

Миграция выполняется автоматически при запуске.

## Настройка

### 1. Добавить API ключи в `.env`

```bash
# Хотя бы один провайдер должен быть настроен
JAHA_API_KEY=your_jaha_key_here
CANBOSO_API_KEY=tgb_3a69f81ce08f5d895a21ab935bdd988c3e33a97b75f74aec
```

### 2. Обновить зависимости (уже включены)

Все необходимые библиотеки уже в `requirements.txt`:
- `httpx` — для HTTP запросов
- `pydantic` — для валидации данных

### 3. Перезапустить приложение

```bash
docker compose -p market --env-file /opt/market/.env restart
```

### 4. Синхронизировать каталог

В админ-панели нажмите "Загрузить каталог" или "Синхронизировать".
Товары от всех провайдеров появятся в каталоге с префиксом `provider:code`.

## Использование

### Синхронизация каталога

```python
# Все провайдеры
await sync_catalog()

# Конкретный провайдер
await sync_catalog('jaha')
await sync_catalog('canboso')
```

### Работа с провайдерами в коде

```python
from app.providers.manager import get_manager

manager = get_manager()

# Список провайдеров
providers = manager.list_providers()

# Получить товары
products = await manager.get_products('jaha')

# Создать заказ
provider_name, order = await manager.create_order(
    product_code='PROD123',
    quantity=1,
    customer_data={'order_id': 'abc123'}
)

# Проверить статус
order = await manager.get_order('jaha', 'ORDER456')

# Балансы
balance = await manager.get_balance('jaha')
all_balances = await manager.get_all_balances()
```

### Добавление нового провайдера

1. Создайте файл `app/providers/myprovider.py`:

```python
from .base import BaseProvider, Product, Order, ProviderError

class MyProvider(BaseProvider):
    @property
    def rate_limits(self):
        return {'get': 1.0, 'post': 2.0}

    async def get_products(self):
        # Реализация
        pass

    async def create_order(self, code, qty, data):
        # Реализация
        pass

    # ... остальные методы
```

2. Добавьте в `app/providers/__init__.py`:

```python
from .myprovider import MyProvider

__all__ = [..., 'MyProvider']
```

3. Зарегистрируйте в `app/providers/manager.py`:

```python
myprovider_key = os.getenv('MYPROVIDER_API_KEY')
if myprovider_key:
    self.providers['myprovider'] = MyProvider(myprovider_key)
```

## API Endpoints

### Новые эндпоинты

```
GET  /api/providers       - Список провайдеров
POST /api/sync?provider=  - Синхронизация (опционально: конкретный провайдер)
```

### Обновлённые эндпоинты

```
GET  /api/dashboard  - Добавлены: providers, balances
POST /api/orders/{oid}/check - Использует provider из заказа
```

## Обратная совместимость

Все старые вызовы `core.jaha()` продолжают работать через обёртку.
Провайдер по умолчанию — первый настроенный (Jaha, если есть).

## Миграция данных

Существующие товары и заказы автоматически получат `provider='jaha'`.
Новая синхронизация добавит товары от других провайдеров.

## Troubleshooting

### Ошибка: Provider not configured

Проверьте `.env`:
- Установлен ли хотя бы один `*_API_KEY`
- Правильно ли указан ключ

### Товары не появляются

1. Проверьте логи: `docker compose logs app`
2. Проверьте раздел "Система" → "Jaha API" / провайдер
3. Попробуйте синхронизировать вручную

### Темы не переключаются

1. Очистите кеш браузера
2. Проверьте, загружается ли `theme.js`
3. Откройте консоль браузера для проверки ошибок

## Поддержка

- GitHub Issues: https://github.com/shooozz/my-tg-business_bot/issues
- Документация Jaha: https://docs.jahadigital.shop
- Документация Canboso: https://canboso.com/api/swagger

---

**ByBlock** — ваша платформа, под контролем. 🟢
