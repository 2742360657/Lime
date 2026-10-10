const {createHash}=require('node:crypto');
const {sqliteHarness}=require('./sqliteHarness.cjs');
const {qqTables}=require('../../src/channels/qq/schema');
const {frame,incoming,mediaUrl,gatewayUrl,MAX_PACKET}=require('../../src/channels/qq/protocol');
const {createQqClient}=require('../../src/channels/qq/client');
const {createQqVault}=require('../../src/channels/qq/vault');
const {createQqInbox}=require('../../src/channels/qq/inbox');
const {createQqReceiver}=require('../../src/channels/qq/receiver');
const binding={appId:'123456',appSecret:'SYNTHETIC_QQ_SECRET',userOpenid:'synthetic-owner'};
const digest=async v=>createHash('sha256').update(v).digest('hex');
const message=(s=2,overrides={})=>({op:0,s,t:'C2C_MESSAGE_CREATE',d:{id:'18446744073709551615',content:'合成QQ通知',timestamp:'2026-10-10T08:00:00Z',author:{user_openid:binding.userOpenid},...overrides}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let db,inbox,stage;
beforeEach(()=>{db=sqliteHarness();for(const[name,cols]of Object.entries(qqTables))db.sql.exec(`CREATE TABLE ${name}(id TEXT PRIMARY KEY,${Object.entries(cols).map(([n,c])=>n+' '+c.type).join(',')})`);stage=jest.fn(async()=>{});inbox=createQqInbox(db,{digest,stage});});
afterEach(()=>db.close());
async function commit(f){const session=await inbox.session(binding);return inbox.commit(binding,session,f);}

test('message identifiers stay strings and oversized/unsafe numeric sequences are rejected',()=>{
 expect(incoming(message(),binding).key).toBe('18446744073709551615');
 expect(()=>incoming(message(2,{id:18446744073709551615}),binding)).toThrow();
 expect(()=>frame('{"op":0,"s":9007199254740993}')).toThrow();
 expect(()=>frame('中'.repeat(MAX_PACKET/2))).toThrow();
});
test.each(['ws://api.sgroup.qq.com/websocket/','wss://api.sgroup.qq.com.evil.test/websocket/','wss://u@api.sgroup.qq.com/websocket/','wss://api.sgroup.qq.com:8443/websocket/','wss://api.sgroup.qq.com/elsewhere'])('gateway rejects %s',u=>expect(()=>gatewayUrl(u)).toThrow());
test.each(['http://gchat.qpic.cn/a','https://gchat.qpic.cn.evil.test/a','https://127.0.0.1/a','https://u@gchat.qpic.cn/a','https://gchat.qpic.cn/a#x'])('media boundary rejects %s',u=>expect(()=>mediaUrl(u)).toThrow());
test('only bound C2C content is persisted; stranger/group/other dispatch only advances processed seq',async()=>{
 await inbox.ready(binding,'synthetic-session',1);
 await commit(message());await commit(message(3,{id:'other',author:{user_openid:'stranger'}}));await commit({...message(4),t:'GROUP_AT_MESSAGE_CREATE'});
 expect(await inbox.list(binding)).toHaveLength(1);expect((await inbox.session(binding)).seq).toBe(4);
});
test('message and sequence roll back together; retry and replay are idempotent',async()=>{
 await inbox.ready(binding,'synthetic-session',1);db.failOn('UPDATE qq_sessions');
 await expect(commit(message())).rejects.toThrow('Synthetic');expect(await inbox.list(binding)).toHaveLength(0);expect((await inbox.session(binding)).seq).toBe(1);
 db.failOn(null);await commit(message());expect(await commit(message(3))).toMatchObject({saved:0,duplicates:1});expect(await inbox.list(binding)).toHaveLength(1);
});
test('media staging failure cannot advance seq; URL/secret are absent from durable SQL messages',async()=>{
 await inbox.ready(binding,'synthetic-session',1);const f=message(2,{attachments:[{url:'https://gchat.qpic.cn/a?private=capability',filename:'../测试.png',content_type:'image/png',size:12}]});
 stage.mockRejectedValueOnce(new Error('Synthetic SecureStore failure'));await expect(commit(f)).rejects.toThrow();expect((await inbox.session(binding)).seq).toBe(1);
 await commit(f);const text=JSON.stringify(await inbox.list(binding));expect(text).not.toContain('private=');expect(text).not.toContain(binding.appSecret);expect(stage.mock.calls[1][1].name).toBe('.._测试.png');
 await commit({...f,s:3});expect(stage).toHaveBeenCalledTimes(2);
});
test('stale session and already aborted delivery cannot insert a late message',async()=>{
 await inbox.ready(binding,'s1',1);await expect(inbox.commit(binding,{session_id:'old',seq:1},message())).rejects.toMatchObject({code:'BUSY'});
 const controller=new AbortController();controller.abort();await expect(inbox.commit(binding,await inbox.session(binding),message(),controller.signal)).rejects.toMatchObject({code:'CANCELLED'});expect(await inbox.list(binding)).toHaveLength(0);
});
test('QR result requires owner identity; HTTP failures and cancellation disclose no raw credential',async()=>{
 const key=Buffer.alloc(32,48).toString('base64');const fetch=jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({retcode:0,data:{task_id:'fixture-task'}}))).mockResolvedValueOnce(new Response(JSON.stringify({retcode:0,data:{status:2,bot_appid:'123456',bot_encrypt_secret:'fixture-cipher'}}))).mockRejectedValueOnce(new Error(binding.appSecret));
 const client=createQqClient(fetch,{randomKey:async()=>key,decrypt:async()=>binding.appSecret});expect((await client.qr()).display).toContain('task_id=fixture-task');await expect(client.status('fixture-task',key)).rejects.toMatchObject({code:'SESSION'});
 await expect(client.access(binding)).rejects.toMatchObject({code:'NETWORK'});const abort=new AbortController();abort.abort();await expect(client.access(binding,abort.signal)).rejects.toMatchObject({code:'CANCELLED'});expect(fetch).toHaveBeenCalledTimes(3);
});
test('HTTP bound/stream/redirect limits and official auth headers are enforced',async()=>{
 const fetch=jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:'synthetic-token',expires_in:'7200'}))).mockResolvedValueOnce(new Response(JSON.stringify({url:'wss://api.sgroup.qq.com/websocket/'}))).mockResolvedValueOnce({...new Response('{}'),ok:true,redirected:true}).mockResolvedValueOnce(new Response('x'.repeat(MAX_PACKET+1)));
 const client=createQqClient(fetch,{randomKey:async()=>'',decrypt:async()=>''});await client.access(binding);await client.gateway('synthetic-token');expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({appId:binding.appId,clientSecret:binding.appSecret});expect(fetch.mock.calls[1][1].headers.Authorization).toBe('QQBot synthetic-token');await expect(client.gateway('synthetic-token')).rejects.toMatchObject({code:'HOST'});await expect(client.gateway('synthetic-token')).rejects.toMatchObject({code:'TOO_LARGE'});
});
test('binding and media are scoped in SecureStore and explicit removal leaves no credentials',async()=>{
 const map=new Map(),vault=createQqVault({getItemAsync:async k=>map.get(k)??null,setItemAsync:async(k,v)=>map.set(k,v),deleteItemAsync:async k=>map.delete(k)},'synthetic-qq');await vault.save(binding);expect(await vault.load()).toEqual(binding);await vault.stage('a'.repeat(64),{url:'https://gchat.qpic.cn/a',name:'a.png',mime:'image/png',size:2});expect((await vault.media('a'.repeat(64))).size).toBe(2);await vault.remove();expect(map.size).toBe(0);
});
function transport(duration=80){let ws;const sent=[];const receiver=createQqReceiver({access:async()=> 'synthetic-token',gateway:async()=> 'wss://api.sgroup.qq.com/websocket/'},inbox,()=>{ws={onopen:null,onmessage:null,onerror:null,onclose:null,send:v=>sent.push(JSON.parse(v)),close:jest.fn()};return ws;},duration);return {receiver,sent,ws:()=>ws,emit:f=>ws.onmessage?.({data:JSON.stringify(f)})};}
const hello={op:10,d:{heartbeat_interval:1000}};
test('new session identifies, saves then acknowledges only committed seq, and shuts down at bound',async()=>{
 const t=transport();const p=t.receiver.read(binding);await tick();t.emit(hello);t.emit({op:11});t.emit({op:0,s:1,t:'READY',d:{session_id:'fixture-s'}});t.emit(message());
 expect(await p).toMatchObject({mode:'new',saved:1,invalidSession:false});expect(t.sent.find(f=>f.op===2).d.intents).toBe(1<<25);expect((await inbox.session(binding)).seq).toBe(2);expect(t.ws().close).toHaveBeenCalled();
});
test('persisted session uses Resume and repeated message does not insert another record',async()=>{
 await inbox.ready(binding,'old-session',1);await commit(message());const t=transport();const p=t.receiver.read(binding);await tick();t.emit(hello);t.emit({op:11});t.emit({...message(),s:3});t.emit({op:0,s:4,t:'RESUMED',d:null});
 expect(await p).toMatchObject({mode:'resumed',duplicates:1,saved:0});expect(t.sent.find(f=>f.op===6).d).toMatchObject({session_id:'old-session',seq:2});expect(await inbox.list(binding)).toHaveLength(1);
});
test('Invalid Session discards stale cursor then identifies once; new READY is not reported as resumed',async()=>{
 await inbox.ready(binding,'stale',100);const t=transport();const p=t.receiver.read(binding);await tick();t.emit(hello);t.emit({op:11});t.emit({op:9,d:false});t.emit({op:0,s:1,t:'READY',d:{session_id:'fresh'}});t.emit(message());expect(await p).toMatchObject({mode:'new',invalidSession:true,saved:1});expect(t.sent.filter(f=>f.op===2)).toHaveLength(1);
});
test('cancel closes socket, prevents queued late data, and releases operation mutex',async()=>{
 const t=transport(),abort=new AbortController();const p=t.receiver.read(binding,abort.signal);await tick();await expect(t.receiver.read(binding)).rejects.toMatchObject({code:'BUSY'});abort.abort();t.emit(hello);await expect(p).rejects.toMatchObject({code:'CANCELLED'});expect(await inbox.list(binding)).toHaveLength(0);expect(t.ws().close).toHaveBeenCalled();
});
test('DB failure blocks subsequent queued frames from advancing past the failed seq',async()=>{
 const t=transport();const p=t.receiver.read(binding);await tick();t.emit(hello);t.emit({op:11});t.emit({op:0,s:1,t:'READY',d:{session_id:'s'}});db.failOn('UPDATE qq_sessions');t.emit(message());t.emit(message(3,{id:'must-not-skip-failed-frame'}));await expect(p).rejects.toMatchObject({code:'PROTOCOL'});expect((await inbox.session(binding)).seq).toBe(1);expect(await inbox.list(binding)).toHaveLength(0);
});
test('missing heartbeat ACK ends a live connection; handshake silence expires',async()=>{
 const t=transport(1200),p=t.receiver.read(binding);await tick();t.emit(hello);t.emit({op:0,s:1,t:'READY',d:{session_id:'s'}});await expect(p).rejects.toMatchObject({code:'NETWORK'});
 const silent=transport(20);await expect(silent.receiver.read(binding)).rejects.toMatchObject({code:'TIMEOUT'});
});
