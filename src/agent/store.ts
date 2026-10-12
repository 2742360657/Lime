import { recordSource, type RecordRow } from '../records/model';
import { documentRefsSchema } from '../domain/commands';
import { DomainError, type DomainTransaction, type DomainDatabase, type DocumentRef, type Receipt } from '../domain/types';
import type { Command } from '../domain/commands';

export const DEFAULT_MODEL = 'deepseek-flash';
export type Persona = { filename: string; body: string; enabled: number; revision: number };
export type AgentRequest = { id: string; session_id: string; text: string; source_refs: string; status: string; error: string | null; created_at: number };
export type AgentMessage = { id: string; session_id: string; request_id: string; role: 'user' | 'assistant'; body: string; created_at: number };
export type AgentSession = { id: string; title: string };
export type ActionResult = { command: Command; status: 'saved' | 'proposal' | 'error'; receipt?: Receipt; proposalId?: string; message?: string };
export type Grant = { id: string; commandType: string; targetId: string | null };
type Deps = { id: () => string; now: () => number };

export function validatePersona(filename: string, body: string) {
  if (!/\.(md|txt|markdown)$/i.test(filename) || filename.length > 200 || !body.trim() || body.length > 32000 || body.includes('\u0000') || body.includes('\ufffd'))
    throw new Error('请选择 UTF-8 的 .md 或 .txt 人格文件，正文不超过 32000 字符。');
  return { filename, body };
}
export function validateModel(model: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(model)) throw new Error('模型名称格式不正确。');
  return model;
}

async function sourceFor(tx: DomainTransaction, ref: DocumentRef) {
  const generic = ref.kind === 'record' ? await tx.getOptional<RecordRow>('SELECT * FROM local_records WHERE id=? AND revision=? AND deleted=0',[ref.id,ref.revision]) : null;
  const source = ref.kind === 'record' ? generic ? recordSource(generic) : null : ref.kind === 'attachment'
            ? await tx.getOptional<{ id: string; revision: number; title: string; body: string; kind: string; date: string }>("SELECT id,revision,filename AS title,body,'attachment' AS kind,'' AS date FROM local_materials WHERE id=? AND revision=? AND deleted=0 AND status='ready'", [ref.id, ref.revision])
            : await tx.getOptional<{ id: string; revision: number; title: string; body: string; kind: string; date: string }>("SELECT id,revision,title,body,kind,date FROM documents WHERE kind='memo' AND id=? AND revision=? AND deleted=0", [ref.id, ref.revision]);
  return source;
}

export function createAgentStore(db: DomainDatabase, deps: Deps) {
  return {
    db,
    async settings() {
      return db.readTransaction(async tx => ({
        persona: await tx.getOptional<Persona>("SELECT * FROM local_personas WHERE id='current'"),
        model: (await tx.getOptional<{ value: string }>("SELECT value FROM local_meta WHERE id='agent-model'"))?.value ?? DEFAULT_MODEL,
      }));
    },
    async saveSettings(model: string, persona: Pick<Persona, 'filename' | 'body' | 'enabled'> | null) {
      validateModel(model);
      if (persona) validatePersona(persona.filename, persona.body);
      await db.writeTransaction(async tx => {
        await tx.execute("INSERT OR REPLACE INTO local_meta(id,value) VALUES('agent-model',?)", [model]);
        if (persona) {
          const old = await tx.getOptional<{ revision: number }>("SELECT revision FROM local_personas WHERE id='current'");
          await tx.execute("INSERT OR REPLACE INTO local_personas(id,filename,body,enabled,revision,updated_at) VALUES('current',?,?,?,?,?)", [persona.filename, persona.body, persona.enabled ? 1 : 0, (old?.revision ?? 0) + 1, deps.now()]);
        } else await tx.execute("DELETE FROM local_personas WHERE id='current'");
      });
    },
    async recover() {
      await db.writeTransaction(tx => tx.execute("UPDATE local_agent_requests SET status='interrupted',error='上次生成被中断。已提交操作仍保留，可重试。',updated_at=? WHERE status='running'", [deps.now()]));
    },
    async sessions(): Promise<AgentSession[]> {
      return db.readTransaction(tx => tx.getAll('SELECT id,title FROM local_agent_sessions ORDER BY updated_at DESC,id'));
    },
    async newSession(): Promise<string> {
      const id = deps.id(), now = deps.now();
      await db.writeTransaction(tx => tx.execute("INSERT INTO local_agent_sessions(id,title,created_at,updated_at) VALUES(?,'新对话',?,?)", [id, now, now]));
      return id;
    },
    async messages(sessionId: string): Promise<AgentMessage[]> {
      return db.readTransaction(tx => tx.getAll('SELECT * FROM local_agent_messages WHERE session_id=? ORDER BY created_at,id', [sessionId]));
    },
    async contextMessages(sessionId: string): Promise<AgentMessage[]> {
      return db.readTransaction(tx => tx.getAll("SELECT m.* FROM local_agent_messages m JOIN local_agent_requests r ON r.id=m.request_id WHERE m.session_id=? AND r.source_refs='[]' AND r.status<>'running' ORDER BY m.created_at DESC,m.id DESC LIMIT 40", [sessionId])).then(rows => (rows as AgentMessage[]).reverse());
    },
    async requests(sessionId: string): Promise<AgentRequest[]> {
      return db.readTransaction(tx => tx.getAll('SELECT * FROM local_agent_requests WHERE session_id=? ORDER BY created_at,id', [sessionId]));
    },
    async begin(sessionId: string, text: string, refs: DocumentRef[]): Promise<AgentRequest> {
      if (!text.trim() || text.length > 12000 || refs.length > 4 || !documentRefsSchema.safeParse(refs).success)
        throw new Error('请输入消息，最多 12000 字符，引用不超过四篇。');
      const id = deps.id(), now = deps.now();
      return db.writeTransaction(async tx => {
        if (!await tx.getOptional('SELECT id FROM local_agent_sessions WHERE id=?', [sessionId])) throw new Error('对话不存在，请新建对话。');
        let sourceLength = 0;
        const selected = new Set<string>();
        for (const ref of refs) {
          const identity = `${ref.kind ?? 'document'}:${ref.id}`;
          if (selected.has(identity)) throw new Error('同一资料只能选择一次。');
          selected.add(identity);
          const source = await sourceFor(tx, ref);
          if (!source) throw new Error('引用已变化，请重新选择。');
          sourceLength += JSON.stringify(source).length;
          if (source.body.length > 32000 || sourceLength > 32000) throw new Error('本轮材料过长，请减少引用或拆分后选择。');
          await tx.execute('INSERT INTO local_agent_sources(id,request_id,document_id,revision,title,body,kind,date) VALUES(?,?,?,?,?,?,?,?)', [`${id}:${identity}`, id, ref.id, ref.revision, source.title, source.body, source.kind, source.date]);
        }
        const request = { id, session_id: sessionId, text: text.trim(), source_refs: JSON.stringify(refs), status: 'running', error: null, created_at: now };
        await tx.execute('INSERT INTO local_agent_requests(id,session_id,text,source_refs,status,error,created_at,updated_at) VALUES(?,?,?,?,?,NULL,?,?)', [id, sessionId, request.text, request.source_refs, 'running', now, now]);
        await tx.execute("INSERT INTO local_agent_messages(id,session_id,request_id,role,body,created_at) VALUES(?,?,?,'user',?,?)", [`${id}:u`, sessionId, id, request.text, now]);
        await tx.execute("INSERT INTO local_agent_messages(id,session_id,request_id,role,body,created_at) VALUES(?,?,?,'assistant','',?)", [`${id}:a`, sessionId, id, now + 1]);
        await tx.execute("UPDATE local_agent_sessions SET title=CASE WHEN title='新对话' THEN ? ELSE title END,updated_at=? WHERE id=?", [request.text.slice(0, 22), now, sessionId]);
        await tx.execute('DELETE FROM local_meta WHERE id=?', ['material-draft-' + sessionId]);
        return request;
      });
    },
    async captureSource(requestId: string, ref: DocumentRef): Promise<DocumentRef[]> {
      if (!documentRefsSchema.safeParse([ref]).success) throw new DomainError('INVALID_ARGUMENT');
      return db.writeTransaction(async tx => {
        const request = await tx.getOptional<AgentRequest>('SELECT * FROM local_agent_requests WHERE id=?', [requestId]);
        const boundary = Number((await tx.getOptional<{ value: string }>("SELECT value FROM local_meta WHERE id='agent-context-boundary'"))?.value ?? 0);
        if (!request || request.status !== 'running' || request.created_at <= boundary) throw new DomainError('PERMISSION_DENIED');
        const refs: DocumentRef[] = JSON.parse(request.source_refs);
        const previous = refs.find(r => r.id === ref.id && r.kind === ref.kind);
        if (previous && previous.revision !== ref.revision) throw new DomainError('SOURCE_CHANGED');
        // Attachments are supplied by the user/channel, not enumerated through arbitrary paths.
        if (ref.kind === 'attachment' && !previous) throw new DomainError('PERMISSION_DENIED');
        if (!previous && refs.length >= 4) throw new DomainError('INVALID_ARGUMENT');
        const source = await sourceFor(tx, ref);
        if (!source) throw new DomainError('SOURCE_CHANGED');
        if (previous) return refs;
        const snapshots = await tx.getAll('SELECT document_id AS id,revision,title,body,kind,date FROM local_agent_sources WHERE request_id=?', [requestId]);
        if (JSON.stringify(source).length + JSON.stringify(snapshots).length > 32000) throw new DomainError('INVALID_ARGUMENT');
        refs.push(ref);
        const identity = `${ref.kind ?? 'document'}:${ref.id}`;
        await tx.execute('INSERT INTO local_agent_sources(id,request_id,document_id,revision,title,body,kind,date) VALUES(?,?,?,?,?,?,?,?)', [`${requestId}:${identity}`, requestId, ref.id, ref.revision, source.title, source.body, source.kind, source.date]);
        await tx.execute('UPDATE local_agent_requests SET source_refs=? WHERE id=?', [JSON.stringify(refs), requestId]);
        return refs;
      });
    },
    async request(id: string) {
      return db.readTransaction(tx => tx.getOptional<AgentRequest>('SELECT * FROM local_agent_requests WHERE id=?', [id]));
    },
    async restart(id: string): Promise<AgentRequest> {
      return db.writeTransaction(async tx => {
        const request = await tx.getOptional<AgentRequest>('SELECT * FROM local_agent_requests WHERE id=?', [id]);
        if (!request || !['error', 'stopped', 'interrupted'].includes(request.status)) throw new Error('这次请求不能重试。');
        await tx.execute("UPDATE local_agent_requests SET status='running',error=NULL,updated_at=? WHERE id=?", [deps.now(), id]);
        return { ...request, status: 'running', error: null };
      });
    },
    async progress(id: string, text: string) {
      await db.writeTransaction(tx => tx.execute('UPDATE local_agent_messages SET body=? WHERE id=?', [text, `${id}:a`]));
    },
    async finish(id: string, text: string, status: string, error: string | null) {
      await db.writeTransaction(async tx => {
        await tx.execute('UPDATE local_agent_messages SET body=? WHERE id=?', [text, `${id}:a`]);
        await tx.execute('UPDATE local_agent_requests SET status=?,error=?,updated_at=? WHERE id=?', [status, error, deps.now(), id]);
      });
    },
    async grants(id: string): Promise<Grant[]> {
      return db.readTransaction(tx => tx.getAll('SELECT id,command_type AS commandType,target_id AS targetId FROM local_agent_grants WHERE request_id=?', [id]));
    },
    async committedReceipts(requestId: string): Promise<Receipt[]> {
      const rows = await db.readTransaction(tx => tx.getAll<{ receipt: string }>('SELECT receipt FROM local_agent_grants WHERE request_id=? AND receipt IS NOT NULL', [requestId]));
      return rows.map(row => JSON.parse(row.receipt));
    },
    async result(id: string): Promise<ActionResult | null> {
      const row = await db.readTransaction(tx => tx.getOptional<{ result: string }>('SELECT result FROM local_agent_results WHERE id=?', [id]));
      return row ? JSON.parse(row.result) : null;
    },
    async results(requestId: string): Promise<ActionResult[]> {
      const rows = await db.readTransaction(tx => tx.getAll<{ result: string }>('SELECT result FROM local_agent_results WHERE request_id=? ORDER BY created_at,id', [requestId]));
      return rows.map(row => JSON.parse(row.result));
    },
    async putResult(id: string, requestId: string, result: ActionResult) {
      await db.writeTransaction(tx => tx.execute('INSERT OR REPLACE INTO local_agent_results(id,request_id,result,created_at) VALUES(?,?,?,?)', [id, requestId, JSON.stringify(result), deps.now()]));
    },
    async contextBoundary() {
      return db.readTransaction(async tx => Number((await tx.getOptional<{ value: string }>("SELECT value FROM local_meta WHERE id='agent-context-boundary'"))?.value ?? 0));
    },
  };
}
export type AgentStore = ReturnType<typeof createAgentStore>;
