"""Consistent online SQLite snapshot; copy resulting file off-server separately."""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

def snapshot(source):
    source=Path(source).resolve(strict=True)
    folder=source.parent/'backups'
    folder.mkdir(parents=True,exist_ok=True)
    destination=folder/(datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')+'.db')
    src=sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)
    dst=sqlite3.connect(destination)
    try:
        src.backup(dst)
        if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
            raise RuntimeError('Invalid snapshot')
    finally:
        src.close(); dst.close()
    destination.chmod(0o600)
    return destination

if __name__=='__main__':
    print(snapshot(os.getenv('DB_PATH','data/shop.db')))
