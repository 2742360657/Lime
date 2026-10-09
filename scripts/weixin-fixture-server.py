#!/usr/bin/env python3
"""Loopback synthetic Weixin responses for the isolated debug phone probe.
No real account, external requests, credentials, model calls or product service.
"""
import argparse,base64,json,time,urllib.parse
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8093);args=parser.parse_args()
VECTOR={"ciphertext":"UimlH+6foVOGlLBzKhGwNcHKXmLQsRXbdfLgR/JJglQ3jDojrB9HZ2xMiqzPQ9Q2","size":34,"hash":"13569892edf1bbc375383a10c52587e88ff9187e2292d987653fcca577013397"}
def msg(identifier,items,sender='synthetic-owner'):
 return {'message_id':identifier,'from_user_id':sender,'message_type':1,'message_state':2,'item_list':items}
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*_):pass
 def output(self,value,status=200):
  data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers()
  try:self.wfile.write(data)
  except (BrokenPipeError,ConnectionResetError):pass
 def do_POST(self):
  length=int(self.headers.get('Content-Length','0'))
  if length>200000:return self.output({},413)
  body=json.loads(self.rfile.read(length));path=urllib.parse.urlparse(self.path).path
  if path=='/slow':time.sleep(2);return self.output({'qrcode':'synthetic','qrcode_img_content':'synthetic'})
  if path.endswith('/get_bot_qrcode'):
   assert body=={'local_token_list':[]} and not self.headers.get('Authorization')
   return self.output({'qrcode':'synthetic-qr','qrcode_img_content':'synthetic-display'})
  if path.endswith('/getupdates'):
   assert self.headers.get('Authorization')=='Bearer synthetic-fixture-token'
   assert body['base_info']=={'channel_version':'2.4.9','bot_agent':'Lime/1.1.1'}
   media={'encrypt_query_param':'synthetic-capability','aes_key':base64.b64encode(b'0'*16).decode()}
   messages=[msg(18446744073709551615,[{'type':1,'text_item':{'text':'合成微信通知'}}]),
    msg(2,[{'type':2,'image_item':{'media':media}}]),msg(3,[{'type':4,'file_item':{'media':media,'file_name':'合成.txt','len':'4'}}]),
    msg(4,[{'type':1,'text_item':{'text':'外部'}}],sender='synthetic-other')]
   return self.output({'ret':0,'msgs':messages,'get_updates_buf':'synthetic-cursor'})
  self.output({},404)
 def do_GET(self):
  parsed=urllib.parse.urlparse(self.path)
  if parsed.path.endswith('/get_qrcode_status'):
   assert not self.headers.get('Authorization') and not self.headers.get('X-WECHAT-UIN')
   return self.output({'status':'confirmed','bot_token':'synthetic-fixture-token','ilink_bot_id':'synthetic-bot','ilink_user_id':'synthetic-owner','baseurl':'https://ilinkai.weixin.qq.com'})
  if parsed.path=='/slow':time.sleep(2);return self.output({'qrcode':'synthetic','qrcode_img_content':'synthetic'})
  if parsed.path=='/media':
   kind=urllib.parse.parse_qs(parsed.query).get('kind',['good'])[0]
   if kind=='redirect':self.send_response(302);self.send_header('Location','https://example.invalid/');self.end_headers();return
   if kind=='large':self.send_response(200);self.send_header('Content-Length',str(10*1024*1024+17));self.end_headers();return
   if kind=='slow':time.sleep(2)
   data=base64.b64decode(VECTOR['ciphertext']) if kind!='padding' else b'0'*16
   self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers()
   try:self.wfile.write(data)
   except (BrokenPipeError,ConnectionResetError):pass
   return
  self.output({},404)
print('Synthetic-only Weixin fixture on loopback',args.port,flush=True)
ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
