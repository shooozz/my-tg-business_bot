import asyncio
import json
import time
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from app import db, core, bots
from app.main import app, SESSIONS, ATTEMPTS

@pytest.fixture(autouse=True)
def isolated(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'PATH',str(tmp_path/'shop.db'))
    monkeypatch.setenv('DATA_KEY',Fernet.generate_key().decode())
    monkeypatch.setenv('ADMIN_PASSWORD','test-password-at-least-16')
    monkeypatch.setenv('RUN_BOTS','false')
    monkeypatch.setenv('COOKIE_SECURE','false')
    db.init(); SESSIONS.clear(); ATTEMPTS.clear()

def order(state='invoice'):
    oid='a'*32
    body={'product_code':'demo-product','quantity':1,'max_unit_price_usdt':'1.0000','external_order_id':oid}
    db.execute('INSERT INTO orders(id,user_id,product_id,stars,body,state,created) VALUES(?,?,?,?,?,?,?)',(oid,123,1,50,core.seal(body),state,time.time()))
    return oid

def payment(oid):
    return {'invoice_payload':oid,'currency':'XTR','total_amount':50,'telegram_payment_charge_id':'charge-1'}

def test_duplicate_payment_is_idempotent():
    oid=order(); core.accept_payment(123,payment(oid)); core.accept_payment(123,payment(oid))
    assert db.one('SELECT state FROM orders')['state']=='paid'
    assert len(db.rows('SELECT * FROM outbox'))==1

@pytest.mark.parametrize('user,currency,amount',[(124,'XTR',50),(123,'USD',50),(123,'XTR',1)])
def test_payment_mismatch_rejected(user,currency,amount):
    oid=order(); p=payment(oid); p.update(currency=currency,total_amount=amount)
    with pytest.raises(ValueError):core.accept_payment(user,p)
    assert db.one('SELECT charge FROM orders')['charge'] is None

def test_late_additions_are_sent_once_and_encrypted():
    oid=order('paid'); snap={'order_number':'ORD-1','status':'completed','delivery':'secret-password','instructions':None}
    core.store_snapshot(oid,snap); core.store_snapshot(oid,snap)
    assert len(db.rows('SELECT * FROM outbox'))==1
    snap['delivery']+='\n\nlate activation'
    core.store_snapshot(oid,snap)
    assert len(db.rows('SELECT * FROM outbox'))==2
    assert 'secret-password' not in db.one('SELECT snapshot FROM orders')['snapshot']
    assert 'secret-password' not in db.one('SELECT payload FROM outbox')['payload']

def test_network_retry_preserves_body_and_key(monkeypatch):
    oid=order('paid'); calls=[]
    async def fail(method,path,body,key):
        calls.append((body,key)); raise core.SupplierError('network_error',True)
    monkeypatch.setattr(core,'jaha',fail)
    asyncio.run(core.process_order(db.one('SELECT * FROM orders')))
    asyncio.run(core.process_order(db.one('SELECT * FROM orders')))
    assert calls[0]==calls[1]
    assert calls[0][1]==oid
    assert db.one('SELECT state FROM orders')['state']=='paid'

def test_unsafe_refund_blocked():
    oid=order('attention'); db.execute("UPDATE orders SET error='network_error'")
    with pytest.raises(ValueError):core.request_refund(oid,'test')
    db.execute("UPDATE orders SET error='out_of_stock'")
    core.request_refund(oid,'test')
    assert db.one('SELECT state FROM orders')['state']=='refund_pending'
    core.store_snapshot(oid,{'order_number':'ORD-1','status':'completed','delivery':'late'})
    assert db.one('SELECT state FROM orders')['state']=='refund_pending'

def test_admin_auth_csrf_and_price():
    with TestClient(app) as c:
        assert c.get('/api/dashboard').status_code==401
        token=c.post('/api/login',json={'password':'test-password-at-least-16'}).json()['csrf']
        assert c.post('/api/sync').status_code==403
        assert c.get('/api/dashboard').status_code==200
        db.execute('INSERT INTO products(code,data) VALUES(?,?)',('demo','{}'))
        assert c.put('/api/products/1',headers={'X-CSRF-Token':token},json={'visible':True,'stars':0}).status_code==400
        assert c.put('/api/products/1',headers={'X-CSRF-Token':token},json={'visible':True,'stars':50}).status_code==200
        assert c.get('/').status_code==200

def test_support_dedupe_and_anonymous_reply(monkeypatch):
    monkeypatch.setattr(core,'ADMINS',{999})
    update={'update_id':1,'message':{'message_id':5,'chat':{'id':123,'type':'private'},'text':'Помогите'}}
    asyncio.run(bots.support_update(update)); asyncio.run(bots.support_update(update))
    assert len(db.rows('SELECT * FROM tickets'))==1
    assert len(db.rows('SELECT * FROM messages'))==1
    core.reply_ticket(1,'Здравствуйте, поможем','web')
    msg=db.one("SELECT * FROM outbox WHERE dedupe='reply:2:0'")
    assert msg['bot']=='support'
    assert core.unseal(msg['payload'])['chat_id']==123

def test_non_admin_cannot_edit_price(monkeypatch):
    monkeypatch.setattr(core,'ADMINS',{999})
    db.execute('INSERT INTO products(code,data,stars) VALUES(?,?,?)',('demo','{}',50))
    asyncio.run(bots.admin_update({'message':{'chat':{'id':123,'type':'private'},'text':'/price 1 1'}}))
    assert db.one('SELECT stars FROM products')['stars']==50

def test_order_details_are_owner_scoped(monkeypatch):
    oid=order('paid')
    async def fake(*args):return True
    monkeypatch.setattr(core,'telegram',fake)
    with pytest.raises(ValueError):
        asyncio.run(bots.shop_update({'callback_query':{'id':'x','data':'order:'+oid,'message':{'chat':{'id':555,'type':'private'}}}}))

def test_checkout_to_delivery_with_mock_services(monkeypatch):
    monkeypatch.setenv('SHOP_TERMS','Тестовые условия магазина')
    p={'code':'demo','title':'Demo','description':'Description','variant':'1 month','period':'30 days','min_quantity':1,'max_quantity':10,'available':10,'price_usdt':'2.0000','status':'available','delivery_type':'automatic','buyer_input':{'required':False}}
    db.execute('INSERT INTO products(code,data,visible,stars,synced) VALUES(?,?,?,?,?)',('demo',json.dumps(p),1,100,time.time()))
    async def supplier(method,path,body=None,key=None):
        if method=='GET':return {'product':p}
        assert body['quantity']==5 and body['max_unit_price_usdt']=='2.0000'
        assert key==body['external_order_id']
        return {'order':{'order_number':'ORD-123','status':'completed','delivery':'five-items'}}
    async def telegram(*args):return True
    monkeypatch.setattr(core,'jaha',supplier)
    monkeypatch.setattr(core,'telegram',telegram)
    async def scenario():
        await bots.begin_order(123,1,5)
        draft=core.unseal(db.setting('draft:123'))
        await bots.shop_update({'callback_query':{'id':'cb','data':'confirm:'+draft['id'],'message':{'chat':{'id':123,'type':'private'}}}})
        o=db.one('SELECT * FROM orders')
        assert o['stars']==500 and o['state']=='invoice'
        pay=payment(o['id']);pay['total_amount']=500
        core.accept_payment(123,pay)
        await core.process_order(db.one('SELECT * FROM orders'))
        assert db.one('SELECT state FROM orders')['state']=='completed'
        assert len(db.rows('SELECT * FROM payments'))==1
    asyncio.run(scenario())
