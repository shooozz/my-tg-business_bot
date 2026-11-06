import asyncio
import hashlib
import json
import os
import re
import time
import uuid
from urllib.parse import quote

import httpx
from cryptography.fernet import Fernet
from . import db
from .providers.manager import get_manager
from .providers.base import ProviderError, normalize_name

ADMINS = {int(x) for x in os.getenv('ADMIN_IDS', '').split(',') if x.strip()}
TOKENS = {k: os.getenv(k.upper() + '_BOT_TOKEN', '') for k in ('shop', 'admin', 'support')}
LOCK = asyncio.Lock()
SYNC_LOCK = asyncio.Lock()
HTTP = httpx.AsyncClient(timeout=40)

# Backwards-compat alias; new code should use ProviderError directly.
SupplierError = ProviderError

def cipher():
    return Fernet(os.environ['DATA_KEY'].encode())

def seal(value):
    return cipher().encrypt(json.dumps(value, ensure_ascii=False).encode()).decode()

def unseal(value):
    return json.loads(cipher().decrypt(value.encode())) if value else None

def audit(actor, action):
    db.execute('INSERT INTO audit(actor,action,created) VALUES(?,?,?)', (str(actor), action, time.time()))

def say(bot, chat, text, keyboard=None, dedupe=None, conn=None):
    chunks = [text[i:i+3500] for i in range(0, len(text), 3500)] or ['—']
    for i, chunk in enumerate(chunks):
        payload = {'chat_id': chat, 'text': chunk}
        if keyboard and i == len(chunks)-1:
            payload['reply_markup'] = {'inline_keyboard': keyboard}
        db.enqueue(bot, 'sendMessage', payload, f'{dedupe}:{i}' if dedupe else None, conn)

def button(text, data=None, url=None):
    return {'text': text, **({'url': url} if url else {'callback_data': data})}

async def telegram(bot, method, payload):
    r = await HTTP.post(f'https://api.telegram.org/bot{TOKENS[bot]}/{method}', json=payload)
    data = r.json()
    if not data.get('ok'):
        raise RuntimeError('telegram_' + str(data.get('error_code', r.status_code)))
    return data['result']


def _product_data(name, description, price_usdt, category, in_stock, provider_data):
    """Build the products.data JSON blob from a normalized offering."""
    return {
        'title': name,
        'description': description,
        'price_usdt': price_usdt,
        'category': category,
        'available': 1 if in_stock else 0,
        'delivery_type': provider_data.get('delivery_type', 'automatic'),
        **{k: v for k, v in provider_data.items() if k not in ('title', 'description', 'price_usdt', 'category', 'available', 'delivery_type')},
    }


async def sync_catalog(provider_name=None):
    """Smart sync engine: fetch providers, normalize to USDT, dedup by lowest
    price across providers, apply adjustable markup, and respect per-field
    auto-update locks on each canonical product.
    """
    async with SYNC_LOCK:
        manager = get_manager()
        providers = [provider_name] if provider_name else list(manager.providers.keys())
        now = time.time()

        errors = []
        for prov in providers:
            try:
                products = await manager.get_products(prov)
            except ProviderError as e:
                errors.append(f'{prov}:{e.code}')
                continue
            _upsert_offerings(prov, products, now)
            if products:
                # Positions removed at the supplier stop being sellable here too.
                # An empty answer is treated as a glitch, not "everything removed".
                db.execute('UPDATE provider_offerings SET in_stock=0, available=0 '
                           'WHERE provider=? AND fetched_at<?', (prov, now))
        db.set_setting('catalog_error', ', '.join(errors))

        # Match unmatched offerings to canonical products by normalized name.
        _auto_match_offerings()

        # Re-pick best (lowest price) offering per canonical product and apply
        # markup + per-field locks.
        _rebuild_products_from_offerings()

        db.set_setting('catalog_sync', time.time())

        # Cache balances here so the dashboard never calls suppliers itself.
        balances = json.loads(db.setting('balances', '{}') or '{}')
        for prov in providers:
            try:
                balances[prov] = await manager.get_balance(prov)
            except Exception:
                pass
        db.set_setting('balances', json.dumps(balances))
        db.set_setting('balance', str(round(sum(balances.values()), 2)) if balances else '—')


def _upsert_offerings(provider, products, fetched_at):
    """Insert/update provider_offerings rows from a fetched product list."""
    with db.connect() as c:
        for p in products:
            raw = json.dumps({'category': p.category, **p.provider_data}, ensure_ascii=False)
            c.execute('''
                INSERT INTO provider_offerings(product_id, provider, provider_product_id,
                    name, description, price_usdt, available, in_stock,
                    min_quantity, max_quantity, delivery_type, product_type, raw_data, fetched_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(provider, provider_product_id) DO UPDATE SET
                    name=excluded.name, description=excluded.description,
                    price_usdt=excluded.price_usdt, available=excluded.available,
                    in_stock=excluded.in_stock, min_quantity=excluded.min_quantity,
                    max_quantity=excluded.max_quantity, delivery_type=excluded.delivery_type,
                    product_type=excluded.product_type, raw_data=excluded.raw_data,
                    fetched_at=excluded.fetched_at
            ''', (
                None, provider, p.code, p.name, p.description, p.price_usdt,
                int(p.provider_data.get('available', 0)), 1 if p.in_stock else 0,
                p.min_quantity, p.max_quantity,
                p.provider_data.get('delivery_type', 'automatic'),
                p.provider_data.get('productType', 'account'),
                raw, fetched_at,
            ))


def _auto_match_offerings():
    """Link unmatched offerings to canonical products by normalized name.
    Creates a new canonical product when no match is found.
    """
    unmatched = db.rows('SELECT * FROM provider_offerings WHERE product_id IS NULL')
    if not unmatched:
        return

    # Index existing canonical products by normalized name for fast lookup.
    existing = db.rows('SELECT id, data FROM products')
    name_index = {}
    for p in existing:
        try:
            name = json.loads(p['data']).get('title', '')
        except (ValueError, KeyError):
            name = ''
        nn = normalize_name(name)
        if nn:
            name_index.setdefault(nn, []).append(p['id'])

    # Products created before the offerings table existed keep their code
    # ("jaha:CODE" or a bare "CODE"); match those first so an INSERT never
    # collides with products.code UNIQUE.
    code_index = {r['code']: r['id'] for r in db.rows('SELECT id, code FROM products') if r['code']}

    default_cat = db.one('SELECT id FROM categories WHERE slug=?', ('general',))
    default_cat = default_cat['id'] if default_cat else None
    # Catalogs also require stars>0 and stock, so a visible row with no price yet is never shown.
    publish = 1 if db.setting('auto_publish', '1') == '1' else 0

    with db.connect() as c:
        for o in unmatched:
            nn = normalize_name(o['name'])
            by_code = (code_index.get(f"{o['provider']}:{o['provider_product_id']}")
                       or code_index.get(o['provider_product_id']))
            matches = [by_code] if by_code else name_index.get(nn, [])
            if matches:
                c.execute('UPDATE provider_offerings SET product_id=? WHERE id=?',
                          (matches[0], o['id']))
            else:
                # Create a new canonical product (hidden until admin enables it).
                data = _product_data(o['name'], o['description'], o['price_usdt'],
                                     '', bool(o['in_stock']),
                                     json.loads(o['raw_data']))
                pid = c.execute(
                    'INSERT INTO products(code,data,visible,stars,synced,provider,base_price_usdt) '
                    'VALUES(?,?,?,?,?,?,?)',
                    (f"{o['provider']}:{o['provider_product_id']}",
                     json.dumps(data, ensure_ascii=False), publish, 0, time.time(),
                     o['provider'], o['price_usdt']),
                ).lastrowid
                c.execute('UPDATE provider_offerings SET product_id=? WHERE id=?', (pid, o['id']))
                if default_cat and not c.execute('SELECT category_id FROM products WHERE id=?', (pid,)).fetchone()['category_id']:
                    c.execute('UPDATE products SET category_id=? WHERE id=?', (default_cat, pid))
                name_index.setdefault(nn, []).append(pid)


async def _refresh_rub_rate():
    """Fetch USDT≈USD/RUB rate from CBR once per hour and cache in settings.
    Skipped when rub_rate_locked=1 (admin set a manual value)."""
    if db.setting('rub_rate_locked', '0') == '1':
        return
    last = float(db.setting('rub_rate_updated', '0'))
    if time.time() - last < 3600:
        return
    try:
        r = await HTTP.get('https://www.cbr-xml-daily.ru/daily_json.js', timeout=10)
        usd = r.json()['Valute']['USD']['Value']  # RUB per 1 USD
        db.set_setting('rub_rate', str(round(usd, 2)))
        db.set_setting('rub_rate_updated', str(time.time()))
    except Exception:
        pass  # keep the previous value


def price_display(base_price_usdt: float) -> dict:
    """Return price_usdt and price_rub with global markup applied."""
    markup = float(db.setting('markup_percent', '10')) / 100
    rub_rate = float(db.setting('rub_rate', '90'))
    price_usdt = round(base_price_usdt * (1 + markup), 2)
    price_rub = round(price_usdt * rub_rate)
    return {'price_usdt': price_usdt, 'price_rub': price_rub}


async def setup_bots():
    """One-time setup called at startup: bot commands list and menu button."""
    shop_token = TOKENS.get('shop')
    public_url = os.getenv('PUBLIC_URL', '')
    if not shop_token:
        return
    try:
        commands = [
            {'command': 'start', 'description': '🏠 Главное меню'},
            {'command': 'catalog', 'description': '🛍️ Каталог товаров'},
            {'command': 'orders', 'description': '📦 Мои заказы'},
            {'command': 'support', 'description': '💬 Поддержка'},
        ]
        await telegram('shop', 'setMyCommands', {'commands': commands})
        if public_url:
            await telegram('shop', 'setChatMenuButton', {
                'menu_button': {'type': 'web_app', 'text': '🛒 Магазин',
                                'web_app': {'url': public_url}}
            })
        else:
            await telegram('shop', 'setChatMenuButton', {
                'menu_button': {'type': 'commands'}
            })
    except Exception:
        pass  # non-critical — bot still works without the menu button


def _category_id(c, name):
    """Find a category by name, creating it when the supplier introduces a new one."""
    name = (name or '').strip()[:128]
    if not name:
        return None
    row = c.execute('SELECT id FROM categories WHERE lower(name)=lower(?)', (name,)).fetchone()
    if row:
        return row['id']
    slug = (re.sub(r'[^a-z0-9а-яё]+', '-', name.lower()).strip('-') or 'cat') + f'-{uuid.uuid4().hex[:6]}'
    return c.execute('INSERT INTO categories(name,slug,sort_order) VALUES(?,?,?)', (name, slug, 100)).lastrowid


def rebuild_prices():
    """For each canonical product, pick the cheapest in-stock offering as the
    active source, then apply markup and copy non-locked fields from it.
    Cheap (no network); call after any markup, rate or lock change.
    """
    default_markup = float(db.setting('markup_percent', '10'))
    rate = float(db.setting('usdt_to_stars_rate', '50'))

    with db.connect() as c:
        cats = {r['id']: dict(r) for r in c.execute('SELECT * FROM categories').fetchall()}
        for p in [dict(r) for r in c.execute('SELECT * FROM products').fetchall()]:
            best = c.execute(
                'SELECT * FROM provider_offerings WHERE product_id=? '
                'ORDER BY (in_stock=1 AND available>0) DESC, price_usdt ASC LIMIT 1',
                (p['id'],),
            ).fetchone()
            if not best:
                continue
            data = json.loads(p['data']) if p['data'] else {}
            raw = json.loads(best['raw_data']) if best['raw_data'] else {}
            cat_id = p['category_id']
            frozen = bool(cat_id and cats.get(cat_id, {}).get('auto_update') == 0)

            if not frozen:
                if not p['name_locked']:
                    data['title'] = best['name']
                if not p['description_locked']:
                    data['description'] = best['description']
                if not p['category_locked'] and raw.get('category'):
                    cat_id = _category_id(c, raw['category']) or cat_id
                    data['category'] = raw['category']
                if raw.get('image'):
                    data['image'] = raw['image']
            # Stock always follows the supplier, even for frozen categories:
            # selling what the supplier no longer has only produces failed orders.
            data['available'] = int(best['available'] or 0) if best['in_stock'] else 0
            data['price_usdt'] = best['price_usdt']
            data['delivery_type'] = best['delivery_type']

            stars = p['stars']
            if not p['price_locked'] and not frozen:
                cat_markup = cats.get(cat_id, {}).get('markup_percent')
                markup = (default_markup if cat_markup is None else cat_markup) / 100
                stars = max(1, round(best['price_usdt'] * (1 + markup) * rate))

            c.execute(
                'UPDATE products SET data=?, base_price_usdt=?, best_offering_id=?, '
                'stars=?, synced=?, category_id=? WHERE id=?',
                (json.dumps(data, ensure_ascii=False), best['price_usdt'],
                 best['id'], stars, time.time(), cat_id, p['id']),
            )
            if cat_id and cat_id not in cats:
                cats[cat_id] = dict(c.execute('SELECT * FROM categories WHERE id=?', (cat_id,)).fetchone())


_rebuild_products_from_offerings = rebuild_prices  # name used by the sync engine and tests


async def check_order_status(oid, provider_name):
    """Check order status with provider."""
    o = db.one('SELECT * FROM orders WHERE id=?', (oid,))
    if not o or not o['supplier_number']:
        raise ProviderError('no_supplier_number', False)

    manager = get_manager()
    order = await manager.get_order(provider_name, o['supplier_number'])

    return {
        'order_number': order.order_number,
        'status': order.status,
        'delivery': order.delivery,
        'instructions': order.instructions,
        **order.provider_data,
    }


def set_product(pid, visible, stars, actor):
    if stars < 0 or stars > 1000000 or (visible and stars < 1):
        raise ValueError('Укажите цену от 1 до 1 000 000 Stars')
    row = db.one('SELECT id, stars FROM products WHERE id=?', (pid,))
    if not row:
        raise ValueError('Товар не найден')
    # A hand-set price is the admin turning off price auto-update for this product.
    locked = 1 if stars != row['stars'] else None
    db.execute('UPDATE products SET visible=?, stars=?, price_locked=COALESCE(?, price_locked) WHERE id=?',
               (int(visible), stars, locked, pid))
    audit(actor, f'product:{pid}:visible={visible}:stars={stars}')

def reply_ticket(tid, text, actor):
    ticket = db.one('SELECT * FROM tickets WHERE id=?', (tid,))
    if not ticket or not text.strip() or len(text) > 3500:
        raise ValueError('Проверьте номер обращения и текст (1–3500 символов)')
    with db.connect() as c:
        mid = c.execute('INSERT INTO messages(ticket_id,author,text,created) VALUES(?,?,?,?)', (tid, 'support', seal(text), time.time())).lastrowid
        c.execute("UPDATE tickets SET state='answered' WHERE id=?", (tid,))
        say('support', ticket['user_id'], f'Ответ поддержки · #{tid}\n\n{text}', dedupe=f'reply:{mid}', conn=c)
    audit(actor, f'reply:{tid}')

def accept_payment(user, payment):
    db.execute('INSERT OR IGNORE INTO payments VALUES(?,?,?,?)',(payment['telegram_payment_charge_id'],user,seal(payment),time.time()))
    with db.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        o = c.execute('SELECT * FROM orders WHERE id=?', (payment['invoice_payload'],)).fetchone()
        if not o or o['user_id'] != user or payment['currency'] != 'XTR' or payment['total_amount'] != o['stars']:
            raise ValueError('payment_mismatch')
        if o['charge']:
            if o['charge'] != payment['telegram_payment_charge_id']:
                raise ValueError('duplicate_charge')
            return
        c.execute("UPDATE orders SET charge=?,state='paid' WHERE id=?", (payment['telegram_payment_charge_id'], o['id']))
        say('shop', user, f"✅ Оплата получена! Заказ {o['id'][:8]} взят в работу 🔧\nСледи за статусом в «Мои заказы» 📦", dedupe='paid:' + o['id'], conn=c)

def store_snapshot(oid, snapshot):
    content = '\n\n'.join(str(snapshot.get(k) or '') for k in ('status','delivery','instructions'))
    digest = hashlib.sha256(content.encode()).hexdigest()
    with db.connect() as c:
        o = c.execute('SELECT * FROM orders WHERE id=?', (oid,)).fetchone()
        if o['state'] in ('refund_pending','customer_refunded'):
            return
        c.execute('UPDATE orders SET supplier_number=?,snapshot=?,state=?,error=NULL,next_poll=? WHERE id=?', (snapshot['order_number'], seal(snapshot), snapshot['status'], time.time() + (3600 if snapshot['status']=='completed' else 60), oid))
        if o['delivery_hash'] != digest:
            say('shop', o['user_id'], f"Заказ {oid[:8]} · {status_label(snapshot['status'])}\n\n" + (snapshot.get('delivery') or 'Ожидаем выдачу товара.') + '\n\n' + (snapshot.get('instructions') or ''), dedupe=f'order:{oid}:{digest}', conn=c)
            c.execute('UPDATE orders SET delivery_hash=? WHERE id=?', (digest, oid))

def status_label(state):
    return {'invoice':'Ожидает оплаты','paid':'Оплачен','processing':'В обработке','manual_review':'Ручная выдача','partially_completed':'Выдан частично','completed':'Выдан','failed':'Ошибка поставщика','cancelled':'Отменён','refunded':'Возврат у поставщика','attention':'Нужна помощь администратора','refund_pending':'Возвращаем Stars','customer_refunded':'Stars возвращены','pending':'Ожидает оплаты'}.get(state,state)

async def process_order(o):
    """Process an order through its provider. Uses the provider stored on the
    order row, so Jaha and Canboso orders are both handled correctly.
    """
    provider_name = o.get('provider', 'jaha')
    try:
        if o['state'] == 'refund_pending':
            try:
                await telegram('shop', 'refundStarPayment', {'user_id':o['user_id'],'telegram_payment_charge_id':o['charge']})
            except RuntimeError:
                db.execute("UPDATE orders SET error='refund_needs_check',next_poll=? WHERE id=?", (time.time()+3600,o['id']))
                return
            db.execute("UPDATE orders SET state='customer_refunded',error=NULL WHERE id=?", (o['id'],))
            say('shop', o['user_id'], f"⭐ Stars за заказ {o['id'][:8]} возвращены. Приходи ещё!")
        elif not o['supplier_number']:
            body = unseal(o['body'])
            product_code = str(body.get('product_code', '')).split(':')[-1]
            customer_data = {'order_id': o['id']}
            if body.get('max_unit_price_usdt') is not None:
                customer_data['max_unit_price_usdt'] = body['max_unit_price_usdt']
            if body.get('buyer_input'):
                customer_data['buyer_input'] = body['buyer_input']
            if body.get('customer_email'):
                customer_data['customer_email'] = body['customer_email']
            if body.get('slot_months'):
                customer_data['slot_months'] = body['slot_months']
            manager = get_manager()
            _, order = await manager.create_order(product_code, body['quantity'], customer_data, provider_name)
            snapshot = {
                'order_number': order.order_number,
                'status': order.status,
                'delivery': order.delivery,
                'instructions': order.instructions,
                **order.provider_data,
            }
            store_snapshot(o['id'], snapshot)
        else:
            manager = get_manager()
            order = await manager.get_order(provider_name, o['supplier_number'])
            snapshot = {
                'order_number': order.order_number,
                'status': order.status,
                'delivery': order.delivery,
                'instructions': order.instructions,
                **order.provider_data,
            }
            store_snapshot(o['id'], snapshot)
    except SupplierError as e:
        attempts = o['attempts'] + 1
        state = o['state'] if e.retry and attempts < 12 else 'attention'
        db.execute('UPDATE orders SET state=?,error=?,attempts=?,next_poll=? WHERE id=?', (state,e.code,attempts,time.time()+max(e.delay,min(3600,30*2**min(attempts,7))),o['id']))
        if attempts == 1 or state == 'attention':
            for admin in ADMINS:
                say('admin',admin,f"Заказ {o['id']}: {e.code}. Проверьте в админке.",dedupe=f"error:{o['id']}:{state}")

def request_refund(oid, actor):
    with db.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        o = c.execute('SELECT * FROM orders WHERE id=?', (oid,)).fetchone()
        safe = o and (o['state']=='refunded' or (o['state']=='attention' and not o['supplier_number'] and o['error'] in ('price_changed','out_of_stock','product_unavailable','quantity_not_allowed','validation_error')))
        if not safe:
            raise ValueError('Возврат доступен после подтверждённого возврата поставщика или окончательного отказа в покупке. Неопределённый результат сначала сверяется с поставщиком.')
        c.execute("UPDATE orders SET state='refund_pending',next_poll=0 WHERE id=?",(oid,))
    audit(actor,'refund:'+oid)

async def worker():
    while True:
        try:
            await _refresh_rub_rate()
            if os.getenv('JAHA_API_KEY') or os.getenv('CANBOSO_API_KEY'):
                sync_period = float(db.setting('sync_period', '900'))
                if time.time()-float(db.setting('catalog_sync','0')) > sync_period:
                    try:
                        await sync_catalog()
                    except SupplierError as e:
                        db.set_setting('catalog_error',e.code)
                        db.set_setting('catalog_sync',time.time()-sync_period/2)
                pending = db.rows("SELECT * FROM orders WHERE state NOT IN ('invoice','attention','customer_refunded','cancelled','failed','refunded') AND charge IS NOT NULL AND next_poll<? ORDER BY next_poll LIMIT 20", (time.time(),))
                for o in pending:
                    await process_order(o)
            db.set_setting('worker_heartbeat',time.time())
        except Exception as e:
            db.set_setting('worker_error',type(e).__name__)
        await asyncio.sleep(3)

async def send_outbox():
    while True:
        processed = False
        for item in db.rows('SELECT * FROM outbox WHERE sent=0 AND next_try<? ORDER BY id LIMIT 30',(time.time(),)):
            if not TOKENS.get(item['bot']):
                continue
            try:
                await telegram(item['bot'],item['method'],unseal(item['payload']))
                db.execute('UPDATE outbox SET sent=1 WHERE id=?',(item['id'],))
                processed = True
            except Exception:
                db.execute('UPDATE outbox SET attempts=attempts+1,next_try=? WHERE id=?',(time.time()+min(3600,15*2**min(item['attempts'],8)),item['id']))
        await asyncio.sleep(0.1 if processed else 0.5)
