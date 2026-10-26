import { View } from 'react-native';

export type IconName = 'today' | 'tasks' | 'habits' | 'memos' | 'settings' | 'menu' | 'more';

/** Small, consistently sized line icons, independent of the device's symbol font. */
export function AppIcon({ name, color }: { name: IconName; color: string }) {
  const line = (left: number, top: number, width: number, rotate = '0deg') => (
    <View style={{ position: 'absolute', left, top, width, height: 2, borderRadius: 1, backgroundColor: color, transform: [{ rotate }] }} />
  );
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: 24, height: 24 }}>
      {name === 'today' && <>
        <View style={{ position: 'absolute', left: 3, top: 5, width: 18, height: 17, borderRadius: 4, borderWidth: 2, borderColor: color }} />
        {line(4, 10, 16)}{line(7, 2, 6, '90deg')}{line(13, 2, 6, '90deg')}
        <View style={{ position: 'absolute', left: 8, top: 14, width: 4, height: 4, borderRadius: 1, backgroundColor: color }} />
      </>}
      {name === 'tasks' && <>
        {line(2, 5, 4, '45deg')}{line(4, 4, 7, '-45deg')}{line(13, 5, 9)}
        {line(2, 15, 4, '45deg')}{line(4, 14, 7, '-45deg')}{line(13, 15, 9)}
      </>}
      {name === 'habits' && <>
        <View style={{ position: 'absolute', left: 2, top: 2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color }} />
        {line(9, 8, 7, '90deg')}{line(11, 13, 6, '25deg')}
      </>}
      {name === 'memos' && <>
        <View style={{ position: 'absolute', left: 4, top: 2, width: 16, height: 20, borderRadius: 3, borderWidth: 2, borderColor: color }} />
        {line(8, 7, 8)}{line(8, 12, 8)}{line(8, 17, 5)}
      </>}
      {name === 'settings' && <>
        <View style={{ position: 'absolute', left: 5, top: 5, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: color }} />
        <View style={{ position: 'absolute', left: 10, top: 10, width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
        {[0, 45, 90, 135].map((angle) => <View key={angle} style={{ position: 'absolute', left: 11, top: 1, width: 2, height: 22, transform: [{ rotate: `${angle}deg` }] }}>
          <View style={{ height: 4, borderRadius: 1, backgroundColor: color }} /><View style={{ marginTop: 14, height: 4, borderRadius: 1, backgroundColor: color }} />
        </View>)}
      </>}
      {name === 'menu' && <>{line(3, 5, 18)}{line(3, 11, 13)}{line(3, 17, 8)}</>}
      {name === 'more' && [4, 11, 18].map((left) => <View key={left} style={{ position: 'absolute', left, top: 10, width: 3, height: 3, borderRadius: 2, backgroundColor: color }} />)}
    </View>
  );
}
