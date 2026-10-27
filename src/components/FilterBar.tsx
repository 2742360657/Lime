import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../state/AppProvider';

export function FilterBar({ options, value, onChange }: {
  options: Array<{ id: string; label: string; count?: number }>;
  value: string;
  onChange: (id: string) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    row: { gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
    chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 8, backgroundColor: theme.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
    active: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
    label: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
    selected: { color: theme.colors.primary, fontWeight: '800' },
    count: { fontSize: 12, color: theme.colors.textSecondary },
  }), [theme]);
  return <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
    {options.map((option) => <TouchableOpacity key={option.id} hitSlop={4} accessibilityRole="button" accessibilityLabel={`筛选${option.label}`} accessibilityState={{ selected: option.id === value }} onPress={() => onChange(option.id)} style={[styles.chip, option.id === value && styles.active]}>
      <Text style={[styles.label, option.id === value && styles.selected]}>{option.label}</Text>
      {option.count !== undefined && <Text style={styles.count}>{option.count}</Text>}
    </TouchableOpacity>)}
  </ScrollView></View>;
}
