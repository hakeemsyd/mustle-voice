import { ReactNode, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import { localDateKey } from "../lib/calendarDate";
import { ChevronRightIcon } from "../icons";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export interface MonthGridDayInfo {
  key: string;
  date: number;
  inMonth: boolean;
  isToday: boolean;
}

interface MonthGridProps {
  monthDate: Date;
  onMonthChange: (next: Date) => void;
  onSelectDay: (key: string) => void;
  dayCellStyle?: (info: MonthGridDayInfo) => object | undefined;
  renderMarker?: (info: MonthGridDayInfo) => ReactNode;
}

function buildMonthGrid(monthDate: Date): MonthGridDayInfo[] {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const firstDay = new Date(y, m, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayKey = localDateKey(new Date());

  const cells: MonthGridDayInfo[] = [];
  const prevMonthDays = new Date(y, m, 0).getDate();
  for (let i = 0; i < startOffset; i++) {
    const d = prevMonthDays - startOffset + i + 1;
    cells.push({ date: d, key: localDateKey(new Date(y, m - 1, d)), inMonth: false, isToday: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = localDateKey(new Date(y, m, d));
    cells.push({ date: d, key, inMonth: true, isToday: key === todayKey });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const nextDate = new Date(`${last.key}T00:00:00`);
    nextDate.setDate(nextDate.getDate() + 1);
    cells.push({ date: nextDate.getDate(), key: localDateKey(nextDate), inMonth: false, isToday: false });
  }
  return cells;
}

export function MonthGrid({ monthDate, onMonthChange, onSelectDay, dayCellStyle, renderMarker }: MonthGridProps) {
  const grid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);
  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const rows: MonthGridDayInfo[][] = [];
  for (let i = 0; i < grid.length; i += 7) rows.push(grid.slice(i, i + 7));

  return (
    <View style={styles.wrap}>
      <View style={styles.monthBar}>
        <Pressable
          style={styles.navBtn}
          onPress={() => onMonthChange(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
        >
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <ChevronRightIcon size={15} color={colors.muted} />
          </View>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable
          style={styles.navBtn}
          onPress={() => onMonthChange(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
        >
          <ChevronRightIcon size={15} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekdayCell}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {rows.map((row, i) => (
          <View key={i} style={styles.gridRow}>
            {row.map((cell) => (
              <Pressable
                key={cell.key}
                disabled={!cell.inMonth}
                style={[styles.dayCell, cell.isToday && styles.dayCellToday, cell.inMonth ? dayCellStyle?.(cell) : undefined]}
                onPress={() => onSelectDay(cell.key)}
              >
                <Text style={[styles.dayCellNum, !cell.inMonth && styles.dayCellNumOutside, cell.isToday && styles.dayCellNumToday]}>
                  {cell.date}
                </Text>
                {cell.inMonth && renderMarker?.(cell)}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingHorizontal: 2,
    paddingBottom: 14,
  },
  navBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  weekdayRow: { flexDirection: "row", marginBottom: 4 },
  weekdayCell: {
    flex: 1,
    textAlign: "center",
    fontFamily: fonts.bodySemiBold,
    fontSize: 10.5,
    color: colors.muted,
    paddingVertical: 4,
  },
  grid: { gap: 4 },
  gridRow: { flexDirection: "row", gap: 4 },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayCellToday: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  dayCellNum: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text },
  dayCellNumOutside: { color: colors.muted, opacity: 0.35 },
  dayCellNumToday: { color: colors.accent, fontFamily: fonts.bodyBold },
});
