import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useHabits } from '../state/HabitStore';

export type DragGroup = {
  id: string;
  title: string;
  /** 该分组是否允许作为拖放目标（例如“已完成”不允许）。 */
  acceptsDrop?: boolean;
};

export type DragItem = {
  id: string;
  groupId: string;
  label: string;
  subtitle?: string;
  leading?: React.ReactNode;
};

type Row =
  | { kind: 'group'; id: string; title: string; y: number; height: number }
  | { kind: 'item'; id: string; item: DragItem; y: number; height: number };

type DraggableListProps = {
  groups: DragGroup[];
  items: DragItem[];
  /** 松手后回调最终顺序；`groupId` 已反映跨分组移动的结果。 */
  onCommit: (ordered: Array<{ id: string; groupId: string }>) => void;
  emptyText?: string;
  contentPaddingBottom?: number;
};

const GROUP_ROW_HEIGHT = 46;
const ITEM_ROW_HEIGHT = 62;

/**
 * 垂直拖动排序列表：长按右侧两条横线后可拖动。
 * 拖动中只有被拖起的那一行跟随手指，松手时一次性落位，避免实时重排造成的抖动。
 */
export function DraggableList({
  groups,
  items,
  onCommit,
  emptyText = '这里还没有内容',
  contentPaddingBottom = 140,
}: DraggableListProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [orderedItems, setOrderedItems] = useState<DragItem[]>(items);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const orderedRef = useRef<DragItem[]>(items);
  const dragTop = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  /** 手指落点相对于被拖行顶部的偏移，保证拖动时行的位置与手指同步。 */
  const grabOffsetRef = useRef(0);
  const dragCenterRef = useRef(0);
  const draggedHeightRef = useRef(0);
  const dropIndexRef = useRef<number | null>(null);
  const groupAcceptsRef = useRef(new Map<string, boolean>());
  groupAcceptsRef.current = new Map(groups.map((group) => [group.id, group.acceptsDrop !== false]));

  // 外部数据变化时同步（拖动过程中不打断）。
  const lastItemsRef = useRef(items);
  if (lastItemsRef.current !== items && activeId === null) {
    lastItemsRef.current = items;
    orderedRef.current = items;
    if (orderedItems !== items) {
      setOrderedItems(items);
    }
  }

  const rows = useMemo<Row[]>(() => {
    const next: Row[] = [];
    let cursor = 0;
    for (const group of groups) {
      const groupItems = orderedItems.filter((item) => item.groupId === group.id);
      const groupHeight = heights[`group:${group.id}`] ?? GROUP_ROW_HEIGHT;
      next.push({ kind: 'group', id: group.id, title: group.title, y: cursor, height: groupHeight });
      cursor += groupHeight;
      for (const item of groupItems) {
        const height = heights[`item:${item.id}`] ?? ITEM_ROW_HEIGHT;
        next.push({ kind: 'item', id: item.id, item, y: cursor, height });
        cursor += height;
      }
    }
    return next;
  }, [groups, orderedItems, heights]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  /** 根据被拖行中心位置，算出它应该插入到第几个条目（不含自身）。 */
  const dropIndexFor = useCallback((centerY: number, draggedId: string) => {
    const itemRows = rowsRef.current.filter(
      (row): row is Extract<Row, { kind: 'item' }> => row.kind === 'item'
    );
    const others = itemRows.filter((row) => row.id !== draggedId);
    let index = others.length;
    for (let i = 0; i < others.length; i += 1) {
      if (centerY < others[i].y + others[i].height / 2) {
        index = i;
        break;
      }
    }
    return index;
  }, []);

  const targetGroupFor = useCallback((centerY: number) => {
    let currentGroupId: string | null = null;
    for (const row of rowsRef.current) {
      if (row.y > centerY) {
        break;
      }
      if (row.kind === 'group') {
        currentGroupId = row.id;
      }
    }
    return currentGroupId;
  }, []);

  const commit = useCallback(
    (next: DragItem[]) => {
      orderedRef.current = next;
      setOrderedItems(next);
      onCommit(next.map((item) => ({ id: item.id, groupId: item.groupId })));
    },
    [onCommit]
  );

  const startDrag = useCallback(
    (itemId: string, pageY: number) => {
      const row = rowsRef.current.find((entry) => entry.kind === 'item' && entry.id === itemId);
      if (!row) {
        return;
      }
      grabOffsetRef.current = pageY - row.y;
      draggedHeightRef.current = row.height;
      dragCenterRef.current = row.y + row.height / 2;
      dropIndexRef.current = null;
      dragTop.setValue(row.y);
      setActiveId(itemId);
      setScrollEnabled(false);
      Animated.timing(lift, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    },
    [dragTop, lift]
  );

  const moveDrag = useCallback(
    (itemId: string, pageY: number) => {
      const top = Math.max(0, pageY - grabOffsetRef.current);
      dragTop.setValue(top);
      dragCenterRef.current = top + draggedHeightRef.current / 2;
      dropIndexRef.current = dropIndexFor(dragCenterRef.current, itemId);
    },
    [dragTop, dropIndexFor]
  );

  const endDrag = useCallback(
    (itemId: string) => {
      Animated.timing(lift, { toValue: 0, duration: 120, useNativeDriver: true }).start();
      setActiveId(null);
      setScrollEnabled(true);

      const centerY = dragCenterRef.current;
      const targetGroupId = targetGroupFor(centerY);
      const moved = orderedRef.current.find((item) => item.id === itemId);
      if (!moved) {
        return;
      }

      const without = orderedRef.current.filter((item) => item.id !== itemId);
      const rawIndex = dropIndexRef.current ?? dropIndexFor(centerY, itemId);
      const index = Math.max(0, Math.min(without.length, rawIndex));

      const acceptsDrop = targetGroupId ? groupAcceptsRef.current.get(targetGroupId) !== false : false;
      const nextGroupId = acceptsDrop && targetGroupId ? targetGroupId : moved.groupId;

      without.splice(index, 0, { ...moved, groupId: nextGroupId });
      commit(without);
    },
    [commit, dragTop, dropIndexFor, targetGroupFor]
  );

  const handleLayout = useCallback((key: string, event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setHeights((current) => (current[key] === height ? current : { ...current, [key]: height }));
  }, []);

  const totalHeight = rows.length > 0 ? rows[rows.length - 1].y + rows[rows.length - 1].height : 0;

  return (
    <ScrollView
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
    >
      {rows.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <View style={{ height: totalHeight }}>
          {rows.map((row) => {
            if (row.kind === 'group') {
              return (
                <View
                  key={`group:${row.id}`}
                  onLayout={(event) => handleLayout(`group:${row.id}`, event)}
                  style={[styles.groupRow, { top: row.y }]}
                >
                  <Text style={styles.groupTitle}>{row.title}</Text>
                  <Text style={styles.groupCount}>
                    {orderedItems.filter((item) => item.groupId === row.id).length}
                  </Text>
                </View>
              );
            }

            const active = row.id === activeId;
            return (
              <Animated.View
                key={row.id}
                onLayout={(event) => handleLayout(`item:${row.id}`, event)}
                style={[styles.itemSlot, { top: active ? dragTop : row.y, zIndex: active ? 2 : 1 }]}
              >
                <DragHandleRow
                  item={row.item}
                  active={active}
                  lift={lift}
                  onStart={startDrag}
                  onMove={moveDrag}
                  onEnd={endDrag}
                  styles={styles}
                  theme={theme}
                />
              </Animated.View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function DragHandleRow({
  item,
  active,
  lift,
  onStart,
  onMove,
  onEnd,
  styles,
  theme,
}: {
  item: DragItem;
  active: boolean;
  lift: Animated.Value;
  onStart: (id: string, pageY: number) => void;
  onMove: (id: string, pageY: number) => void;
  onEnd: (id: string, pageY: number) => void;
  styles: ReturnType<typeof createStyles>;
  theme: ReturnType<typeof useHabits>['theme'];
}) {
  const itemId = item.id;
  const activeRef = useRef(active);
  activeRef.current = active;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => onStart(itemId, event.nativeEvent.pageY),
        onPanResponderMove: (event) => {
          if (activeRef.current) {
            onMove(itemId, event.nativeEvent.pageY);
          }
        },
        onPanResponderRelease: (event) => onEnd(itemId, event.nativeEvent.pageY),
        onPanResponderTerminate: (event) => onEnd(itemId, event.nativeEvent.pageY),
      }),
    [itemId, onEnd, onMove, onStart]
  );

  return (
    <Animated.View
      style={[
        styles.row,
        active && styles.rowActive,
        { transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) }] },
      ]}
    >
      {item.leading}
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.rowLabel}>
          {item.label}
        </Text>
        {item.subtitle ? <Text style={styles.rowSubtitle}>{item.subtitle}</Text> : null}
      </View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={`拖动 ${item.label}`}
        hitSlop={8}
        style={[styles.handle, active && styles.handleActive]}
        {...responder.panHandlers}
      >
        <View style={[styles.handleLine, active && { backgroundColor: theme.colors.primary }]} />
        <View style={[styles.handleLine, active && { backgroundColor: theme.colors.primary }]} />
      </View>
    </Animated.View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    empty: { padding: 18, fontSize: 13, color: theme.colors.textSecondary },
    groupRow: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: GROUP_ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    groupTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.textSecondary },
    groupCount: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
    itemSlot: { position: 'absolute', left: 0, right: 0, zIndex: 1 },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: theme.radius.medium,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    rowActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
      ...theme.shadow,
    },
    rowText: { flex: 1, gap: 3 },
    rowLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
    rowSubtitle: { fontSize: 11, color: theme.colors.textSecondary },
    handle: {
      width: 48,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceMuted,
    },
    handleActive: { backgroundColor: theme.colors.surface },
    handleLine: { width: 20, height: 2, borderRadius: 1, backgroundColor: theme.colors.textMuted },
  });
}
