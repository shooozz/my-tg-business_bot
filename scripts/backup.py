"""Consistent online SQLite snapshot; copy resulting file off-server separately."""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

source=Path(os.getenv('DB_PATH','data/shop.db'))
folder=source.parent/'backups'
folder.mkdir(parents=True,exist_ok=True)
destination=folder/(datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')+'.db')
with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst:
    src.backup(dst)
destination.chmod(0o600)
print(destination)
