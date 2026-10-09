import { Schema, Table, column } from '@powersync/react-native';

// Keep the existing columns and IDs: storage isolation does not change record semantics.
export const tableColumns = {
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

export type LocalTable = keyof typeof tableColumns;
export const localTables = Object.keys(tableColumns) as LocalTable[];

export function createDatabaseSchema(localOnly = true) {
  return new Schema(Object.fromEntries(localTables.map(name => [name,
    new Table(tableColumns[name], { localOnly: localOnly || name.startsWith('local_') }),
  ])));
}
