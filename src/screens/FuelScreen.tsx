import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFuelData } from "../hooks/useFuelData";
import { colors, fonts } from "../constants/theme";
import { AppleIcon, XIcon } from "../icons";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function FuelScreen() {
  const { loading, macros, entries, deleteEntry } = useFuelData();

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <AppleIcon size={18} color={colors.accent} />
        <Text style={styles.headerTitle}>FUEL</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>TODAY'S NUTRITION</Text>
          {!macros ? (
            <Text style={styles.emptyText}>No nutrition targets yet — tell your coach your goal to get started.</Text>
          ) : (
            <View style={styles.macroCard}>
              {macros.map((m) => {
                const pct = m.goal > 0 ? Math.min(Math.round((m.current / m.goal) * 100), 100) : 0;
                const remaining = m.goal - m.current;
                return (
                  <View key={m.key} style={styles.macroRow}>
                    <View style={styles.macroRowTop}>
                      <View style={[styles.macroRowDot, { backgroundColor: m.color }]} />
                      <Text style={styles.macroRowLabel}>{m.label}</Text>
                      <View style={styles.macroRowValues}>
                        <Text style={[styles.macroRowCurrent, { color: m.color }]}>{m.current}</Text>
                        <Text style={styles.macroRowSep}>/</Text>
                        <Text style={styles.macroRowGoal}>
                          {m.goal}
                          {m.unit}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.macroRowBar}>
                      <View style={[styles.macroRowFill, { width: `${pct}%`, backgroundColor: m.color }]} />
                    </View>
                    <Text style={styles.macroRowRemaining}>
                      {remaining}
                      {m.unit} remaining
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionLabel}>TODAY'S LOG</Text>
          {entries.length === 0 ? (
            <Text style={styles.emptyText}>Nothing logged yet — tell your coach what you ate.</Text>
          ) : (
            <View style={styles.logList}>
              {entries.map((entry) => (
                <View key={entry.id} style={styles.logRow}>
                  <View style={styles.logRowMain}>
                    <Text style={styles.logDescription}>{entry.description}</Text>
                    <Text style={styles.logMeta}>
                      {formatTime(entry.at)} · {entry.calories} kcal · {entry.proteinG}p / {entry.carbsG}c / {entry.fatG}f
                    </Text>
                  </View>
                  <Pressable style={styles.logDeleteBtn} onPress={() => deleteEntry(entry.id)} hitSlop={8}>
                    <XIcon size={13} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, height: 48 },
  headerTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, letterSpacing: 1.4, color: colors.text },
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  sectionLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.muted,
    marginTop: 16,
    marginBottom: 10,
  },
  emptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 18 },

  macroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    gap: 16,
  },
  macroRow: { gap: 6 },
  macroRowTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  macroRowDot: { width: 7, height: 7, borderRadius: 3.5 },
  macroRowLabel: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: "rgba(255,255,255,0.7)" },
  macroRowValues: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  macroRowCurrent: { fontFamily: fonts.display, fontSize: 19 },
  macroRowSep: { fontFamily: fonts.body, fontSize: 11, color: "rgba(255,255,255,0.22)" },
  macroRowGoal: { fontFamily: fonts.bodyMedium, fontSize: 12, color: "rgba(255,255,255,0.35)" },
  macroRowBar: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  macroRowFill: { height: "100%", borderRadius: 2 },
  macroRowRemaining: { fontFamily: fonts.body, fontSize: 10.5, color: "rgba(255,255,255,0.28)" },

  logList: { gap: 8 },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  logRowMain: { flex: 1, gap: 3 },
  logDescription: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  logMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  logDeleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
  },
});
