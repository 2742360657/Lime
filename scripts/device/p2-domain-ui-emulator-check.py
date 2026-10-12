#!/usr/bin/env python3
"""Focused phase-boundary standalone task/checkin check on an emulator only."""
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
parser.add_argument('--serial', default='emulator-5554')
parser.add_argument('--resume-fixture', help='Resume after creating this synthetic task, without another create.')
parser.add_argument('--verify-export', help='Verify an already captured synthetic export without repeating UI writes.')
args = parser.parse_args()
ADB = shutil.which('adb')
if not ADB or not args.serial.startswith('emulator-'):
    raise SystemExit('This synthetic UI test requires an emulator and scripts/env.sh.')


def adb(*parts):
    return subprocess.check_output([ADB, '-s', args.serial, *parts], text=True, timeout=35).strip()


def ui():
    filename = '/sdcard/lime-p2-ui-' + uuid.uuid4().hex + '.xml'
    try:
        adb('shell', 'uiautomator', 'dump', filename)
        return ET.fromstring(adb('shell', 'cat', filename))
    finally:
        adb('shell', 'rm', '-f', filename)


def wait(label):
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        tree = ui()
        # The home section title also says 待办. Select the navigation accessibility label first.
        for field in ['content-desc', 'text']:
            for node in tree.iter('node'):
                if node.get(field) == label:
                    return node
        time.sleep(0.3)
    raise RuntimeError('UI did not present: ' + label)


def tap(label):
    node = wait(label)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    adb('shell', 'input', 'tap', str((x1+x2)//2), str((y1+y2)//2))


def write(label, text, replace=False):
    tap(label)
    if replace:
        adb('shell', 'input', 'keycombination', '113', '29')
    adb('shell', 'input', 'text', text)


def keyboard_back():
    if 'mInputShown=true' in adb('shell', 'dumpsys', 'input_method'):
        adb('shell', 'input', 'keyevent', '4')


def launch():
    adb('shell', 'am', 'start', '-n', PACKAGE + '/app.lime.personalassistant.MainActivity')
    wait('日记')


if '8081' in adb('reverse', '--list'):
    raise SystemExit('Remove development reverse mapping before standalone UI acceptance.')
fixture = args.resume_fixture or 'LIME-P2-' + uuid.uuid4().hex[:8]
if not re.fullmatch(r'LIME-P2-[0-9a-f]{8}', fixture):
    raise SystemExit('Resume only a generated synthetic fixture.')
if args.verify_export:
    if not args.resume_fixture or not re.fullmatch(r'/sdcard/Documents/LimeP2Check-[0-9a-f]{8}/lime-records-[0-9]+\.json', args.verify_export):
        raise SystemExit('Verification requires an existing generated fixture/export.')
    export_path = args.verify_export
else:
    launch(); tap('待办')
    if not args.resume_fixture:
        tap('新建待办'); write('待办名称', fixture)
        keyboard_back(); tap('保存')
    wait(fixture)
    tap(fixture); write(fixture, fixture + '-edited', replace=True)
    keyboard_back(); tap('保存'); wait(fixture + '-edited')
    tap('完成待办：' + fixture + '-edited'); wait('待办已完成')
    tap('习惯'); tap('新建习惯'); write('习惯名称', fixture + '-habit')
    keyboard_back(); tap('保存'); wait(fixture + '-habit')
    tap('打卡：' + fixture + '-habit'); wait('已记录一次打卡')
    adb('shell', 'am', 'force-stop', PACKAGE)
    launch(); tap('习惯'); wait(fixture + '-habit')
    # Capture the actual ordinary records through the public export flow.
    directory = 'LimeP2Check-' + uuid.uuid4().hex[:8]
    adb('shell', 'mkdir', '-p', '/sdcard/Documents/' + directory)
    tap('编辑个人资料'); tap('数据备份'); wait('USE THIS FOLDER')
    tree = ui()
    if not any(n.get('text') == directory for n in tree.iter('node')) and any(n.get('text') == 'Documents' for n in tree.iter('node')):
        tap('Documents')
    tap(directory); tap('USE THIS FOLDER'); tap('ALLOW'); wait('导出完成')
    filename = next(name for name in adb('shell', 'ls', '/sdcard/Documents/' + directory).splitlines() if name.startswith('lime-records-'))
    export_path = '/sdcard/Documents/' + directory + '/' + filename
backup = json.loads(adb('shell', 'cat', export_path))
tasks = [row for row in backup['rows']['tasks'] if row['title'] == fixture + '-edited' and row['deleted'] == 0]
assert len(tasks) == 1 and tasks[0]['status'] == 'done' and tasks[0]['completed_at'] is not None
# Portable backups deliberately omit internal revisions; those are checked in domain tests.
habits = [row for row in backup['rows']['habits'] if row['name'] == fixture + '-habit' and row['deleted'] == 0]
assert len(habits) == 1
assert len([row for row in backup['rows']['checkins'] if row['habit_id'] == habits[0]['id'] and row['deleted'] == 0]) == 1
result = {'status': 'export-verified' if args.verify_export else 'passed', 'uiStepsThisRun': not bool(args.verify_export),
          'taskEditedAndCompleted': True, 'checkins': 1, 'actualRecordExport': True, 'fixture': fixture}
if not args.verify_export:
    result.update(standalone=True, restart=True)
path = ROOT / '.local/runs/device/p2-domain-ui-result.json'
path.write_text(json.dumps(result, indent=2) + '\n'); path.chmod(0o600)
print('PASS actual exported task/checkin verification; UI steps completed in a prior run' if args.verify_export else
      'PASS standalone task create/edit/complete, once-only checkin, immediate restart and actual exported record verification')
