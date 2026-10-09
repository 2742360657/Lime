export const THEME_PRESETS = {
  forest: {
    id: 'forest',
    label: '松绿',
    colors: {
      background: '#F4F7F3',
      surface: '#FFFFFF',
      surfaceMuted: '#EAF0E8',
      border: '#D9E3D7',
      primary: '#2E7D5A',
      primarySoft: '#DCEFE5',
      danger: '#B84545',
      dangerSoft: '#F8E6E6',
      textPrimary: '#18231C',
      textSecondary: '#5A6A60',
      textMuted: '#839087',
      white: '#FFFFFF',
    },
  },
  ocean: {
    id: 'ocean',
    label: '海蓝',
    colors: {
      background: '#F3F7FA',
      surface: '#FFFFFF',
      surfaceMuted: '#E7F0F7',
      border: '#D7E2EB',
      primary: '#2E6F9E',
      primarySoft: '#DDECF8',
      danger: '#B84545',
      dangerSoft: '#F8E6E6',
      textPrimary: '#182331',
      textSecondary: '#587086',
      textMuted: '#8393A1',
      white: '#FFFFFF',
    },
  },
  amber: {
    id: 'amber',
    label: '暖棕',
    colors: {
      background: '#FAF6F0',
      surface: '#FFFFFF',
      surfaceMuted: '#F6EEDF',
      border: '#E7DAC3',
      primary: '#AF6A2A',
      primarySoft: '#F6E9D6',
      danger: '#B84545',
      dangerSoft: '#F8E6E6',
      textPrimary: '#2A2117',
      textSecondary: '#7A6247',
      textMuted: '#9B876E',
      white: '#FFFFFF',
    },
  },
  rose: {
    id: 'rose',
    label: '柔粉',
    colors: {
      background: '#FBF4F7',
      surface: '#FFFFFF',
      surfaceMuted: '#F7E7EE',
      border: '#EACFDC',
      primary: '#C06A8D',
      primarySoft: '#F8E3EC',
      danger: '#B84545',
      dangerSoft: '#F8E6E6',
      textPrimary: '#2A1B22',
      textSecondary: '#7D5C6A',
      textMuted: '#A08490',
      white: '#FFFFFF',
    },
  },
  mint: {
    id: 'mint',
    label: '薄荷',
    colors: {
      background: '#F2F8F6',
      surface: '#FFFFFF',
      surfaceMuted: '#E3F1ED',
      border: '#CEE4DC',
      primary: '#2C8A73',
      primarySoft: '#D7F0E8',
      danger: '#B84545',
      dangerSoft: '#F8E6E6',
      textPrimary: '#16231E',
      textSecondary: '#5A756C',
      textMuted: '#83958F',
      white: '#FFFFFF',
    },
  },
  slate: {
    id: 'slate',
    label: '石墨',
    colors: {
      background: '#F3F4F6',
      surface: '#FFFFFF',
      surfaceMuted: '#E7EAF0',
      border: '#D8DDE6',
      primary: '#4B6078',
      primarySoft: '#E3EAF3',
      danger: '#B84545',
      dangerSoft: '#F8E6E6',
      textPrimary: '#1C232B',
      textSecondary: '#667281',
      textMuted: '#8B97A5',
      white: '#FFFFFF',
    },
  },
} as const;

export type ThemeId = keyof typeof THEME_PRESETS;
export type AppTheme = (typeof THEME_PRESETS)[ThemeId] & {
  radius: {
    large: number;
    medium: number;
    small: number;
    pill: number;
  };
  shadow: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
};

export const DEFAULT_THEME_ID: ThemeId = 'forest';

const SHARED_THEME_TOKENS = {
  radius: {
    large: 24,
    medium: 18,
    small: 12,
    pill: 999,
  },
  shadow: {
    shadowColor: '#1F2E25',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;

export function getTheme(themeId: ThemeId): AppTheme {
  const preset = THEME_PRESETS[themeId] ?? THEME_PRESETS[DEFAULT_THEME_ID];
  return {
    ...preset,
    ...SHARED_THEME_TOKENS,
  };
}
