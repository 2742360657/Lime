import { Schema, Table, column } from '@powersync/react-native';

// Keep the existing columns and IDs: storage isolation does not change record semantics.
export const legacyTableColumns = {
  document_groups: { owner_id: column.text, kind: column.text, name: column.text, sort_order: column.integer, created_at: column.integer, revision: column.integer, deleted: column.integer, updated_at: column.text },
  documents: { group_id: column.text, sort_order: column.integer, created_at: column.integer, edited_at: column.integer, deleted_at: column.integer, owner_id: column.text, kind: column.text, title: column.text, body: column.text, date: column.text, revision: column.integer, deleted: column.integer, updated_at: column.text },
  tasks: { owner_id: column.text, title: column.text, status: column.text, document_id: column.text, due_at: column.text, note: column.text, due_date_key: column.text, due_time: column.text, sort_order: column.integer, created_at: column.integer, completed_at: column.integer, revision: column.integer, deleted: column.integer, updated_at: column.text },
  habit_groups: { owner_id: column.text, name: column.text, sort_order: column.integer, created_at: column.integer, revision: column.integer, deleted: column.integer, updated_at: column.text },
  habits: { owner_id: column.text, name: column.text, group_id: column.text, cadence: column.text, target_count: column.integer, sort_order: column.integer, created_at: column.integer, archived_at: column.integer, revision: column.integer, deleted: column.integer, updated_at: column.text },
  checkins: { owner_id: column.text, habit_id: column.text, date_key: column.text, timestamp: column.integer, note: column.text, created_at: column.integer, revision: column.integer, deleted: column.integer, updated_at: column.text },
  suggestions: { owner_id: column.text, document_id: column.text, document_revision: column.integer, request_id: column.text, summary: column.text, tasks: column.text, model: column.text, status: column.text, updated_at: column.text },
  local_meta: { value: column.text },
  local_conflicts: { payload: column.text, snapshots: column.text, error: column.text, created_at: column.text },
  local_drafts: { base_content: column.text, kind: column.text, group_id: column.text, base_revision: column.integer, title: column.text, body: column.text, date: column.text, document_id: column.text },
};

// Additive local-only objects. Never change the historical source schema on migration.
export const tableColumns = {
  ...legacyTableColumns,
  local_operations: { fingerprint: column.text, receipt: column.text, created_at: column.integer },
  local_memories: { kind: column.text, key: column.text, content: column.text, forgotten: column.integer, revision: column.integer, created_at: column.integer, updated_at: column.text },
  local_activities: { kind: column.text, title: column.text, note: column.text, completion_note: column.text, habit_id: column.text, status: column.text, checkin_id: column.text, revision: column.integer, created_at: column.integer, updated_at: column.text, completed_at: column.integer },
  local_proposals: { command: column.text, fingerprint: column.text, source_refs: column.text, request_id: column.text, revision: column.integer, status: column.text, operation_id: column.text, receipt: column.text, created_at: column.integer, updated_at: column.text },
  local_personas: { filename: column.text, body: column.text, enabled: column.integer, revision: column.integer, updated_at: column.integer },
  local_agent_sessions: { title: column.text, created_at: column.integer, updated_at: column.integer },
  local_agent_messages: { session_id: column.text, request_id: column.text, role: column.text, body: column.text, created_at: column.integer },
  local_agent_requests: { session_id: column.text, text: column.text, source_refs: column.text, status: column.text, error: column.text, created_at: column.integer, updated_at: column.integer },
  local_agent_grants: { request_id: column.text, command_type: column.text, target_id: column.text, fingerprint: column.text, receipt: column.text },
  local_agent_results: { request_id: column.text, result: column.text, created_at: column.integer },
  local_materials: { filename: column.text, uri: column.text, hash: column.text, size: column.integer, mime: column.text, kind: column.text, body: column.text, images: column.text, pages: column.integer, status: column.text, note: column.text, revision: column.integer, deleted: column.integer, created_at: column.integer },
  local_material_imports: { outcome: column.text, created_at: column.integer },
  local_agent_sources: { request_id: column.text, document_id: column.text, revision: column.integer, title: column.text, body: column.text, kind: column.text, date: column.text },
};

export type LocalTable = keyof typeof tableColumns;
export const localTables = Object.keys(tableColumns) as LocalTable[];
export const migrationTables = Object.keys(legacyTableColumns) as (keyof typeof legacyTableColumns)[];

export function createDatabaseSchema(localOnly = true) {
  const names: LocalTable[] = localOnly ? localTables : migrationTables;
  return new Schema(Object.fromEntries(names.map(name => [name,
    new Table(tableColumns[name], { localOnly: localOnly || name.startsWith('local_') }),
  ])));
}
