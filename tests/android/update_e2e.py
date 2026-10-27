#!/usr/bin/env python3
"""Owned, isolated Android36 emulator: real release download and in-place update.

Run through workspace run. Requires a local Android SDK with emulator/system image,
QA updater signed with the release key but version 1.2.4/code9, verification test APK,
and both v1.2.5 official APKs. No personal devices, accounts or data are used.
"""
from storage_helpers import read_state, clear_snapshot_slots
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

p = argparse.ArgumentParser()
p.add_argument('--sdk', required=True, type=Path)
p.add_argument('--out', required=True, type=Path)
p.add_argument('--fixtures', type=Path)
p.add_argument('--manifest', type=Path, help='Published manifest matching the fixture APKs')
p.add_argument('--qa-apk', type=Path)
p.add_argument('--test-apk', type=Path)
p.add_argument('--final-apk', type=Path)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
root = Path.cwd()
adb_path = a.sdk / 'platform-tools/adb'
serial = 'emulator-5584'
pkg = 'com.androidsoftwaredaily.habitcheckin'
data = f'/data/user/0/{pkg}/files/habit-checkin/data.json'
cache = f'/data/user/0/{pkg}/cache/updates'
avds = root / '.local/update-avd'
avd = avds / 'LimeUpdater.avd'
avd.mkdir(parents=True, exist_ok=True)
(avds / 'LimeUpdater.ini').write_text(f'avd.ini.encoding=UTF-8\npath={avd}\ntarget=android-36\n')
(avd / 'config.ini').write_text(f'''AvdId=LimeUpdater
avd.ini.displayname=Lime Updater Isolated QA
abi.type=x86_64
hw.cpu.arch=x86_64
hw.cpu.ncore=2
hw.ramSize=2048
hw.lcd.width=720
hw.lcd.height=1600
hw.lcd.density=320
hw.keyboard=no
hw.gpu.enabled=yes
hw.gpu.mode=swiftshader
disk.dataPartition.size=6442450944
image.sysdir.1={a.sdk}/system-images/android-36/default/x86_64
tag.id=default
tag.display=Default Android System Image
target=android-36
showDeviceFrame=no
''')
report_path = a.out / 'result.json'
report = json.loads(report_path.read_text()) if report_path.exists() else {}

def adb(*args, binary=False, check=True, timeout=40):
    r = subprocess.run([str(adb_path), '-s', serial, *map(str,args)], capture_output=True, text=not binary, check=check, timeout=timeout)
    return r.stdout

def sh(*args): return adb('shell', *map(str,args))
def state(): return read_state(adb, data)
def tree():
    sh('uiautomator','dump','/sdcard/lime-update.xml')
    xml = adb('exec-out','cat','/sdcard/lime-update.xml')
    (a.out / 'current.xml').write_text(xml)
    return ET.fromstring(xml)
def box(n): return list(map(int, re.findall(r'-?\d+', n.attrib['bounds'])))
def shot(name):
    (a.out / (name+'.png')).write_bytes(adb('exec-out','screencap','-p',binary=True))
    (a.out / (name+'.xml')).write_text(ET.tostring(tree(),encoding='unicode'))
def find(value, attr='content-desc', timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for n in tree().iter('node'):
            if n.attrib.get(attr) == value and n.attrib.get('enabled') != 'false':
                x1,y1,x2,y2=box(n)
                if x2>x1 and y2>y1 and y1>=40 and y2<=1535: return n
        time.sleep(.5)
    shot('failure')
    raise AssertionError(f'Missing {attr}={value}')
def tap(value,attr='content-desc',timeout=25):
    n=find(value,attr,timeout);x1,y1,x2,y2=box(n)
    sh('input','tap',(x1+x2)//2,(y1+y2)//2);time.sleep(.4)
def wait_message(fragment, timeout=30):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if any(fragment in n.attrib.get('text','') for n in tree().iter('node')): return
        time.sleep(.5)
    shot('failure-message');raise AssertionError('Missing message: '+fragment)
def record(key,value=True):
    report[key]=value;report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({key:value},ensure_ascii=False),flush=True)
def business(value): return {key:value[key] for key in ['habits','groups','todos','memoGroups','memos']}
def launch(): sh('am','start','-n',pkg+'/.MainActivity');time.sleep(2)
def restart(): sh('am','force-stop',pkg);launch()
def write_state(value):
    sh('am','force-stop',pkg)
    clear_snapshot_slots(adb, data)
    f=a.out/'fixture.json';f.write_text(json.dumps(value,ensure_ascii=False))
    sh('mkdir','-p',str(Path(data).parent));adb('push',f,data)
    uid=sh('stat','-c','%u',f'/data/user/0/{pkg}').strip()
    sh('chown','-R',f'{uid}:{uid}',f'/data/user/0/{pkg}/files')

def initial_test():
    assert a.qa_apk and a.test_apk and a.fixtures and a.manifest
    release=json.loads(a.manifest.read_text());version=release["version"];code=release["versionCode"]
    adb('install','-r',a.qa_apk,timeout=90)
    sh('cmd','appops','set',pkg,'REQUEST_INSTALL_PACKAGES','default')
    now=int(time.time()*1000)//60000*60000
    date_key=dt.datetime.fromtimestamp(now/1000,dt.timezone(dt.timedelta(hours=4))).date().isoformat()
    fixture=dict(version=7,groups=[],habits=[dict(id='habit',name='更新后保留的习惯',groupId=None,order=0,cadence='daily',targetCount=0,createdAt=now,archivedAt=None,checkins=[dict(id='checkin',dateKey=date_key,timestamp=now,note='更新测试记录',createdAt=now)])],todos=[dict(id='todo',title='更新后保留的待办',note='更新不应修改这段内容',dueDateKey=None,dueTime=None,order=0,completedAt=None,createdAt=now)],memoGroups=[],memos=[dict(id='memo',title='更新后保留的备忘录',body='保留正文\nEND_UPDATE_TEST',groupId=None,order=0,createdAt=now,updatedAt=now,deletedAt=None)],settings=dict(themeId='ocean',profileName='更新测试',profileSignature='',avatarUri=None,collapsedTodoBuckets=[],autoCheckUpdates=False,lastUpdateCheckAt=0,skippedUpdateVersionCode=0))
    write_state(fixture)
    sh('mkdir','-p',cache)
    for f in a.fixtures.glob('*.apk'): adb('push',f,cache+'/'+f.name)
    uid=sh('stat','-c','%u',f'/data/user/0/{pkg}').strip();sh('chown','-R',f'{uid}:{uid}',f'/data/user/0/{pkg}/cache')
    adb('install','-r',a.test_apk,timeout=90)
    output=sh('am','instrument','-w','-e','fixtureCode',str(code),'-e','fixtureVersion',version,pkg+'.test/'+pkg+'.UpdateVerifierInstrumentation')
    (a.out/'native-verification.txt').write_text(output)
    assert 'PASS: 13 APK verification cases' in output,output
    record('nativeVerifier13Cases',True)
    # Remove fixtures before measuring runtime download cleanup, without changing business data.
    sh('rm','-rf',cache)
    fixture['settings']['autoCheckUpdates']=True
    sh('wm','size','720x1280');sh('settings','put','system','font_scale','1.3');time.sleep(1)
    write_state(fixture);launch()
    for label in ['下载更新','跳过此版本','稍后更新']:
        assert box(find(label,timeout=35))[3] <= 1184, 'Update controls clipped on small screen'
    shot('small-screen-large-font');record('smallScreenLargeFontControlsReachable')
    tap('跳过此版本',timeout=35);time.sleep(1)
    sh('wm','size','720x1600');sh('settings','put','system','font_scale','1.0');time.sleep(1)
    assert state()['settings']['skippedUpdateVersionCode']==code
    checked=state()['settings']['lastUpdateCheckAt'];assert checked>0
    restart();tap('设置');tap('检查更新')
    find('下载更新');record('automaticCheckAndManualOverrideSkip')
    tap('稍后更新');tap('自动检查更新');time.sleep(1)
    assert state()['settings']['autoCheckUpdates'] is False
    restart();tap('设置');assert state()['settings']['autoCheckUpdates'] is False
    record('automaticCheckPreferencePersists')
    # Manual network failures must be visible and leave local content usable.
    sh('svc','wifi','disable');sh('svc','data','disable')
    tap('检查更新');wait_message('无法',30)
    assert business(state())==business(fixture)
    record('offlineFailurePreservesContent');shot('offline')
    sh('svc','wifi','enable');sh('svc','data','enable');time.sleep(3)
    tap('检查更新');find('下载更新',timeout=35);shot('available')
    adb('emu','network','speed','edge')
    tap('下载更新');tap('取消下载');wait_message('下载已取消')
    assert not sh('ls','-A',cache).strip()
    adb('emu','network','speed','full');record('cancelDeletesPartialDownload')
    tap('下载更新');find('安装更新',timeout=210);shot('ready')
    # Keep length unchanged so the second, native install-time hash check is exercised.
    target=cache+f'/lime-{version}-x86_64.apk'
    tampered=a.out/'tampered-private-test.apk';adb('pull',target,tampered)
    content=bytearray(tampered.read_bytes());content[len(content)//2]^=1;tampered.write_bytes(content);adb('push',tampered,target);tampered.unlink()
    tap('安装更新');wait_message('校验失败');find('重新下载更新');record('installTimeTamperRejected');shot('tamper-rejected')
    tap('重新下载更新');find('安装更新',timeout=210)
    tap('安装更新');time.sleep(1);shot('unknown-source')
    switches=[n for n in tree().iter('node') if n.attrib.get('package')=='com.android.settings' and n.attrib.get('checkable')=='true']
    assert switches,'Expected per-app unknown source permission screen'
    n=switches[0];assert n.attrib.get('checked')=='false'
    x1,y1,x2,y2=box(n);sh('input','tap',(x1+x2)//2,(y1+y2)//2)
    sh('input','keyevent',4);time.sleep(1);tap('安装更新');time.sleep(2);shot('system-installer')
    current=tree()
    buttons=[n for n in current.iter('node') if n.attrib.get('text','').casefold() in ['update','install','更新','安装'] and n.attrib.get('enabled')=='true']
    assert buttons,'Expected Android installer confirmation'
    n=buttons[-1];x1,y1,x2,y2=box(n);sh('input','tap',(x1+x2)//2,(y1+y2)//2)
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        if re.search(rf'versionCode={code}\b',sh('dumpsys','package',pkg)):break
        time.sleep(1)
    else:raise AssertionError('System installer did not update package')
    record('realDownloadAndSystemInstall',True)
    restart()
    assert business(state())==business(fixture)
    assert state()['settings']['themeId']=='ocean' and state()['settings']['profileName']=='更新测试'
    record('businessDataPreservedAcrossInstall');shot('installed-target')
    (a.out/'expected-business.json').write_text(json.dumps(business(fixture),ensure_ascii=False))

def final_test():
    adb('install','-r',a.final_apk,timeout=90);launch();tap('设置')
    version=json.loads((root/'app.json').read_text())['expo']['version']
    wait_message('当前版本 '+version)
    assert business(state())==json.loads((a.out/'expected-business.json').read_text())
    assert state()['settings']['themeId']=='ocean'
    record('formalUpgradePreservesContent')
    for attempt in range(3):
        tap('检查更新')
        try:
            wait_message('当前已是最新版本',22)
            break
        except AssertionError:
            if attempt == 2: raise
            time.sleep(4)
    shot('final-version');record('latestDoesNotOfferDowngrade')

env=dict(os.environ,ANDROID_HOME=str(a.sdk),ANDROID_SDK_ROOT=str(a.sdk),ANDROID_AVD_HOME=str(avds))
log=(a.out/'emulator.log').open('w')
emulator=subprocess.Popen([str(a.sdk/'emulator/emulator'),'-avd','LimeUpdater','-port','5584','-timezone','Asia/Shanghai','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader','-cores','2','-memory','2048','-no-metrics'],env=env,stdout=log,stderr=log)
try:
    deadline=time.monotonic()+160
    while time.monotonic()<deadline:
        if emulator.poll() is not None:raise RuntimeError('Emulator startup failed')
        if adb('shell','getprop','sys.boot_completed',check=False).strip()=='1':break
        time.sleep(2)
    else:raise TimeoutError('Emulator boot')
    for _ in range(6):
        adb('root',check=False);adb('wait-for-device')
        if sh('id','-u').strip()=='0':break
        time.sleep(2)
    else:raise AssertionError('Isolated emulator adb root unavailable')
    sh('settings','put','system','font_scale','1.0');sh('wm','size','720x1600');sh('input','keyevent',82)
    sh('svc','wifi','enable');sh('svc','data','enable');adb('emu','network','speed','full');time.sleep(3)
    mode='finalUpgrade' if a.final_apk else 'initialUpdate'
    record(mode+'Status','running')
    if a.final_apk:final_test()
    else:initial_test()
    record(mode+'Status','passed')
except Exception as error:
    record(('finalUpgrade' if a.final_apk else 'initialUpdate')+'Status','failed: '+str(error))
    (a.out/'guest-connectivity.txt').write_text(sh('dumpsys','connectivity'))
    (a.out/'guest-network-log.txt').write_text(sh('logcat','-d','-t','300'))
    shot('failure-final');raise
finally:
    adb('emu','kill',check=False)
    try:emulator.wait(timeout=15)
    except subprocess.TimeoutExpired:emulator.terminate();emulator.wait(timeout=10)
    log.close()
