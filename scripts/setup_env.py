"""Generate local secrets without printing them. Run after dependency installation."""
from pathlib import Path
import secrets
from cryptography.fernet import Fernet

target=Path('.env')
if target.exists():
    raise SystemExit('.env exists; refusing to overwrite secrets')
text=Path('.env.example').read_text(encoding='utf-8')
text=text.replace('ADMIN_PASSWORD=\n','ADMIN_PASSWORD='+secrets.token_urlsafe(32)+'\n')
text=text.replace('DATA_KEY=\n','DATA_KEY='+Fernet.generate_key().decode()+'\n')
target.write_text(text,encoding='utf-8')
target.chmod(0o600)
print('Created .env. Edit it locally; keep DATA_KEY with your backups.')
