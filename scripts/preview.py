"""Local UI preview. Uses an isolated database, no bots, no real secrets.

--demo fills the preview database with sample supplier positions by running
the real sync engine against a fake supplier (two providers, one duplicate).
"""
import asyncio
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.fernet import Fernet
os.environ.update(RUN_BOTS='false',COOKIE_SECURE='false',ADMIN_PASSWORD='local-preview-only-2026',DATA_KEY=Fernet.generate_key().decode(),DB_PATH='data/preview.db',SHOP_BOT_TOKEN='',ADMIN_BOT_TOKEN='',SUPPORT_BOT_TOKEN='',JAHA_API_KEY='',SHOP_BOT_USERNAME=os.getenv('SHOP_BOT_USERNAME','demo_shop_bot'))
import uvicorn


def seed_demo():
    from app import core, db
    from app.providers.base import Product

    def item(code, name, price, category, available=20, desc=''):
        return Product(code=code, name=name, description=desc or f'{name}. Выдача сразу после оплаты.', price_usdt=price,
                       category=category, in_stock=available > 0, max_quantity=10, provider_data={'available': available, 'delivery_type': 'automatic'})

    class Demo:
        providers = {'jaha': None, 'canboso': None}
        catalog = {
            'jaha': [item('gpt-plus', 'ChatGPT Plus 1 месяц', 6.5, 'Нейросети'), item('mj', 'Midjourney Basic', 4.2, 'Нейросети'),
                     item('spotify', 'Spotify Premium 3 месяца', 3.9, 'Музыка'), item('steam10', 'Steam 10 USD', 10.4, 'Игры'),
                     item('xbox', 'Xbox Game Pass Ultimate', 7.1, 'Игры', available=0)],
            'canboso': [item('c-gpt', 'chatgpt plus - 1 месяц', 5.8, 'Нейросети'), item('c-yt', 'YouTube Premium 1 месяц', 1.9, 'Видео'),
                        item('c-netflix', 'Netflix Premium', 4.8, 'Видео'), item('c-claude', 'Claude Pro 1 месяц', 6.9, 'Нейросети')],
        }
        async def get_products(self, name): return self.catalog[name]
        async def get_balance(self, name=None): return 125.5 if name == 'jaha' else 42.0

    db.init()
    core.get_manager = lambda: Demo()
    asyncio.run(core.sync_catalog())


if __name__ == '__main__':
    if '--demo' in sys.argv:
        Path('data/preview.db').unlink(missing_ok=True)
        seed_demo()
    uvicorn.run('app.main:app',host='127.0.0.1',port=8000,access_log=False)
