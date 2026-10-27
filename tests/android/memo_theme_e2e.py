#!/usr/bin/env python3
"""Isolated Android36: body-origin touch drags, end-word edits and six themes.

Run through workspace run with --qa-apk for an old-release probe (records results),
or --final-apk for strict fixed-build assertions. No personal device/data is used.
"""
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
p.add_argument('--qa-apk', type=Path)
p.add_argument('--final-apk', type=Path)
p.add_argument('--small-only', action='store_true')
p.add_argument('--themes-only', action='store_true')
p.add_argument('--scroll-only', action='store_true')
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
root = Path.cwd()
adb_path = a.sdk / 'platform-tools/adb'
serial = 'emulator-5586'
pkg = 'com.androidsoftwaredaily.habitcheckin'
data = f'/data/user/0/{pkg}/files/habit-checkin/data.json'
cache = f'/data/user/0/{pkg}/cache/updates'
avds = root / '.local/memo-theme-avd'
avd = avds / 'LimeMemoTheme.avd'
avd.mkdir(parents=True, exist_ok=True)
(avds / 'LimeMemoTheme.ini').write_text(f'avd.ini.encoding=UTF-8\npath={avd}\ntarget=android-36\n')
(avd / 'config.ini').write_text(f'''AvdId=LimeMemoTheme
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
report = {}

def adb(*args, binary=False, check=True, timeout=40):
    r = subprocess.run([str(adb_path), '-s', serial, *map(str,args)], capture_output=True, text=not binary, check=check, timeout=timeout)
    return r.stdout

def sh(*args): return adb('shell', *map(str,args))
def state(): return json.loads(adb('exec-out', 'cat', data))
def keyboard_visible():
    info=sh('dumpsys','input_method')
    return all(flag in info for flag in ['mInputShown=true','mWindowVisible=true','mInputViewStarted=true'])
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
    f=a.out/'fixture.json';f.write_text(json.dumps(value,ensure_ascii=False))
    sh('mkdir','-p',str(Path(data).parent));adb('push',f,data)
    uid=sh('stat','-c','%u',f'/data/user/0/{pkg}').strip()
    sh('chown','-R',f'{uid}:{uid}',f'/data/user/0/{pkg}/files')

def scroll_body(down, times=14):
    for _ in range(times):
        n=find('备忘录正文');x1,y1,x2,y2=box(n)
        # Start strictly inside the actual TextInput, not the outside ScrollView gutter.
        top=y1+int((y2-y1)*.22);bottom=y1+int((y2-y1)*.78)
        sh('input','swipe',(x1+x2)//2,bottom if down else top,(x1+x2)//2,top if down else bottom,350)
        time.sleep(.08)

def ocr_marker(name, marker):
    shot(name)
    result=subprocess.run(['tesseract',str(a.out/(name+'.png')),'stdout','--psm','6'],capture_output=True,text=True,check=True,env=dict(os.environ,OMP_THREAD_LIMIT='1'))
    (a.out/(name+'-ocr.txt')).write_text(result.stdout)
    return marker in result.stdout.replace(' ','').replace('_','').upper()

def probe():
    apk=a.final_apk or a.qa_apk
    assert apk
    adb('install','-r',apk,timeout=90)
    fixture=json.loads((a.out/'fixture.json').read_text()) if (a.out/'fixture.json').exists() else dict(version=7,habits=[],groups=[],todos=[],memoGroups=[],memos=[dict(id='long',title='长文滑动验收',body='STARTMARKER\n'+'\n'.join(f'Line {i:03d} native memo scrolling test' for i in range(1,81))+'\nENDMARKER',groupId=None,order=0,createdAt=1793023200000,updatedAt=1793023200000,deletedAt=None)],settings=dict(themeId='forest',profileName='交互验收',profileSignature='',avatarUri=None,collapsedTodoBuckets=[],autoCheckUpdates=False,lastUpdateCheckAt=0,skippedUpdateVersionCode=0))
    write_state(fixture);launch();tap('备忘录');tap('打开 长文滑动验收')
    # Focus, then hide IME. Both swipes must remain in the text area.
    top=ocr_marker('memo-before-scroll','STARTMARKER')
    tap('备忘录正文');sh('input','keyevent',4);time.sleep(.5)
    scroll_body(True)
    closed=ocr_marker('memo-bottom-keyboard-closed','ENDMARKER')
    closed_ime=keyboard_visible()
    # Re-open at top to avoid using cursor-to-end as a substitute for real touch scrolling.
    tap('保存备忘录');tap('打开 长文滑动验收');tap('备忘录正文');time.sleep(.5)
    assert keyboard_visible()
    scroll_body(True,22)
    opened=ocr_marker('memo-bottom-keyboard-open','ENDMARKER')
    record('memoViewportProbe',dict(startMarkerInitiallyVisible=top,bottomReachableKeyboardClosed=closed,keyboardUnexpectedlyOpenedDuringDrag=closed_ime,bottomReachableKeyboardOpen=opened))
    if a.final_apk:
        assert top and closed and opened and not closed_ime,'Body drag did not expose the last line with expected keyboard state'
        verify_tail_edit(fixture)
        if not a.scroll_only: verify_themes()


# Decode Android screencap's 8-bit PNG directly, without extra Python packages.
def rgb_pixels(file):
    import struct,zlib
    data=file.read_bytes();offset=8;compressed=b''
    while offset<len(data):
        size=struct.unpack('>I',data[offset:offset+4])[0];kind=data[offset+4:offset+8];chunk=data[offset+8:offset+8+size];offset+=size+12
        if kind==b'IHDR':width,height,depth,color,*_=struct.unpack('>IIBBBBB',chunk)
        if kind==b'IDAT':compressed+=chunk
    assert depth==8 and color in (2,6),'Unsupported screenshot format'
    channels=4 if color==6 else 3;stride=width*channels;raw=zlib.decompress(compressed);previous=bytearray(stride);rows=[]
    for y in range(height):
        mode=raw[y*(stride+1)];row=bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        if mode==0:
            rows.append(row);previous=row;continue
        if mode==2:
            row=bytearray((value+previous[x])&255 for x,value in enumerate(row))
            rows.append(row);previous=row;continue
        for x in range(stride):
            left=row[x-channels] if x>=channels else 0;above=previous[x];diagonal=previous[x-channels] if x>=channels else 0
            if mode==1:predict=left
            elif mode==2:predict=above
            elif mode==3:predict=(left+above)//2
            elif mode==4:
                value=left+above-diagonal;dist=[abs(value-left),abs(value-above),abs(value-diagonal)];predict=[left,above,diagonal][dist.index(min(dist))]
            else:assert mode==0;predict=0
            row[x]=(row[x]+predict)&255
        rows.append(row);previous=row
    return width,height,channels,rows

def color_count(name,bounds,color):
    width,height,channels,rows=rgb_pixels(a.out/(name+'.png'))
    x1,y1,x2,y2=bounds;rgb=bytes.fromhex(color.lstrip('#'));count=0
    for y in range(max(0,y1),min(height,y2)):
        for x in range(max(0,x1),min(width,x2)):
            if rows[y][x*channels:x*channels+3]==rgb:count+=1
    return count


def verify_tail_edit(fixture):
    import csv,io
    shot('memo-tail-selection-before')
    result=subprocess.run(['tesseract',str(a.out/'memo-tail-selection-before.png'),'stdout','--psm','6','tsv'],capture_output=True,text=True,check=True,env=dict(os.environ,OMP_THREAD_LIMIT='1'))
    token=next((r for r in csv.DictReader(io.StringIO(result.stdout),delimiter='\t') if re.sub('[^A-Z]','',r['text'].upper())=='ENDMARKER'),None)
    assert token,'Cannot locate last word for a real long press'
    x=int(token['left'])+int(token['width'])//2;y=int(token['top'])+int(token['height'])//2
    sh('input','swipe',x,y,x,y,1100);time.sleep(.6);shot('memo-tail-selected')
    sh('input','text','EDITEDMARKER');time.sleep(1.2)
    expected=fixture['memos'][0]['body'].replace('ENDMARKER','EDITEDMARKER')
    assert state()['memos'][0]['body']==expected,'Last-word replacement changed unexpected text'
    record('tailCanBeSelectedEditedAndAutosaved')
    scroll_body(False,22);assert ocr_marker('memo-scroll-back-to-top','STARTMARKER')
    tap('返回备忘录列表');tap('不保存')
    time.sleep(.5);assert state()['memos'][0]['body']==fixture['memos'][0]['body']
    record('discardRestoresAutosavedMemo')

def verify_themes():
    palette=dict(forest=('#2E7D5A','#EAF0E8'),ocean=('#2E6F9E','#E7F0F7'),amber=('#965824','#F6EEDF'),rose=('#A7476D','#F7E7EE'),mint=('#247762','#E3F1ED'),slate=('#4B6078','#E7EAF0'))
    for theme_id,label in [('forest','松绿'),('ocean','海蓝'),('amber','暖棕'),('rose','柔粉'),('mint','薄荷'),('slate','石墨')]:
        tap('设置');tap('色系选择, '+{'forest':'松绿','ocean':'海蓝','amber':'暖棕','rose':'柔粉','mint':'薄荷','slate':'石墨'}[state()['settings']['themeId']]+', ›')
        tap(label,'text');tap('关闭','text');time.sleep(.2)
        assert state()['settings']['themeId']==theme_id
        shot('theme-'+theme_id+'-settings')
        tap('习惯');tap('新建习惯');tap('习惯名称')
        deadline=time.monotonic()+10
        while time.monotonic()<deadline and not keyboard_visible(): time.sleep(.2)
        assert keyboard_visible(),'Habit input did not open the software keyboard'
        sh('input','keyevent',4);time.sleep(.5);tap('设置目标次数');time.sleep(.3)
        shot('theme-'+theme_id+'-input-switch')
        assert color_count('theme-'+theme_id+'-input-switch',box(find('设置目标次数')),palette[theme_id][0])>=20,'Switch thumb does not match palette'
        tap('习惯名称');sh('input','text','Cursor_test')
        cursor_seen=False
        for _ in range(3):
            shot('theme-'+theme_id+'-cursor')
            if color_count('theme-'+theme_id+'-cursor',box(find('习惯名称')),palette[theme_id][0])>0:cursor_seen=True;break
            time.sleep(.25)
        assert cursor_seen,'Input cursor does not match palette'
        tap('取消编辑');tap('继续编辑');tap('取消编辑');shot('theme-'+theme_id+'-confirmation')
        assert color_count('theme-'+theme_id+'-confirmation',box(find('继续编辑')),palette[theme_id][1])>=100,'Confirmation does not match palette'
        tap('放弃修改')
        tap('备忘录');tap('打开 长文滑动验收');tap('备忘录正文');time.sleep(.2)
        shot('theme-'+theme_id+'-memo');tap('保存备忘录')
        record('theme-'+theme_id+'-controlsAndConfirmation')
    restart();tap('设置');assert state()['settings']['themeId']=='slate';record('selectedThemePersistsAfterRestart')


def probe_small():
    assert a.final_apk
    adb('install','-r',a.final_apk,timeout=90)
    overlays=sh('cmd','overlay','list')
    assert 'com.android.internal.systemui.navbar.gestural' in overlays
    sh('cmd','overlay','enable-exclusive','--category','com.android.internal.systemui.navbar.gestural')
    sh('wm','size','720x1280');sh('settings','put','system','font_scale','1.3');time.sleep(2)
    fixture=dict(version=7,habits=[],groups=[],todos=[],memoGroups=[],memos=[dict(id='long',title='长文滑动验收',body='STARTMARKER\n'+('这是一段连续的中文长正文，用来验证自动换行以后仍然能在文字区域上下滑动。'*45)+'\nENDMARKER',groupId=None,order=0,createdAt=1793023200000,updatedAt=1793023200000,deletedAt=None)],settings=dict(themeId='slate',profileName='小屏手势验收',profileSignature='',avatarUri=None,collapsedTodoBuckets=[],autoCheckUpdates=False,lastUpdateCheckAt=0,skippedUpdateVersionCode=0))
    write_state(fixture);launch();tap('备忘录');tap('打开 长文滑动验收');tap('备忘录正文')
    assert keyboard_visible()
    found=False
    for index in range(15):
        scroll_body(True,5)
        if ocr_marker('small-wrapped-end','ENDMARKER'):found=True;break
    assert found,'Wrapped long memo cannot reach bottom on small screen with IME'
    record('smallGestureNavigationLargeFontWrappedBodyScrolls')
    # Actual word selection and replacement while the keyboard stays open.
    import csv,io
    result=subprocess.run(['tesseract',str(a.out/'small-wrapped-end.png'),'stdout','--psm','6','tsv'],capture_output=True,text=True,check=True,env=dict(os.environ,OMP_THREAD_LIMIT='1'))
    token=next(r for r in csv.DictReader(io.StringIO(result.stdout),delimiter='\t') if re.sub('[^A-Z]','',r['text'].upper())=='ENDMARKER')
    x=int(token['left'])+int(token['width'])//2;y=int(token['top'])+int(token['height'])//2
    sh('input','swipe',x,y,x,y,1100);time.sleep(.5);shot('small-tail-selected')
    sh('input','text','EDITEDMARKER');time.sleep(1.2)
    assert state()['memos'][0]['body']==fixture['memos'][0]['body'].replace('ENDMARKER','EDITEDMARKER')
    tap('保存备忘录');restart()
    assert state()['memos'][0]['body'].endswith('EDITEDMARKER')
    record('smallScreenTailSelectionEditAndRestartPersist')


env=dict(os.environ,ANDROID_HOME=str(a.sdk),ANDROID_SDK_ROOT=str(a.sdk),ANDROID_AVD_HOME=str(avds))
log=(a.out/'emulator.log').open('w')
emulator=subprocess.Popen([str(a.sdk/'emulator/emulator'),'-avd','LimeMemoTheme','-port','5586','-timezone','Asia/Shanghai','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader','-cores','2','-memory','2048','-no-metrics'],env=env,stdout=log,stderr=log)
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
    sh('settings','put','system','font_scale','1.0');sh('wm','size','720x1600');sh('settings','put','secure','show_ime_with_hard_keyboard','1');sh('input','keyevent',82)
    sh('svc','wifi','enable');sh('svc','data','enable');adb('emu','network','speed','full');time.sleep(3)
    mode='memoThemeFix' if a.final_apk else 'memoBaseline'
    record(mode+'Status','running')
    if a.small_only:probe_small()
    elif a.themes_only:
        adb('install','-r',a.final_apk,timeout=90);restart();verify_themes()
    else:probe()
    record(mode+'Status','passed')
except Exception as error:
    record(('memoThemeFix' if a.final_apk else 'memoBaseline')+'Status','failed: '+str(error))
    (a.out/'guest-connectivity.txt').write_text(sh('dumpsys','connectivity'))
    (a.out/'guest-network-log.txt').write_text(sh('logcat','-d','-t','300'))
    shot('failure-final');raise
finally:
    adb('shell','wm','size','720x1600',check=False);adb('shell','settings','put','system','font_scale','1.0',check=False)
    adb('emu','kill',check=False)
    try:emulator.wait(timeout=15)
    except subprocess.TimeoutExpired:emulator.terminate();emulator.wait(timeout=10)
    log.close()
