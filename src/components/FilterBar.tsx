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
    row: { gap: 18, paddingHorizontal: 16 },
    tab: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 2, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    active: { borderBottomColor: theme.colors.primary },
    label: { fontSize: 13, fontWeight: '400', color: theme.colors.textSecondary },
    selected: { color: theme.colors.primaryText, fontWeight: '600' },
    count: { fontSize: 12, color: theme.colors.textMuted },
  }), [theme]);
  return <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
    {options.map(option => <TouchableOpacity key={option.id} hitSlop={{ top: 0, bottom: 0, left: 4, right: 4 }}
      accessibilityRole="button" accessibilityLabel={`筛选${option.label}`} accessibilityState={{ selected: option.id === value }}
      onPress={() => onChange(option.id)} style={[styles.tab, option.id === value && styles.active]}>
      <Text style={[styles.label, option.id === value && styles.selected]}>{option.label}</Text>
      {option.count !== undefined && <Text style={styles.count}>{option.count}</Text>}
    </TouchableOpacity>)}
  </ScrollView></View>;
}
