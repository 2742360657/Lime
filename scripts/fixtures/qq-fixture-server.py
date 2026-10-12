#!/usr/bin/env python3
"""Loopback-only synthetic QQ HTTP/WS/media fixture; never forwards messages."""
import base64, hashlib, json, struct, time, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

TEXT = '合成QQ附件：不是真实任务。'.encode()
def png_chunk(kind, raw):
    return struct.pack('!I',len(raw))+kind+raw+struct.pack('!I',zlib.crc32(kind+raw)&0xffffffff)
IMAGE = b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('!2I5B',1,1,8,2,0,0,0))+png_chunk(b'IDAT',zlib.compress(b'\x00\x32\x96\x32'))+png_chunk(b'IEND',b'')
CIPHER = 'MTExMTExMTExMTExNsQzCA2jvSxNqwCwIiD6j8EPcAiapKgdBkIvEl8ttRckxPU='

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *args): pass
    def reply(self, value):
        raw = json.dumps(value).encode(); self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_POST(self):
        length = int(self.headers.get('Content-Length','0'))
        if length > 8192: self.send_error(413); return
        self.rfile.read(length)
        if self.path.endswith('create_bind_task'): self.reply({'retcode':0,'data':{'task_id':'fixture-task'}})
        elif self.path.endswith('poll_bind_result'): self.reply({'retcode':0,'data':{'status':2,'bot_appid':'123456','bot_encrypt_secret':CIPHER,'user_openid':'synthetic-owner'}})
        elif self.path.endswith('getAppAccessToken'): self.reply({'access_token':'synthetic-access','expires_in':'7200'})
        else: self.send_error(404)
    def do_GET(self):
        p=urlparse(self.path);kind=parse_qs(p.query).get('kind',['text'])[0]
        if p.path=='/gateway': self.reply({'url':'wss://api.sgroup.qq.com/websocket/'});return
        if p.path=='/ws':
            self.websocket(parse_qs(p.query).get('mode',['new'])[0]);return
        if p.path!='/media': self.send_error(404);return
        if kind=='redirect': self.send_response(302);self.send_header('Location','http://127.0.0.1:1/');self.send_header('Content-Length','0');self.end_headers();return
        raw=IMAGE if kind=='image' else TEXT
        self.send_response(200);self.send_header('Content-Length',str(11*1024*1024 if kind=='large' else len(raw)));self.end_headers()
        if kind=='large':return
        if kind=='slow':time.sleep(2)
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass
    def websocket(self,mode):
        if mode=='redirect':self.send_response(302);self.send_header('Location','ws://127.0.0.1:8094/ws?mode=new');self.send_header('Content-Length','0');self.end_headers();return
        key=self.headers.get('Sec-WebSocket-Key','');accept=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        self.send_response(101);self.send_header('Upgrade','websocket');self.send_header('Connection','Upgrade');self.send_header('Sec-WebSocket-Accept',accept);self.end_headers();self.wfile.flush()
        self.connection.settimeout(8)
        def send(value):
            raw=json.dumps(value).encode();header=bytes([0x81,len(raw)]) if len(raw)<126 else bytes([0x81,126])+struct.pack('!H',len(raw));self.wfile.write(header+raw);self.wfile.flush()
        def receive():
            first=self.rfile.read(2)
            if len(first)<2 or first[0]&15==8:return None
            length=first[1]&127
            if length==126:length=struct.unpack('!H',self.rfile.read(2))[0]
            if length==127 or length>8192:raise ValueError('fixture frame cap')
            mask=self.rfile.read(4) if first[1]&128 else None;raw=self.rfile.read(length)
            if mask:raw=bytes(v^mask[i%4] for i,v in enumerate(raw))
            return json.loads(raw)
        def msg(seq,key,owner='synthetic-owner',attachments=None,event='C2C_MESSAGE_CREATE'):
            return {'op':0,'s':seq,'t':event,'d':{'id':key,'author':{'user_openid':owner},'content':'合成QQ通知','timestamp':'2026-10-10T08:00:00Z','attachments':attachments or []}}
        try:
            send({'op':10,'d':{'heartbeat_interval':1000}})
            while True:
                value=receive()
                if value is None:break
                if value['op']==1:send({'op':11});continue
                if mode=='silent':continue
                if value['op']==6 and mode=='invalid':send({'op':9,'d':False});continue
                if value['op']==6:
                    send(msg(7,'18446744073709551615'));send({'op':0,'s':8,'t':'RESUMED','d':None});continue
                if value['op']==2:
                    send({'op':0,'s':1,'t':'READY','d':{'session_id':'fixture-'+mode}});send(msg(2,'18446744073709551615'))
                    if mode=='invalid':continue
                    send(msg(3,'fixture-text',attachments=[{'url':'https://multimedia.nt.qq.com.cn/fixture-text','filename':'合成QQ.txt','content_type':'text/plain','size':len(TEXT)}]))
                    send(msg(4,'fixture-image',attachments=[{'url':'https://gchat.qpic.cn/fixture-image','filename':'合成QQ.png','content_type':'image/png','size':len(IMAGE)}]))
                    send(msg(5,'stranger','other-owner'));send(msg(6,'group',event='GROUP_AT_MESSAGE_CREATE'))
        except (OSError,ValueError,json.JSONDecodeError):pass
        finally:self.close_connection=True

if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',8094),Handler)
    print('Synthetic QQ fixture listening on loopback 8094.',flush=True)
    server.serve_forever()
