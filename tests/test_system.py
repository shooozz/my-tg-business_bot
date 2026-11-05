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
    async def fail_create(product_code, quantity, customer_data, provider_name=None):
        calls.append((product_code, quantity, dict(customer_data), provider_name))
        raise core.SupplierError('network_error',True)
    from app.providers.manager import get_manager
    monkeypatch.setattr(get_manager(),'create_order',fail_create)
    asyncio.run(core.process_order(db.one('SELECT * FROM orders')))
    asyncio.run(core.process_order(db.one('SELECT * FROM orders')))
    assert calls[0]==calls[1]
    assert calls[0][2]['order_id']==oid
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
    pid=db.one('SELECT id FROM products')['id']
    db.execute('INSERT INTO provider_offerings(product_id,provider,provider_product_id,name,description,price_usdt,available,in_stock,min_quantity,max_quantity,delivery_type,product_type,raw_data,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,'jaha','demo','Demo','Description',2.0,10,1,1,10,'automatic','account',json.dumps(p),time.time()))
    oid_offering=db.one('SELECT id FROM provider_offerings')['id']
    db.execute('UPDATE products SET best_offering_id=?,base_price_usdt=? WHERE id=?',(oid_offering,2.0,pid))
    from app.providers.manager import get_manager
    from app.providers.base import Order
    async def fake_create(product_code, quantity, customer_data, provider_name=None):
        assert quantity==5 and customer_data['order_id']
        return (provider_name or 'jaha'), Order(order_number='ORD-123',status='completed',delivery='five-items',instructions=None,provider_data={})
    monkeypatch.setattr(get_manager(),'create_order',fake_create)
    async def telegram(*args):return True
    monkeypatch.setattr(core,'telegram',telegram)
    async def scenario():
        await bots.begin_order(123,pid,5)
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


# ── New sync-engine tests ──────────────────────────────────────────────────────

def test_sync_markup_applied():
    """_rebuild_products_from_offerings applies markup% to compute stars."""
    from app.core import _rebuild_products_from_offerings
    db.set_setting('markup_percent', '10')
    db.set_setting('usdt_to_stars_rate', '50')
    pid=db.execute('INSERT INTO products(code,data,visible,stars,synced,base_price_usdt) VALUES(?,?,?,?,?,?)',('x','{}',0,0,0,0.0))
    oid=db.execute('INSERT INTO provider_offerings(product_id,provider,provider_product_id,name,description,price_usdt,available,in_stock,min_quantity,max_quantity,delivery_type,product_type,raw_data,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,'jaha','x','X','',2.0,5,1,1,5,'automatic','account','{}',time.time()))
    _rebuild_products_from_offerings()
    p=db.one('SELECT * FROM products WHERE id=?',(pid,))
    # 2.0 USDT * 1.10 markup * 50 rate = 110 stars
    assert p['stars']==110
    assert p['best_offering_id']==oid

def test_sync_dedup_picks_lowest_price():
    """When two offerings link to the same product, the cheaper one wins."""
    from app.core import _rebuild_products_from_offerings
    db.set_setting('markup_percent', '0')
    db.set_setting('usdt_to_stars_rate', '100')
    pid=db.execute('INSERT INTO products(code,data,visible,stars,synced,base_price_usdt) VALUES(?,?,?,?,?,?)',('y','{}',0,0,0,0.0))
    db.execute('INSERT INTO provider_offerings(product_id,provider,provider_product_id,name,description,price_usdt,available,in_stock,min_quantity,max_quantity,delivery_type,product_type,raw_data,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,'jaha','y1','Y','',5.0,1,1,1,1,'automatic','account','{}',time.time()))
    cheap=db.execute('INSERT INTO provider_offerings(product_id,provider,provider_product_id,name,description,price_usdt,available,in_stock,min_quantity,max_quantity,delivery_type,product_type,raw_data,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,'canboso','y2','Y','',3.0,1,1,1,1,'automatic','account','{}',time.time()))
    _rebuild_products_from_offerings()
    p=db.one('SELECT * FROM products WHERE id=?',(pid,))
    assert p['best_offering_id']==cheap   # cheaper canboso offering wins
    assert p['stars']==300               # 3.0 USDT * 0% markup * 100 rate = 300

def test_price_lock_preserved_on_sync():
    """A product with price_locked=1 keeps its manual stars price after sync."""
    from app.core import _rebuild_products_from_offerings
    db.set_setting('markup_percent', '10')
    db.set_setting('usdt_to_stars_rate', '50')
    pid=db.execute('INSERT INTO products(code,data,visible,stars,synced,base_price_usdt,price_locked) VALUES(?,?,?,?,?,?,?)',('z','{}',1,999,0,0.0,1))
    db.execute('INSERT INTO provider_offerings(product_id,provider,provider_product_id,name,description,price_usdt,available,in_stock,min_quantity,max_quantity,delivery_type,product_type,raw_data,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(pid,'jaha','z','Z','',10.0,1,1,1,1,'automatic','account','{}',time.time()))
    _rebuild_products_from_offerings()
    p=db.one('SELECT * FROM products WHERE id=?',(pid,))
    assert p['stars']==999  # locked: 10 USDT * 110% * 50 = 550 ignored

def test_canboso_vnd_normalization():
    """CanbosoProvider.get_products() converts VND prices to USDT correctly."""
    from app.providers.canboso import CanbosoProvider
    provider=CanbosoProvider('tgb_testkey')
    async def mock_request(method,path,body=None,idempotency_key=None):
        return {'products':[{'productId':'p1','name':'ChatGPT Plus','description':'test',
                              'productType':'account',
                              'price':{'amount':250000,'currency':'VND','text':'250.000 đ'},
                              'availability':{'available':10,'sold':0},'promotions':[]}]}
    import asyncio as _asyncio
    async def run():
        provider._request=mock_request
        return await provider.get_products()
    products=_asyncio.run(run())
    assert len(products)==1
    # 250000 VND * 0.00004 (default rate) = 10.0 USDT
    assert abs(products[0].price_usdt-10.0)<0.001
    assert products[0].name=='ChatGPT Plus'
    assert products[0].in_stock


class FakeManager:
    """Stands in for ProviderManager during sync tests."""
    def __init__(self, catalog):
        self.catalog = catalog
        self.providers = {name: None for name in catalog}
    async def get_products(self, name):
        return self.catalog[name]
    async def get_balance(self, name=None):
        return 1.0

def offer(code, name, price, category='Сервисы', available=5):
    from app.providers.base import Product
    return Product(code=code, name=name, description='', price_usdt=price, category=category,
                   in_stock=available > 0, provider_data={'available': available})

def test_full_sync_matches_legacy_codes_creates_categories_and_drops_removed(monkeypatch):
    db.set_setting('markup_percent','10'); db.set_setting('usdt_to_stars_rate','50')
    # Product saved by the old sync, before provider_offerings existed.
    db.execute('INSERT INTO products(code,data,visible,stars) VALUES(?,?,?,?)',('jaha:A',json.dumps({'title':'Old'}),1,10))
    fake = FakeManager({'jaha':[offer('A','Alpha',2.0), offer('B','Beta',1.0,'Игры')]})
    monkeypatch.setattr(core,'get_manager',lambda: fake)
    asyncio.run(core.sync_catalog())
    rows = {r['code']: r for r in db.rows('SELECT * FROM products')}
    assert set(rows) == {'jaha:A','jaha:B'}            # legacy row reused, no UNIQUE crash
    assert json.loads(rows['jaha:A']['data'])['title'] == 'Alpha'
    assert rows['jaha:A']['stars'] == 110               # 2.0 * 1.10 * 50
    cats = {c['name']: c['id'] for c in db.rows('SELECT * FROM categories')}
    assert rows['jaha:A']['category_id'] == cats['Сервисы'] and rows['jaha:B']['category_id'] == cats['Игры']
    # Supplier removes A: it must stop being sellable here.
    fake.catalog['jaha'] = [offer('B','Beta',1.0,'Игры')]
    asyncio.run(core.sync_catalog())
    assert json.loads(db.one("SELECT data FROM products WHERE code='jaha:A'")['data'])['available'] == 0

def test_cross_provider_dedup_by_name(monkeypatch):
    db.set_setting('markup_percent','0'); db.set_setting('usdt_to_stars_rate','10')
    fake = FakeManager({'jaha':[offer('J1','ChatGPT Plus 1 month',5.0)],
                        'canboso':[offer('C1','chatgpt plus - 1 month',3.0)]})
    monkeypatch.setattr(core,'get_manager',lambda: fake)
    asyncio.run(core.sync_catalog())
    products = db.rows('SELECT * FROM products')
    assert len(products) == 1 and products[0]['stars'] == 30   # one position, cheaper source
    best = db.one('SELECT provider FROM provider_offerings WHERE id=?',(products[0]['best_offering_id'],))
    assert best['provider'] == 'canboso'
    # The cheap source sells out: fall back to the other supplier.
    fake.catalog['canboso'] = [offer('C1','chatgpt plus - 1 month',3.0,available=0)]
    asyncio.run(core.sync_catalog())
    assert db.one('SELECT stars FROM products')['stars'] == 50

def test_category_markup_and_freeze():
    from app.core import rebuild_prices
    db.set_setting('markup_percent','10'); db.set_setting('usdt_to_stars_rate','100')
    cid = db.execute("INSERT INTO categories(name,slug,markup_percent) VALUES('VIP','vip',50)")
    pid = db.execute('INSERT INTO products(code,data,stars,category_id) VALUES(?,?,?,?)',('v',json.dumps({'title':'Mine'}),0,cid))
    db.execute("INSERT INTO provider_offerings(product_id,provider,provider_product_id,name,price_usdt,available,in_stock,raw_data,fetched_at) VALUES(?,'jaha','v','Supplier',1.0,3,1,'{}',0)",(pid,))
    rebuild_prices()
    assert db.one('SELECT stars FROM products')['stars'] == 150     # category 50% beats global 10%
    db.execute('UPDATE categories SET auto_update=0 WHERE id=?',(cid,))
    db.execute("UPDATE provider_offerings SET price_usdt=9.0, name='Renamed', available=0")
    rebuild_prices()
    p = db.one('SELECT * FROM products'); d = json.loads(p['data'])
    assert p['stars'] == 150 and d['title'] == 'Supplier'           # frozen: price and name kept
    assert d['available'] == 0                                       # stock still follows supplier

def test_manual_edit_locks_field_and_unlock_restores(monkeypatch):
    db.set_setting('markup_percent','0'); db.set_setting('usdt_to_stars_rate','10')
    pid = db.execute('INSERT INTO products(code,data,stars) VALUES(?,?,?)',('m',json.dumps({'title':'Sup'}),0))
    db.execute("INSERT INTO provider_offerings(product_id,provider,provider_product_id,name,price_usdt,available,in_stock,raw_data,fetched_at) VALUES(?,'jaha','m','Sup',2.0,3,1,'{}',0)",(pid,))
    core.rebuild_prices()
    with TestClient(app) as c:
        token = c.post('/api/login',json={'password':'test-password-at-least-16'}).json()['csrf']
        h = {'X-CSRF-Token': token}
        assert c.put(f'/api/products/{pid}',headers=h,json={'stars':77,'name':'Моё'}).status_code == 200
        core.rebuild_prices()
        p = db.one('SELECT * FROM products')
        assert (p['stars'], p['price_locked'], p['name_locked']) == (77, 1, 1)
        assert json.loads(p['data'])['title'] == 'Моё'
        # Old admin panel sends only visible+stars: locks must survive.
        assert c.put(f'/api/products/{pid}',headers=h,json={'visible':True,'stars':77}).status_code == 200
        assert db.one('SELECT name_locked FROM products')['name_locked'] == 1
        # Unlocking price returns to the automatic price immediately.
        assert c.put(f'/api/products/{pid}',headers=h,json={'price_locked':False}).status_code == 200
        assert db.one('SELECT stars FROM products')['stars'] == 20

def test_migration_keeps_hand_set_prices(monkeypatch):
    # Simulate a database from before auto-markup: hand-set price, no lock, no migration flag.
    db.execute("DELETE FROM settings WHERE key='migrated_price_locks'")
    db.execute('INSERT INTO products(code,data,visible,stars) VALUES(?,?,?,?)',('jaha:A',json.dumps({'title':'A'}),1,333))
    db.execute('INSERT INTO products(code,data,visible,stars) VALUES(?,?,?,?)',('jaha:B',json.dumps({'title':'B'}),0,0))
    db.execute('UPDATE products SET price_locked=0')
    db.init()
    db.init()  # second start must not re-run the migration
    fake = FakeManager({'jaha':[offer('A','A',2.0), offer('B','B',1.0), offer('C','New',1.0)]})
    monkeypatch.setattr(core,'get_manager',lambda: fake)
    asyncio.run(core.sync_catalog())
    rows = {r['code']: r for r in db.rows('SELECT * FROM products')}
    assert rows['jaha:A']['stars'] == 333 and rows['jaha:A']['price_locked'] == 1  # hand price kept
    assert rows['jaha:B']['price_locked'] == 0 and rows['jaha:B']['stars'] > 0     # had no price: auto
    assert rows['jaha:C']['price_locked'] == 0                                     # new product: auto

def test_jaha_order_body_has_only_documented_fields():
    from app.providers.jaha import JahaProvider
    provider = JahaProvider('jaha_live_test'); sent = {}
    async def fake_request(method, path, body=None, idempotency_key=None):
        sent.update(body=body, key=idempotency_key)
        return {'order':{'order_number':'N1','status':'processing'}}
    provider._request = fake_request
    asyncio.run(provider.create_order('code-1', 2, {'order_id':'a'*32,'max_unit_price_usdt':'1.5'}))
    assert sent['body'] == {'product_code':'code-1','quantity':2,'external_order_id':'a'*32,'max_unit_price_usdt':'1.5'}
    assert sent['key'] == 'a'*32
