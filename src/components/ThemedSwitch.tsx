import { Switch, type SwitchProps } from 'react-native';
import { useTheme } from '../state/AppProvider';

export function ThemedSwitch(props: SwitchProps) {
  const theme = useTheme();
  return <Switch trackColor={{ false: theme.colors.border, true: theme.colors.primarySoft }}
    thumbColor={props.value ? theme.colors.primary : theme.colors.textSecondary}
    ios_backgroundColor={theme.colors.border} {...props} />;
}
