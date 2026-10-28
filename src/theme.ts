type SurfaceTone = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  controlBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
};

const neutral: SurfaceTone = {
  background: '#F5F6F7', surface: '#FFFFFF', surfaceMuted: '#ECEEF0',
  border: '#DDE1E5', controlBorder: '#7A8087',
  textPrimary: '#252A30', textSecondary: '#565E66', textMuted: '#626A72',
};
const warm: SurfaceTone = {
  background: '#F5F3EF', surface: '#FFFDF9', surfaceMuted: '#ECE9E3',
  border: '#DEDAD2', controlBorder: '#807B72',
  textPrimary: '#2C2925', textSecondary: '#625B53', textMuted: '#6B645B',
};
const quiet: SurfaceTone = {
  background: '#F3F5F3', surface: '#FDFEFC', surfaceMuted: '#E9EDE9',
  border: '#D9DFD9', controlBorder: '#778078',
  textPrimary: '#272D29', textSecondary: '#576159', textMuted: '#626C64',
};

/** Mix related roles, never use the selected fill as a universal text/selection color. */
function blend(a: string, b: string, weight: number) {
  const channels = [1, 3, 5].map(offset => Math.round(
    parseInt(a.slice(offset, offset + 2), 16) * (1 - weight) +
    parseInt(b.slice(offset, offset + 2), 16) * weight));
  return '#' + channels.map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function preset<Id extends string>(id: Id, label: string, description: string,
  primary: string, primarySoft: string, tone: SurfaceTone = neutral) {
  return { id, label, description, colors: {
    ...tone, primary, primarySoft,
    primaryText: blend(primary, tone.textPrimary, .24),
    onPrimary: '#FFFFFF',
    selection: blend(tone.surface, primary, .22),
    danger: '#A84147', dangerSoft: '#FAEDEF',
  } };
}

export const THEME_PRESETS = {
  forest: preset('forest', '松绿', '柔和纸白 · 沉静绿', '#536F60', '#E8EEE9', quiet),
  ocean: preset('ocean', '海蓝', '冷调浅灰 · 雾蓝', '#4F6D86', '#E8EDF3'),
  amber: preset('amber', '暖棕', '暖纸底色 · 木棕', '#826648', '#F0EAE0', warm),
  rose: preset('rose', '柔粉', '中性浅灰 · 灰玫瑰', '#936372', '#F3EBEE'),
  mint: preset('mint', '薄荷', '清透纸白 · 青瓷', '#3F746F', '#E4EFEC'),
  slate: preset('slate', '石墨', '冷调浅灰 · 岩蓝', '#526477', '#E8ECF0'),
  graphite: preset('graphite', '玄墨', '中性浅灰 · 深石墨', '#343D47', '#E6E9ED'),
  iris: preset('iris', '鸢紫', '中性浅灰 · 灰紫', '#6B5C85', '#ECE8F1'),
  clay: preset('clay', '陶土', '暖纸底色 · 赭石', '#9A6049', '#F3EAE4', warm),
  olive: preset('olive', '橄榄', '暖纸底色 · 苔绿', '#677047', '#ECEEE2', warm),
} as const;

export type ThemeId = keyof typeof THEME_PRESETS;
type ThemePreset = (typeof THEME_PRESETS)[ThemeId];
export type AppTheme = Omit<ThemePreset, 'colors'> & {
  colors: ThemePreset['colors'] & { scrim: string };
  radius: { large: number; medium: number; small: number; pill: number };
  shadow: {
    shadowColor: string; shadowOpacity: number; shadowRadius: number;
    shadowOffset: { width: number; height: number }; elevation: number;
  };
};

export const DEFAULT_THEME_ID: ThemeId = 'forest';

/** A restrained shape scale; circles are reserved for semantic controls, not all actions. */
export function getTheme(themeId: ThemeId): AppTheme {
  const choice = Object.prototype.hasOwnProperty.call(THEME_PRESETS, themeId)
    ? THEME_PRESETS[themeId] : THEME_PRESETS[DEFAULT_THEME_ID];
  return {
    ...choice,
    radius: { large: 14, medium: 10, small: 6, pill: 999 },
    colors: { ...choice.colors, scrim: choice.colors.textPrimary + '45' },
    shadow: { shadowColor: choice.colors.textPrimary, shadowOpacity: .06,
      shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  };
}
