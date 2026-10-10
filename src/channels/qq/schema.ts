import { Schema, Table, column } from '@powersync/react-native';
export const qqTables = {
  qq_sessions: { session_id: column.text, seq: column.integer },
  qq_messages: { account_id: column.text, message_key: column.text, body: column.text, parts: column.text, created_at: column.integer },
  qq_downloads: { uri: column.text, hash: column.text, kind: column.text },
};
export const createQqSchema = () => new Schema(Object.fromEntries(Object.entries(qqTables).map(([name,cols])=>[name,new Table(cols,{localOnly:true})])));
