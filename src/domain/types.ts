export type SqlValue = string | number | null;
export interface DomainTransaction {
  getOptional<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  getAll<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  execute(sql: string, params?: SqlValue[]): Promise<unknown>;
}
export interface DomainDatabase {
  writeTransaction<T>(fn: (tx: DomainTransaction) => Promise<T>): Promise<T>;
  readTransaction<T>(fn: (tx: DomainTransaction) => Promise<T>): Promise<T>;
}
export type DocumentRef = { id: string; revision: number; kind?: 'attachment' };
// Constructed by application code. None of these fields are model tool arguments.
export type ReadContext = { actor: 'ui' | 'agent'; documentRefs?: DocumentRef[] };
export type UiContext = { actor: 'ui' };
export type EntityRef = { kind: 'task' | 'habit' | 'checkin' | 'memory' | 'activity' | 'reminder'; id: string; revision: number };
export type Receipt = {
  operationId: string;
  disposition: 'committed' | 'replayed' | 'unchanged';
  entity: EntityRef;
  related?: EntityRef;
};
export type ErrorCode = 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'PERMISSION_DENIED' |
  'OPERATION_ID_REUSED' | 'ALREADY_EXISTS' | 'ACTIVITY_CLOSED' | 'SOURCE_CHANGED' | 'PROPOSAL_CLOSED';
const messages: Record<ErrorCode, string> = {
  INVALID_ARGUMENT: '信息不完整或格式不正确，请核对后重试。',
  NOT_FOUND: '记录已不存在或已被删除。',
  VERSION_CONFLICT: '记录已经变化，请重新核对。当前输入仍保留。',
  PERMISSION_DENIED: '这项操作尚未获得授权。',
  OPERATION_ID_REUSED: '同一次操作的内容已变化，请使用新的操作。',
  ALREADY_EXISTS: '这项记忆已存在，请明确更正已有内容。',
  ACTIVITY_CLOSED: '这项活动已完成或取消，不会重复打卡。',
  SOURCE_CHANGED: '引用的原文已经变化，请重新选择。',
  PROPOSAL_CLOSED: '这项建议已处理或已变化，请重新核对。',
};
export class DomainError extends Error {
  constructor(public readonly code: ErrorCode) { super(messages[code]); this.name = 'DomainError'; }
}
