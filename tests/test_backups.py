import json
import sqlite3
from datetime import datetime,timedelta
import pytest
from scripts.backup import snapshot
from scripts.drive_backup import obsolete,upload_and_retain,REMOTE

def test_snapshot_includes_wal_and_refuses_missing_source(tmp_path):
    source=tmp_path/'live.db'
    with pytest.raises(FileNotFoundError):snapshot(source)
    with sqlite3.connect(source) as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.execute('CREATE TABLE orders(id INTEGER)')
        c.execute('INSERT INTO orders VALUES(42)');c.commit()
        with sqlite3.connect(snapshot(source)) as restored:
            assert restored.execute('SELECT id FROM orders').fetchone()[0]==42
            assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'

def test_retention_and_unrelated_files():
    dates=[datetime(2026,10,31)-timedelta(days=n) for n in range(60)]
    names=['market-'+d.strftime('%Y%m%dT%H%M%S%fZ')+'.db.gz' for d in dates]
    strangers=['notes.txt','../market-20260101T000000000000Z.db.gz','market-99999999T999999999999Z.db.gz']
    deleted=obsolete(names+strangers); kept=set(names)-set(deleted)
    assert set(names[:7])<=kept and 7<=len(kept)<=11
    assert len({d.isocalendar()[:2] for d,n in zip(dates,names) if n in kept})==4
    assert not set(strangers)&set(deleted)

@pytest.mark.parametrize('fail_at',['copyto','check'])
def test_failure_never_prunes(tmp_path,fail_at):
    local=tmp_path/'market-20261031T030000000000Z.db.gz';local.write_bytes(b'test')
    calls=[]
    def fake(args):
        calls.append(args)
        if args[1]=='config':return json.dumps({'market-crypt':{'type':'crypt','remote':'gdrive:backups'},'gdrive':{'type':'drive'}})
        if args[1]==fail_at:raise RuntimeError('simulated')
        return ''
    with pytest.raises(RuntimeError):upload_and_retain(local,['rclone'],fake)
    assert not any('deletefile' in c for c in calls)

def test_plain_remote_rejected(tmp_path):
    calls=[]
    def fake(args):calls.append(args);return json.dumps({'market-crypt':{'type':'drive'}})
    with pytest.raises(RuntimeError):upload_and_retain(tmp_path/'backup.gz',['rclone'],fake)
    assert len(calls)==1

def test_pruning_after_download_verification(tmp_path):
    local=tmp_path/'market-20261031T030000000000Z.db.gz';local.write_bytes(b'test')
    dates=[datetime(2026,10,30)-timedelta(days=n) for n in range(45)]
    names=[local.name]+['market-'+d.strftime('%Y%m%dT%H%M%S%fZ')+'.db.gz' for d in dates]+['personal.txt']
    calls=[]
    def fake(args):
        calls.append(args)
        if args[1]=='config':return json.dumps({'market-crypt':{'type':'crypt','remote':'gdrive:backups'},'gdrive':{'type':'drive'}})
        if args[1]=='lsf':return '\n'.join(names)
        return ''
    upload_and_retain(local,['rclone'],fake)
    assert calls[2][1]=='check' and '--download' in calls[2]
    deletions=[c for c in calls if c[1]=='deletefile']
    assert deletions and all(c[2].startswith(REMOTE+'/market-') for c in deletions)
    assert not any('personal.txt' in ' '.join(c) for c in deletions)
