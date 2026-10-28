import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../state/AppProvider';

export function SectionHeading({ title, meta, collapsed, onToggle, danger = false, accessibilityLabel }: {
  title: string; meta?: string; collapsed: boolean; onToggle: () => void; danger?: boolean; accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: !collapsed }}
    accessibilityLabel={accessibilityLabel ?? `${collapsed ? '展开' : '收起'}${title}`} onPress={onToggle}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingTop: 12, paddingBottom: 4 }}>
    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: danger ? theme.colors.danger : theme.colors.textPrimary }}>{title}</Text>
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      {!!meta && <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{meta}</Text>}
      <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.primaryText }}>{collapsed ? '展开' : '收起'}</Text>
    </View>
  </TouchableOpacity>;
}
