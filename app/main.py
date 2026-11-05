import asyncio
import contextlib
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from . import db, core, bots

SESSIONS = {}
ATTEMPTS = {}

@contextlib.asynccontextmanager
async def lifespan(app):
    db.init()
    if len(os.getenv('ADMIN_PASSWORD',''))<16:
        raise RuntimeError('ADMIN_PASSWORD must be at least 16 characters')
    core.cipher()
    tasks=[]
    if os.getenv('RUN_BOTS','true')=='true':
        tasks=[asyncio.create_task(core.worker()),asyncio.create_task(core.send_outbox())]
        tasks += [asyncio.create_task(bots.poll(k)) for k,v in core.TOKENS.items() if v]
    yield
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks,return_exceptions=True)

app=FastAPI(title='Digital Market',lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)

@app.middleware('http')
async def security(request,call_next):
    path = request.url.path
    is_public = path.startswith('/api/public/')
    if path.startswith('/api/') and path!='/api/login' and not is_public:
        session=SESSIONS.get(request.cookies.get('session',''))
        if not session or session['expires']<time.time():
            return JSONResponse({'detail':'Войдите в админку'},status_code=401)
        if request.method!='GET' and not hmac.compare_digest(request.headers.get('X-CSRF-Token',''),session['csrf']):
            return JSONResponse({'detail':'Обновите страницу и повторите'},status_code=403)
        request.state.session=session
    response=await call_next(request)
    # Product images come from supplier CDNs, hence https: in img-src.
    response.headers.update({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'none'"})
    if path.startswith('/assets/'):
        response.headers['Cache-Control']='public, max-age=31536000, immutable'  # hashed file names
    elif is_public and response.status_code==200:
        response.headers['Cache-Control']='public, max-age=60'
    else:
        response.headers['Cache-Control']='no-store'
    return response

class Login(BaseModel):
    password: str=Field(max_length=512)

@app.post('/api/login')
async def login(body:Login,request:Request):
    ip=request.client.host
    recent=[t for t in ATTEMPTS.get(ip,[]) if t>time.time()-900]
    ATTEMPTS[ip]=recent
    if len(recent)>=10:
        raise HTTPException(429,'Слишком много попыток. Подождите 15 минут.')
    expected=os.getenv('ADMIN_PASSWORD','')
    if not expected or not hmac.compare_digest(hashlib.sha256(body.password.encode()).digest(),hashlib.sha256(expected.encode()).digest()):
        recent.append(time.time())
        raise HTTPException(401,'Неверный пароль')
    for key in list(SESSIONS):
        if SESSIONS[key]['expires']<time.time():
            del SESSIONS[key]
    token=secrets.token_urlsafe(32)
    SESSIONS[token]={'csrf':secrets.token_urlsafe(32),'expires':time.time()+28800}
    result=JSONResponse({'csrf':SESSIONS[token]['csrf']})
    result.set_cookie('session',token,httponly=True,secure=os.getenv('COOKIE_SECURE','true')=='true',samesite='strict',max_age=28800)
    core.audit('web','login')
    return result

@app.get('/api/session')
async def session(request:Request):
    return {'csrf':request.state.session['csrf']}

@app.post('/api/logout')
async def logout(request:Request):
    SESSIONS.pop(request.cookies.get('session',''),None)
    result=JSONResponse({'ok':True}); result.delete_cookie('session'); return result

@app.get('/health')
async def health():
    db.one('SELECT 1')
    return {'status':'ok'}


@app.get('/api/dashboard')
async def dashboard():
    import json
    from .providers.manager import get_manager

    products=db.rows('SELECT * FROM products ORDER BY id')
    for p in products:
        p['data']=json.loads(p['data'])
    orders=db.rows('SELECT id,user_id,product_id,stars,state,supplier_number,error,provider,created FROM orders WHERE charge IS NOT NULL ORDER BY created DESC LIMIT 200')
    tickets=db.rows('SELECT * FROM tickets ORDER BY id DESC LIMIT 200')
    for t in tickets:
        t['messages']=db.rows('SELECT * FROM messages WHERE ticket_id=? ORDER BY id',(t['id'],))
        for m in t['messages']:
            m['text']=core.unseal(m['text'])

    # Get provider info
    manager = get_manager()
    providers_info = manager.list_providers()

    # Get balances from all providers
    # Cached by sync_catalog; asking suppliers on every page load burns their rate limits.
    balances = json.loads(db.setting('balances', '{}') or '{}')

    return {
        'products':products,
        'orders':orders,
        'tickets':tickets,
        'balance':db.setting('balance','—'),
        'catalog_sync':db.setting('catalog_sync','0'),
        'catalog_error':db.setting('catalog_error'),
        'pending_messages':db.one('SELECT COUNT(*) n FROM outbox WHERE sent=0')['n'],
        'audit':db.rows('SELECT * FROM audit ORDER BY id DESC LIMIT 30'),
        'configured':{k:bool(v) for k,v in core.TOKENS.items()},
        'supplier_configured':bool(os.getenv('JAHA_API_KEY')) or bool(os.getenv('CANBOSO_API_KEY')),
        'providers': providers_info,
        'balances': balances,
        'categories': db.rows('SELECT * FROM categories ORDER BY sort_order, name'),
        'markup_percent': float(db.setting('markup_percent', '10')),
        'sync_period': int(db.setting('sync_period', '900')),
        'auto_publish': db.setting('auto_publish', '1') == '1',
        'usdt_to_stars_rate': float(db.setting('usdt_to_stars_rate', '50')),
        'vnd_to_usdt_rate': float(db.setting('vnd_to_usdt_rate', '0.00004')),
        'offering_count': db.one('SELECT COUNT(*) n FROM provider_offerings')['n'],
        'unmatched_count': db.one('SELECT COUNT(*) n FROM provider_offerings WHERE product_id IS NULL')['n'],
    }


class ProductEdit(BaseModel):
    # Omitted fields keep their current value. A changed name/description/
    # price/category locks that field unless its *_locked flag is sent.
    visible: bool | None = None
    stars: int | None = Field(default=None, ge=0, le=1000000)
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=4000)
    category_id: int | None = None
    name_locked: bool | None = None
    description_locked: bool | None = None
    price_locked: bool | None = None
    category_locked: bool | None = None

@app.put('/api/products/{pid}')
async def product(pid:int,body:ProductEdit):
    row = db.one('SELECT * FROM products WHERE id=?', (pid,))
    if not row:
        raise HTTPException(404,'Товар не найден')
    data = json.loads(row['data']) if row['data'] else {}
    sent = body.model_fields_set
    visible = row['visible'] if body.visible is None else int(body.visible)
    stars = row['stars'] if body.stars is None else body.stars
    if visible and stars < 1:
        raise HTTPException(400,'Укажите цену от 1 до 1 000 000 Stars')
    if body.category_id is not None and not db.one('SELECT id FROM categories WHERE id=?',(body.category_id,)):
        raise HTTPException(400,'Категория не найдена')

    def lock(flag, changed, current):
        if flag is not None:
            return int(flag)
        return 1 if changed else current

    name_changed = body.name is not None and body.name != data.get('title')
    desc_changed = body.description is not None and body.description != data.get('description')
    price_changed = body.stars is not None and body.stars != row['stars']
    cat_changed = 'category_id' in sent and body.category_id != row['category_id']
    if name_changed: data['title'] = body.name
    if desc_changed: data['description'] = body.description
    locks = (lock(body.name_locked, name_changed, row['name_locked']),
             lock(body.description_locked, desc_changed, row['description_locked']),
             lock(body.price_locked, price_changed, row['price_locked']),
             lock(body.category_locked, cat_changed, row['category_locked']))
    db.execute('UPDATE products SET visible=?, stars=?, category_id=?, data=?, name_locked=?, '
               'description_locked=?, price_locked=?, category_locked=? WHERE id=?',
               (visible, stars, body.category_id if 'category_id' in sent else row['category_id'],
                json.dumps(data, ensure_ascii=False), *locks, pid))
    # Unlocking a field should show the supplier value right away, not after the next sync.
    if any(old and not new for old, new in zip((row['name_locked'],row['description_locked'],row['price_locked'],row['category_locked']), locks)):
        core.rebuild_prices()
    core.audit('web', f'product:{pid}:visible={visible}:stars={stars}:locks={"".join(map(str,locks))}')
    return {'ok':True}


class BulkEdit(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=1000)
    visible: bool | None = None
    category_id: int | None = None

@app.post('/api/products/bulk')
async def bulk_products(body: BulkEdit):
    """Show/hide or move many products at once (category management)."""
    marks = ','.join('?'*len(body.ids))
    if body.visible is not None:
        # Products without a price cannot go on sale.
        db.execute(f'UPDATE products SET visible=? WHERE id IN ({marks}) AND (stars>0 OR ?=0)',
                   (int(body.visible), *body.ids, int(body.visible)))
    if 'category_id' in body.model_fields_set:
        db.execute(f'UPDATE products SET category_id=?, category_locked=1 WHERE id IN ({marks})',
                   (body.category_id, *body.ids))
    core.audit('web', f'bulk:{len(body.ids)}:visible={body.visible}:cat={body.category_id}')
    return {'ok':True}

@app.post('/api/sync')
async def sync(provider: str = None):
    from .providers.manager import get_manager

    manager = get_manager()

    # Check if any provider is configured
    if not manager.providers:
        raise HTTPException(400,'Добавьте JAHA_API_KEY или CANBOSO_API_KEY в .env сервера')

    if provider and provider not in manager.providers:
        raise HTTPException(400,f'Провайдер {provider} не настроен')
    try:
        await core.sync_catalog(provider)
    except core.SupplierError as e:
        raise HTTPException(502,e.code)
    error = db.setting('catalog_error')
    if error:
        # Partial failure: other suppliers were still synced.
        raise HTTPException(502,f'Не удалось обновить: {error}')
    return {'ok':True}


class Reply(BaseModel):
    text:str=Field(min_length=1,max_length=3500)

@app.post('/api/tickets/{tid}/reply')
async def reply(tid:int,body:Reply):
    try:
        core.reply_ticket(tid,body.text,'web')
    except ValueError as e:
        raise HTTPException(400,str(e))
    return {'ok':True}

@app.post('/api/tickets/{tid}/close')
async def close(tid:int):
    db.execute("UPDATE tickets SET state='closed' WHERE id=?",(tid,))
    core.audit('web',f'close:{tid}')
    return {'ok':True}

@app.post('/api/orders/{oid}/refund')
async def refund(oid:str):
    try:
        core.request_refund(oid,'web')
    except ValueError as e:
        raise HTTPException(400,str(e))
    return {'ok':True}

@app.post('/api/orders/{oid}/check')
async def check_order(oid:str):
    o=db.one('SELECT * FROM orders WHERE id=?',(oid,))
    if not o or not o['supplier_number']:
        raise HTTPException(400,'Нет номера поставщика. Неопределённую покупку нужно сверить с поддержкой.')
    if o['state'] in ('customer_refunded','refund_pending'):
        raise HTTPException(400,'Для заказа уже оформлен возврат покупателю')
    try:
        provider_name = o.get('provider', 'jaha')
        snapshot = await core.check_order_status(oid, provider_name)
        core.store_snapshot(oid,snapshot)
    except core.SupplierError as e:
        raise HTTPException(502,e.code)
    return {'ok':True}

@app.get('/api/providers')
async def list_providers():
    """List all configured providers."""
    from .providers.manager import get_manager
    manager = get_manager()
    return {'providers': manager.list_providers()}


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    parent_id: int | None = None
    sort_order: int = 0
    auto_update: bool = True
    # None = use the global markup
    markup_percent: float | None = Field(default=None, ge=0, le=500)

@app.get('/api/categories')
async def list_categories():
    cats = db.rows('SELECT * FROM categories ORDER BY sort_order, name')
    for c in cats:
        c['product_count'] = db.one('SELECT COUNT(*) n FROM products WHERE category_id=?', (c['id'],))['n']
    return {'categories': cats}

@app.post('/api/categories')
async def create_category(body: CategoryCreate):
    slug = re.sub(r'[^a-z0-9]+', '-', body.name.lower()).strip('-') + '-' + str(int(time.time()))
    cid = db.execute('INSERT INTO categories(name,slug,parent_id,sort_order,auto_update,markup_percent) VALUES(?,?,?,?,?,?)',
                     (body.name, slug, body.parent_id, body.sort_order, int(body.auto_update), body.markup_percent))
    core.audit('web', f'category:create:{cid}:{body.name}')
    return {'id': cid}

@app.put('/api/categories/{cid}')
async def update_category(cid: int, body: CategoryCreate):
    if not db.one('SELECT id FROM categories WHERE id=?', (cid,)):
        raise HTTPException(404, 'Категория не найдена')
    if body.parent_id == cid:
        raise HTTPException(400, 'Категория не может быть вложена сама в себя')
    db.execute('UPDATE categories SET name=?,parent_id=?,sort_order=?,auto_update=?,markup_percent=? WHERE id=?',
               (body.name, body.parent_id, body.sort_order, int(body.auto_update), body.markup_percent, cid))
    core.rebuild_prices()
    core.audit('web', f'category:update:{cid}:{body.name}:markup={body.markup_percent}')
    return {'ok': True}

@app.delete('/api/categories/{cid}')
async def delete_category(cid: int):
    if not db.one('SELECT id FROM categories WHERE id=?', (cid,)):
        raise HTTPException(404, 'Категория не найдена')
    db.execute('UPDATE products SET category_id=NULL WHERE category_id=?', (cid,))
    db.execute('DELETE FROM categories WHERE id=?', (cid,))
    core.audit('web', f'category:delete:{cid}')
    return {'ok': True}


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingsEdit(BaseModel):
    markup_percent: float = Field(ge=0, le=200)
    usdt_to_stars_rate: float = Field(gt=0, le=10000)
    vnd_to_usdt_rate: float = Field(gt=0)
    sync_period: int = Field(ge=60, le=86400)
    auto_publish: bool = True

@app.get('/api/settings')
async def get_settings():
    return {
        'markup_percent': float(db.setting('markup_percent', '10')),
        'usdt_to_stars_rate': float(db.setting('usdt_to_stars_rate', '50')),
        'vnd_to_usdt_rate': float(db.setting('vnd_to_usdt_rate', '0.00004')),
        'sync_period': int(db.setting('sync_period', '900')),
        'auto_publish': db.setting('auto_publish', '1') == '1',
    }

@app.put('/api/settings')
async def update_settings(body: SettingsEdit):
    db.set_setting('auto_publish', '1' if body.auto_publish else '0')
    db.set_setting('markup_percent', str(body.markup_percent))
    db.set_setting('usdt_to_stars_rate', str(body.usdt_to_stars_rate))
    db.set_setting('vnd_to_usdt_rate', str(body.vnd_to_usdt_rate))
    db.set_setting('sync_period', str(body.sync_period))
    core.rebuild_prices()  # new markup/rate applies immediately, no supplier calls
    core.audit('web', f'settings:markup={body.markup_percent}:rate={body.usdt_to_stars_rate}:period={body.sync_period}')
    return {'ok': True}


# ── Provider Offerings ────────────────────────────────────────────────────────

@app.get('/api/offerings')
async def list_offerings():
    offerings = db.rows(
        'SELECT o.id, o.product_id, o.provider, o.provider_product_id, o.name, '
        'o.description, o.price_usdt, o.available, o.in_stock, o.delivery_type, '
        'o.product_type, o.fetched_at, p.data as product_data '
        'FROM provider_offerings o LEFT JOIN products p ON o.product_id=p.id '
        'ORDER BY (o.product_id IS NULL) DESC, o.fetched_at DESC LIMIT 500'
    )
    return {'offerings': offerings}

class OfferingLink(BaseModel):
    product_id: int | None = None

@app.put('/api/offerings/{oid}/link')
async def link_offering(oid: int, body: OfferingLink):
    if not db.one('SELECT id FROM provider_offerings WHERE id=?', (oid,)):
        raise HTTPException(404, 'Предложение не найдено')
    if body.product_id is not None and not db.one('SELECT id FROM products WHERE id=?', (body.product_id,)):
        raise HTTPException(400, 'Товар не найден')
    db.execute('UPDATE provider_offerings SET product_id=? WHERE id=?', (body.product_id, oid))
    core.rebuild_prices()
    core.audit('web', f'offering:link:{oid}->product:{body.product_id}')
    return {'ok': True}


# ── Public (no-auth) ──────────────────────────────────────────────────────────

@app.get('/api/public/shop-bot')
async def public_shop_bot():
    return {'username': os.getenv('SHOP_BOT_USERNAME', '').lstrip('@'),
            'shop_name': os.getenv('SHOP_NAME', 'ByBlock')}

@app.get('/api/public/categories')
async def public_categories():
    cats = db.rows(
        'SELECT c.id, c.name, c.slug, c.parent_id, c.sort_order, COUNT(p.id) AS product_count '
        'FROM categories c LEFT JOIN products p ON p.category_id=c.id AND p.visible=1 AND p.stars>0 '
        "AND json_extract(p.data,'$.available')>0 "
        'GROUP BY c.id ORDER BY c.sort_order'
    )
    return {'categories': [c for c in cats if c['product_count'] > 0]}

@app.get('/api/public/products')
async def public_products(category_id: int = None, page: int = 0, q: str = ''):
    if category_id:
        prods = db.rows(
            'SELECT p.* FROM products p WHERE p.visible=1 AND p.stars>0 AND p.category_id=? ORDER BY p.id',
            (category_id,)
        )
    else:
        prods = db.rows('SELECT * FROM products WHERE visible=1 AND stars>0 ORDER BY id')
    result = []
    q_lower = q.lower() if q else ''
    for p in prods:
        d = json.loads(p['data'])
        if not d.get('available'):
            continue
        if q_lower and q_lower not in d.get('title', '').lower() and q_lower not in d.get('description', '').lower():
            continue
        result.append({'id': p['id'], 'name': d.get('title', ''), 'description': d.get('description', ''),
                        'stars': p['stars'], 'category_id': p['category_id'],
                        'delivery_type': d.get('delivery_type', 'automatic'),
                        'image': d.get('image', ''), 'emoji': d.get('emoji', ''),
                        'available': d.get('available', 0)})
    start = page * 20
    return {'products': result[start:start+20], 'total': len(result), 'page': page}

@app.get('/api/public/products/{pid}')
async def public_product(pid: int):
    row = db.one(
        'SELECT p.*, o.delivery_type AS o_delivery, o.available AS o_avail, '
        'o.min_quantity, o.max_quantity '
        'FROM products p LEFT JOIN provider_offerings o ON p.best_offering_id=o.id '
        'WHERE p.id=? AND p.visible=1 AND p.stars>0', (pid,)
    )
    if not row:
        raise HTTPException(404, 'Товар не найден')
    d = json.loads(row['data'])
    return {
        'id': row['id'], 'name': d.get('title', ''), 'description': d.get('description', ''),
        'stars': row['stars'], 'category_id': row['category_id'],
        'delivery_type': row.get('o_delivery') or d.get('delivery_type', 'automatic'),
        'image': d.get('image', ''), 'emoji': d.get('emoji', ''),
        'available': d.get('available', 0),
        'min_quantity': row.get('min_quantity', 1), 'max_quantity': row.get('max_quantity', 1),
    }


STATIC=Path(__file__).parent/'static'
# React build output (frontend/ -> npm run build). Absent in a fresh checkout,
# in which case the legacy vanilla admin keeps working at / and /admin.
WEB=Path(__file__).parent/'web'
app.mount('/static',StaticFiles(directory=STATIC),name='static')
if (WEB/'assets').is_dir():
    app.mount('/assets',StaticFiles(directory=WEB/'assets'),name='assets')

def _page(name):
    built = WEB/name
    return FileResponse(built if built.is_file() else STATIC/'index.html')

@app.get('/')
async def index():
    return _page('store.html')

@app.get('/admin')
async def admin_index():
    return _page('admin.html')
