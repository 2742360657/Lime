import {
  createDrawerNavigator,
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';

import { PanelProvider, usePanel } from '../navigation/panel';

const Drawer = createDrawerNavigator();

function GlobalDrawerContent(props: DrawerContentComponentProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const activeRoute = props.state.routeNames[props.state.index];
  const panel = usePanel(activeRoute);

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerScroll}>
      <Text style={styles.drawerTitle}>{panel.title}</Text>
      {panel.items.filter((item) => !item.bottom).map((item) => {
        return (
          <TouchableOpacity
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: !!item.selected }}
            onPress={() => { props.navigation.closeDrawer(); item.onPress(); }}
            style={[styles.item, item.selected && styles.itemSelected]}
          >
            <Text style={[styles.itemText, item.selected && styles.itemTextSelected]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={styles.drawerBottom}>
        {panel.items.filter((item) => item.bottom).map((item) => (
          <TouchableOpacity
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => { props.navigation.closeDrawer(); item.onPress(); }}
            style={[styles.item, item.selected && styles.itemSelected]}
          >
            <Text style={[styles.itemText, item.selected && styles.itemTextSelected]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </DrawerContentScrollView>
  );
}

/**
 * 左侧页面操作抽屉。主页面切换固定在各页面底部，避免两套横向抽屉互相抢手势。
 */
export function AppNavigator({ screens }: { screens: Record<string, React.ComponentType<any>> }) {
  const { width: screenWidth } = useWindowDimensions();
  const theme = useTheme();
  return (
    <PanelProvider>
    <Drawer.Navigator
      initialRouteName="today"
        drawerContent={(props) => <GlobalDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerPosition: 'left',
        // 只保留一套横向抽屉，减少手势竞争和“滑了但没跟上”的感觉。
        swipeEnabled: true,
        swipeEdgeWidth: 24,
        swipeMinDistance: 18,
        overlayColor: theme.colors.scrim,
        drawerStyle: { width: Math.min(340, screenWidth * 0.88), backgroundColor: theme.colors.surface },
      }}
    >
      {Object.entries(screens).map(([name, Component]) => (
        <Drawer.Screen key={name} name={name} component={Component} options={{ swipeEnabled: name !== 'today' && name !== 'settings' }} />
      ))}
    </Drawer.Navigator>
    </PanelProvider>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    drawerScroll: {
      paddingTop: 8,
      paddingHorizontal: 10,
      backgroundColor: theme.colors.surface,
      flexGrow: 1,
    },
    drawerTitle: {
      fontSize: 22,
      fontWeight: '600',
      color: theme.colors.textPrimary,
      paddingHorizontal: 14,
      paddingBottom: 12,
    },
    drawerBottom: { marginTop: 'auto' },
    item: { paddingVertical: 14, paddingHorizontal: 14, borderRadius: theme.radius.action },
    itemSelected: { backgroundColor: theme.colors.primarySoft },
    itemText: { fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary },
    itemTextSelected: { color: theme.colors.primaryText, fontWeight: '600' },
  });
}
