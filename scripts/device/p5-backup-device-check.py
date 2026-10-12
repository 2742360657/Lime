#!/usr/bin/env python3
"""Run an isolated native backup probe on an explicitly selected debug device.

Requires this checkout's Metro/debug build. Uses only local native files and SQLite; no HTTP fixture is needed. No app data reset, model calls,
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
            if node.get('text') == '完整备份验证失败':
                raise RuntimeError('Native synthetic backup probe failed; ordinary records were not modified.')
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
tap('验证完整备份组件')
wait('完整备份验证通过')
result = json.loads(adb('shell', 'run-as', PACKAGE, 'cat', 'files/lime-p5-backup-probe.json'))
assert result['status'] == 'passed' and result['localQueue'] == 0
assert result['syntheticOnly'] is True and result['modelCalls']==0
assert all(result[field] for field in ('fullObjects','zipRoundtrip','relocatedFiles','integrity','repeated','conflictPreserved','lateRollback','archiveRoundtrip','zipBoundaries','inertHistory','weixinHistory','genericRecords','recordVersionConflict','memoHistory','qqHistory','organizationHistory','credentialsExcluded','reopen'))
path = ROOT / '.local' / 'runs' / 'device' / 'p5-backup-native-result.json'
path.write_text(json.dumps(result, indent=2) + '\n')
path.chmod(0o600)
for node in ui().iter('node'):
    if node.get('resource-id') == 'android:id/button1':
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
        adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
        break
print('PASS native complete v4 backup ZIP, generic records and version conflicts, memo/QQ/organization history, credential exclusion, relocated originals, late rollback, archive roundtrip, bounded rejection, SQLite reopen and zero queue; no model')
