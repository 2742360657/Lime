#!/usr/bin/env python3
"""Explicitly run this checkout's isolated daily workflow probe on a debug device."""
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
    filename = '/sdcard/lime-daily-' + uuid.uuid4().hex + '.xml'
    try:
        adb('shell', 'uiautomator', 'dump', filename)
        return ET.fromstring(adb('shell', 'cat', filename))
    finally:
        adb('shell', 'rm', '-f', filename)


def wait(label, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for node in ui().iter('node'):
            if node.get('text') == '日用记录验证失败':
                raise RuntimeError('Isolated native daily probe failed; ordinary records were not used.')
            if label in (node.get('text'), node.get('content-desc')):
                return node
        time.sleep(0.5)
    raise RuntimeError('Device did not present: ' + label + '. Check unlock and this checkout\'s Metro bundle.')


def tap(label):
    node = wait(label)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))


(ROOT / '.local' / 'p5-daily-native-result.json').unlink(missing_ok=True)
adb('shell', 'am', 'start', '-n', PACKAGE + '/app.lime.personalassistant.MainActivity')
wait('日记')
adb('shell', 'input', 'keyevent', '82')
tap('验证日用记录与整理')
wait('日用记录验证通过')
result = json.loads(adb('shell', 'run-as', PACKAGE, 'cat', 'files/lime-p5-daily-probe.json'))
assert result.get('batch') == 'offline-management'
assert result['status'] == 'passed' and result['localQueue'] == 0
assert result['syntheticOnly'] is True and result['ordinaryDatabaseAccessed'] is False and result['modelCalls'] == 0
flags = ('memoUnselectedDenied', 'memoSelectedProposal', 'memoDraftPreserved', 'memoHistoricalSource', 'memoMetadataPrivate', 'recordGenericPayload','recordMetadataPrivate','recordSelectedCalculation', 'activityCompletionReplay', 'singleCheckin', 'trainingCounts', 'trainingCoverage', 'organizationPreview', 'organizationVersionGuard', 'organizationConfirm', 'organizationUndo', 'organizationReopenUndo', 'reopenReceiptReplay', 'localQueueZero', 'isolatedDatabaseCleaned','memoryOlderSearch','memoryStablePages','memoryLiteralKeywords','memoryForgottenExcluded','activityStablePages','uiRetryReplay','shanghaiCompletionDate')
assert all(result['flags'][field] for field in flags)
path = ROOT / '.local' / 'p5-daily-native-result.json'
path.write_text(json.dumps(result, indent=2) + '\n')
path.chmod(0o600)
for node in ui().iter('node'):
    if node.get('resource-id') == 'android:id/button1':
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
        adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
        break
print('PASS isolated native memory search/paging/forget/literal keywords, retry and Shanghai date, memo authorization and drafts, generic records and exact calculations, activity/checkin history, reversible organization, SQLite reopen and zero queue; no model')
