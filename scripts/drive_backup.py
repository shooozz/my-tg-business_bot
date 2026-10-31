"""Linux host: snapshot, compress, upload through rclone crypt, verify, retain.

No raw credentials or subprocess stderr are logged. No sync or directory purge.
"""
import gzip
import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/opt/market')
REMOTE = 'market-crypt:my-tg-business_bot'
NAME = re.compile(r'^market-(\d{8}T\d{12}Z)\.db\.gz$')

def obsolete(names):
    """Keep newest backup for each of seven latest days and four latest ISO weeks."""
    dated=[]
    for name in names:
        match=NAME.fullmatch(name)
        if match:
            try:
                dated.append((datetime.strptime(match[1],'%Y%m%dT%H%M%S%fZ'),name))
            except ValueError:
                pass
    days,weeks,keep=set(),set(),set()
    for stamp,name in sorted(dated,reverse=True):
        day,week=stamp.date(),stamp.isocalendar()[:2]
        if day not in days and len(days)<7:
            days.add(day); keep.add(name)
        if week not in weeks and len(weeks)<4:
            weeks.add(week); keep.add(name)
    return [name for _,name in sorted(dated) if name not in keep]

def run(args):
    result=subprocess.run(args,capture_output=True,text=True,timeout=1800)
    if result.returncode:
        raise RuntimeError('Backup command failed')
    return result.stdout.strip()

def upload_and_retain(local,rclone,execute=run):
    config=json.loads(execute(rclone+['config','dump']))
    crypt=config.get('market-crypt',{})
    underlying=config.get(crypt.get('remote','').split(':')[0],{})
    if crypt.get('type')!='crypt' or underlying.get('type')!='drive':
        raise RuntimeError('Require crypt over Google Drive')
    execute(rclone+['copyto',str(local),REMOTE+'/'+local.name])
    execute(rclone+['check',str(local.parent),REMOTE,'--include',local.name,'--one-way','--download'])
    names=execute(rclone+['lsf',REMOTE,'--files-only','--max-depth','1']).splitlines()
    if local.name not in names:
        raise RuntimeError('Uploaded backup missing; retention skipped')
    for name in obsolete(names):
        execute(rclone+['deletefile',REMOTE+'/'+name,'--drive-use-trash=false'])

def main():
    import fcntl
    os.umask(0o077)
    with (ROOT/'maintenance.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        release=(ROOT/'current-release').read_text().strip()
        if not re.fullmatch('[a-f0-9]{40}',release):
            raise RuntimeError('Invalid current-release')
        os.environ.update(RELEASE_ID=release,ENV_FILE=str(ROOT/'.env'))
        compose=['docker','compose','-p','market','--env-file',str(ROOT/'.env'),'-f',str(ROOT/'releases'/release/'compose.yaml')]
        rclone=['rclone','--config',str(ROOT/'backup'/'rclone.conf'),'--retries','3']
        try:
            container_path=run(compose+['exec','-T','app','python','scripts/backup.py'])
            if not re.fullmatch(r'/app/data/backups/\d{8}-\d{6}-\d{6}\.db',container_path):
                raise RuntimeError('Unexpected snapshot path')
            with tempfile.TemporaryDirectory(prefix='market-backup-') as staging:
                staging=Path(staging)
                raw=staging/'snapshot.db'
                run(compose+['cp','app:'+container_path,str(raw)])
                name='market-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.db.gz'
                compressed=staging/name
                with raw.open('rb') as source,gzip.open(compressed,'wb') as destination:
                    shutil.copyfileobj(source,destination)
                upload_and_retain(compressed,rclone)
            # Only prune recognized local snapshots after offsite verification.
            cleanup="from pathlib import Path; import re; p=Path('/app/data/backups'); files=sorted(x for x in p.iterdir() if re.fullmatch(r'\\d{8}-\\d{6}(?:-\\d{6})?\\.db',x.name) and x.is_file()); [x.unlink() for x in files[:-7]]"
            run(compose+['exec','-T','app','python','-c',cleanup])
            (ROOT/'backup'/'last-success').write_text(datetime.now(timezone.utc).isoformat())
            print('Google Drive backup verified successfully.')
        except Exception:
            try:
                code="import sys; from app import core; [core.say('admin',uid,sys.argv[1]) for uid in core.ADMINS]"
                run(compose+['exec','-T','app','python','-c',code,'⚠ Копия Google Drive не завершена. Проверьте journalctl -u market-backup.service. Очистка старых копий начинается только после проверки новой.'])
            except Exception:
                print('Could not queue backup alert; inspect systemd logs.')
            raise

if __name__=='__main__':
    try:
        main()
    except Exception as error:
        print('Backup failed: '+type(error).__name__,flush=True)
        raise SystemExit(1)
