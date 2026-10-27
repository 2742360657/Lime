import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '../state/AppProvider';
import type { AppTheme } from '../theme';
import { orderByVisibleGroups } from '../utils/dragOrder';


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
  selected?: boolean;
  sortable?: boolean;
};

type Row =
  | { kind: 'group'; id: string; title: string; y: number; height: number }
  | { kind: 'item'; id: string; item: DragItem; y: number; height: number };

type DraggableListProps = {
  groups: DragGroup[];
  items: DragItem[];
  /** 松手后回调最终顺序；`groupId` 已反映跨分组移动的结果。 */
  onCommit: (ordered: Array<{ id: string; groupId: string }>) => void;
  /** 点按整行时切换选中。不传则整行不可点。 */
  onToggleSelect?: (id: string) => void;
  emptyText?: string;
  contentPaddingBottom?: number;
  /** 打开整理时保持原来的滚动位置。 */
  initialScrollY?: number;
  /** 拖到列表上下边缘时自动滚动，长列表也能一次拖到底。 */
  autoScroll?: boolean;
  dragEnabled?: boolean;
};

const GROUP_ROW_HEIGHT = 46;
const ITEM_ROW_HEIGHT = 62;
/** 手指移动超过这个距离才算“拖动”，轻触把手只会切换选中。 */
const DRAG_THRESHOLD = 6;
const SHIFT_DURATION = 140;
/** 自动滚动的触发边距与速度（像素）。 */
const AUTO_SCROLL_ZONE = 90;
const AUTO_SCROLL_STEP = 18;

const rowKey = (row: { kind: 'group' | 'item'; id: string }) => `${row.kind}:${row.id}`;

/**
 * 垂直拖动排序列表。
 *
 * - 点按整行切换选中；按住右侧把手并移动超过 6px 才开始拖动，避免误触重排。
 * - 拖动时其余行实时让出位置，能提前看到落点；目标分组会高亮。
 * - 拖到上下边缘自动滚动；松手一次性落位，避免实时重排造成的抖动。
 */
export function DraggableList({
  groups,
  items,
  onCommit,
  onToggleSelect,
  emptyText = '这里还没有内容',
  contentPaddingBottom = 140,
  initialScrollY = 0,
  autoScroll = false,
  dragEnabled = true,
}: DraggableListProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const visualItems = useMemo(() => orderByVisibleGroups(items, groups), [items, groups]);
  const [orderedItems, setOrderedItems] = useState<DragItem[]>(visualItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const orderedRef = useRef<DragItem[]>(visualItems);
  const dragTop = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  /** 手指落点相对于被拖行顶部的偏移，保证拖动时行的位置与手指同步。 */
  const grabOffsetRef = useRef(0);
  const dragCenterRef = useRef(0);
  const draggedHeightRef = useRef(0);
  const dropIndexRef = useRef<number | null>(null);
  const groupAcceptsRef = useRef(new Map<string, boolean>());
  groupAcceptsRef.current = new Map(groups.map((group) => [group.id, group.acceptsDrop !== false]));
  /** 每条行相对基础位置的让位偏移。 */
  const shiftsRef = useRef(new Map<string, Animated.Value>());
  const previewIdsRef = useRef('');

  const scrollRef = useRef<ScrollView>(null);
  const wrapperRef = useRef<View>(null);
  /** 列表在屏幕坐标里的顶部位置，用来把 pageY 换算成内容坐标。 */
  const listTopRef = useRef(0);
  const scrollYRef = useRef(initialScrollY);
  const viewportHeightRef = useRef(0);

  useEffect(() => {
    wrapperRef.current?.measureInWindow((_x, y) => {
      listTopRef.current = y;
    });
  }, []);

  const shiftFor = (key: string) => {
    let value = shiftsRef.current.get(key);
    if (!value) {
      value = new Animated.Value(0);
      shiftsRef.current.set(key, value);
    }
    return value;
  };

  const resetShifts = () => {
    previewIdsRef.current = '';
    shiftsRef.current.forEach((value) => { value.stopAnimation(); value.setValue(0); });
  };

  // 外部数据变化时同步（拖动过程中不打断）。
  const lastItemsRef = useRef(visualItems);
  if (lastItemsRef.current !== visualItems && activeId === null) {
    lastItemsRef.current = visualItems;
    orderedRef.current = visualItems;
    if (orderedItems !== visualItems) {
      setOrderedItems(visualItems);
    }
  }

  const layoutRows = useCallback(
    (source: DragItem[]): Row[] => {
      const next: Row[] = [];
      let cursor = 0;
      for (const group of groups) {
        const groupItems = source.filter((item) => item.groupId === group.id);
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
    },
    [groups, heights]
  );

  const rows = useMemo<Row[]>(() => layoutRows(orderedItems), [layoutRows, orderedItems]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  /** 把其余行移动到预览位置，实时让出被拖条目的落点。 */
  const previewShift = useCallback(
    (next: DragItem[]) => {
      const baseRows = rowsRef.current;
      const nextRows = layoutRows(next);
      const baseY = new Map(baseRows.map((row) => [rowKey(row), row.y]));
      const keys = new Set<string>([...baseY.keys(), ...nextRows.map((row) => rowKey(row))]);
      keys.forEach((key) => {
        const from = baseY.get(key) ?? 0;
        const target = nextRows.find((row) => rowKey(row) === key)?.y ?? from;
        Animated.timing(shiftFor(key), {
          toValue: target - from,
          duration: SHIFT_DURATION,
          useNativeDriver: true,
        }).start();
      });
    },
    [layoutRows]
  );

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

  /** 依据当前落点生成预览顺序。 */
  const buildPreview = useCallback((itemId: string, centerY: number) => {
    const moved = orderedRef.current.find((item) => item.id === itemId);
    if (!moved) {
      return null;
    }
    const without = orderedRef.current.filter((item) => item.id !== itemId);
    const rawIndex = dropIndexRef.current ?? dropIndexFor(centerY, itemId);
    const index = Math.max(0, Math.min(without.length, rawIndex));
    const targetGroupId = targetGroupFor(centerY);
    const acceptsDrop = targetGroupId ? groupAcceptsRef.current.get(targetGroupId) !== false : false;
    const next = [...without];
    next.splice(index, 0, { ...moved, groupId: acceptsDrop && targetGroupId ? targetGroupId : moved.groupId });
    return next;
  }, [dropIndexFor, targetGroupFor]);

  const scrollBy = useCallback((delta: number) => {
    const lastRow = rowsRef.current.at(-1);
    const contentHeight = lastRow ? lastRow.y + lastRow.height + contentPaddingBottom : 0;
    const maximum = Math.max(0, contentHeight - viewportHeightRef.current);
    const next = Math.min(maximum, Math.max(0, scrollYRef.current + delta));
    scrollYRef.current = next;
    scrollRef.current?.scrollTo({ y: next, animated: false });
    return next;
  }, [contentPaddingBottom]);

  /** 手指靠近上下边缘时滚动列表，并把被拖行一起带着走。 */
  const autoScrollFor = useCallback(
    (contentY: number) => {
      if (!autoScroll || viewportHeightRef.current === 0) {
        return 0;
      }
      const viewportTop = scrollYRef.current;
      const viewportBottom = viewportTop + viewportHeightRef.current;
      if (contentY < viewportTop + AUTO_SCROLL_ZONE) {
        return scrollBy(-AUTO_SCROLL_STEP) - viewportTop;
      }
      if (contentY > viewportBottom - AUTO_SCROLL_ZONE) {
        return scrollBy(AUTO_SCROLL_STEP) - viewportTop;
      }
      return 0;
    },
    [autoScroll, scrollBy]
  );

  const startDrag = useCallback(
    (itemId: string, pageY: number) => {
      wrapperRef.current?.measureInWindow((_x, y) => {
        listTopRef.current = y;
      });
      const row = rowsRef.current.find((entry) => entry.kind === 'item' && entry.id === itemId);
      if (!row) {
        return;
      }
      const contentY = pageY - listTopRef.current + scrollYRef.current;
      grabOffsetRef.current = contentY - row.y;
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
      const contentY = pageY - listTopRef.current + scrollYRef.current;
      const scrolled = autoScrollFor(contentY);
      const top = Math.max(0, contentY - scrolled - grabOffsetRef.current);
      dragTop.setValue(top);
      dragCenterRef.current = top + draggedHeightRef.current / 2;
      dropIndexRef.current = dropIndexFor(dragCenterRef.current, itemId);

      const next = buildPreview(itemId, dragCenterRef.current);
      if (next) {
        const signature = next.map((item) => `${item.id}@${item.groupId}`).join('|');
        if (signature !== previewIdsRef.current) {
          previewIdsRef.current = signature;
          setDropGroupId(next.find((item) => item.id === itemId)?.groupId ?? null);
          previewShift(next);
        }
      }
    },
    [autoScrollFor, buildPreview, dragTop, dropIndexFor, previewShift]
  );

  const endDrag = useCallback(
    (itemId: string) => {
      Animated.timing(lift, { toValue: 0, duration: 120, useNativeDriver: true }).start();

      const centerY = dragCenterRef.current;
      const next = buildPreview(itemId, centerY) ?? orderedRef.current;
      setActiveId(null);
      setScrollEnabled(true);
      setDropGroupId(null);
      resetShifts();
      dropIndexRef.current = null;
      commit(next);
    },
    [buildPreview, commit, lift]
  );

  const handleLayout = useCallback((key: string, event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    setHeights((current) => (current[key] === height ? current : { ...current, [key]: height }));
  }, []);

  const totalHeight = rows.length > 0 ? rows[rows.length - 1].y + rows[rows.length - 1].height : 0;

  return (
    <View
      ref={wrapperRef}
      style={styles.wrapper}
      onLayout={() => {
        wrapperRef.current?.measureInWindow((_x, y) => {
          listTopRef.current = y;
        });
      }}
    >
      <ScrollView
        ref={scrollRef}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: initialScrollY }}
        contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onLayout={(event) => {
          viewportHeightRef.current = Math.round(event.nativeEvent.layout.height);
        }}
      >
        {rows.length === 0 ? (
          <Text style={styles.empty}>{emptyText}</Text>
        ) : (
          <View style={{ height: totalHeight }}>
            {rows.map((row) => {
              if (row.kind === 'group') {
                const isDropTarget = activeId !== null && dropGroupId === row.id;
                return (
                  <Animated.View
                    key={rowKey(row)}
                    onLayout={(event) => handleLayout(`group:${row.id}`, event)}
                    style={[
                      styles.groupRow,
                      { top: row.y, transform: [{ translateY: shiftFor(rowKey(row)) }] },
                    ]}
                  >
                    <Text style={[styles.groupTitle, isDropTarget && styles.groupTitleActive]}>{row.title}</Text>
                    <Text style={[styles.groupCount, isDropTarget && styles.groupTitleActive]}>
                      {orderedItems.filter((item) => item.groupId === row.id).length}
                    </Text>
                  </Animated.View>
                );
              }

              const active = row.id === activeId;
              return (
                <Animated.View
                  key={rowKey(row)}
                  onLayout={(event) => handleLayout(`item:${row.id}`, event)}
                  style={[
                    styles.itemSlot,
                    {
                      top: active ? dragTop : row.y,
                      zIndex: active ? 3 : 1,
                      transform: active ? undefined : [{ translateY: shiftFor(rowKey(row)) }],
                    },
                  ]}
                >
                  <DragHandleRow
                    item={row.item}
                    dragEnabled={dragEnabled && row.item.sortable !== false}
                    onNudge={(direction) => {
                      const next = [...orderedRef.current];
                      const peers = next.filter((item) => item.groupId === row.item.groupId);
                      const peer = peers[peers.findIndex((item) => item.id === row.id) + direction];
                      if (!peer) return;
                      const a = next.findIndex((item) => item.id === row.id);
                      const b = next.findIndex((item) => item.id === peer.id);
                      [next[a], next[b]] = [next[b], next[a]];
                      onCommit(next.map(({ id, groupId }) => ({ id, groupId })));
                    }}
                    active={active}
                    lift={lift}
                    onStart={startDrag}
                    onMove={moveDrag}
                    onEnd={endDrag}
                    onToggleSelect={onToggleSelect}
                    styles={styles}
                    theme={theme}
                  />
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DragHandleRow({
  item,
  dragEnabled,
  onNudge,
  active,
  lift,
  onStart,
  onMove,
  onEnd,
  onToggleSelect,
  styles,
  theme,
}: {
  item: DragItem;
  dragEnabled: boolean;
  onNudge: (direction: number) => void;
  active: boolean;
  lift: Animated.Value;
  onStart: (id: string, pageY: number) => void;
  onMove: (id: string, pageY: number) => void;
  onEnd: (id: string, pageY: number) => void;
  onToggleSelect?: (id: string) => void;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
}) {
  const itemId = item.id;
  const startedRef = useRef(false);
  const startYRef = useRef(0);
  const callbacks = useRef({ onStart, onMove, onEnd, onToggleSelect });
  useLayoutEffect(() => { callbacks.current = { onStart, onMove, onEnd, onToggleSelect }; });

  // Keep the native gesture instance stable while React renders the drag preview.
  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(DRAG_THRESHOLD)
    .runOnJS(true)
    .onBegin(event => { startedRef.current = false; startYRef.current = event.absoluteY; })
    .onStart(event => {
      startedRef.current = true;
      callbacks.current.onStart(itemId, startYRef.current);
      callbacks.current.onMove(itemId, event.absoluteY);
    })
    .onUpdate(event => callbacks.current.onMove(itemId, event.absoluteY))
    .onFinalize(() => {
      if (startedRef.current) callbacks.current.onEnd(itemId, 0);
      else callbacks.current.onToggleSelect?.(itemId);
      startedRef.current = false;
    }), [itemId]);

  return (
    <Animated.View
      style={[
        styles.row,
        active && styles.rowActive,
        { transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) }] },
      ]}
    >
      <Pressable
        accessibilityRole={onToggleSelect ? 'checkbox' : undefined}
        accessibilityLabel={item.label}
        accessibilityState={onToggleSelect ? { checked: item.selected } : undefined}
        disabled={!onToggleSelect}
        onPress={() => onToggleSelect?.(itemId)}
        style={styles.tapArea}
      >
        {item.leading}
        <View style={styles.rowText}>
          <Text numberOfLines={2} style={styles.rowLabel}>
            {item.label}
          </Text>
          {item.subtitle ? <Text style={styles.rowSubtitle}>{item.subtitle}</Text> : null}
        </View>
      </Pressable>
      {dragEnabled && <GestureDetector gesture={gesture}><View
        accessibilityRole="adjustable"
        accessibilityActions={[{ name: 'increment', label: '下移' }, { name: 'decrement', label: '上移' }]}
        onAccessibilityAction={(event) => onNudge(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
        accessibilityLabel={`拖动 ${item.label}`}
        hitSlop={8}
        style={[styles.handle, active && styles.handleActive]}
      >
        <View style={[styles.handleLine, active && { backgroundColor: theme.colors.primary }]} />
        <View style={[styles.handleLine, active && { backgroundColor: theme.colors.primary }]} />
      </View></GestureDetector>}
    </Animated.View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrapper: { flex: 1 },
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
    groupTitleActive: { color: theme.colors.primary },
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
    tapArea: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowText: { flex: 1, gap: 3 },
    rowLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.textPrimary },
    rowSubtitle: { fontSize: 11, color: theme.colors.textSecondary },
    handle: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: theme.radius.small,
      backgroundColor: theme.colors.surfaceMuted,
    },
    handleActive: { backgroundColor: theme.colors.surface },
    handleLine: { width: 20, height: 2, borderRadius: 1, backgroundColor: theme.colors.textMuted },
  });
}
