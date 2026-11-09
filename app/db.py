import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

PATH = os.getenv('DB_PATH', 'data/shop.db')

DEFAULT_SETTINGS = {
    'markup_percent': '10',
    'usdt_to_stars_rate': '50',
    'vnd_to_usdt_rate': '0.00004',
    'sync_period': '900',
    # New supplier positions go on sale right away ("what they add, I have").
    'auto_publish': '1',
    # RUB/USDT exchange rate (auto-updated from CBR, overridable in admin).
    'rub_rate': '90',
    'rub_rate_locked': '0',  # set to '1' if admin manually overrides the rate
    # Payment methods
    'pay_stars_enabled': '1',
    'pay_crypto_enabled': '0',
    'pay_crypto_token': '',
    'pay_rub_enabled': '0',
    'pay_rub_provider': 'okassa',
    'pay_rub_api_key': '',
}

@contextmanager
def connect():
    Path(PATH).parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(PATH, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA foreign_keys=ON')
    try:
        with c:
            yield c
    finally:
        c.close()

def _add_column(c, table, column, definition):
    try:
        c.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')
    except sqlite3.OperationalError:
        pass  # column already exists

def init():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, code TEXT UNIQUE, data TEXT NOT NULL, visible INTEGER DEFAULT 0, stars INTEGER DEFAULT 0, synced REAL DEFAULT 0, provider TEXT DEFAULT 'jaha');
        CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, user_id INTEGER, product_id INTEGER, stars INTEGER, body TEXT, state TEXT DEFAULT 'invoice', charge TEXT UNIQUE, supplier_number TEXT, snapshot TEXT, delivery_hash TEXT, error TEXT, attempts INTEGER DEFAULT 0, next_poll REAL DEFAULT 0, created REAL NOT NULL, provider TEXT DEFAULT 'jaha');
        CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY, user_id INTEGER, state TEXT DEFAULT 'open', created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, ticket_id INTEGER REFERENCES tickets(id), author TEXT, text TEXT, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY, bot TEXT, method TEXT, payload TEXT, dedupe TEXT UNIQUE, sent INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, next_try REAL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS updates(bot TEXT, id INTEGER, PRIMARY KEY(bot,id));
        CREATE TABLE IF NOT EXISTS payments(charge TEXT PRIMARY KEY, user_id INTEGER, payload TEXT, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, actor TEXT, action TEXT, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS categories(
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            parent_id INTEGER REFERENCES categories(id),
            sort_order INTEGER DEFAULT 0,
            auto_update INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS provider_offerings(
            id INTEGER PRIMARY KEY,
            product_id INTEGER REFERENCES products(id),
            provider TEXT NOT NULL,
            provider_product_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            price_usdt REAL NOT NULL DEFAULT 0,
            available INTEGER DEFAULT 0,
            in_stock INTEGER DEFAULT 1,
            min_quantity INTEGER DEFAULT 1,
            max_quantity INTEGER DEFAULT 1,
            delivery_type TEXT DEFAULT 'automatic',
            product_type TEXT DEFAULT 'account',
            raw_data TEXT NOT NULL DEFAULT '{}',
            fetched_at REAL NOT NULL DEFAULT 0,
            UNIQUE(provider, provider_product_id)
        );
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT DEFAULT '',
            image TEXT DEFAULT '',
            emoji TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            visible INTEGER DEFAULT 1,
            created REAL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT DEFAULT '',
            image TEXT DEFAULT '',
            collection_type TEXT DEFAULT 'manual',
            auto_rules TEXT DEFAULT '{}',
            auto_combinator TEXT DEFAULT 'any',
            sort_override TEXT DEFAULT '{}',
            sort_order INTEGER DEFAULT 0,
            visible_store INTEGER DEFAULT 1,
            visible_bot INTEGER DEFAULT 1,
            schedule_start REAL,
            schedule_end REAL,
            pinned_product_ids TEXT DEFAULT '[]',
            excluded_product_ids TEXT DEFAULT '[]',
            limit_count INTEGER DEFAULT 0,
            visible INTEGER DEFAULT 1,
            created REAL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS collection_products (
            collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            position INTEGER DEFAULT 0,
            PRIMARY KEY (collection_id, product_id)
        );
        CREATE TABLE IF NOT EXISTS product_features (
            id INTEGER PRIMARY KEY,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            feature_key TEXT NOT NULL,
            feature_value TEXT DEFAULT '',
            UNIQUE(product_id, feature_key)
        );
        CREATE TABLE IF NOT EXISTS product_extra_categories (
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            PRIMARY KEY(product_id, category_id)
        );
        CREATE TABLE IF NOT EXISTS media_items (
            id INTEGER PRIMARY KEY,
            filename TEXT NOT NULL,
            url TEXT NOT NULL,
            mime_type TEXT DEFAULT 'image/jpeg',
            width INTEGER DEFAULT 0,
            height INTEGER DEFAULT 0,
            size_bytes INTEGER DEFAULT 0,
            source_note TEXT DEFAULT '',
            usage_ok INTEGER DEFAULT 1,
            demo_only INTEGER DEFAULT 0,
            created REAL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS bot_screens (
            id INTEGER PRIMARY KEY,
            screen_key TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            draft_data TEXT DEFAULT '{}',
            published_data TEXT DEFAULT '{}',
            published_at REAL,
            sort_order INTEGER DEFAULT 0,
            created REAL DEFAULT (unixepoch()),
            updated REAL DEFAULT (unixepoch())
        );
        CREATE TABLE IF NOT EXISTS bot_screen_versions (
            id INTEGER PRIMARY KEY,
            screen_id INTEGER NOT NULL REFERENCES bot_screens(id) ON DELETE CASCADE,
            data TEXT NOT NULL,
            actor TEXT DEFAULT 'admin',
            created REAL DEFAULT (unixepoch())
        );
        ''')

        # Product columns (non-destructive migration)
        _add_column(c, 'products', 'provider', "TEXT DEFAULT 'jaha'")
        _add_column(c, 'products', 'category_id', 'INTEGER REFERENCES categories(id)')
        _add_column(c, 'products', 'name_locked', 'INTEGER DEFAULT 0')
        _add_column(c, 'products', 'description_locked', 'INTEGER DEFAULT 0')
        _add_column(c, 'products', 'price_locked', 'INTEGER DEFAULT 0')
        _add_column(c, 'products', 'category_locked', 'INTEGER DEFAULT 0')
        _add_column(c, 'products', 'base_price_usdt', 'REAL DEFAULT 0')
        _add_column(c, 'products', 'best_offering_id', 'INTEGER REFERENCES provider_offerings(id)')
        _add_column(c, 'orders', 'provider', "TEXT DEFAULT 'jaha'")
        # NULL = use the global markup_percent setting
        _add_column(c, 'categories', 'markup_percent', 'REAL')

        # services
        _add_column(c, 'products', 'service_id', 'INTEGER REFERENCES services(id)')
        _add_column(c, 'products', 'conditions', 'TEXT DEFAULT ""')
        _add_column(c, 'products', 'warranty', 'TEXT DEFAULT ""')
        _add_column(c, 'products', 'instructions', 'TEXT DEFAULT ""')
        _add_column(c, 'products', 'promo_field_label', 'TEXT DEFAULT ""')

        # variants and display
        _add_column(c, 'products', 'region', 'TEXT DEFAULT ""')
        _add_column(c, 'products', 'duration_days', 'INTEGER DEFAULT 0')
        _add_column(c, 'products', 'access_type', 'TEXT DEFAULT "personal"')
        _add_column(c, 'products', 'activation_method', 'TEXT DEFAULT ""')
        _add_column(c, 'products', 'delivery_note', 'TEXT DEFAULT ""')
        _add_column(c, 'products', 'guarantee_days', 'INTEGER DEFAULT 0')
        _add_column(c, 'products', 'guarantee_note', 'TEXT DEFAULT ""')
        _add_column(c, 'products', 'sort_order', 'INTEGER DEFAULT 0')
        _add_column(c, 'products', 'media_id', 'INTEGER REFERENCES media_items(id)')

        # categories display
        _add_column(c, 'categories', 'image', 'TEXT DEFAULT ""')
        _add_column(c, 'categories', 'emoji', 'TEXT DEFAULT ""')
        _add_column(c, 'categories', 'description', 'TEXT DEFAULT ""')
        _add_column(c, 'categories', 'visible', 'INTEGER DEFAULT 1')

        # Default category
        if not db_one(c, 'SELECT id FROM categories WHERE slug=?', ('general',)):
            c.execute("INSERT INTO categories(name,slug,sort_order) VALUES('Общее','general',0)")

        # One-time: prices set by hand before auto-markup existed must survive the
        # first sync, so lock them. Runs once per database, guarded by a flag.
        if not db_one(c, "SELECT value FROM settings WHERE key='migrated_price_locks'"):
            c.execute('UPDATE products SET price_locked=1 WHERE stars>0')
            c.execute("INSERT INTO settings VALUES('migrated_price_locks','1')")

        # v2: user asked to clear all hand-set price locks so auto-markup takes over
        if not db_one(c, "SELECT value FROM settings WHERE key='v2_unlock_prices'"):
            c.execute('UPDATE products SET price_locked=0')
            c.execute("INSERT INTO settings VALUES('v2_unlock_prices','1')")

        # Default settings (inside the same transaction)
        for k, v in DEFAULT_SETTINGS.items():
            if not db_one(c, 'SELECT value FROM settings WHERE key=?', (k,)):
                c.execute('INSERT INTO settings VALUES(?,?)', (k, v))

        BOT_SCREENS_DEFAULT = [
            ('welcome',      'Приветствие',            0),
            ('main_menu',    'Главное меню',            1),
            ('catalog',      'Каталог (категории)',     2),
            ('product_list', 'Список товаров',          3),
            ('product_card', 'Карточка товара',         4),
            ('promo_input',  'Ввод промокода',          5),
            ('checkout',     'Подтверждение заказа',    6),
            ('waiting',      'Ожидание выдачи',         7),
            ('delivery',     'Выдача товара',           8),
            ('orders',       'История заказов',         9),
            ('guarantee',    'Гарантия',               10),
            ('support',      'Помощь',                 11),
            ('docs',         'Документы',              12),
        ]
        for key, name, order in BOT_SCREENS_DEFAULT:
            if not db_one(c, 'SELECT id FROM bot_screens WHERE screen_key=?', (key,)):
                c.execute('INSERT INTO bot_screens(screen_key,name,sort_order) VALUES(?,?,?)',
                          (key, name, order))

def db_one(c, sql, args=()):
    r = c.execute(sql, args).fetchone()
    return r

def rows(sql, args=()):
    with connect() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]

def one(sql, args=()):
    r = rows(sql, args)
    return r[0] if r else None

def execute(sql, args=()):
    with connect() as c:
        return c.execute(sql, args).lastrowid

def setting(key, default=''):
    r = one('SELECT value FROM settings WHERE key=?', (key,))
    return r['value'] if r else default

def set_setting(key, value):
    execute('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, str(value)))

def enqueue(bot, method, payload, dedupe=None, conn=None):
    from .core import seal
    values = (bot, method, seal(payload), dedupe)
    sql = 'INSERT OR IGNORE INTO outbox(bot,method,payload,dedupe) VALUES(?,?,?,?)'
    if conn is not None:
        conn.execute(sql, values)
    else:
        execute(sql, values)
