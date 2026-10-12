import { DEFAULT_THEME_ID, THEME_PRESETS, type ThemeId } from '../theme';
import type { AppSettings } from '../types/habit';
import type { DomainTransaction } from '../domain/types';

export const DEFAULT_PROFILE_NAME = '酸橙用户';
export const DEFAULT_PROFILE_SIGNATURE = '';

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in THEME_PRESETS;
}

function sanitizeSettings(candidate: unknown): AppSettings {
  const raw = candidate && typeof candidate === 'object' ? (candidate as Partial<AppSettings>) : {};

  const collapsedTodoBuckets = Array.isArray(raw.collapsedTodoBuckets)
    ? [...new Set(raw.collapsedTodoBuckets.filter((id): id is string => typeof id === 'string'))]
    : [];

  return {
    collapsedTodoBuckets,
    themeId: isThemeId(raw.themeId) ? raw.themeId : DEFAULT_THEME_ID,
    profileName:
      typeof raw.profileName === 'string' && raw.profileName.trim()
        ? raw.profileName.trim()
        : DEFAULT_PROFILE_NAME,
    profileSignature:
      typeof raw.profileSignature === 'string'
        ? raw.profileSignature.trim()
        : DEFAULT_PROFILE_SIGNATURE,
    avatarUri: typeof raw.avatarUri === 'string' && raw.avatarUri ? raw.avatarUri : null,
  };
}


// SQLite is the only authority. Appearance settings are separate from business records.
export async function readAppSettings(tx: Pick<DomainTransaction, 'getOptional'>): Promise<AppSettings> {
  const row = await tx.getOptional<{value:string}>("SELECT value FROM local_meta WHERE id='app-settings'");
  return sanitizeSettings(row ? JSON.parse(row.value) : null);
}
export async function writeAppSettings(tx: Pick<DomainTransaction, 'execute'>, settings: AppSettings) {
  await tx.execute("INSERT OR REPLACE INTO local_meta(id,value) VALUES('app-settings',?)", [JSON.stringify(settings)]);
}
