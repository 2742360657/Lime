/** 0 means a free-recording habit; positive integers are period goals. */
export const MAX_HABIT_TARGET = 9999;

export function isValidHabitTarget(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_HABIT_TARGET;
}

export function parseHabitTarget(enabled: boolean, text: string): number | null {
  if (!enabled) return 0;
  const value = text.trim();
  if (!/^[1-9]\d{0,3}$/.test(value)) return null;
  const target = Number(value);
  return target <= MAX_HABIT_TARGET ? target : null;
}

/** Preserve explicit free recording while retaining the old default for legacy data. */
export function normalizeHabitTarget(value: unknown): number {
  if (value === 0) return 0;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : 1;
}
