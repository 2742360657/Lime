import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useHabits } from '../state/HabitStore';

export type ReorderItem = {
  id: string;
  label: string;
  subtitle?: string;
};

type ReorderModalProps = {
  visible: boolean;
  title: string;
  items: ReorderItem[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
};

const ROW_STEP = 72;

function moveItem(items: ReorderItem[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function ReorderModal({
  visible,
  title,
  items,
  onClose,
  onSave,
}: ReorderModalProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [ordered, setOrdered] = useState(items);
  const [activeId, setActiveId] = useState<string | null>(null);
  const orderedRef = useRef(items);
  const startIndexRef = useRef(0);
  const dragTop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setOrdered(items);
      orderedRef.current = items;
      setActiveId(null);
    }
  }, [items, visible]);

  const startDrag = useCallback(
    (id: string) => {
      const index = orderedRef.current.findIndex((item) => item.id === id);
      if (index < 0) {
        return;
      }
      startIndexRef.current = index;
      dragTop.setValue(index * ROW_STEP);
      setActiveId(id);
    },
    [dragTop]
  );

  const moveDrag = useCallback(
    (id: string, dy: number) => {
      const current = orderedRef.current;
      const currentIndex = current.findIndex((item) => item.id === id);
      if (currentIndex < 0) {
        return;
      }
      const rawTop = startIndexRef.current * ROW_STEP + dy;
      const targetIndex = Math.max(0, Math.min(current.length - 1, Math.round(rawTop / ROW_STEP)));
      dragTop.setValue(Math.max(0, Math.min((current.length - 1) * ROW_STEP, rawTop)));

      if (targetIndex !== currentIndex) {
        const next = moveItem(current, currentIndex, targetIndex);
        orderedRef.current = next;
        setOrdered(next);
      }
    },
    [dragTop]
  );

  const endDrag = useCallback(
    (id: string) => {
      const targetIndex = orderedRef.current.findIndex((item) => item.id === id);
      Animated.spring(dragTop, {
        toValue: Math.max(0, targetIndex) * ROW_STEP,
        useNativeDriver: false,
        speed: 24,
        bounciness: 3,
      }).start(() => setActiveId(null));
    },
    [dragTop]
  );

  const handleSave = () => {
    onSave(orderedRef.current.map((item) => item.id));
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={handleSave} style={[styles.headerButton, styles.saveButton]}>
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.body}>
          {ordered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>没有可排序的内容</Text>
            </View>
          ) : (
            <ScrollView scrollEnabled={activeId === null} contentContainerStyle={styles.scrollContent}>
              <View style={{ height: ordered.length * ROW_STEP }}>
                {ordered.map((item, index) => (
                  <DraggableRow
                    key={item.id}
                    item={item}
                    index={index}
                    active={activeId === item.id}
                    dragTop={dragTop}
                    onStart={startDrag}
                    onMove={moveDrag}
                    onEnd={endDrag}
                    styles={styles}
                  />
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function DraggableRow({
  item,
  index,
  active,
  dragTop,
  onStart,
  onMove,
  onEnd,
  styles,
}: {
  item: ReorderItem;
  index: number;
  active: boolean;
  dragTop: Animated.Value;
  onStart: (id: string) => void;
  onMove: (id: string, dy: number) => void;
  onEnd: (id: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => onStart(item.id),
        onPanResponderMove: (_, gesture) => onMove(item.id, gesture.dy),
        onPanResponderRelease: () => onEnd(item.id),
        onPanResponderTerminate: () => onEnd(item.id),
      }),
    [item.id, onEnd, onMove, onStart]
  );

  return (
    <Animated.View
      style={[
        styles.rowPosition,
        { top: active ? dragTop : index * ROW_STEP },
        active && styles.rowPositionActive,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>{index + 1}</Text>
        </View>
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={styles.rowLabel}>{item.label}</Text>
          {item.subtitle ? <Text style={styles.rowSubtitle}>{item.subtitle}</Text> : null}
        </View>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={`拖动 ${item.label}`}
          style={[styles.handle, active && styles.handleActive]}
          {...responder.panHandlers}
        >
          <Text style={[styles.handleText, active && styles.handleTextActive]}>≡</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0,
      backgroundColor: theme.colors.background,
    },
    header: {
      minHeight: 64,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textPrimary },
    headerButton: { minWidth: 60, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' },
    headerButtonText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
    saveButton: { borderRadius: 12, backgroundColor: theme.colors.primary },
    saveButtonText: { fontSize: 14, fontWeight: '800', color: theme.colors.white },
    body: { flex: 1, paddingHorizontal: 20, paddingTop: 18 },
    scrollContent: { paddingBottom: 30 },
    empty: { padding: 18, borderRadius: 16, backgroundColor: theme.colors.surface },
    emptyText: { fontSize: 13, color: theme.colors.textSecondary },
    rowPosition: { position: 'absolute', left: 0, right: 0, height: 64, zIndex: 1 },
    rowPositionActive: { zIndex: 10 },
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      ...theme.shadow,
    },
    indexBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted,
    },
    indexText: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary },
    rowText: { flex: 1, gap: 3 },
    rowLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
    rowSubtitle: { fontSize: 11, color: theme.colors.textSecondary },
    handle: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
    },
    handleActive: { backgroundColor: theme.colors.primarySoft },
    handleText: { fontSize: 24, fontWeight: '700', color: theme.colors.textMuted },
    handleTextActive: { color: theme.colors.primary },
  });
}
