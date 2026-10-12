#!/usr/bin/env python3
"""Deferred emulator UI checks; cancels forms and makes no ordinary record writes."""
import argparse,json,re,subprocess,time,uuid,xml.etree.ElementTree as E
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--serial',required=True);p.add_argument('--mode',choices=['debug','preview'],required=True);a=p.parse_args()
ROOT=Path(__file__).resolve().parents[1]
PKG='app.lime.personalassistant.dev';ADB=['adb','-s',a.serial]
def adb(*parts):return subprocess.check_output(ADB+list(parts),text=True,timeout=35).strip()
assert adb('shell','getprop','ro.kernel.qemu')=='1','This smoke script is restricted to an emulator.'
RESULT=ROOT/'.local'/('p5-offline-ui-'+a.mode+'.json')
RESULT.parent.mkdir(exist_ok=True);RESULT.unlink(missing_ok=True)
size=list(map(int,re.findall(r'(\d+)x(\d+)',adb('shell','wm','size'))[-1]));width,height=size
def ui():
 path='/sdcard/lime-offline-ui-'+uuid.uuid4().hex+'.xml'
 try:adb('shell','uiautomator','dump',path);return E.fromstring(adb('shell','cat',path))
 finally:adb('shell','rm','-f',path)
def matches(n,label):return label in (n.get('text'),n.get('content-desc'))
def bounds(n):return list(map(int,re.findall(r'\d+',n.get('bounds',''))))
def find(label,scroll=False,timeout=25):
 end=time.monotonic()+timeout;swipes=0
 while time.monotonic()<end:
  for n in ui().iter('node'):
   if matches(n,label):
    b=bounds(n)
    if len(b)==4 and b[2]>b[0] and b[3]>b[1] and (not scroll or b[3]<height*0.96):return n
  if scroll and swipes<5:
   adb('shell','input','swipe',str(width*97//100),str(height*3//4),str(width*97//100),str(height//3),'350');swipes+=1
  time.sleep(.3)
 raise RuntimeError('Missing expected static control: '+label)
def tap(label,scroll=False):
 find(label,scroll);time.sleep(.4);n=find(label,scroll);x1,y1,x2,y2=bounds(n);adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
def start():
 adb('shell','am','force-stop',PKG);adb('shell','am','start','-n',PKG+'/app.lime.personalassistant.MainActivity');find('日记');time.sleep(.5)
def navigate(label):
 for _ in range(3):
  for n in ui().iter('node'):
   if n.get('content-desc')==label and n.get('selected')=='true':return
  tap(label);time.sleep(.5)
 raise RuntimeError('Tab did not activate: '+label)
def verify_modules(drawer=False):
 if drawer:tap('打开页面菜单')
 tap('QQ收件',True);find('尚未绑定QQ');assert find('读取QQ消息').get('enabled')=='false';tap('关闭QQ收件')
 if drawer:tap('打开页面菜单')
 tap('本机资料',True);find('资料标题关键词');tap('新增资料')
 for label in ['资料标题','资料类型','资料标签','资料正文']:find(label)
 tap('取消资料编辑');tap('关闭资料')
 if drawer:tap('打开页面菜单')
 tap('日用记录与整理',True);find('搜索活动计划');tap('新增活动计划')
 for label in ['活动计划标题','活动计划类型','活动计划备注']:find(label)
 tap('取消活动编辑');tap('训练依据');find('训练起始日期');find('训练结束日期');tap('查询记录依据')
 find('可恢复整理');tap('可恢复整理');find('预览所选整理');assert find('预览所选整理').get('enabled')=='false';tap('关闭日用记录')
start();tap('编辑个人资料');tap('助手配置',True);find('搜索个人记忆',True);tap('新增个人记忆',True);find('个人记忆名称',True);find('个人记忆内容',True);tap('取消记忆编辑',True);tap('关闭');verify_modules();adb('shell','input','keyevent','4');find('日记')
navigate('助手');verify_modules(drawer=True)
start();tap('编辑个人资料');tap('本机资料',True);find('资料标题关键词');tap('关闭资料')
result={'status':'passed','phase':'p5-offline-management','memoryCreateCancel':True,'activityCreateCancel':True,'mode':a.mode,'settingsAndAssistantEntries':True,'qqUnboundReadDisabled':True,'recordFormCancel':True,'dailyHistoryQuery':True,'organizationWithoutSelectionDisabled':True,'coldReopen':True,'ordinaryWritesRequested':False,'networkRequestsRequested':False,'modelCalls':0}
out=RESULT;out.write_text(json.dumps(result,indent=2)+'\n');out.chmod(0o600)
print('PASS '+a.mode+' offline memory/activity form cancel, settings/assistant module entries, unbound QQ, record cancel, history query, empty selection guard and cold reopen; no requested ordinary writes/network/model')
