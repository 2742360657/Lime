import { Alert } from './src/components/ThemedAlert';
import { useBackupRestore } from './src/hooks/useBackupRestore';
import { AppProvider, useAppActions, useAppSelector, useAppStore, useTheme } from './src/state/AppProvider';
import type { AppTheme } from './src/theme';

import { createNavigationContainerRef, DefaultTheme, NavigationContainer } from '@react-navigation/native';
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

import { AppNavigator } from './src/components/AppNavigator';
import { ThemedAlertHost } from './src/components/ThemedAlert';
import { useBackHandler } from './src/navigation/back';
import { HOME_TARGET, type NavigationTarget } from './src/navigation/types';
import { HomeScreen } from './src/screens/HomeScreen';
import { MemosScreen } from './src/screens/MemosScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { TrashScreen } from './src/screens/TrashScreen';
import { UpdateProvider } from './src/update/UpdateProvider';

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
  const { isLoading, error, loadError, saveFailed, saveError, storageNotice, isRestoring } = useAppSelector(s => ({
    isLoading: s.isLoading, error: s.error, loadError: s.loadError, saveFailed: s.saveStatus === 'error',
    saveError: s.saveError, storageNotice: s.storageNotice, isRestoring: s.isRestoring,
  }));
  const store = useAppStore();
  const { restore, restoring } = useBackupRestore();
  const { clearError } = useAppActions();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigationTheme = useMemo(() => ({ ...DefaultTheme, colors: {
    ...DefaultTheme.colors, primary: theme.colors.primary, background: theme.colors.background,
    card: theme.colors.surface, text: theme.colors.textPrimary, border: theme.colors.border,
    notification: theme.colors.danger,
  } }), [theme]);
  const insets = useSafeAreaInsets();
  const [exitPromptVisible, setExitPromptVisible] = useState(false);

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
        void (async () => {
          try {
            if (store.getSnapshot().isHydrated) await store.flush();
            BackHandler.exitApp();
          } catch {
            Alert.alert('修改尚未保存', '保存失败，已暂时留在应用中。请点击“重试保存”后再退出。');
          }
        })();
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
    }, [cancelExit, store])
  );

  useEffect(() => () => clearExitArm(), []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={theme.colors.primaryText} />
            <Text style={styles.loadingText}>正在读取本地数据...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.loadingState}>
            <Text style={styles.promptTitle}>无法读取本地数据</Text>
            <Text style={styles.loadingText}>{loadError}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="重新读取数据" onPress={() => void store.load()} style={styles.promptButton}>
              <Text style={styles.promptButtonText}>重新读取</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="从备份恢复" disabled={restoring} onPress={restore} style={styles.promptButton}>
              <Text style={styles.promptButtonText}>{restoring ? '正在恢复…' : '从备份恢复'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {saveFailed || storageNotice ? <View style={styles.storageBanner}>
              <Text accessibilityLiveRegion="assertive" style={styles.storageMessage}>{saveError ?? storageNotice}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={saveFailed ? '重试保存' : '知道了'}
                onPress={saveFailed ? () => void store.flush().catch(() => {}) : store.dismissStorageNotice} style={styles.promptButton}>
                <Text style={styles.promptButtonText}>{saveFailed ? '重试保存' : '知道了'}</Text>
              </TouchableOpacity>
            </View> : null}
          <NavigationContainer ref={navigationRef} theme={navigationTheme}>
            <AppNavigator screens={SCREENS} />
          </NavigationContainer>
          </>
        )}
      </View>

      {isRestoring ? <View style={styles.restoringOverlay}><ActivityIndicator color={theme.colors.primaryText} /><Text style={styles.loadingText}>正在保存恢复的数据…</Text></View> : null}

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
        <AppProvider>
          <UpdateProvider><AppShell /><ThemedAlertHost /></UpdateProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.colors.background },
    app: { flex: 1, backgroundColor: theme.colors.background },
    loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    loadingText: { fontSize: 14, lineHeight: 22, textAlign: 'center', color: theme.colors.textSecondary },
    storageBanner: { paddingHorizontal: 16, paddingVertical: 8, gap: 4, backgroundColor: theme.colors.dangerSoft },
    storageMessage: { fontSize: 13, lineHeight: 20, color: theme.colors.danger },
    restoringOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.colors.surface },
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
    promptButtonText: { fontSize: 13, fontWeight: '800', color: theme.colors.primaryText },
  });
}
