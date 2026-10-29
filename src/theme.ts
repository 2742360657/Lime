/** Original pairs are retained verbatim; operational roles are derived for readable UI. */
function blend(a: string, b: string, weight: number) {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - weight) +
    parseInt(b.slice(i, i + 2), 16) * weight).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function luminance(hex: string) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
}
function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function readable(color: string, surfaces: string[], dark: boolean, minimum = 4.5) {
  const end = dark ? '#FFFFFF' : '#17131C';
  for (let step = 0; step <= 100; step++) {
    const candidate = blend(color, end, step / 100);
    if (surfaces.every(surface => contrast(candidate, surface) >= minimum)) return candidate;
  }
  return end;
}
function preset<Id extends string>(id: Id, label: string, pair: readonly [string, string],
  background: string, accent: string, supporting: string, dark = false) {
  const surface = blend(background, '#FFFFFF', dark ? .045 : .55);
  const surfaceMuted = blend(surface, supporting, dark ? .12 : .14);
  const softSource = luminance(supporting) > .55 ? supporting : accent;
  const primarySoft = !dark && luminance(softSource) > .55 ? softSource : blend(surface, accent, dark ? .15 : .16);
  const surfaces = [background, surface, surfaceMuted, primarySoft];
  const primary = readable(accent, surfaces, dark);
  const textPrimary = dark ? '#F5F0F8' : '#27232B';
  const textSecondary = readable(blend(textPrimary, background, .36), surfaces, dark);
  const textMuted = readable(blend(textPrimary, background, .44), surfaces, dark);
  const selection = blend(surface, accent, .24);
  return { id, label, pair, dark, description: dark ? '深色搭配' : '浅色搭配', colors: {
    background, surface, surfaceMuted, primary, primarySoft, primaryText: primary,
    onPrimary: contrast(primary, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#17131C',
    textPrimary, textSecondary, textMuted, selection,
    border: blend(surface, textPrimary, .15),
    controlBorder: readable(blend(surface, textPrimary, .5), surfaces, dark, 3),
    danger: dark ? '#FFB4AB' : '#A33B45', dangerSoft: dark ? '#3D252A' : '#FAEDEF',
    scrim: dark ? '#00000099' : '#17131C55',
  } };
}

// Existing IDs deliberately remain valid for installed settings and historical backups.
export const THEME_PRESETS = {
  rose: preset('rose', '桃粉 / 奶白', ['#FFC2CB', '#FFF5E8'], '#FFF5E8', '#FFC2CB', '#FFC2CB'),
  graphite: preset('graphite', '墨黑 / 星紫', ['#0B0C10', '#A855F7'], '#0B0C10', '#A855F7', '#A855F7', true),
  amber: preset('amber', '焦糖棕 / 奶咖白', ['#8C5A42', '#F5F1E9'], '#F5F1E9', '#8C5A42', '#8C5A42'),
  sakura: preset('sakura', '樱花粉 / 纯白', ['#FB7299', '#FFFFFF'], '#FFFFFF', '#FB7299', '#FB7299'),
  forest: preset('forest', '暖白 / 青果绿', ['#F2F0EB', '#8CB369'], '#F2F0EB', '#8CB369', '#8CB369'),
  ocean: preset('ocean', '奶白 / 深海蓝', ['#F5F1E9', '#0018A8'], '#F5F1E9', '#0018A8', '#0018A8'),
  iris: preset('iris', '薰衣草紫 / 奶油黄', ['#B5A3D0', '#F5E6A3'], '#F5E6A3', '#B5A3D0', '#B5A3D0'),
  mint: preset('mint', '薄荷绿 / 暖陶土', ['#3EA88D', '#C46B4E'], '#EDF6F2', '#3EA88D', '#C46B4E'),
  olive: preset('olive', '酒红 / 卡其', ['#722F37', '#C3B091'], '#C3B091', '#722F37', '#C3B091'),
  lemon: preset('lemon', '亮柠黄 / 雾感紫灰', ['#FFC700', '#8A7E97'], '#F7F4FA', '#8A7E97', '#FFC700'),
  aubergine: preset('aubergine', '嫩黄 / 茄紫', ['#FFF380', '#7B2CBF'], '#FFFBE6', '#7B2CBF', '#FFF380'),
  slate: preset('slate', '雾灰 / 橘粉', ['#E0E0E0', '#FF8C94'], '#E0E0E0', '#FF8C94', '#E0E0E0'),
  clay: preset('clay', '铜金 / 黛蓝', ['#B87333', '#123456'], '#123456', '#B87333', '#B87333', true),
} as const;

export type ThemeId = keyof typeof THEME_PRESETS;
type ThemePreset = (typeof THEME_PRESETS)[ThemeId];
export type AppTheme = ThemePreset & {
  radius: { large: number; medium: number; small: number; action: number; pill: number };
  shadow: { shadowColor: string; shadowOpacity: number; shadowRadius: number;
    shadowOffset: { width: number; height: number }; elevation: number };
};
export const DEFAULT_THEME_ID: ThemeId = 'forest';
export function getTheme(themeId: ThemeId): AppTheme {
  const choice = Object.prototype.hasOwnProperty.call(THEME_PRESETS, themeId)
    ? THEME_PRESETS[themeId] : THEME_PRESETS[DEFAULT_THEME_ID];
  return { ...choice, radius: { large: 20, medium: 16, small: 12, action: 16, pill: 999 },
    shadow: { shadowColor: '#000000', shadowOpacity: .1, shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 }, elevation: 2 } };
}
