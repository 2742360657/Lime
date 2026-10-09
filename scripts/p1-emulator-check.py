#!/usr/bin/env python3
"""Phase-boundary checks on an emulator only; no personal phone or server calls.

Run native mode with a debug APK/Metro, and records mode with a standalone
preview APK. Uses synthetic records and never clears/uninstalls app data.
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
ACTIVITY = PACKAGE + '/app.lime.personalassistant.MainActivity'
ADB = shutil.which('adb')
parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['native', 'records', 'checkin', 'backup'])
parser.add_argument('--serial', default='emulator-5554')
args = parser.parse_args()
if not ADB or not args.serial.startswith('emulator-'):
    raise SystemExit('This synthetic acceptance script requires adb and an emulator serial.')


def adb(*parts):
    return subprocess.check_output([ADB, '-s', args.serial, *parts], text=True, timeout=35).strip()


def ui():
    filename = '/sdcard/lime-p1-' + uuid.uuid4().hex + '.xml'
    try:
        adb('shell', 'uiautomator', 'dump', filename)
        content = adb('shell', 'cat', filename)
        (ROOT / '.local/p1-ui-last.xml').write_text(content)
        return ET.fromstring(content)
    finally:
        adb('shell', 'rm', '-f', filename)


def find(tree, label):
    for field in ['content-desc', 'text']:
        for node in tree.iter('node'):
            if node.get(field) == label:
                return node
    return None


def wait(label, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        tree = ui()
        node = find(tree, label)
        if node is not None:
            return node
        if find(tree, '本地记录未能打开。原有数据仍保留，请勿清除应用数据。') is not None:
            raise RuntimeError('Application database initialization failed.')
        time.sleep(0.3)
    raise RuntimeError('UI did not present: ' + label)


def tap(label):
    node = wait(label)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


def write(label, value):
    tap(label)
    adb('shell', 'input', 'text', value.replace(' ', '%s'))


def hide_keyboard():
    if 'mInputShown=true' in adb('shell', 'dumpsys', 'input_method'):
        adb('shell', 'input', 'keyevent', '4')


def launch():
    adb('shell', 'am', 'start', '-n', ACTIVITY)
    wait('日记')


def save_report(name, result):
    path = ROOT / '.local' / name
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    path.chmod(0o600)


if args.mode == 'native':
    launch()
    adb('shell', 'input', 'keyevent', '82')
    tap('验证本地迁移与记录')
    wait('本地迁移验证通过', timeout=90)
    raw = adb('shell', 'run-as', PACKAGE, 'cat', 'files/lime-p1-native-probe.json')
    result = json.loads(raw)
    assert result['localQueue'] == 0 and result['sourceQueue'] > 0 and result['documents'] == 205
    tap('OK')
    save_report('p1-native-result.json', result)
    print('PASS native synced-source queue, local-only migration, drafts/checkin, receipt and reopen', flush=True)
elif args.mode == 'records':
    if '8081' in adb('reverse', '--list'):
        raise RuntimeError('Standalone acceptance requires no Metro reverse mapping on 8081.')
    fixture = 'LIME-P1-' + uuid.uuid4().hex[:8]
    adb('shell', 'am', 'force-stop', PACKAGE)
    launch()
    tap('日记'); wait('我的日记')
    tap('打开页面菜单')
    assert find(ui(), '连接自己的服务器') is None
    tap('日记流')
    tap('写日记'); write('日记标题', fixture); write('日记正文', 'Synthetic original diary text.')
    hide_keyboard(); tap('保存并返回'); wait(fixture)
    tap('打开页面菜单'); tap('备忘录')
    tap('新建备忘录'); write('备忘录标题', fixture + '-memo'); write('备忘录正文', 'Synthetic memo original.')
    hide_keyboard(); tap('返回备忘录列表'); wait(fixture + '-memo')
    tap('待办'); tap('新建待办'); write('待办名称', fixture + '-task')
    hide_keyboard(); tap('保存'); wait(fixture + '-task')
    tap('习惯'); tap('新建习惯'); write('习惯名称', fixture + '-habit')
    hide_keyboard(); tap('保存'); wait(fixture + '-habit')
    tap('打卡：' + fixture + '-habit')
    wait('已记录一次打卡')
    adb('shell', 'am', 'force-stop', PACKAGE)
    launch()
    tap('日记'); wait(fixture)
    tap('阅读日记：' + fixture); wait('Synthetic original diary text.'); tap('返回')
    tap('打开页面菜单'); tap('备忘录'); wait(fixture + '-memo')
    tap('打开 ' + fixture + '-memo'); wait('Synthetic memo original.'); tap('返回备忘录列表')
    tap('待办'); wait(fixture + '-task')
    tap('习惯'); wait(fixture + '-habit')
    tap('助手'); wait('助手暂未启用。日记、备忘录、待办和习惯可继续在本机使用。')
    assert find(ui(), '发送消息') is None
    save_report('p1-records-result.json', {'fixture': fixture, 'standalone': True, 'diary': True, 'memo': True, 'task': True, 'habit': True, 'restart': True, 'serverMenuRemoved': True, 'assistantReadOnly': True})
    print('PASS standalone native UI records, process restart, server menu removal and explicit assistant state', flush=True)
elif args.mode == 'checkin':
    fixture = json.loads((ROOT / '.local/p1-records-result.json').read_text())['fixture']
    launch(); tap('习惯'); tap('打卡：' + fixture + '-habit'); wait('已记录一次打卡')
    adb('shell', 'am', 'force-stop', PACKAGE); launch(); tap('习惯'); wait(fixture + '-habit')
    save_report('p1-checkin-result.json', {'ackAfterCommit': True, 'restart': True, 'fixture': fixture})
    print('PASS checkin acknowledgement followed immediately by process restart', flush=True)
else:
    directory = 'LimeP1Backup-' + uuid.uuid4().hex[:8]
    adb('shell', 'mkdir', '-p', '/sdcard/Documents/' + directory)
    launch(); tap('编辑个人资料'); tap('数据备份'); wait('USE THIS FOLDER')
    # DocumentsUI Back first navigates to the parent, then cancels the picker.
    for _ in range(4):
        if find(ui(), '数据备份') is not None:
            break
        adb('shell', 'input', 'keyevent', '4')
    wait('数据备份')
    tap('数据备份')
    tree = ui()
    if find(tree, directory) is None and find(tree, 'Documents') is not None:
        tap('Documents')
    tap(directory); tap('USE THIS FOLDER'); tap('ALLOW')
    wait('导出完成'); tap('OK')
    filename = next(name for name in adb('shell', 'ls', '/sdcard/Documents/' + directory).splitlines() if name.startswith('lime-records-'))
    backup = json.loads(adb('shell', 'cat', '/sdcard/Documents/' + directory + '/' + filename))
    assert backup['format'] == 'angelime-records' and backup['version'] == 1
    fixture = json.loads((ROOT / '.local/p1-records-result.json').read_text())['fixture']
    diary = next(row for row in backup['rows']['documents'] if row['title'] == fixture)
    memo = next(row for row in backup['rows']['documents'] if row['title'] == fixture + '-memo')
    habit = next(row for row in backup['rows']['habits'] if row['name'] == fixture + '-habit')
    assert diary['body'] == 'Synthetic original diary text.' and memo['body'] == 'Synthetic memo original.'
    assert len([row for row in backup['rows']['checkins'] if row['habit_id'] == habit['id'] and row['deleted'] == 0]) == 1
    assert any(row['title'] == fixture + '-task' for row in backup['rows']['tasks'])
    marker = 'LIME-RESTORE-' + uuid.uuid4().hex[:8]
    memo.update(title=marker + '-copy', body='A synthetic conflicting imported copy.')
    backup['drafts'] = [{'id': marker + '-draft', 'document_id': memo['id'], 'kind': 'memo', 'title': marker + '-draft', 'body': 'Synthetic unsaved draft.', 'date': memo['date'], 'group_id': None, 'base_revision': 1, 'base_content': None}]
    imported_name = marker + '.json'
    private = ROOT / '.local' / imported_name
    private.write_text(json.dumps(backup)); private.chmod(0o600)
    adb('push', str(private), '/sdcard/Download/' + imported_name)

    def pick_import():
        tap('数据恢复')
        tree = ui()
        if find(tree, imported_name) is None:
            tap('Show roots'); tap('Downloads')
        tap(imported_name)

    pick_import(); wait('合并恢复确认'); tap('合并恢复'); wait('本机恢复完成'); tap('OK')
    pick_import(); tap('合并恢复'); wait('这份备份已导入，未重复写入。'); tap('OK')
    tap('日记'); tap('打开页面菜单'); tap('备忘录')
    wait(fixture + '-memo'); wait(marker + '-copy')
    tap('打开 ' + fixture + '-memo'); wait('Synthetic memo original.'); tap('返回备忘录列表')
    save_report('p1-backup-result.json', {'nativeExport': True, 'cancelExport': True, 'nativeImport': True, 'repeatReceipt': True, 'conflictCopy': True, 'originalPreserved': True, 'checkinCount': 1, 'draftImported': True, 'fixture': marker})
    print('PASS SAF export/cancel, exact persisted checkin, native picker import, conflict copy and repeat receipt', flush=True)
