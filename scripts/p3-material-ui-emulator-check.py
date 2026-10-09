#!/usr/bin/env python3
"""Batch-test synthetic material UI/intents on a debug emulator, never a phone.
Requires this checkout's Metro/debug build and a completed native material probe.
Preserves app data; SQLite snapshots/logs remain ignored and private.
"""
import argparse
import json
from pathlib import Path
import re
import shlex
import shutil
import sqlite3
import subprocess
import time
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SERIAL = 'emulator-5554'
parser = argparse.ArgumentParser()
parser.add_argument('--from-stage', choices=['intake', 'picker', 'proposal'], default='intake')
args = parser.parse_args()
PACKAGE = 'app.lime.personalassistant.dev'
MAIN = PACKAGE + '/app.lime.personalassistant.MainActivity'
ADB = shutil.which('adb')
if not ADB:
    raise SystemExit('Source scripts/env.sh first.')


def adb(*parts, binary=False):
    return subprocess.check_output([ADB, '-s', SERIAL, *parts], timeout=35, text=not binary)


def shell(*parts):
    return adb('shell', shlex.join(parts))


def ui():
    remote = '/sdcard/lime-p3-ui-' + uuid.uuid4().hex + '.xml'
    try:
        shell('uiautomator', 'dump', remote)
        return ET.fromstring(shell('cat', remote))
    finally:
        shell('rm', '-f', remote)


def node(label, timeout=30, contains=False):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        nodes = list(ui().iter('node'))
        nodes.sort(key=lambda n: n.get('content-desc') != label)
        for n in nodes:
            values = (n.get('text', ''), n.get('content-desc', ''))
            if any(label in value if contains else label == value for value in values):
                return n
        time.sleep(.3)
    raise RuntimeError('Missing UI: ' + label)


def dismiss_dev_warning():
    # RN LogBox is a separate touch overlay, even outside its visible toast.
    root = ui()
    parents = {child: parent for parent in root.iter() for child in parent}
    for warning in root.iter('node'):
        if warning.get('text') != 'Open debugger to view warnings.':
            continue
        container = parents.get(warning)
        if container is None:
            continue
        closes = [n for n in container.iter('node') if n.get('clickable') == 'true'
                  and not n.get('text') and not n.get('content-desc')]
        if closes:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', closes[-1].get('bounds', '')))
            shell('input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
            time.sleep(.2)
        return


def tap(label, contains=False):
    node(label, contains=contains)  # Wait for startup before dismissing any overlay.
    dismiss_dev_warning()
    time.sleep(.35)  # Android drawers/modals may expose nodes during animation.
    n = node(label, contains=contains)
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds', '')))
    shell('input', 'tap', str((x1+x2)//2), str((y1+y2)//2))


def tap_task_editor(title):
    root = ui()
    parents = {child: parent for parent in root.iter() for child in parent}
    for label in root.iter('node'):
        if label.get('text') != title:
            continue
        parent = parents.get(label)
        while parent is not None:
            edit = next((n for n in parent.iter('node') if n.get('content-desc') == '编辑待办'), None)
            if edit is not None:
                x1, y1, x2, y2 = map(int, re.findall(r'\d+', edit.get('bounds', '')))
                shell('input', 'tap', str((x1+x2)//2), str((y1+y2)//2))
                return
            parent = parents.get(parent)
    raise RuntimeError('Task editor not found: ' + title)


def dismiss_keyboard():
    if 'mInputShown=true' in shell('dumpsys', 'input_method'):
        shell('input', 'keyevent', '4')


def stop():
    shell('am', 'force-stop', PACKAGE)


def start():
    shell('am', 'start', '-n', MAIN)
    node('日记')


def shared(action, uri=None, text=None, dismiss=True):
    parts = ['am', 'start', '-a', action, '-t', 'text/plain', '-n', MAIN]
    if uri:
        if action.endswith('VIEW'):
            parts += ['-d', uri]
        else:
            parts += ['--eu', 'android.intent.extra.STREAM', uri]
    if text:
        parts += ['--es', 'android.intent.extra.TEXT', text]
    shell(*parts)
    node('查看收到的材料')
    tap('查看收到的材料')
    node('本机材料')
    if dismiss:
        tap('知道了')


def snapshot():
    stop()
    folder = ROOT / '.local' / ('p3-sqlite-' + uuid.uuid4().hex)
    folder.mkdir(mode=0o700)
    for suffix in ('', '-wal'):
        try:
            data = adb('exec-out', 'run-as', PACKAGE, 'cat', 'databases/lime-local.sqlite' + suffix, binary=True)
        except subprocess.CalledProcessError:
            if not suffix:
                raise
            continue
        (folder / ('lime-local.sqlite' + suffix)).write_bytes(data)
    return sqlite3.connect(folder / 'lime-local.sqlite')


progress_path = ROOT / '.local' / 'p3-material-ui-progress.json'
if args.from_stage == 'intake':
    progress = {}
else:
    progress = json.loads(progress_path.read_text()) if progress_path.exists() else {}
    required = ['intake'] if args.from_stage == 'picker' else ['intake', 'picker']
    if not all(progress.get(stage) for stage in required):
        raise SystemExit('Resume requires completed earlier stages on this emulator; run intake first.')


def mark(stage):
    progress[stage] = True
    progress_path.write_text(json.dumps(progress, indent=2) + '\n')


if shell('getprop', 'ro.kernel.qemu').strip() != '1':
    raise SystemExit('Emulator only.')
if args.from_stage == 'intake':
    stop()
    shared('android.intent.action.SEND', text='Synthetic cold notification 456')
    node('共享文字.txt')
    tap('查看材料 共享文字.txt')
    node('Synthetic cold notification 456')
    tap('关闭材料')
    tap('选中 共享文字.txt')
    node('本轮引用 · 共享文字.txt')
    stop(); start(); tap('助手')
    node('本轮引用 · 共享文字.txt')
    tap('取消引用')
    shared('android.intent.action.VIEW', uri='content://' + PACKAGE + '.fixtures/synthetic-text.txt')
    node('synthetic-text.txt')
    tap('关闭文件列表')
    # Warm multi-file OS intent via a debug-only sender with hard-coded synthetic URIs.
    shell('am', 'start', '-n', PACKAGE + '/app.lime.personalassistant.MaterialFixtureSender')
    node('查看收到的材料'); tap('查看收到的材料'); node('本机材料'); tap('知道了')
    node('synthetic-image.png')
    tap('查看材料 synthetic-image.png'); node('发送时使用缩放后的图片', contains=True); tap('关闭材料')
    tap('关闭文件列表')
    # Cold VIEW of the same content must not duplicate a material.
    stop(); shared('android.intent.action.VIEW', uri='content://' + PACKAGE + '.fixtures/synthetic-text.txt'); tap('关闭文件列表')
    shared('android.intent.action.SEND', uri='content://' + PACKAGE + '.fixtures/synthetic-missing.txt', dismiss=False)
    node('文件无法读取', contains=True)
    tap('知道了'); tap('关闭文件列表')
    mark('intake')
    print('PASS intake/draft/view/failure paths', flush=True)
if args.from_stage in ('intake', 'picker'):
    # Real system picker/cancel path, only synthetic Downloads are selected.
    text = adb('exec-out', 'run-as', PACKAGE, 'cat', 'cache/p3-fixtures/synthetic-text.txt', binary=True)
    local = ROOT / '.local' / 'lime-p3-synthetic-text.txt'; local.write_bytes(text)
    adb('push', str(local), '/sdcard/Download/lime-p3-synthetic-text.txt')
    stop(); start(); tap('助手'); tap('文件／图片'); tap('选择文件／图片'); node('Show roots'); tap('Show roots'); tap('Downloads'); node('Files in Downloads'); tap('lime-p3-synthetic-text.txt'); node('本机材料')
    tap('选择文件／图片'); node('Show roots'); shell('input', 'keyevent', '4'); node('本机材料')
    tap('查看材料 synthetic-text.txt'); tap('更正正文'); tap('更正材料正文'); shell('input', 'keyevent', '123'); shell('input', 'text', '-fix'); dismiss_keyboard(); tap('保存更正'); node('正文经手动更正', contains=True); tap('关闭材料'); tap('关闭文件列表')
    mark('picker')
    print('PASS picker/cancel/correction paths', flush=True)
stop(); start(); tap('助手')
# Deterministic seeded UI example; actual SDK and real vision have separate checks.
shell('input', 'keyevent', '82'); tap('准备模拟器材料建议'); node('材料交互样本就绪'); tap('OK')
stop(); start(); tap('助手'); node('确认保存'); tap('修改'); expected_title = node('标题').get('text') + '-edited'; tap('标题'); shell('input', 'keyevent', '123'); shell('input', 'text', '-edited'); dismiss_keyboard(); tap('保存修改'); node(expected_title, contains=True); tap('确认保存'); node('新增待办 · 已保存'); tap('查看记录'); node(expected_title, contains=True); tap_task_editor(expected_title); tap('查看待办来源'); node('查看来源原件'); tap('查看来源原件'); node('synthetic-text.txt')
# Snapshot the completed, quiet emulator DB after force-stop; no resetting userdata.
with snapshot() as db:
    hashes = db.execute('SELECT hash,count(*) FROM local_materials GROUP BY hash').fetchall()
    assert all(count == 1 for _, count in hashes)
    assert db.execute("SELECT count(*) FROM tasks WHERE title=? AND deleted=0", [expected_title]).fetchone()[0] == 1
    assert db.execute('SELECT count(*) FROM local_material_imports').fetchone()[0] >= 5
    assert db.execute('SELECT count(*) FROM local_agent_sources WHERE kind=?', ['attachment']).fetchone()[0] >= 1
mark('proposal')
result = dict(status='passed', execution='resumed acceptance' if args.from_stage != 'intake' else 'single run', coldSend=True, coldWarmView=True, warmMultiple=True, contentDedup=True, expiredUriFailure=True, pickerCancel=True, draftRestart=True, correction=True, proposalEditAccept=True, taskSourceOriginal=True, syntheticOnly=True)
(ROOT / '.local' / 'p3-material-ui-result.json').write_text(json.dumps(result, indent=2) + '\n')
shell('rm', '-f', '/sdcard/Download/lime-p3-synthetic-text.txt')
start()
print('PASS synthetic material UI: share/open, file picker, draft restart, correction, proposal and original source')
