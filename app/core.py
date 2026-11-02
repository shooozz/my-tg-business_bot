import asyncio
import hashlib
import json
import os
import time
import uuid
from urllib.parse import quote

import httpx
from cryptography.fernet import Fernet
from . import db
from .providers.manager import get_manager
from .providers.base import ProviderError

ADMINS = {int(x) for x in os.getenv('ADMIN_IDS', '').split(',') if x.strip()}
TOKENS = {k: os.getenv(k.upper() + '_BOT_TOKEN', '') for k in ('shop', 'admin', 'support')}
LOCK = asyncio.Lock()
SYNC_LOCK = asyncio.Lock()
HTTP = httpx.AsyncClient(timeout=40)

# Use ProviderError instead of SupplierError for consistency
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
    # Plain text prevents supplier text from becoming active Telegram markup.
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

class SupplierError(Exception):
    """Deprecated: use ProviderError from providers.base"""
    def __init__(self, code, retry=False, delay=60):
        self.code, self.retry, self.delay = code, retry, delay

# Keep old jaha() function for backward compatibility
async def jaha(method, path, body=None, key=None):
    """Legacy Jaha API function - use providers.JahaProvider instead."""
    manager = get_manager()
    try:
        provider = manager.get_provider('jaha')
    except ValueError:
        raise SupplierError('jaha_not_configured', False)

    # Map old jaha() calls to new provider
    try:
        if method == 'GET':
            if path.startswith('/products'):
                products = await provider.get_products()
                # Return in old format
                return {'products': [p.provider_data for p in products], 'next_cursor': None}
            elif path.startswith('/orders/'):
                order_num = path.split('/')[2].split('?')[0]
                order = await provider.get_order(order_num)
                return {'order': order.provider_data}
            elif path == '/account':
                balance = await provider.get_balance()
                return {'account': {'balance_usdt': str(balance)}}
        elif method == 'POST' and path == '/orders':
            # Create order - requires product_code extraction from body
            order = await provider.create_order(
                body['product_code'],
                body.get('quantity', 1),
                {'order_id': key} if key else {}
            )
            return {'order': order.provider_data}
    except ProviderError as e:
        raise SupplierError(e.code, e.retry, e.delay) from None
    except Exception as e:
        raise SupplierError('supplier_error', False) from e

async def sync_catalog(provider_name=None):
    """Sync products from provider(s)."""
    async with SYNC_LOCK:
        manager = get_manager()

        if provider_name:
            # Sync specific provider
            products = await manager.get_products(provider_name)
        else:
            # Sync all providers
            all_products = await manager.get_all_products()
            products = []
            for prov_name, prov_products in all_products.items():
                # Add provider prefix to product codes
                for p in prov_products:
                    p.code = f"{prov_name}:{p.code}"
                    products.append(p)

        with db.connect() as c:
            c.execute('UPDATE products SET synced=0')
            for p in products:
                # Store original provider data as JSON
                product_data = {
                    'title': p.name,
                    'description': p.description,
                    'price_usdt': p.price_usdt,
                    'category': p.category,
                    'available': 1 if p.in_stock else 0,
                    'delivery_type': 'auto',
                    **p.provider_data
                }

                c.execute(
                    'INSERT INTO products(code,data,synced,provider) VALUES(?,?,?,?) '
                    'ON CONFLICT(code) DO UPDATE SET data=excluded.data,synced=excluded.synced,provider=excluded.provider',
                    (p.code, json.dumps(product_data, ensure_ascii=False), time.time(), p.code.split(':')[0] if ':' in p.code else 'jaha')
                )

        db.set_setting('catalog_sync', time.time())

        # Get balance from default or specified provider
        try:
            balance = await manager.get_balance(provider_name)
            db.set_setting('balance', str(balance))
        except Exception:
            pass

async def check_order_status(oid, provider_name):
    """Check order status with provider."""
    o = db.one('SELECT * FROM orders WHERE id=?', (oid,))
    if not o or not o['supplier_number']:
        raise ProviderError('no_supplier_number', False)

    manager = get_manager()
    order = await manager.get_order(provider_name, o['supplier_number'])

    # Convert to old snapshot format for compatibility
    return {
        'order_number': order.order_number,
        'status': order.status,
        'delivery': order.delivery,
        'instructions': order.instructions,
        **order.provider_data
    }


def set_product(pid, visible, stars, actor):
    if stars < 0 or stars > 1000000 or (visible and stars < 1):
        raise ValueError('Укажите цену от 1 до 1 000 000 Stars')
    if not db.one('SELECT id FROM products WHERE id=?', (pid,)):
        raise ValueError('Товар не найден')
    db.execute('UPDATE products SET visible=?, stars=? WHERE id=?', (int(visible), stars, pid))
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
        say('shop', user, f"Оплата получена. Заказ {o['id'][:8]} передан в обработку. Статус доступен в «Мои заказы».", dedupe='paid:' + o['id'], conn=c)

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
    return {'invoice':'Ожидает оплаты','paid':'Оплачен','processing':'В обработке','manual_review':'Ручная выдача','partially_completed':'Выдан частично','completed':'Выдан','failed':'Ошибка поставщика','cancelled':'Отменён','refunded':'Возврат у поставщика','attention':'Нужна помощь администратора','refund_pending':'Возвращаем Stars','customer_refunded':'Stars возвращены'}.get(state,state)

async def process_order(o):
    try:
        if o['state'] == 'refund_pending':
            try:
                await telegram('shop', 'refundStarPayment', {'user_id':o['user_id'],'telegram_payment_charge_id':o['charge']})
            except RuntimeError:
                # An uncertain refund requires manual reconciliation, never a new purchase.
                db.execute("UPDATE orders SET error='refund_needs_check',next_poll=? WHERE id=?", (time.time()+3600,o['id']))
                return
            db.execute("UPDATE orders SET state='customer_refunded',error=NULL WHERE id=?", (o['id'],))
            say('shop',o['user_id'],f"Stars за заказ {o['id'][:8]} возвращены.")
        elif not o['supplier_number']:
            snapshot = (await jaha('POST','/orders',unseal(o['body']),o['id']))['order']
            store_snapshot(o['id'],snapshot)
        else:
            snapshot = (await jaha('GET','/orders/'+quote(o['supplier_number'],safe='')+'?include_additions=true'))['order']
            store_snapshot(o['id'],snapshot)
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
        # Only confirmed supplier refund or a definitive rejection before purchase.
        safe = o and (o['state']=='refunded' or (o['state']=='attention' and not o['supplier_number'] and o['error'] in ('price_changed','out_of_stock','product_unavailable','quantity_not_allowed','validation_error')))
        if not safe:
            raise ValueError('Возврат доступен после подтверждённого возврата поставщика или окончательного отказа в покупке. Неопределённый результат сначала сверяется с поставщиком.')
        c.execute("UPDATE orders SET state='refund_pending',next_poll=0 WHERE id=?",(oid,))
    audit(actor,'refund:'+oid)

async def worker():
    while True:
        try:
            if os.getenv('JAHA_API_KEY'):
                if time.time()-float(db.setting('catalog_sync','0')) > 900:
                    try:
                        await sync_catalog()
                    except SupplierError as e:
                        db.set_setting('catalog_error',e.code)
                        db.set_setting('catalog_sync',time.time()-600)
                pending = db.rows("SELECT * FROM orders WHERE state NOT IN ('invoice','attention','customer_refunded','cancelled','failed','refunded') AND charge IS NOT NULL AND next_poll<? ORDER BY next_poll LIMIT 20", (time.time(),))
                for o in pending:
                    await process_order(o)
            db.set_setting('worker_heartbeat',time.time())
        except Exception as e:
            db.set_setting('worker_error',type(e).__name__)
        await asyncio.sleep(3)

async def send_outbox():
    while True:
        for item in db.rows('SELECT * FROM outbox WHERE sent=0 AND next_try<? ORDER BY id LIMIT 30',(time.time(),)):
            if not TOKENS.get(item['bot']):
                continue
            try:
                await telegram(item['bot'],item['method'],unseal(item['payload']))
                db.execute('UPDATE outbox SET sent=1 WHERE id=?',(item['id'],))
            except Exception:
                db.execute('UPDATE outbox SET attempts=attempts+1,next_try=? WHERE id=?',(time.time()+min(3600,15*2**min(item['attempts'],8)),item['id']))
        await asyncio.sleep(1)
