import { column } from '@powersync/react-native';

export const gradeTables = {
  local_grades: {
    course: column.text, term: column.text, score_units: column.integer, credit_units: column.integer,
    note: column.text, source_refs: column.text, deleted: column.integer, revision: column.integer,
    created_at: column.integer, updated_at: column.text,
  },
};
