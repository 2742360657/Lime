const {createHash}=require('node:crypto');
const {sqliteHarness}=require('./sqliteHarness.cjs');
const {qqProductTables}=require('../../src/channels/qq/productSchema');
const {createQqProductInbox}=require('../../src/channels/qq/productInbox');
const {createQqIntake}=require('../../src/channels/qq/intake');
const {createQqVault}=require('../../src/channels/qq/vault');
const {createQqForegroundOperation}=require('../../src/channels/qq/foreground');
const {createMaterialStore}=require('../../src/materials/store');
const {QqError}=require('../../src/channels/qq/protocol');
const {AbortController:PonyfillController,AbortSignal:PonyfillSignal}=require('abortcontroller-polyfill/dist/cjs-ponyfill');
const binding={appId:'123456',appSecret:'SYNTHETIC_QQ_SECRET',userOpenid:'synthetic-owner'};
const digest=async value=>createHash('sha256').update(value).digest('hex');
const media={url:'https://grouptalk.c2c.qq.com/file?synthetic=capability',filename:'合成.txt',content_type:'text/plain',size:7};
const message=(seq=2,overrides={})=>({op:0,s:seq,t:'C2C_MESSAGE_CREATE',d:{id:'18446744073709551615',content:'合成QQ文字',timestamp:'2026-10-11T08:00:00Z',author:{user_openid:binding.userOpenid},attachments:[],...overrides}});
let db,vault,inbox,storage,stage,materials,next;
beforeEach(()=>{
 db=sqliteHarness();
 for(const [table,fields]of Object.entries(qqProductTables))db.sql.exec(`CREATE TABLE IF NOT EXISTS ${table}(id TEXT PRIMARY KEY,${Object.entries(fields).map(([name,col])=>name+' '+col.type).join(',')})`);
 storage=new Map();vault=createQqVault({getItemAsync:async key=>storage.get(key)??null,setItemAsync:async(key,value)=>storage.set(key,value),deleteItemAsync:async key=>storage.delete(key)},'synthetic-product-qq');
 stage=jest.fn(vault.stage);inbox=createQqProductInbox(db,{digest,now:()=>1000,stage,release:vault.release});next=0;materials=createMaterialStore(db,{id:()=> 'material-'+ ++next,now:()=>1000});
});
afterEach(()=>db.close());
const commit=async f=>inbox.commit(binding,await inbox.session(binding),f);
const items=()=>db.getAll('SELECT * FROM local_qq_items ORDER BY position');
const signal=()=>new AbortController().signal;
const copy=(hash='1'.repeat(64))=>({name:'合成.txt',uri:'file:///synthetic/'+hash+'.txt',hash,size:7,mime:'text/plain'});
const analysis={kind:'text',body:'合成材料',images:[],pages:0,status:'ready',note:''};
const intake=(saveMedia=async()=>materials.save(copy(),analysis))=>createQqIntake(db,materials,{media:vault.media,releaseMedia:vault.release,saveText:async()=>materials.save(copy('2'.repeat(64)),analysis),saveMedia});
const abortAfterSql=(fragment,controller)=>({...db,writeTransaction:fn=>db.writeTransaction(tx=>fn({...tx,execute:async(sql,args)=>{const result=await tx.execute(sql,args);if(sql.includes(fragment))controller.abort();return result;}}))});

test('bound message registers readable parts and a visible rejected attachment before committing seq',async()=>{
 await inbox.ready(binding,'new',1);
 expect(await commit(message(2,{attachments:[{...media,url:'https://unknown.invalid/private?secret=synthetic'},media]}))).toMatchObject({saved:1,seq:2});
 const rows=await items();expect(rows.map(row=>row.kind)).toEqual(['text','unsupported','media']);expect(rows[1]).toMatchObject({status:'error',state:'unsupported',capability_id:null});expect(rows[1].note).toContain('重新转发');
 expect(rows[2].capability_id).toMatch(/^[a-f0-9]{64}$/);expect((await inbox.session(binding)).seq).toBe(2);
 const durable=JSON.stringify({messages:await db.getAll('SELECT * FROM qq_product_messages'),items:rows});expect(durable).not.toContain('https://');expect(durable).not.toContain('private?');expect(durable).not.toContain(binding.appSecret);
});
test('SecureStore failure leaves a visible per-file failure and permits the next dispatch',async()=>{
 await inbox.ready(binding,'s',1);stage.mockRejectedValueOnce(new Error('Private synthetic error'));
 await commit(message(2,{attachments:[media]}));
 expect((await items()).find(row=>row.kind==='media')).toMatchObject({status:'error',capability_id:null});expect((await inbox.session(binding)).seq).toBe(2);
 await commit(message(3,{id:'following',content:'后续合成文字'}));expect((await inbox.session(binding)).seq).toBe(3);expect(await db.getAll('SELECT * FROM qq_product_messages')).toHaveLength(2);
 expect(JSON.stringify(await items())).not.toContain('Private synthetic error');
});
test('message, visible failure and seq roll back together; new staged capability is released on SQL failure',async()=>{
 await inbox.ready(binding,'s',1);db.failOn('UPDATE qq_product_sessions');
 await expect(commit(message(2,{attachments:[media,{...media,url:'https://unknown.invalid/file'}]}))).rejects.toThrow('Synthetic');
 expect(await items()).toHaveLength(0);expect(await db.getAll('SELECT * FROM qq_product_messages')).toHaveLength(0);expect((await inbox.session(binding)).seq).toBe(1);expect(JSON.parse(storage.get('synthetic-product-qq-media-index'))).toEqual([]);
 db.failOn(null);await commit(message(2,{attachments:[media]}));expect(await items()).toHaveLength(2);expect((await inbox.session(binding)).seq).toBe(2);
});
test('cancellation while session or final seq SQL resolves rolls back the whole transaction',async()=>{
 const readyAbort=new AbortController(),readyInbox=createQqProductInbox(abortAfterSql('INSERT OR REPLACE INTO qq_product_sessions',readyAbort),{digest,now:()=>1000,stage,release:vault.release});
 await expect(readyInbox.ready(binding,'cancelled',1,readyAbort.signal)).rejects.toMatchObject({code:'CANCELLED'});expect(await inbox.session(binding)).toBeNull();
 await inbox.ready(binding,'s',1);
 const commitAbort=new AbortController(),commitInbox=createQqProductInbox(abortAfterSql('UPDATE qq_product_sessions',commitAbort),{digest,now:()=>1000,stage,release:vault.release});
 await expect(commitInbox.commit(binding,await inbox.session(binding),message(2,{attachments:[media]}),commitAbort.signal)).rejects.toMatchObject({code:'CANCELLED'});
 expect((await inbox.session(binding)).seq).toBe(1);expect(await items()).toHaveLength(0);expect(JSON.parse(storage.get('synthetic-product-qq-media-index'))).toEqual([]);
});
test('malformed own content gets an actionable receipt; unsafe seq and foreign content cannot enter storage',async()=>{
 await inbox.ready(binding,'s',1);
 await commit(message(2,{id:123,content:42,attachments:{url:'malformed'}}));
 const rows=await items();expect(rows.length).toBeGreaterThan(0);expect(rows.every(row=>row.kind==='unsupported' && row.status==='error')).toBe(true);
 await commit(message(3,{author:{user_openid:'stranger'},content:'must-not-persist'}));await commit({...message(4),t:'GROUP_AT_MESSAGE_CREATE'});
 expect(await db.getAll('SELECT * FROM qq_product_messages')).toHaveLength(1);expect(JSON.stringify(await items())).not.toContain('must-not-persist');expect((await inbox.session(binding)).seq).toBe(4);
 await expect(commit(message(Number.MAX_SAFE_INTEGER+1))).rejects.toMatchObject({code:'PROTOCOL'});expect((await inbox.session(binding)).seq).toBe(4);
});
test('overlong text and extra attachment count produce visible scope notes without dropping the event',async()=>{
 await inbox.ready(binding,'s',1);await commit(message(2,{content:'中'.repeat(32001),attachments:Array.from({length:9},()=>media)}));
 const rows=await items();expect(rows[0].body).toHaveLength(32000);expect(rows[0].note).toContain('32000');expect(rows.filter(row=>row.kind==='media')).toHaveLength(8);expect(rows.at(-1).note).toContain('分批');expect((await inbox.session(binding)).seq).toBe(2);
});
test('save releases capability and manifest slot; replay does not re-stage or recreate materials',async()=>{
 await inbox.ready(binding,'s',1);await commit(message(2,{attachments:[media]}));const row=(await items()).find(row=>row.kind==='media'),store=intake();
 const material=await store.save(row.id,signal());expect(await vault.media(row.capability_id)).toBeNull();expect(JSON.parse(storage.get('synthetic-product-qq-media-index'))).toEqual([]);expect(await store.get(row.id)).toMatchObject({status:'saved',material_id:material.id,capability_id:null});
 expect(await commit(message(3,{attachments:[media]}))).toMatchObject({saved:0,duplicates:1});expect(stage).toHaveBeenCalledTimes(1);expect(await store.save(row.id,signal())).toMatchObject({id:material.id});expect(await materials.list()).toHaveLength(1);
});
test('receipt SQL failure is independently retryable through P3 hash deduplication',async()=>{
 await inbox.ready(binding,'s',1);await commit(message(2,{attachments:[media]}));const row=(await items()).find(row=>row.kind==='media'),store=intake();
 db.failOn('UPDATE local_qq_items SET material_id');await expect(store.save(row.id,signal())).rejects.toThrow('Synthetic');
 expect(await materials.list()).toHaveLength(1);expect((await store.get(row.id)).material_id).toBeNull();expect(await vault.media(row.capability_id)).not.toBeNull();
 db.failOn(null);await store.save(row.id,signal());expect(await materials.list()).toHaveLength(1);expect(await vault.media(row.capability_id)).toBeNull();
});
test('single-file network failure does not block saving another part',async()=>{
 await inbox.ready(binding,'s',1);await commit(message(2,{attachments:[media,media]}));const rows=(await items()).filter(row=>row.kind==='media');
 const saveMedia=jest.fn().mockRejectedValueOnce(new QqError('NETWORK')).mockImplementation(async()=>materials.save(copy(),analysis));const store=intake(saveMedia);
 await expect(store.save(rows[0].id,signal())).rejects.toMatchObject({code:'NETWORK'});expect(await store.get(rows[0].id)).toMatchObject({status:'error',material_id:null});
 await store.save(rows[1].id,signal());expect(await store.get(rows[1].id)).toMatchObject({status:'saved'});expect(await vault.media(rows[0].capability_id)).not.toBeNull();expect(await vault.media(rows[1].capability_id)).toBeNull();
});
test('cancellation after material copy and a superseded item cannot commit a late receipt',async()=>{
 await inbox.ready(binding,'s',1);await commit(message(2,{attachments:[media]}));const row=(await items()).find(row=>row.kind==='media'),abort=new AbortController();
 const cancelledStore=intake(async()=>{const material=await materials.save(copy(),analysis);abort.abort();return material;});
 await expect(cancelledStore.save(row.id,abort.signal)).rejects.toMatchObject({code:'CANCELLED'});expect((await cancelledStore.get(row.id)).material_id).toBeNull();
 const staleStore=intake(async()=>{const material=await materials.save(copy(),analysis);await db.execute('UPDATE local_qq_items SET state=?,revision=revision+1 WHERE id=?',['superseded',row.id]);return material;});
 await expect(staleStore.save(row.id,signal())).rejects.toMatchObject({code:'BUSY'});expect((await staleStore.get(row.id)).material_id).toBeNull();expect(await vault.media(row.capability_id)).not.toBeNull();
});
test('cancellation during receipt SQL preserves the original and pending capability without a false saved receipt',async()=>{
 await inbox.ready(binding,'s',1);await commit(message(2,{attachments:[media]}));const row=(await items()).find(row=>row.kind==='media'),abort=new AbortController();
 const store=createQqIntake(abortAfterSql('UPDATE local_qq_items SET material_id',abort),materials,{media:vault.media,releaseMedia:vault.release,saveText:async()=>materials.save(copy('2'.repeat(64)),analysis),saveMedia:async()=>materials.save(copy(),analysis)});
 await expect(store.save(row.id,abort.signal)).rejects.toMatchObject({code:'CANCELLED'});
 expect((await store.get(row.id)).material_id).toBeNull();expect(await vault.media(row.capability_id)).not.toBeNull();expect(await materials.list()).toHaveLength(1);
 await intake().save(row.id,signal());expect(await materials.list()).toHaveLength(1);expect((await store.get(row.id)).status).toBe('saved');
});
test('new message version retires old capabilities and preserves an earlier saved original',async()=>{
 await inbox.ready(binding,'s',1);await commit(message(2,{attachments:[media,media]}));const oldRows=(await items()).filter(row=>row.kind==='media');await intake().save(oldRows[0].id,signal());
 await commit(message(3,{content:'合成新版',attachments:[{...media,url:'https://grouptalk.c2c.qq.com/new'}]}));
 expect((await items()).filter(row=>row.fingerprint===oldRows[0].fingerprint).every(row=>row.state==='superseded' && row.capability_id===null)).toBe(true);expect(await vault.media(oldRows[1].capability_id)).toBeNull();expect(await materials.list()).toHaveLength(1);
});
test('restored history is inert until a new authenticated delivery supplies fresh capabilities',async()=>{
 await inbox.ready(binding,'s',1);await commit(message(2,{attachments:[media]}));const row=(await items()).find(row=>row.kind==='media');
 await db.execute('DELETE FROM qq_product_messages');await db.execute('UPDATE local_qq_items SET capability_id=NULL,status=?,kind=?,body=?,filename=?',['restored','text','合成导入字段不能冒充新鉴权内容','导入历史.txt']);await vault.prune([]);
 await expect(intake().save(row.id,signal())).rejects.toMatchObject({code:'PROTOCOL'});
 await inbox.ready(binding,'fresh',1);await commit(message(2,{attachments:[media]}));expect(await intake().get(row.id)).toMatchObject({status:'pending',state:'complete',capability_id:row.capability_id,kind:'media',body:'',filename:media.filename});
});
test('media capacity is reusable after release, and prune drops only unreferenced indexed capabilities',async()=>{
 const ids=Array.from({length:512},(_,n)=>n.toString(16).padStart(64,'0'));storage.set('synthetic-product-qq-media-index',JSON.stringify(ids));for(const id of ids)storage.set('synthetic-product-qq-media-'+id,'{}');
 const nextId='f'.repeat(64),descriptor={url:media.url,name:media.filename,mime:media.content_type,size:7};await expect(vault.stage(nextId,descriptor)).rejects.toMatchObject({code:'TOO_LARGE'});
 await vault.release(ids[0]);await vault.stage(nextId,descriptor);expect(await vault.media(nextId)).toMatchObject(descriptor);
 await vault.prune([nextId]);expect(JSON.parse(storage.get('synthetic-product-qq-media-index'))).toEqual([nextId]);expect(await vault.media(ids[1])).toBeNull();expect(await vault.media(nextId)).not.toBeNull();
});
test('foreground operation guards repeated ponyfill cancellation and releases its mutex',async()=>{
 const originalController=global.AbortController,originalSignal=global.AbortSignal;global.AbortController=PonyfillController;global.AbortSignal=PonyfillSignal;
 try{
  let active=true,changed,complete,seen;const dispose=jest.fn(),foreground=createQqForegroundOperation({active:()=>active,subscribe:fn=>{changed=fn;return dispose;}}),wait=new Promise(resolve=>{complete=resolve;});
  const result=foreground.run(async sig=>{seen=sig;await wait;if(sig.aborted)throw new QqError('CANCELLED');}).catch(error=>error);
  await expect(foreground.run(async()=>{})).rejects.toMatchObject({code:'BUSY'});foreground.cancel();active=false;expect(()=>changed()).not.toThrow();complete();expect(await result).toMatchObject({code:'CANCELLED'});expect(seen.aborted).toBe(true);expect(dispose).toHaveBeenCalledTimes(1);
  active=true;expect(await foreground.run(async()=> 'next')).toBe('next');
 }finally{global.AbortController=originalController;global.AbortSignal=originalSignal;}
});
