import { frame, gatewayUrl, QqError, type QqBinding } from './protocol';
import type { createQqClient } from './client';
import type { createQqInbox } from './inbox';
export type QqSocket = { send(data: string): void; close(): void; onopen: (() => void) | null; onmessage: ((event: { data: unknown }) => void) | null; onerror: (() => void) | null; onclose: ((event: { code: number }) => void) | null };
export function createQqReceiver(client: Pick<ReturnType<typeof createQqClient>, 'access' | 'gateway'>, inbox: ReturnType<typeof createQqInbox>, socket: (url: string) => QqSocket, duration = 60000) {
  let busy=false;
  return { async read(binding: QqBinding, external?: AbortSignal) {
    if (busy) throw new QqError('BUSY'); if (duration < 1 || duration > 60000) throw new QqError('PROTOCOL'); busy=true;
    const controller=new AbortController(), abort=()=>controller.abort(); external?.addEventListener('abort',abort,{once:true});
    try {
      if (external?.aborted) throw new QqError('CANCELLED');
      const token=await client.access(binding,controller.signal), url=await client.gateway(token,controller.signal);
      let session=await inbox.session(binding); if (controller.signal.aborted) throw new QqError('CANCELLED');
      return await new Promise<{ saved:number; duplicates:number; ignored:number; mode:'new'|'resumed'; invalidSession:boolean }>((resolve,reject)=>{
        let ws:QqSocket; try { ws=socket(gatewayUrl(url)); } catch { reject(new QqError('NETWORK')); return; }
        let mode:'new'|'resumed'|undefined, hello=false, fallback=false, awaitingAck=false, ending=false, pending=0, total=0, failure:QqError|undefined;
        let heartbeat:ReturnType<typeof setInterval>|undefined, queue=Promise.resolve(); const counts={saved:0,duplicates:0,ignored:0};
        const clean=()=>{ clearTimeout(timer); if (heartbeat) clearInterval(heartbeat); controller.signal.removeEventListener('abort',cancel); ws.onopen=null; ws.onmessage=null; ws.onerror=null; ws.onclose=null; ws.close(); };
        const finish=(error?:QqError)=>{ failure??=error; if (ending) {if(error)controller.abort();return;} ending=true;if(error)controller.abort();void queue.then(()=>{ clean(); if (failure) reject(failure); else if (!mode) reject(new QqError('TIMEOUT')); else resolve({...counts,mode,invalidSession:fallback}); },()=>{clean();reject(failure??new QqError('PROTOCOL'));}); };
        const cancel=()=>finish(new QqError('CANCELLED'));
        const timer=setTimeout(()=>finish(),duration); controller.signal.addEventListener('abort',cancel,{once:true});
        const send=(data:unknown)=>{ if (!controller.signal.aborted) ws.send(JSON.stringify(data)); else throw new QqError('CANCELLED'); };
        const identify=()=>send({op:2,d:{token:'QQBot '+token,intents:1<<25,shard:[0,1],properties:{$os:'android',$browser:'Lime',$device:'Lime'}}});
        const beat=()=>{ if (awaitingAck) { finish(new QqError('NETWORK')); return; } awaitingAck=true; send({op:1,d:session?.seq??null}); };
        ws.onopen=()=>{}; ws.onerror=()=>finish(new QqError('NETWORK')); ws.onclose=event=>finish(event.code===1000?undefined:new QqError('NETWORK'));
        ws.onmessage=event=>{
          if (ending || controller.signal.aborted) return;
          if (++pending>128 || ++total>256) { finish(new QqError('TOO_LARGE')); return; }
          const next=queue.then(async()=>{
            if (controller.signal.aborted) throw new QqError('CANCELLED');
            if (typeof event.data!=='string') throw new QqError('PROTOCOL'); const f=frame(event.data);
            if (f.op===10) {
              const interval=(f.d as {heartbeat_interval?:unknown}|null)?.heartbeat_interval;
              if (hello || typeof interval!=='number' || !Number.isInteger(interval) || interval<1000 || interval>120000) throw new QqError('PROTOCOL'); hello=true;
              if (session) send({op:6,d:{token:'QQBot '+token,session_id:session.session_id,seq:session.seq}}); else identify(); beat();
              heartbeat=setInterval(()=>{try{beat();}catch{finish(new QqError('NETWORK'));}},interval);
            } else if (!hello) throw new QqError('PROTOCOL');
            else if (f.op===11) awaitingAck=false;
            else if (f.op===1) { awaitingAck=true; send({op:1,d:session?.seq??null}); }
            else if (f.op===9) { if (!session || fallback) throw new QqError('SESSION'); await inbox.reset(binding); session=null; mode=undefined; fallback=true; identify(); }
            else if (f.op===7) throw new QqError('NETWORK');
            else if (f.op===0) {
              if (f.t==='READY') {
                const sessionId=(f.d as {session_id?:unknown}|null)?.session_id; if (typeof sessionId!=='string' || f.s===undefined) throw new QqError('PROTOCOL');
                await inbox.ready(binding,sessionId,f.s,controller.signal); session={session_id:sessionId,seq:f.s}; mode='new';
              } else { if (!session) throw new QqError('SESSION'); if (f.t==='RESUMED') mode='resumed'; const result=await inbox.commit(binding,session,f,controller.signal); session={...session,seq:result.seq}; counts.saved+=result.saved;counts.duplicates+=result.duplicates;counts.ignored+=result.ignored; }
            }
          });
          queue=next.then(()=>{pending--;},error=>{pending--;finish(error instanceof QqError?error:new QqError('PROTOCOL'));});
        };
        if (controller.signal.aborted) cancel();
      });
    } finally { controller.abort(); external?.removeEventListener('abort',abort); busy=false; }
  } };
}
