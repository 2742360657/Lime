import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useHabits } from '../state/HabitStore';
import { getDaysInMonth, getMonthStartWeekday, WEEKDAY_LABELS } from '../utils/date';

type HistoryCalendarProps = {
  year: number;
  monthIndex: number;
  dateCountMap: Record<string, number>;
  compact?: boolean;
  selectedDateKey?: string | null;
  canPressDay?: (dateKey: string) => boolean;
  onPressDay?: (dateKey: string) => void;
};

type CalendarCell = {
  key: string;
  day: number | null;
  count: number;
};

function createCalendarCells(
  year: number,
  monthIndex: number,
  dateCountMap: Record<string, number>
): CalendarCell[] {
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const monthStartWeekday = getMonthStartWeekday(year, monthIndex);
  const cells: CalendarCell[] = [];

  for (let blank = 0; blank < monthStartWeekday; blank += 1) {
    cells.push({ key: `blank-${blank}`, day: null, count: 0 });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({
      key,
      day,
      count: dateCountMap[key] ?? 0,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `tail-${cells.length}`, day: null, count: 0 });
  }

  return cells;
}

export function HistoryCalendar({
  year,
  monthIndex,
  dateCountMap,
  compact = false,
  selectedDateKey = null,
  canPressDay,
  onPressDay,
}: HistoryCalendarProps) {
  const { theme } = useHabits();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cells = createCalendarCells(year, monthIndex, dateCountMap);

  return (
    <View style={styles.wrapper}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={[styles.weekdayLabel, compact && styles.weekdayLabelCompact]}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          if (cell.day === null) {
            return <View key={cell.key} style={[styles.cell, compact && styles.cellCompact]} />;
          }

          const isActive = cell.count > 0;
          const isSelected = selectedDateKey === cell.key;
          const isPressable = canPressDay?.(cell.key) ?? false;

          return (
            <View key={cell.key} style={[styles.cell, compact && styles.cellCompact]}>
              <TouchableOpacity
                disabled={!isPressable || !onPressDay}
                onPress={() => onPressDay?.(cell.key)}
                style={[
                  styles.dayChip,
                  compact && styles.dayChipCompact,
                  isActive && styles.activeChip,
                  isSelected && styles.selectedChip,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    compact && styles.dayTextCompact,
                    isActive && styles.activeDayText,
                    isSelected && styles.selectedText,
                  ]}
                >
                  {cell.day}
                </Text>
                <Text
                  style={[
                    styles.countText,
                    compact && styles.countTextCompact,
                    isActive && styles.activeCountText,
                    isSelected && styles.selectedText,
                  ]}
                  numberOfLines={1}
                >
                  {cell.count > 0 ? `${cell.count}次` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useHabits>['theme']) {
  return StyleSheet.create({
    wrapper: {
      gap: 10,
    },
    weekdayRow: {
      flexDirection: 'row',
      marginBottom: 2,
    },
    weekdayLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textMuted,
    },
    weekdayLabelCompact: {
      fontSize: 10,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -2,
      marginVertical: -2,
    },
    cell: {
      width: '14.2857%',
      paddingHorizontal: 2,
      paddingVertical: 2,
    },
    cellCompact: {
      paddingHorizontal: 1.5,
      paddingVertical: 1.5,
    },
    dayChip: {
      minHeight: 58,
      borderRadius: 18,
      paddingVertical: 8,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'transparent',
    },
    dayChipCompact: {
      minHeight: 42,
      borderRadius: 14,
      paddingVertical: 6,
    },
    activeChip: {
      backgroundColor: theme.colors.primarySoft,
    },
    selectedChip: {
      backgroundColor: theme.colors.primary,
    },
    dayText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    dayTextCompact: {
      fontSize: 11,
    },
    activeDayText: {
      color: theme.colors.primary,
    },
    countText: {
      minHeight: 12,
      fontSize: 10,
      color: theme.colors.textMuted,
    },
    countTextCompact: {
      minHeight: 10,
      fontSize: 8,
    },
    activeCountText: {
      color: theme.colors.primary,
      fontWeight: '700',
    },
    selectedText: {
      color: theme.colors.white,
    },
  });
}
