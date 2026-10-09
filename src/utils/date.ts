const pad = (value: number) => String(value).padStart(2, '0');

const ENGLISH_MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const CHINESE_DIGITS: Record<string, string> = {
  零: '0',
  〇: '0',
  一: '1',
  二: '2',
  两: '2',
  兩: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
};

function normalizeNumericText(value: string) {
  return value
    .replace(/[０-９]/g, (character) => String(character.charCodeAt(0) - 0xff10))
    .replace(/[零〇一二两兩三四五六七八九十]+/g, (token) => {
      if (!token.includes('十')) {
        return [...token].map((character) => CHINESE_DIGITS[character]).join('');
      }
      const [before, after] = token.split('十');
      const tens = before ? Number([...before].map((character) => CHINESE_DIGITS[character]).join('')) : 1;
      const ones = after ? Number([...after].map((character) => CHINESE_DIGITS[character]).join('')) : 0;
      return String(tens * 10 + ones);
    });
}

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export function toLocalDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toMonthKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

export function formatMonthLabel(year: number, monthIndex: number) {
  return `${year}年${monthIndex + 1}月`;
}

export function formatYearLabel(year: number) {
  return `${year}年`;
}

export function getTodayKey() {
  return toLocalDateKey(Date.now());
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return toLocalDateKey(new Date(year, month - 1, day + days, 12, 0, 0, 0).getTime());
}

export function isValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function buildDateKey(year: number, month: number, day: number) {
  const dateKey = `${year}-${pad(month)}-${pad(day)}`;
  return isValidDateKey(dateKey) ? dateKey : null;
}

/**
 * Accepts common Chinese and English date shorthand and returns YYYY-MM-DD.
 * A date without a year intentionally uses the current year.
 */
export function parseFlexibleDateInput(input: string, referenceDate = new Date()) {
  const raw = normalizeNumericText(input).trim().toLowerCase().replace(/[，,]/g, ' ');
  if (!raw) {
    return null;
  }

  const referenceKey = toLocalDateKey(referenceDate.getTime());
  if (raw === '今天' || raw === '今日' || raw === 'today') {
    return referenceKey;
  }
  if (raw === '明天' || raw === 'tomorrow') {
    return addDaysToDateKey(referenceKey, 1);
  }
  if (raw === '后天' || raw === '後天' || raw === 'day after tomorrow') {
    return addDaysToDateKey(referenceKey, 2);
  }
  if (raw === '大后天' || raw === '大後天') {
    return addDaysToDateKey(referenceKey, 3);
  }

  const relativeMatch = raw.match(/^\+\s*(\d{1,3})(?:\s*(?:天|days?))?$/);
  if (relativeMatch) {
    return addDaysToDateKey(referenceKey, Number(relativeMatch[1]));
  }

  const englishMonthFirst = raw.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{2,4}))?$/);
  if (englishMonthFirst && ENGLISH_MONTHS[englishMonthFirst[1]]) {
    const year = englishMonthFirst[3]
      ? normalizeInputYear(Number(englishMonthFirst[3]))
      : referenceDate.getFullYear();
    return buildDateKey(year, ENGLISH_MONTHS[englishMonthFirst[1]], Number(englishMonthFirst[2]));
  }

  const englishDayFirst = raw.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{2,4}))?$/);
  if (englishDayFirst && ENGLISH_MONTHS[englishDayFirst[2]]) {
    const year = englishDayFirst[3]
      ? normalizeInputYear(Number(englishDayFirst[3]))
      : referenceDate.getFullYear();
    return buildDateKey(year, ENGLISH_MONTHS[englishDayFirst[2]], Number(englishDayFirst[1]));
  }

  const compact = raw.replace(/\s/g, '');
  if (/^\d{8}$/.test(compact)) {
    return buildDateKey(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)), Number(compact.slice(6, 8)));
  }
  if (/^\d{4}$/.test(compact)) {
    return buildDateKey(referenceDate.getFullYear(), Number(compact.slice(0, 2)), Number(compact.slice(2, 4)));
  }

  const normalized = raw
    .replace(/[年\.\/]/g, '-')
    .replace(/[月]/g, '-')
    .replace(/[日号號]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const parts = normalized.split('-').filter(Boolean);

  if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) {
    return buildDateKey(referenceDate.getFullYear(), Number(parts[0]), Number(parts[1]));
  }
  if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    if (parts[0].length >= 2 && Number(parts[0]) > 31) {
      return buildDateKey(normalizeInputYear(Number(parts[0])), Number(parts[1]), Number(parts[2]));
    }
    if (parts[2].length >= 2 && Number(parts[2]) > 31) {
      return buildDateKey(normalizeInputYear(Number(parts[2])), Number(parts[0]), Number(parts[1]));
    }
  }

  return null;
}

function normalizeInputYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

/** Accepts 8, 8:30, 830, 下午3点, 3pm, now/现在 and similar forms. */
export function parseFlexibleTimeInput(input: string, referenceDate = new Date()) {
  let raw = normalizeNumericText(input)
    .trim()
    .toLowerCase()
    .replace(/([ap])\s*\.?\s*m\.?/g, '$1m')
    .replace(/：/g, ':');
  if (!raw) {
    return null;
  }
  if (raw === '现在' || raw === '現在' || raw === 'now') {
    return `${pad(referenceDate.getHours())}:${pad(referenceDate.getMinutes())}`;
  }
  if (raw === '中午' || raw === 'noon') {
    return '12:00';
  }
  if (raw === '午夜' || raw === 'midnight') {
    return '00:00';
  }

  let period: 'am' | 'pm' | null = null;
  if (/(下午|晚上|傍晚|pm)/.test(raw)) {
    period = 'pm';
  } else if (/(凌晨|早上|早晨|上午|am)/.test(raw)) {
    period = 'am';
  } else if (/中午/.test(raw)) {
    period = 'pm';
  }

  const hasHalf = /半/.test(raw);
  raw = raw
    .replace(/(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|am|pm)/g, '')
    .replace(/[点點时時]半/g, ':30')
    .replace(/[点點时時]/g, ':')
    .replace(/[分]/g, '')
    .replace(/半/g, '30')
    .trim();

  let hour: number;
  let minute: number;
  const separated = raw.match(/^(\d{1,2})(?:\s*[:\.\s]\s*(\d{1,2}))?:?$/);
  if (separated) {
    hour = Number(separated[1]);
    minute = separated[2] === undefined ? (hasHalf ? 30 : 0) : Number(separated[2]);
  } else if (/^\d{3,4}$/.test(raw)) {
    hour = Number(raw.slice(0, -2));
    minute = Number(raw.slice(-2));
  } else {
    return null;
  }

  if (period) {
    if (hour < 1 || hour > 12) {
      return null;
    }
    if (period === 'pm' && hour < 12) {
      hour += 12;
    } else if (period === 'am' && hour === 12) {
      hour = 0;
    }
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${pad(hour)}:${pad(minute)}`;
}

export function formatFriendlyDate(dateKey: string) {
  const todayKey = getTodayKey();
  if (dateKey === todayKey) {
    return '今天';
  }
  if (dateKey === addDaysToDateKey(todayKey, 1)) {
    return '明天';
  }
  const [, month, day] = dateKey.split('-').map(Number);
  return `${month}月${day}日`;
}

export function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function getMonthStartWeekday(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).getDay();
}

export function compareDateKeys(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function isFutureDateKey(dateKey: string) {
  return compareDateKeys(dateKey, getTodayKey()) > 0;
}

export function getHourMinuteFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return {
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

export function buildTimestampForDateTime(dateKey: string, hour: number, minute: number) {
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    next.getFullYear() !== year ||
    next.getMonth() !== month - 1 ||
    next.getDate() !== day
  ) {
    return null;
  }

  return next.getTime();
}

export function buildFallbackTimestamp(dateKey: string) {
  return buildTimestampForDateTime(dateKey, 12, 0) ?? Date.now();
}

export function clampToMinute(timestamp: number) {
  const date = new Date(timestamp);
  date.setSeconds(0, 0);
  return date.getTime();
}
