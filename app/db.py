import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

PATH = os.getenv('DB_PATH', 'data/shop.db')

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
        ''')

        # Add provider column to existing tables if not exists
        try:
            c.execute('ALTER TABLE products ADD COLUMN provider TEXT DEFAULT "jaha"')
        except sqlite3.OperationalError:
            pass  # Column already exists

        try:
            c.execute('ALTER TABLE orders ADD COLUMN provider TEXT DEFAULT "jaha"')
        except sqlite3.OperationalError:
            pass  # Column already exists


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
