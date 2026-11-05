import asyncio
import json
import os
import time
import uuid
from urllib.parse import quote
from . import db, core

def support_url(order=''):
    return 'https://t.me/' + os.getenv('SUPPORT_BOT_USERNAME','support_bot').lstrip('@') + ('?start='+order if order else '')

def menu():
    return [[core.button('🛍 Каталог','catalog:0'),core.button('📦 Мои заказы','orders')],[core.button('💬 Поддержка',url=support_url()),core.button('Условия','terms')]]

def _buyer_input_req(raw_data: dict) -> dict:
    """Normalize buyer input requirements from Jaha or Canboso raw data."""
    bi = raw_data.get('buyer_input') or {}
    if bi.get('required'):
        return bi
    req = raw_data.get('purchaseRequirements') or raw_data.get('purchase_requirements') or {}
    if req.get('customerEmail'):
        return {'required': True, 'fields': [{'name': 'email', 'type': 'email', 'required': True, 'max_length': 320}], 'scope': 'per_order', 'prompt': 'Введите ваш email для заказа', 'max_total_length': 320}
    return {'required': False, 'fields': [], 'scope': 'per_order', 'max_total_length': 0}

async def catalog(uid, page=0, category_id=None):
    if category_id:
        products = db.rows(
            'SELECT * FROM products WHERE visible=1 AND stars>0 AND synced>0 AND category_id=? ORDER BY id',
            (category_id,)
        )
    else:
        products = db.rows('SELECT * FROM products WHERE visible=1 AND stars>0 AND synced>0 ORDER BY id')
    products = [p for p in products if json.loads(p['data']).get('available')]
    start = max(0,page)*8
    buttons = [[core.button(f"{json.loads(p['data'])['title'][:38]} · {p['stars']} ⭐",f"product:{p['id']}")] for p in products[start:start+8]]
    nav = []
    cat_suffix = f':{category_id}' if category_id else ''
    if page > 0:
        nav.append(core.button('← Назад',f'catalog:{page-1}{cat_suffix}'))
    if start+8<len(products):
        nav.append(core.button('Далее →',f'catalog:{page+1}{cat_suffix}'))
    if nav:
        buttons.append(nav)
    if not category_id and db.rows('SELECT id FROM categories LIMIT 2'):
        buttons.append([core.button('📂 Категории','catalog_cats')])
    buttons.append([core.button('Главное меню','home')])
    label = 'Каталог · выберите товар' if products else 'Каталог пока готовится. Обратитесь в поддержку или загляните позже.'
    if category_id:
        cat = db.one('SELECT name FROM categories WHERE id=?',(category_id,))
        if cat:
            label = f"📂 {cat['name']} · выберите товар"
    core.say('shop',uid,label,buttons)

async def categories_menu(uid):
    cats = db.rows(
        'SELECT c.id, c.name, COUNT(p.id) AS cnt FROM categories c '
        'LEFT JOIN products p ON p.category_id=c.id AND p.visible=1 AND p.stars>0 '
        "AND json_extract(p.data,'$.available')>0 "
        'GROUP BY c.id ORDER BY c.sort_order'
    )
    buttons = [[core.button(f"📂 {c['name']} ({c['cnt']})",f"catalog:0:{c['id']}")] for c in cats if c['cnt']]
    if not buttons:
        buttons = [[core.button('Все товары','catalog:0')]]
    buttons.append([core.button('Главное меню','home')])
    core.say('shop',uid,'Категории товаров:',buttons)

async def product_card(uid, pid):
    """Serve product card entirely from DB — no live provider API calls."""
    row = db.one(
        'SELECT p.*, o.delivery_type AS o_delivery, o.available AS o_avail, '
        'o.min_quantity AS o_min, o.max_quantity AS o_max '
        'FROM products p LEFT JOIN provider_offerings o ON p.best_offering_id=o.id '
        'WHERE p.id=? AND p.visible=1', (pid,)
    )
    if not row:
        raise ValueError('Товар больше не продаётся')
    p = json.loads(row['data'])
    qty = row.get('o_min') or p.get('min_quantity', 1)
    delivery = 'автоматическая' if (row.get('o_delivery') or p.get('delivery_type','')) in ('automatic','auto') else 'ручная, срок не гарантируется'
    text = f"{p.get('title','')} · {p.get('variant','')}\n\n{p.get('description','')}\n\nСрок: {p.get('period','не указан')}\nВыдача: {delivery}\nЗаказ: {qty} шт. × {row['stars']} ⭐ = {qty*row['stars']} ⭐"
    available = row.get('o_avail') or p.get('available', 0)
    max_qty = row.get('o_max') or p.get('max_quantity', 1)
    buttons = []
    if available >= qty and qty <= max_qty:
        choices = sorted({qty, 5, 10})
        buttons.append([core.button(f'{n} шт. · {n*row["stars"]} ⭐',f'buy:{pid}:{n}') for n in choices if qty<=n<=min(available,max_qty)])
    buttons.append([core.button('← Каталог','catalog:0'),core.button('Поддержка',url=support_url())])
    core.say('shop',uid,text,buttons)


async def begin_order(uid, pid, quantity=None):
    """Create a purchase draft from cached DB data — no live provider calls."""
    if not os.getenv('SHOP_TERMS'):
        raise ValueError('Продажи ещё не открыты: магазин настраивает условия.')
    row = db.one(
        'SELECT p.*, o.provider_product_id AS o_code, o.provider AS o_provider, '
        'o.min_quantity AS o_min, o.max_quantity AS o_max, o.available AS o_avail, '
        'o.product_type, o.raw_data '
        'FROM products p LEFT JOIN provider_offerings o ON p.best_offering_id=o.id '
        'WHERE p.id=? AND p.visible=1 AND p.stars>0', (pid,)
    )
    if not row:
        raise ValueError('Товар недоступен')
    p = json.loads(row['data'])
    provider = row.get('o_provider') or row.get('provider', 'jaha')
    product_code = row.get('o_code') or str(row.get('code', '')).split(':')[-1]
    raw = json.loads(row['raw_data'] or '{}') if row.get('raw_data') else {}
    min_qty = row.get('o_min') or p.get('min_quantity', 1)
    max_qty = row.get('o_max') or p.get('max_quantity', 1)
    available = row.get('o_avail') or p.get('available', 0)
    qty = quantity if quantity is not None else min_qty
    if not p.get('available') or available < qty or max_qty < qty or qty < min_qty:
        raise ValueError('Товар закончился')
    oid = uuid.uuid4().hex
    body = {'product_code': product_code, 'quantity': qty,
            'max_unit_price_usdt': str(row.get('base_price_usdt') or 0),
            'external_order_id': oid}
    buyer_input_req = _buyer_input_req(raw)
    draft = {'id': oid, 'pid': pid, 'body': body, 'stars': row['stars']*qty,
             'product': {**p, 'code': product_code, 'buyer_input': buyer_input_req},
             'answers': [], 'step': 0, 'created': time.time(), 'provider': provider}
    db.set_setting(f'draft:{uid}', core.seal(draft))
    if buyer_input_req.get('required'):
        await ask_field(uid, draft)
    else:
        confirm_order(uid, draft)


def input_fields(draft):
    req = draft['product']['buyer_input']
    fields = req.get('fields',[])
    count = draft['body']['quantity'] if req.get('scope')=='per_unit' else 1
    return [(i,f) for i in range(count) for f in fields]

async def ask_field(uid,draft):
    fields = input_fields(draft)
    i, field = fields[draft['step']]
    core.say('shop',uid,f"{draft['product']['buyer_input'].get('prompt') or 'Данные для выполнения заказа'}\n\nЕдиница {i+1}, поле: {field['name']} (до {field['max_length']} символов).\nОтправляя данные, вы соглашаетесь передать их поставщику для выполнения заказа. /cancel — отменить.")

def confirm_order(uid,draft):
    core.say('shop',uid,f"Проверьте заказ\n{draft['product']['title']}\nКоличество: {draft['body']['quantity']}\nИтого: {draft['stars']} ⭐\n\n{os.getenv('SHOP_TERMS','Условия не настроены')}\n\nНажимая кнопку, вы принимаете условия магазина и товара. Счёт действует 15 минут.",[[core.button('Принимаю условия · оплатить','confirm:'+draft['id'])],[core.button('Отмена','cancel')]])

async def shop_update(update):
    if 'pre_checkout_query' in update:
        q=update['pre_checkout_query']
        o=db.one('SELECT * FROM orders WHERE id=?',(q['invoice_payload'],))
        ok=bool(o and o['user_id']==q['from']['id'] and not o['charge'] and o['state']=='invoice' and o['stars']==q['total_amount'] and q['currency']=='XTR' and time.time()-o['created']<900)
        if ok:
            p=db.one('SELECT * FROM products WHERE id=?',(o['product_id'],))
            ok=bool(p and p['visible'] and p['synced']>0)
        await core.telegram('shop','answerPreCheckoutQuery',{'pre_checkout_query_id':q['id'],'ok':ok,**({} if ok else {'error_message':'Счёт устарел. Откройте товар заново.'})})
        return
    m=update.get('message') or update.get('callback_query',{}).get('message')
    if not m or m['chat']['type']!='private':
        return
    uid=m['chat']['id']
    if m.get('successful_payment'):
        core.accept_payment(uid,m['successful_payment'])
        return
    cb=update.get('callback_query')
    text=m.get('text','')
    data=cb['data'] if cb else ''
    if cb:
        await core.telegram('shop','answerCallbackQuery',{'callback_query_id':cb['id']})
    if text.startswith(('/support','/paysupport')):
        core.say('shop',uid,'Напишите в поддержку — ответ придёт от её имени.',[[core.button('Открыть поддержку',url=support_url())]])
    elif text=='/terms' or data=='terms':
        core.say('shop',uid,os.getenv('SHOP_TERMS','Условия пока не опубликованы.'),menu())
    elif text.startswith('/start') or data=='home':
        param = text.split(' ', 1)[1].strip() if text.startswith('/start') and ' ' in text else ''
        if param.startswith('buy_'):
            try:
                await product_card(uid, int(param[4:]))
            except (ValueError, IndexError):
                core.say('shop', uid, 'Товар не найден.', menu())
        else:
            core.say('shop',uid,'Добро пожаловать!\nВыберите товар, оплатите Stars и получите заказ здесь. Все вопросы решает наша поддержка.',menu())
    elif text=='/cancel' or data=='cancel':
        db.execute('DELETE FROM settings WHERE key=?',(f'draft:{uid}',))
        core.say('shop',uid,'Оформление отменено.',menu())
    elif data=='catalog_cats':
        await categories_menu(uid)
    elif data.startswith('catalog:'):
        parts = data.split(':')
        page = int(parts[1]) if len(parts) > 1 else 0
        cat_id = int(parts[2]) if len(parts) > 2 else None
        await catalog(uid, page, cat_id)
    elif data.startswith('product:'):
        await product_card(uid,int(data.split(':')[1]))
    elif data.startswith('buy:'):
        args=data.split(':')
        await begin_order(uid,int(args[1]),int(args[2]) if len(args)>2 else None)
    elif data=='orders' or text=='/orders':
        orders=db.rows('SELECT * FROM orders WHERE user_id=? AND charge IS NOT NULL ORDER BY created DESC LIMIT 20',(uid,))
        core.say('shop',uid,'Ваши последние заказы' if orders else 'У вас пока нет оплаченных заказов.',[[core.button(f"{o['id'][:8]} · {core.status_label(o['state'])}",'order:'+o['id'])] for o in orders]+[[core.button('Главное меню','home')]])
    elif data.startswith('order:'):
        o=db.one('SELECT * FROM orders WHERE id=? AND user_id=?',(data[6:],uid))
        if not o:
            raise ValueError('Заказ не найден')
        snap=core.unseal(o['snapshot']) or {}
        core.say('shop',uid,f"Заказ {o['id'][:8]} · {core.status_label(o['state'])}\n{snap.get('delivery') or 'Данных выдачи пока нет.'}\n{snap.get('instructions') or ''}",[[core.button('Вопрос по заказу',url=support_url(o['id']))]])
    elif data.startswith('confirm:'):
        raw=db.setting(f'draft:{uid}')
        draft=core.unseal(raw) if raw else None
        if not draft or draft['id']!=data[8:] or time.time()-draft['created']>900:
            raise ValueError('Оформление устарело. Откройте товар заново.')
        if draft['product'].get('buyer_input', {}).get('required') and draft['step']!=len(input_fields(draft)):
            raise ValueError('Сначала заполните данные')
        with db.connect() as c:
            provider_name = draft.get('provider', 'jaha')
            c.execute('INSERT OR IGNORE INTO orders(id,user_id,product_id,stars,body,created,provider) VALUES(?,?,?,?,?,?,?)',(draft['id'],uid,draft['pid'],draft['stars'],core.seal(draft['body']),time.time(),provider_name))
            db.enqueue('shop','sendInvoice',{'chat_id':uid,'title':draft['product']['title'][:32],'description':f"{draft['body']['quantity']} шт. · условия приняты",'payload':draft['id'],'currency':'XTR','prices':[{'label':'Заказ','amount':draft['stars']}],'start_parameter':draft['id']},'invoice:'+draft['id'],c)
            c.execute('DELETE FROM settings WHERE key=?',(f'draft:{uid}',))

    elif text and not text.startswith('/'):
        raw=db.setting(f'draft:{uid}')
        draft=core.unseal(raw) if raw else None
        if not draft or time.time()-draft['created']>900 or draft['step']>=len(input_fields(draft)):
            core.say('shop',uid,'Вопросы о заказах принимаем в боте поддержки.',menu())
            return
        unit,field=input_fields(draft)[draft['step']]
        if len(text)>field['max_length'] or not text.strip() or (field['type']=='email' and ('@' not in text or ' ' in text)):
            raise ValueError('Проверьте формат и длину поля')
        items=draft['body'].setdefault('buyer_input',{'items':[]})['items']
        while len(items)<=unit:
            items.append({})
        items[unit][field['name']]=text
        if sum(len(v) for item in items for v in item.values())>draft['product']['buyer_input'].get('max_total_length',1000):
            raise ValueError('Превышена общая длина данных. /cancel — начать заново.')
        draft['step']+=1
        db.set_setting(f'draft:{uid}',core.seal(draft))
        if draft['step']<len(input_fields(draft)):
            await ask_field(uid,draft)
        else:
            confirm_order(uid,draft)

async def support_update(update):
    m=update.get('message')
    if not m or m['chat']['type']!='private':
        return
    uid=m['chat']['id']
    text=m.get('text') or m.get('caption') or '[Вложение]'
    if text=='/start':
        core.say('support',uid,'Поддержка магазина\nОпишите вопрос и укажите номер заказа. Можно прикрепить фото или файл. Ответ придёт сюда, писать администратору лично не нужно.')
        return
    with db.connect() as c:
        if c.execute("SELECT 1 FROM updates WHERE bot='support' AND id=?",(update['update_id'],)).fetchone():
            return
        ticket=c.execute("SELECT * FROM tickets WHERE user_id=? AND state!='closed' ORDER BY id DESC LIMIT 1",(uid,)).fetchone()
        tid=ticket['id'] if ticket else c.execute('INSERT INTO tickets(user_id,created) VALUES(?,?)',(uid,time.time())).lastrowid
        mid=c.execute('INSERT INTO messages(ticket_id,author,text,created) VALUES(?,?,?,?)',(tid,'customer',core.seal(text),time.time())).lastrowid
        c.execute("UPDATE tickets SET state='open' WHERE id=?",(tid,))
        c.execute("INSERT INTO updates VALUES('support',?)",(update['update_id'],))
        core.say('support',uid,f'Обращение #{tid} принято. Ответим здесь.',dedupe=f'ticket-received:{mid}',conn=c)
        for admin in core.ADMINS:
            # copyMessage hides sender identity and supports photos, documents and voice.
            core.say('support',admin,f'Обращение #{tid}. Ответ: /reply {tid} текст',dedupe=f'ticket-head:{mid}:{admin}',conn=c)
            db.enqueue('support','copyMessage',{'chat_id':admin,'from_chat_id':uid,'message_id':m['message_id']},f'ticket-copy:{mid}:{admin}',c)
            core.say('admin',admin,f'Обращение #{tid}\n{text}\n\n/reply {tid} текст',dedupe=f'ticket-admin:{mid}:{admin}',conn=c)

async def admin_update(update, bot='admin'):
    m=update.get('message') or update.get('callback_query',{}).get('message')
    if not m or m['chat']['type']!='private' or m['chat']['id'] not in core.ADMINS:
        return
    uid=m['chat']['id']; text=m.get('text','')
    cb=update.get('callback_query')
    if cb:
        await core.telegram(bot,'answerCallbackQuery',{'callback_query_id':cb['id']})
        text=cb['data']
    parts=text.split(maxsplit=2)
    command=parts[0] if parts else ''
    if command in ('/start','/admin','home'):
        core.say(bot,uid,'Управление магазином\n\n/price ID Stars — изменить цену\n/show ID · /hide ID — видимость\n/reply Номер текст — ответ поддержки\n/close Номер — закрыть обращение\n/refund ID_заказа — вернуть Stars после подтверждения поставщика\n/markup N — наценка %\n/rate N — курс USDT→Stars\n/sync [провайдер] — синхронизация\n/unmatched — несопоставленные предложения',[[core.button('Товары','/products'),core.button('Заказы','/orders')],[core.button('Поддержка','/tickets'),core.button('Синхр.','/sync')],[core.button('Веб-админка',url=os.getenv('PUBLIC_URL','https://example.com'))]])
    elif command=='/sync':
        prov = parts[1] if len(parts)>1 else None
        await core.sync_catalog(prov)
        core.say(bot,uid,f"Каталог обновлён{' от '+prov if prov else ''}. Баланс: {db.setting('balance','—')} USDT")
    elif command in ('/markup','/rate'):
        try:
            value=float(parts[1].replace(',','.'))
        except (IndexError,ValueError):
            raise ValueError(f'Формат: {command} число')
        if command=='/markup' and not 0<=value<=500 or command=='/rate' and not 0<value<=10000:
            raise ValueError('Недопустимое значение')
        db.set_setting('markup_percent' if command=='/markup' else 'usdt_to_stars_rate',value)
        core.rebuild_prices(); core.audit(uid,f'{command[1:]}:{value}')
        core.say(bot,uid,(f'Наценка: {value:g}%' if command=='/markup' else f'Курс USDT→Stars: {value:g}')+'. Цены пересчитаны.')
    elif command=='/unmatched':
        n=db.one('SELECT COUNT(*) n FROM provider_offerings WHERE product_id IS NULL')['n']
        core.say(bot,uid,f'Несопоставленных предложений: {n}. Сопоставьте в веб-админке → «Провайдеры».' if n else 'Все предложения сопоставлены.')
    elif command=='/products':
        products=db.rows('SELECT * FROM products ORDER BY id LIMIT 80')
        core.say(bot,uid,'\n'.join(f"#{p['id']} · {'В продаже' if p['visible'] else 'Скрыт'} · {p['stars']} ⭐ · {json.loads(p['data'])['title']}" for p in products) or 'Каталог пуст. /sync')
    elif command in ('/show','/hide','/price'):
        p=db.one('SELECT * FROM products WHERE id=?',(int(parts[1]),))
        if not p:
            raise ValueError('Товар не найден')
        core.set_product(p['id'],p['visible'] if command=='/price' else command=='/show',int(parts[2]) if command=='/price' else p['stars'],uid)
        core.say(bot,uid,'Товар обновлён.')
    elif command=='/orders':
        rows=db.rows('SELECT * FROM orders WHERE charge IS NOT NULL ORDER BY created DESC LIMIT 20')
        core.say(bot,uid,'\n'.join(f"{o['id']} · {core.status_label(o['state'])} · {o['stars']} ⭐ · {o['error'] or ''}" for o in rows) or 'Оплаченных заказов пока нет.')
    elif command=='/tickets':
        rows=db.rows("SELECT * FROM tickets WHERE state!='closed' ORDER BY id DESC LIMIT 30")
        core.say(bot,uid,'\n'.join(f"#{t['id']} · {t['state']}" for t in rows) or 'Открытых обращений нет.')
    elif command=='/reply':
        core.reply_ticket(int(parts[1]),parts[2],uid)
        core.say(bot,uid,'Ответ поставлен в очередь отправки от имени поддержки.')
    elif command=='/close':
        db.execute("UPDATE tickets SET state='closed' WHERE id=?",(int(parts[1]),))
        core.audit(uid,'close:'+parts[1]); core.say(bot,uid,'Обращение закрыто.')
    elif command=='/refund':
        core.request_refund(parts[1],uid); core.say(bot,uid,'Возврат поставлен в очередь.')

async def poll(bot):
    while True:
        try:
            offset=int(db.setting('offset:'+bot,'0'))
            updates=await core.telegram(bot,'getUpdates',{'offset':offset,'timeout':25,'allowed_updates':['message','callback_query','pre_checkout_query']})
            for update in updates:
                try:
                    uid=update.get('message',{}).get('chat',{}).get('id')
                    if bot=='shop':
                        await shop_update(update)
                    elif bot=='admin' or (bot=='support' and uid in core.ADMINS):
                        await admin_update(update,bot)
                    else:
                        await support_update(update)
                except (ValueError,IndexError,core.SupplierError) as e:
                    chat=update.get('message',{}).get('chat',{}).get('id') or update.get('callback_query',{}).get('message',{}).get('chat',{}).get('id')
                    if chat:
                        core.say(bot,chat,e.code if isinstance(e,core.SupplierError) else str(e))
                    if update.get('message',{}).get('successful_payment'):
                        core.audit('system','payment_review:'+str(update['update_id']))
                        for admin in core.ADMINS:
                            core.say('admin',admin,'Платёж требует ручной проверки. Update ID: '+str(update['update_id']))
                db.set_setting('offset:'+bot,update['update_id']+1)
        except Exception as e:
            db.set_setting('bot_error:'+bot,type(e).__name__)
            await asyncio.sleep(5)
