import { column } from '@powersync/react-native';

// Separate receipts keep organization snapshots out of single-entity operation mappings.
export const dailyTables = {
  local_organization_batches: {
    fingerprint: column.text, plan: column.text, before_snapshots: column.text,
    after_snapshots: column.text, receipt: column.text, status: column.text,
    revision: column.integer, created_at: column.integer, updated_at: column.text,
    undone_at: column.integer,
  },
};
