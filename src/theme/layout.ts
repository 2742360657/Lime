import { StyleSheet } from 'react-native';
import type { AppTheme } from '../theme';

/** Shared rhythm for browse, select and drag rows; behavior stays in each component. */
export function listRow(theme: AppTheme) {
  return { minHeight: 62, flexDirection: 'row' as const, alignItems: 'center' as const,
    gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface };
}
export function pageHeading(theme: AppTheme) {
  return { fontSize: 20, fontWeight: '600' as const, color: theme.colors.textPrimary };
}
