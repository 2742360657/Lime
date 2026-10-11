import { column } from '@powersync/react-native';

// Product objects are additive; the QQ validation database is never imported.
export const qqProductTables = {
  qq_product_sessions: { session_id: column.text, seq: column.integer },
  qq_product_messages: { account_id: column.text, message_key: column.text, fingerprint: column.text, body: column.text, parts: column.text, created_at: column.integer, revision: column.integer },
  local_qq_items: { message_id: column.text, account_key: column.text, fingerprint: column.text, position: column.integer, kind: column.text, filename: column.text, body: column.text, capability_id: column.text, material_id: column.text, status: column.text, note: column.text, state: column.text, created_at: column.integer, revision: column.integer },
};
