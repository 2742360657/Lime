#!/usr/bin/env python3
"""Run an isolated native weixin probe on an explicitly selected debug device.

Requires this checkout's Metro/debug build. Requires loopback fixture 8093 mapped to this phone. No app data reset, model calls,
ordinary records, persona, platform accounts or credentials are used.
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

ROOT = Path(__file__).resolve().parents[2]
(ROOT / '.local' / 'runs' / 'device').mkdir(parents=True, exist_ok=True)
PACKAGE = 'app.lime.personalassistant.dev'
parser = argparse.ArgumentParser()
parser.add_argument('--serial', required=True)
args = parser.parse_args()
ADB = shutil.which('adb')
if not ADB:
    raise SystemExit('Source scripts/env.sh before running this probe.')


def adb(*parts):
    return subprocess.check_output([ADB, '-s', args.serial, *parts], text=True, timeout=35).strip()


def ui():
    filename = '/sdcard/lime-agent-' + uuid.uuid4().hex + '.xml'
    try:
        adb('shell', 'uiautomator', 'dump', filename)
        return ET.fromstring(adb('shell', 'cat', filename))
    finally:
        adb('shell', 'rm', '-f', filename)


def wait(label, timeout=40):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        tree = ui()
        for node in tree.iter('node'):
            if node.get('text') == '微信组件验证失败':
                raise RuntimeError('Native synthetic weixin probe failed; ordinary records were not modified.')
            if label in (node.get('text'), node.get('content-desc')):
                return node
        time.sleep(0.5)
    raise RuntimeError('Device did not present: ' + label + '. Check that it is unlocked and this checkout provides Metro.')


def tap(label):
    node = wait(label)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))


adb('shell', 'am', 'start', '-n', PACKAGE + '/app.lime.personalassistant.MainActivity')
wait('日记')
adb('shell', 'input', 'keyevent', '82')
tap('验证微信手机组件')
wait('微信组件验证通过')
result = json.loads(adb('shell', 'run-as', PACKAGE, 'cat', 'files/lime-p4-weixin-probe.json'))
assert result['status'] == 'passed' and result['localQueue'] == 0
assert result['syntheticOnly'] is True and result['accountTested'] is False and result['modelCalls']==0
assert all(result[field] for field in ('losslessIds','cursorOnce','reopened','ownerFilter','secureStore','cancellation','nativeCipher','nativeDownload','mediaRejection','p3Parse'))
path = ROOT / '.local' / 'runs' / 'device' / 'p4-weixin-native-result.json'
path.write_text(json.dumps(result, indent=2) + '\n')
path.chmod(0o600)
# English/Chinese system button labels vary. The result is already persisted.
print('PASS native Weixin synthetic transport, owner filter, cursor reopen, SecureStore, AES/download, P3 parsing and cancellation; no real account/model')
