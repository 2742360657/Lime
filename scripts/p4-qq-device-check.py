#!/usr/bin/env python3
"""Run isolated synthetic QQ native probe on an unlocked debug device."""
import argparse,json,re,shutil,subprocess,time,uuid
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];PACKAGE='app.lime.personalassistant.dev'
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);args=parser.parse_args()
ADB=shutil.which('adb')
if not ADB:raise SystemExit('Source scripts/env.sh first.')
def adb(*parts):return subprocess.check_output([ADB,'-s',args.serial,*parts],text=True,timeout=35).strip()
def ui():
    if not re.search(r'mCurrentFocus=.*'+re.escape(PACKAGE),adb('shell','dumpsys','window')):raise RuntimeError('Lime is not foreground; pause device check.')
    path='/sdcard/lime-qq-'+uuid.uuid4().hex+'.xml'
    try:adb('shell','uiautomator','dump',path);return ET.fromstring(adb('shell','cat',path))
    finally:adb('shell','rm','-f',path)
def wait(label,timeout=45):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        for node in ui().iter('node'):
            if node.get('text')=='QQ组件验证失败':raise RuntimeError('Synthetic QQ native probe failed; inspect private stage result.')
            if label in (node.get('text'),node.get('content-desc')):return node
        time.sleep(.3)
    raise RuntimeError('Expected static control missing: '+label)
def tap(label):
    n=wait(label);x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds','')));adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
adb('shell','am','start','-n',PACKAGE+'/app.lime.personalassistant.MainActivity')
# Android may return from am start before the app owns its first window.
launch_deadline=time.monotonic()+10
while not re.search(r'mCurrentFocus=.*'+re.escape(PACKAGE),adb('shell','dumpsys','window')):
    if time.monotonic()>launch_deadline:raise RuntimeError('Lime did not reach foreground after launch.')
    time.sleep(.2)
wait('日记');adb('shell','input','keyevent','82');tap('验证QQ手机组件');wait('QQ组件验证通过')
result=json.loads(adb('shell','run-as',PACKAGE,'cat','files/lime-p4-qq-probe.json'))
assert result['status']=='passed' and result['syntheticOnly'] is True and result['accountTested'] is False and result['modelCalls']==0 and result['localQueue']==0
assert all(result[name] for name in ['nativeGcm','badTag','secureStore','ownerFilter','wsNew','wsResume','invalidSession','wsRedirect','wsCancellation','dedup','reopen','nativeMedia','p3Parse','mediaRejection','mediaCancellation'])
target=ROOT/'.local'/'p4-qq-native-result.json';target.write_text(json.dumps(result,indent=2)+'\n');target.chmod(0o600)
print('PASS native synthetic QQ HTTP/WS, GCM, owner/seq, resume/fallback, media/P3, cancellation and zero queue; no real QQ/model.')
