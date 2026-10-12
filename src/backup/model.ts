import { validateRecordRow, type RecordRow } from '../records/model';
import { tableColumns } from '../storage/databaseSchema';
import { portableRow, recordFields, portableDraft, type RecordTable } from '../assistant/recoveryRecords';
import { validatePersona, validateModel } from '../agent/store';
import { canonicalJson, commandSchema, documentRefsSchema } from '../domain/commands';
import type { SqlValue } from '../domain/types';
import { validateOrganizationBatch, organizationDependencies } from '../daily/model';

export const MAX_MANIFEST = 25 * 1024 * 1024;
export const MAX_PACKAGE = 256 * 1024 * 1024;
export const exportTables = [
  'document_groups', 'habit_groups', 'documents', 'habits', 'checkins', 'tasks',
  'local_drafts', 'local_conflicts', 'local_memories', 'local_activities', 'local_personas',
  'local_operations', 'local_proposals', 'local_agent_sessions', 'local_agent_messages',
  'local_agent_requests', 'local_agent_results', 'local_agent_sources', 'local_materials',
  'local_material_imports', 'local_reminder_rules', 'local_backup_archives', 'local_meta',
  'local_weixin_items',
  'local_qq_items', 'local_organization_batches', 'local_records',
] as const;
export type BackupTable = typeof exportTables[number];
export type Row = Record<string, SqlValue> & { id: string };
export type Blob = { hash: string; size: number; role: 'material' | 'archive' };
export type Manifest = { format: 'lime-local-backup'; version: 4; exportedAt: string; rows: Record<BackupTable, Row[]>; blobs: Blob[] };
export class BackupError extends Error {
  constructor(readonly code: 'FORMAT' | 'LIMIT' | 'MISSING_FILE' | 'INTEGRITY' | 'REFERENCE' | 'BUSY' | 'IO') {
    super(({ FORMAT: '数据包格式或版本不受支持。', LIMIT: '数据包超出当前支持大小，请保留原文件。', MISSING_FILE: '原件或图片副本缺失，未生成完整数据包。', INTEGRITY: '数据包内容校验失败，尚未恢复。', REFERENCE: '数据包中的关联不完整，尚未恢复。', BUSY: '请先停止助手生成，再恢复。', IO: '文件操作未完成，请检查空间或权限；原有记录仍保留。' })[code]);
    this.name = 'BackupError';
  }
}
export const emptyBackupRows = () => Object.fromEntries(exportTables.map(t => [t, [] as Row[]])) as Manifest['rows'];
export const hashPattern = /^[a-f0-9]{64}$/;
export const blobUri = (hash: string) => 'blob:' + hash;
export function blobHash(value: unknown) {
  if (typeof value !== 'string' || !/^blob:[a-f0-9]{64}$/.test(value)) throw new BackupError('FORMAT');
  return value.slice(5);
}
export function safeMeta(id: string) {
  return ['agent-model', 'agent-context-boundary'].includes(id);
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BackupError('FORMAT');
  return v as Record<string, unknown>;
}
export function json(value: SqlValue): any {
  try { return JSON.parse(String(value)); } catch { throw new BackupError('FORMAT'); }
}
export function projectRow(table: BackupTable, value: unknown): Row {
  const source = object(value); if (typeof source.id !== 'string') throw new BackupError('FORMAT');
  const result: Row = { id: source.id };
  if (!result.id || result.id.length > 512 || /[\x00-\x1f]/.test(result.id)) throw new BackupError('FORMAT');
  for (const [field, column] of Object.entries(tableColumns[table])) {
    const v = source[field] ?? null;
    if (v !== null && (column.type === 'INTEGER' ? !Number.isSafeInteger(v) : typeof v !== 'string' || v.length > MAX_MANIFEST)) throw new BackupError('FORMAT');
    result[field] = v as SqlValue;
  }
  if (table === 'local_weixin_items' || table === 'local_qq_items') result.capability_id = null;
  return result;
}
export function fileSlots(table: BackupTable, row: Row): { field: 'uri' | 'image'; index?: number; value: string; role: Blob['role']; size?: number; hash?: string }[] {
  if (table === 'local_backup_archives') return [{ field: 'uri', value: String(row.uri), role: 'archive', size: Number(row.size), hash: String(row.hash) }];
  if (table !== 'local_materials') return [];
  const images = json(row.images);
  if (!Array.isArray(images) || images.length > 6 || images.some(v => !v || typeof v.uri !== 'string' || typeof v.label !== 'string' || v.label.length > 100)) throw new BackupError('FORMAT');
  return [{ field: 'uri', value: String(row.uri), role: 'material', size: Number(row.size), hash: String(row.hash) }, ...images.map((image, index) => ({ field: 'image' as const, index, value: image.uri as string, role: 'material' as const }))];
}
export function replaceFiles(table: BackupTable, input: Row, replace: (uri: string) => string): Row {
  const row = { ...input };
  if (table === 'local_materials') {
    row.uri = replace(String(row.uri)); row.images = JSON.stringify(json(row.images).map((image: any) => ({ ...image, uri: replace(image.uri) })));
  } else if (table === 'local_backup_archives') row.uri = replace(String(row.uri));
  return row;
}
export function historyRow(table: BackupTable, source: Row): Row {
  const row = { ...source };
  if (table === 'local_agent_requests') { row.status = 'restored'; row.error = null; }
  if (table === 'local_proposals' && row.status === 'pending') row.status = 'restored';
  if (table === 'local_personas' || table === 'local_reminder_rules') row.enabled = 0;
  if (table === 'local_weixin_items' || table === 'local_qq_items') {
    row.capability_id = null;
    if (!row.material_id) { row.status = 'restored'; row.note = '恢复的收件历史；未保存的附件请重新转发。'; }
  }
  if (table === 'local_organization_batches') row.status = 'restored';
  return row;
}
export function equalRow(table: BackupTable, a: Row, b: Row) {
  const normalize = (row: Row) => {
    const r = historyRow(table,row);
    // Verified blobs are relocated on restore. Paths are storage locations, not content identity.
    if (table === 'local_materials') { delete r.uri; r.images = JSON.stringify(json(r.images).map((image: any) => ({ label: image.label }))); }
    if (table === 'local_backup_archives') delete r.uri;
    return canonicalJson(r);
  };
  return normalize(a) === normalize(b);
}
type Ref = { table: BackupTable; id: string; historical?: boolean };
const entityTables: Record<string, BackupTable> = { task: 'tasks', memo: 'documents', record: 'local_records', habit: 'habits', checkin: 'checkins', memory: 'local_memories', activity: 'local_activities', reminder: 'local_reminder_rules' };
export function dependencies(table: BackupTable, row: Row): Ref[] {
  const refs: Ref[] = [], add = (parent: BackupTable, id: unknown) => { if (id !== null && id !== undefined && id !== '') { if (typeof id !== 'string') throw new BackupError('REFERENCE'); refs.push({ table: parent, id }); } };
  if (table === 'documents') add('document_groups', row.group_id);
  if (table === 'habits') add('habit_groups', row.group_id);
  if (table === 'checkins') add('habits', row.habit_id);
  if (table === 'local_activities') { add('habits', row.habit_id); add('checkins', row.checkin_id); }
  if (table === 'local_weixin_items' || table === 'local_qq_items') add('local_materials', row.material_id);
  if (table === 'local_organization_batches') refs.push(...organizationDependencies(row));
  if (table === 'local_agent_requests') add('local_agent_sessions', row.session_id);
  if (['local_agent_messages', 'local_agent_results', 'local_agent_sources', 'local_proposals'].includes(table)) add('local_agent_requests', row.request_id);
  if (table === 'local_agent_messages') add('local_agent_sessions', row.session_id);
  if (['local_agent_requests','local_proposals','local_material_imports','local_records'].includes(table)) {
    const sources = table === 'local_material_imports' ? json(row.outcome).refs : json(row.source_refs);
    if (!Array.isArray(sources)) throw new BackupError('REFERENCE');
    for (const ref of sources) {
      if (!ref || typeof ref.id !== 'string') throw new BackupError('REFERENCE');
      refs.push({ table: table === 'local_material_imports' || ref.kind === 'attachment' ? 'local_materials' : ref.kind === 'record' ? 'local_records' : 'documents', id: ref.id, historical: table !== 'local_material_imports' });
    }
  }
  if (table === 'local_agent_sources') refs.push({ table: row.kind === 'attachment' ? 'local_materials' : row.kind === 'record' ? 'local_records' : 'documents', id: String(row.document_id), historical: true });
  const receipt = (v: unknown) => {
    if (!v || typeof v !== 'object') throw new BackupError('REFERENCE');
    const r = v as Record<string, any>;
    for (const entity of [r.entity, r.related].filter(Boolean)) {
      if (!entityTables[entity.kind] || typeof entity.id !== 'string' || !Number.isSafeInteger(entity.revision)) throw new BackupError('REFERENCE');
      add(entityTables[entity.kind], entity.id);
    }
  };
  if (table === 'local_operations' || (table === 'local_proposals' && row.receipt)) receipt(json(row.receipt));
  if (table === 'local_agent_results') {
    const result = json(row.result); if (result.receipt) receipt(result.receipt);
    if (result.proposalId) add('local_proposals', result.proposalId);
  }
  // Source refs describe immutable historical snapshots, not a fresh read grant.
  return refs;
}
export function validateManifest(value: unknown): Manifest {
  try {
    const raw = object(value);
    if (raw.format !== 'lime-local-backup' || raw.version !== 4 || typeof raw.version !== 'number' || Object.keys(raw).sort().join(',') !== 'blobs,exportedAt,format,rows,version') throw new BackupError('FORMAT');
    if (typeof raw.exportedAt !== 'string' || raw.exportedAt.length > 40 || !Number.isFinite(Date.parse(raw.exportedAt))) throw new BackupError('FORMAT');
    const source = object(raw.rows), rows = emptyBackupRows();
    const expectedTables = [...exportTables];
    if (Object.keys(source).sort().join(',') !== expectedTables.sort().join(',')) throw new BackupError('FORMAT');
    let count = 0;
    for (const table of exportTables) {
      const values = source[table]; if (!Array.isArray(values) || (count += values.length) > 50000) throw new BackupError('LIMIT');
      rows[table] = values.map(v => {
        const r = object(v), projected = projectRow(table, v);
        if (Object.keys(r).sort().join(',') !== Object.keys(projected).sort().join(',')) throw new BackupError('FORMAT');
        if ((table === 'local_weixin_items' || table === 'local_qq_items') && (r.capability_id !== null || !Number.isSafeInteger(projected.position) || Number(projected.position) < 0 || Number(projected.position) > 99 || typeof projected.body !== 'string' || projected.body.length > 32000 || typeof projected.filename !== 'string' || projected.filename.length > 180 || (projected.status === 'saved' && !projected.material_id))) throw new BackupError('FORMAT');
        if (table === 'local_records') validateRecordRow(projected as unknown as RecordRow);
        if (table === 'local_organization_batches') validateOrganizationBatch(projected);
        if (table === 'local_meta' && !safeMeta(projected.id)) throw new BackupError('FORMAT');
        if (Object.hasOwn(recordFields, table)) portableRow(table as RecordTable, projected);
        if (table === 'local_drafts') portableDraft(projected);
        if (table === 'local_personas') validatePersona(String(projected.filename),String(projected.body));
        if (table === 'local_meta' && projected.id === 'agent-model') validateModel(String(projected.value));
        if (table === 'local_meta' && projected.id === 'agent-context-boundary' && (!Number.isFinite(Number(projected.value)) || Number(projected.value)<0)) throw new BackupError('FORMAT');
        const requiredText: Partial<Record<BackupTable,string[]>> = {
          local_memories:['kind','key','content'],local_activities:['kind','title','note'],local_personas:['filename','body'],
          local_agent_sessions:['title'],local_agent_messages:['role','body','session_id','request_id'],
          local_agent_requests:['session_id','text','source_refs','status'],local_agent_sources:['request_id','document_id','kind','body','title','date'],
          local_proposals:['request_id','status','source_refs','fingerprint'],local_operations:['fingerprint','receipt'],
          local_material_imports:['outcome'],local_materials:['filename','uri','hash','mime','kind','body','images','status','note'],
          local_agent_results:['request_id','result'],local_backup_archives:['uri','hash','summary'],local_meta:['value'],
          local_weixin_items:['message_id','account_key','fingerprint','kind','filename','body','status','note','state'],
          local_qq_items:['message_id','account_key','fingerprint','kind','filename','body','status','note','state'],
          local_records:['type_key','schema_key','title','body','payload','tags','source_refs'],
        };
        for(const field of requiredText[table] ?? [])if(typeof projected[field]!=='string')throw new BackupError('FORMAT');
        for (const flag of ['deleted','forgotten','enabled','day_of']) if (flag in projected && projected[flag] !== null && ![0,1].includes(Number(projected[flag]))) throw new BackupError('FORMAT');
        if ('revision' in projected && (!Number.isSafeInteger(projected.revision) || Number(projected.revision) < 0)) throw new BackupError('FORMAT');
        if (table === 'local_reminder_rules' && !commandSchema.safeParse({ type: 'reminder.create', title: projected.title, note: projected.note, mode: projected.mode, dateKey: projected.date_key, monthDay: projected.month_day, time: projected.time, advanceDays: projected.advance_days, dayOf: !!projected.day_of, enabled: !!projected.enabled }).success) throw new BackupError('FORMAT');
        if (table === 'local_proposals' && projected.command && !commandSchema.safeParse(json(projected.command)).success) throw new BackupError('FORMAT');
        if (['local_agent_requests','local_proposals','local_records'].includes(table)) {
          if (!documentRefsSchema.safeParse(json(projected.source_refs)).success) throw new BackupError('FORMAT');
        }
        if (table === 'local_agent_results' && !commandSchema.safeParse(json(projected.result).command).success) throw new BackupError('FORMAT');
        const enums: Partial<Record<BackupTable, Record<string,string[]>>> = {
          local_agent_messages: { role: ['user','assistant'] }, local_memories: { kind: ['fact','preference'] },
          local_activities: { status: ['active','completed','cancelled'] },
          local_proposals: { status: ['pending','accepted','rejected','restored'] },
          local_agent_requests: { status: ['running','complete','error','stopped','interrupted','restored'] },
          local_materials: { kind: ['text','image','pdf','unsupported'], status: ['ready','unsupported'] },
          local_reminder_rules: { mode: ['once','annual'] },
          local_weixin_items: { kind: ['text','media','unsupported'], status: ['pending','saved','error','restored'], state: ['complete','pending','deleted','unsupported','superseded'] },
          local_qq_items: { kind: ['text','media','unsupported'], status: ['pending','saved','error','restored'], state: ['complete','unsupported','superseded'] },
        };
        for (const [field,allowed] of Object.entries(enums[table] ?? {})) if (!allowed.includes(String(projected[field]))) throw new BackupError('FORMAT');
        return projected;
      });
      if (new Set(rows[table].map(r => r.id)).size !== rows[table].length) throw new BackupError('FORMAT');
    }
    if (!Array.isArray(raw.blobs) || raw.blobs.length > 1023) throw new BackupError('LIMIT');
    let bytes = 0;
    const blobs: Blob[] = raw.blobs.map(v => {
      const b = object(v);
      if (Object.keys(b).sort().join(',') !== 'hash,role,size' || typeof b.hash !== 'string' || !hashPattern.test(b.hash) || !['material','archive'].includes(String(b.role)) || !Number.isSafeInteger(b.size) || Number(b.size) < 0 || Number(b.size) > (b.role === 'material' ? 10 * 1024 * 1024 : MAX_PACKAGE)) throw new BackupError('FORMAT');
      bytes += Number(b.size); if (bytes > MAX_PACKAGE) throw new BackupError('LIMIT');
      return b as Blob;
    });
    const byHash = new Map(blobs.map(b => [b.hash,b])); if (byHash.size !== blobs.length) throw new BackupError('FORMAT');
    const used = new Set<string>();
    const ids = Object.fromEntries(exportTables.map(t => [t,new Map(rows[t].map(r => [r.id,r]))])) as Record<BackupTable, Map<string, Row>>;
    for (const table of exportTables) for (const row of rows[table]) {
      for (const ref of dependencies(table, row)) if (!ref.historical && !ids[ref.table].has(ref.id)) throw new BackupError('REFERENCE');
      if (table === 'local_agent_messages' && ids.local_agent_requests.get(String(row.request_id))?.session_id !== row.session_id) throw new BackupError('REFERENCE');
      if (table === 'documents' && row.group_id && ids.document_groups.get(String(row.group_id))?.kind !== row.kind) throw new BackupError('REFERENCE');
      for (const slot of fileSlots(table,row)) {
        const hash = blobHash(slot.value), b = byHash.get(hash);
        if (!b || (slot.role === 'material' && b.size > 10*1024*1024) || (slot.size !== undefined && b.size !== slot.size) || (slot.hash !== undefined && slot.hash !== hash)) throw new BackupError('INTEGRITY');
        used.add(hash);
      }
    }
    if (used.size !== blobs.length) throw new BackupError('INTEGRITY');
    return { format: 'lime-local-backup', version: 4, exportedAt: raw.exportedAt, rows, blobs };
  } catch (error) { if (error instanceof BackupError) throw error; throw new BackupError('FORMAT'); }
}
