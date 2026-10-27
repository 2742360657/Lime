import type { ReactNode } from 'react';
import { FlatList, type StyleProp, type ViewStyle } from 'react-native';

export type VirtualRow = { key: string; render: () => ReactNode };

/** Flat rows keep large date/category groups virtualized too. Do not put another vertical list inside a row. */
export function VirtualList({ rows, contentStyle, onScrollY, empty }: {
  rows: VirtualRow[];
  contentStyle?: StyleProp<ViewStyle>;
  onScrollY?: (y: number) => void;
  empty?: ReactNode;
}) {
  return <FlatList
    style={{ flex: 1 }}
    data={rows}
    keyExtractor={row => row.key}
    renderItem={({ item }) => <>{item.render()}</>}
    ListEmptyComponent={empty ? <>{empty}</> : null}
    contentContainerStyle={[{ gap: 8 }, contentStyle]}
    initialNumToRender={12}
    maxToRenderPerBatch={10}
    windowSize={7}
    removeClippedSubviews={false}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
    onScroll={event => onScrollY?.(event.nativeEvent.contentOffset.y)}
    scrollEventThrottle={16}
  />;
}
