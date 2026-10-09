#!/usr/bin/env python3
"""Read-only P4 reminder settings acceptance on an explicitly selected device.
Requires the standalone preview with reminders currently disabled.
Does not save rules, edit ordinary records or request notification permission.
"""
import argparse,json,re,shlex,subprocess,time,uuid,xml.etree.ElementTree as E
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--serial',required=True);args=parser.parse_args()
SERIAL=args.serial;PKG='app.lime.personalassistant.dev';ROOT=Path(__file__).resolve().parents[1]
def shell(*parts):
 return subprocess.check_output(['adb','-s',SERIAL,'shell',shlex.join(parts)],text=True,timeout=35)
def ui():
 p='/sdcard/lime-p4-phone-'+uuid.uuid4().hex+'.xml'
 try:
  shell('uiautomator','dump',p);return E.fromstring(shell('cat',p))
 finally:shell('rm','-f',p)
def node(label,contains=False,timeout=40):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  nodes=list(ui().iter('node'));nodes.sort(key=lambda n:n.get('content-desc')!=label)
  for n in nodes:
   if any(label in v if contains else label==v for v in (n.get('text',''),n.get('content-desc',''))):return n
  time.sleep(.3)
 raise RuntimeError('Missing expected control: '+label)
def tap(label,contains=False):
 n=node(label,contains);time.sleep(.25);n=node(label,contains)
 x1,y1,x2,y2=map(int,re.findall(r'\d+',n.get('bounds')));shell('input','tap',str((x1+x2)//2),str((y1+y2)//2))
def start():
 shell('am','start','-n',PKG+'/app.lime.personalassistant.MainActivity');node('日记')
start()
tap('编辑个人资料');tap('本地提醒');node('关闭提醒')
node('系统提醒已关闭，规则仍保留。')
assert node('开启系统提醒').get('checked')=='false'
tap('新建提醒');node('编辑提醒');node('提醒名称');node('提醒日期');node('提醒时间')
tap('每年公历');node('公历月日 MM-DD（不支持农历）');node('提前天数');node('当天提醒')
tap('选日期');node('取消');tap('取消');node('编辑提醒')
tap('返回提醒');node('本地提醒');node('系统提醒已关闭，规则仍保留。')
tap('关闭提醒');node('设置')
shell('am','force-stop',PKG);start();tap('编辑个人资料');tap('本地提醒');node('关闭提醒');node('系统提醒已关闭，规则仍保留。')
tap('关闭提醒')
result={'status':'passed','settingsEntry':True,'defaultDisabled':True,'onceAnnualEditor':True,'systemDatePickerCancel':True,'editorCancel':True,'reopenDisabled':True,'ordinaryRecordsEdited':False,'permissionRequested':False,'deliveryTested':False}
p=ROOT/'.local'/'p4-reminder-settings-result.json';p.write_text(json.dumps(result,indent=2)+'\n');p.chmod(0o600)
print('PASS phone standalone reminder settings/editor/calendar cancel/reopen; no records written or permissions requested')
