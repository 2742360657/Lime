import { column } from '@powersync/react-native';
export const recordTables = {
    local_records: { type_key: column.text, schema_key: column.text, schema_version: column.integer, title: column.text, body: column.text, payload: column.text, tags: column.text, occurred_at: column.integer, source_refs: column.text, revision: column.integer, deleted: column.integer, created_at: column.integer, updated_at: column.text },
};
