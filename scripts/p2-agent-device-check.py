#!/usr/bin/env python3
"""Run an isolated native agent probe on an explicitly selected debug device.

Requires this checkout's Metro/debug build. No app data reset, model calls,
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

ROOT = Path(__file__).resolve().parents[1]
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
            if node.get('text') == '本机助手验证失败':
                raise RuntimeError('Native synthetic agent probe failed; ordinary records were not modified.')
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
tap('验证本机助手运行时')
wait('本机助手验证通过')
result = json.loads(adb('shell', 'run-as', PACKAGE, 'cat', 'files/lime-p2-agent-probe.json'))
assert result['status'] == 'passed' and result['checkins'] == 1 and result['localQueue'] == 0
assert all(result[field] for field in ('sdkStream', 'toolLoop', 'secureStore', 'personaReopen', 'neutralOptional', 'interruptedRecovery', 'receiptReplay', 'crossSessionActivity'))
path = ROOT / '.local' / 'p2-agent-native-result.json'
path.write_text(json.dumps(result, indent=2) + '\n')
path.chmod(0o600)
# English/Chinese system button labels vary. The result is already persisted.
print('PASS native assistant: SDK stream/tool loop, optional persona, SecureStore, reopen/replay, once-only checkin and zero queue')
