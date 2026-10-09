import { Schema, Table, column } from '@powersync/react-native';

// Separate validation database only. Ordinary app schema is deliberately unchanged.
export const weixinTables = {
  weixin_accounts: { bot_id: column.text, user_id: column.text, cursor: column.text, updated_at: column.integer },
  weixin_messages: { account_id: column.text, message_key: column.text, fingerprint: column.text, state: column.text, body: column.text, parts: column.text, created_at: column.integer, revision: column.integer },
};
export const createWeixinSchema = () => new Schema(Object.fromEntries(Object.entries(weixinTables).map(([name, cols]) => [name, new Table(cols, { localOnly: true })])));
