"""Local UI preview. Uses an isolated database, no bots, no real secrets."""
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from cryptography.fernet import Fernet
os.environ.update(RUN_BOTS='false',COOKIE_SECURE='false',ADMIN_PASSWORD='local-preview-only-2026',DATA_KEY=Fernet.generate_key().decode(),DB_PATH='data/preview.db',SHOP_BOT_TOKEN='',ADMIN_BOT_TOKEN='',SUPPORT_BOT_TOKEN='',JAHA_API_KEY='')
import uvicorn
uvicorn.run('app.main:app',host='127.0.0.1',port=8000,access_log=False)
