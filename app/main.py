import asyncio
import contextlib
import hashlib
import hmac
import os
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
    if request.url.path.startswith('/api/') and request.url.path!='/api/login':
        session=SESSIONS.get(request.cookies.get('session',''))
        if not session or session['expires']<time.time():
            return JSONResponse({'detail':'Войдите в админку'},status_code=401)
        if request.method!='GET' and not hmac.compare_digest(request.headers.get('X-CSRF-Token',''),session['csrf']):
            return JSONResponse({'detail':'Обновите страницу и повторите'},status_code=403)
        request.state.session=session
    response=await call_next(request)
    response.headers.update({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"})
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
    products=db.rows('SELECT * FROM products ORDER BY id')
    for p in products:
        p['data']=json.loads(p['data'])
    orders=db.rows('SELECT id,user_id,product_id,stars,state,supplier_number,error,created FROM orders WHERE charge IS NOT NULL ORDER BY created DESC LIMIT 200')
    tickets=db.rows('SELECT * FROM tickets ORDER BY id DESC LIMIT 200')
    for t in tickets:
        t['messages']=db.rows('SELECT * FROM messages WHERE ticket_id=? ORDER BY id',(t['id'],))
        for m in t['messages']:
            m['text']=core.unseal(m['text'])
    return {'products':products,'orders':orders,'tickets':tickets,'balance':db.setting('balance','—'),'catalog_sync':db.setting('catalog_sync','0'),'catalog_error':db.setting('catalog_error'),'pending_messages':db.one('SELECT COUNT(*) n FROM outbox WHERE sent=0')['n'],'audit':db.rows('SELECT * FROM audit ORDER BY id DESC LIMIT 30'),'configured':{k:bool(v) for k,v in core.TOKENS.items()},'supplier_configured':bool(os.getenv('JAHA_API_KEY'))}

class ProductEdit(BaseModel):
    visible:bool
    stars:int=Field(ge=0,le=1000000)

@app.put('/api/products/{pid}')
async def product(pid:int,body:ProductEdit):
    try:
        core.set_product(pid,body.visible,body.stars,'web')
    except ValueError as e:
        raise HTTPException(400,str(e))
    return {'ok':True}

@app.post('/api/sync')
async def sync():
    if not os.getenv('JAHA_API_KEY'):
        raise HTTPException(400,'Добавьте JAHA_API_KEY в .env сервера')
    try:
        await core.sync_catalog()
        db.set_setting('catalog_error','')
    except core.SupplierError as e:
        raise HTTPException(502,e.code)
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
        raise HTTPException(400,'Нет номера поставщика. Неопределённую покупку нужно сверить с поддержкой Jaha.')
    if o['state'] in ('customer_refunded','refund_pending'):
        raise HTTPException(400,'Для заказа уже оформлен возврат покупателю')
    try:
        from urllib.parse import quote
        snapshot=(await core.jaha('GET','/orders/'+quote(o['supplier_number'],safe='')+'?include_additions=true'))['order']
        core.store_snapshot(oid,snapshot)
    except core.SupplierError as e:
        raise HTTPException(502,e.code)
    return {'ok':True}

STATIC=Path(__file__).parent/'static'
app.mount('/static',StaticFiles(directory=STATIC),name='static')

@app.get('/')
async def index():
    return FileResponse(STATIC/'index.html')
