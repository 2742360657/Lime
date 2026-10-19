import { Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';

import { AppNavigator } from './src/components/AppNavigator';
import { useBackHandler, useSystemBack } from './src/navigation/back';
import { HOME_TARGET, type NavigationTarget } from './src/navigation/types';
import { HomeScreen } from './src/screens/HomeScreen';
import { MemosScreen } from './src/screens/MemosScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { TrashScreen } from './src/screens/TrashScreen';
import { HabitProvider, useHabits } from './src/state/HabitStore';

const EXIT_CONFIRM_WINDOW = 2500;

const navigationRef = createNavigationContainerRef<Record<string, object>>();

const SCREENS: Record<string, React.ComponentType<any>> = {
  today: TodayScreen,
  tasks: TasksScreen,
  habits: HomeScreen,
  memos: MemosScreen,
  trash: TrashScreen,
  settings: SettingsScreen,
};

/** “再按一次退出”的待确认状态；放模块作用域，组件重挂载不丢失。 */
let exitArmed = false;
let exitTimer: ReturnType<typeof setTimeout> | null = null;

function clearExitArm() {
  exitArmed = false;
  if (exitTimer) {
    clearTimeout(exitTimer);
    exitTimer = null;
  }
}

function AppShell() {
  const { isLoading, error, clearError, theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [exitPromptVisible, setExitPromptVisible] = useState(false);

  useSystemBack();

  useEffect(() => {
    if (!error) {
      return;
    }
    Alert.alert('存储提示', error, [{ text: '知道了', onPress: clearError }]);
  }, [error, clearError]);

  const cancelExit = useCallback(() => {
    clearExitArm();
    setExitPromptVisible(false);
  }, []);

  // 系统返回：非首页回首页；首页连按两次才退出。
  // 更靠内的处理器（右侧操作栏、页面编辑态）会先消费返回键。
  useBackHandler(
    useCallback(() => {
      const current = navigationRef.isReady()
        ? (navigationRef.getCurrentRoute()?.name as NavigationTarget | undefined)
        : HOME_TARGET;

      if (current && current !== HOME_TARGET) {
        cancelExit();
        navigationRef.navigate(HOME_TARGET as never);
        return true;
      }

      if (exitArmed) {
        clearExitArm();
        setExitPromptVisible(false);
        BackHandler.exitApp();
        return true;
      }

      clearExitArm();
      exitArmed = true;
      setExitPromptVisible(true);
      exitTimer = setTimeout(() => {
        exitArmed = false;
        setExitPromptVisible(false);
        exitTimer = null;
      }, EXIT_CONFIRM_WINDOW);
      return true;
    }, [cancelExit])
  );

  useEffect(() => () => clearExitArm(), []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>正在读取本地数据...</Text>
          </View>
        ) : (
          <NavigationContainer ref={navigationRef}>
            <AppNavigator screens={SCREENS} />
          </NavigationContainer>
        )}
      </View>

      {exitPromptVisible ? (
        <View
          style={[styles.promptOverlay, { paddingBottom: 92 + insets.bottom }]}
          pointerEvents="box-none"
        >
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>再按一次返回退出酸橙</Text>
            <Text style={styles.promptHint}>也可以点下面继续留在应用里。</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="留在应用"
              onPress={cancelExit}
              style={styles.promptButton}
            >
              <Text style={styles.promptButtonText}>继续使用</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <HabitProvider>
          <AppShell />
        </HabitProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.colors.background },
    app: { flex: 1, backgroundColor: theme.colors.background },
    loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { fontSize: 14, color: theme.colors.textSecondary },
    promptOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      top: 0,
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: 20,
      paddingBottom: 92,
    },
    promptCard: {
      width: '100%',
      borderRadius: theme.radius.large,
      padding: 20,
      gap: 8,
      backgroundColor: theme.colors.surface,
      ...theme.shadow,
    },
    promptTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
    promptHint: { fontSize: 12, color: theme.colors.textSecondary },
    promptButton: {
      marginTop: 8,
      alignSelf: 'flex-end',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: theme.colors.primarySoft,
    },
    promptButtonText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },
  });
}
