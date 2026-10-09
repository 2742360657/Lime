#!/usr/bin/env python3
"""Explicit foreground account validation. Never prints QR contents, tokens or messages.
Requires this checkout's debug build/Metro. QR output stays ignored and private.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import time
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = 'app.lime.personalassistant.dev'
STEPS = {
    'qr': ('获取微信验证二维码', '微信验证二维码就绪', 'qr'),
    'status': ('确认微信验证绑定', '微信验证状态', 'status'),
    'read': ('读取微信验证消息', '微信验证收件完成', 'receive'),
    'download': ('下载微信验证附件', '微信附件验证完成', 'downloads'),
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', required=True)
parser.add_argument('--action', choices=STEPS, required=True)
args = parser.parse_args()
ADB = shutil.which('adb')
if not ADB:
    raise SystemExit('Source scripts/env.sh first.')

def adb(*parts):
    return subprocess.check_output([ADB, '-s', args.serial, *parts], text=True, timeout=35).strip()

def ui():
    path = '/sdcard/lime-wx-' + uuid.uuid4().hex + '.xml'
    try:
        adb('shell', 'uiautomator', 'dump', path)
        return ET.fromstring(adb('shell', 'cat', path))
    finally:
        adb('shell', 'rm', '-f', path)

def wait(label, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        tree = ui()
        texts = {node.get('text', '') for node in tree.iter('node')}
        if '微信验证未完成' in texts:
            codes = [code for code in ('HOST','PROTOCOL','NETWORK','HTTP','SESSION','BUSINESS','CANCELLED','TIMEOUT','TOO_LARGE','BUSY') if '微信验证未完成：' + code in texts]
            raise RuntimeError('Weixin account step failed: ' + (codes[0] if codes else 'CHECK'))
        for node in tree.iter('node'):
            if label in (node.get('text'), node.get('content-desc')):
                return node
        time.sleep(0.5)
    raise RuntimeError('Phone step timed out; unlock it and check this checkout provides Metro.')

menu, success, suffix = STEPS[args.action]
remote = 'files/lime-weixin-validation-' + suffix + '.json'
adb('shell', 'am', 'force-stop', PACKAGE)
adb('shell', 'run-as', PACKAGE, 'rm', '-f', remote)
adb('shell', 'am', 'start', '-n', PACKAGE + '/app.lime.personalassistant.MainActivity')
wait('日记')
adb('shell', 'input', 'keyevent', '82')
node = wait(menu)
x1,y1,x2,y2 = map(int, re.findall(r'\d+',node.get('bounds','')))
adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
wait(success)
result = json.loads(adb('shell', 'run-as', PACKAGE, 'cat', remote))
output = ROOT / '.local' / ('weixin-validation-' + suffix + '.json')
# Open privately from creation; QR is ephemeral login data and is never stdout.
import os
with os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as stream:
    json.dump(result, stream); stream.write('\n')
output.chmod(0o600)
if args.action == 'qr':
    assert set(result) == {'display'} and isinstance(result['display'],str) and 0 < len(result['display']) <= 16384
    print('QR ready in private local output; no account confirmed or messages read.')
elif args.action == 'status':
    assert set(result) == {'status','accountTested'}
    assert result['status'] in ('wait','scaned','confirmed','expired','need_verifycode','verify_code_blocked','scaned_but_redirect','binded_redirect')
    print('Binding status:',result['status'])
else:
    keys = ('saved','duplicates','ignored') if args.action == 'read' else ('saved','failed','skipped')
    assert set(result) == {*keys,'modelCalls'} and result['modelCalls'] == 0
    assert all(isinstance(result[key],int) and result[key]>=0 for key in keys)
    print('Foreground validation counts:',json.dumps(result))
