import { useMemo } from 'react';
import { PixelRatio, Text, View, useWindowDimensions } from 'react-native';
import qrcode from 'qrcode-generator';

// Matrix generation stays in the mature encoder; only black runs are drawn here.
export function QrCode({ value }: { value: string }) {
  const { width } = useWindowDimensions();
  const matrix = useMemo(() => {
    try {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      const qr = qrcode(0, 'M'); qr.addData(value); qr.make();
      const size = qr.getModuleCount();
      const rows = Array.from({ length: size }, (_, row) => {
        const runs: { start: number; length: number }[] = [];
        for (let col = 0; col < size; col++) if (qr.isDark(row, col)) {
          const start = col; while (col + 1 < size && qr.isDark(row, col + 1)) col++;
          runs.push({ start, length: col - start + 1 });
        }
        return runs;
      });
      return { size, rows };
    } catch { return null; }
  }, [value]);
  if (!matrix) return <Text style={{ color: '#222' }}>二维码生成失败，请重新获取。</Text>;
  const ratio = PixelRatio.get(), unit = Math.max(1, Math.floor(Math.min(width - 48, 288) * ratio / (matrix.size + 8))) / ratio;
  return <View accessible accessibilityLabel="微信绑定二维码" style={{ alignSelf: 'center', width: (matrix.size + 8) * unit, height: (matrix.size + 8) * unit, padding: unit * 4, backgroundColor: '#fff' }}>
    {matrix.rows.map((runs, row) => <View key={row} style={{ height: unit, width: matrix.size * unit }}>{runs.map(run => <View key={run.start} style={{ position: 'absolute', left: run.start * unit, width: run.length * unit, height: unit, backgroundColor: '#000' }} />)}</View>)}
  </View>;
}
