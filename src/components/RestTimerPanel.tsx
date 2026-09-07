import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import { PauseIcon, PlayIcon } from "../icons";

interface NextSetInfo {
  exerciseName: string;
  setNumber: number;
  detail: string;
}

interface RestTimerPanelProps {
  /** Live seconds remaining, ticking off the shared wall-clock end time in
   *  ActiveSessionContext — see useRestRemaining. Not owned locally, so the
   *  minimized ActiveWorkoutBanner can show the exact same number. */
  remaining: number;
  /** The original full duration, for the progress bar's 100% mark. */
  targetSec: number;
  paused: boolean;
  onExtend: () => void;
  onTogglePause: () => void;
  nextSet: NextSetInfo;
  onContinue: () => void;
  /** Why the target auto-adapted (short of target reps, cleared it easily, later-set fatigue)
   *  — shown so an adjusted rest target never looks like it silently changed for no reason.
   *  Null/omitted when it's just the plain default. */
  reasonLabel?: string | null;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Non-blocking, in-flow rest panel — matches the real design (mustle-mvp's
// RestTimerPanel): a countdown that does NOT auto-continue on its own, an
// explicit "Start Set N" action (tappable early, which is what replaces a
// separate "skip"), a real Pause (freezes the countdown, distinct from
// Extend), and a progress track. The countdown itself lives in
// ActiveSessionContext (wall-clock based, so a stalled JS timer self-corrects
// instead of drifting) — this component only renders it.
export function RestTimerPanel({
  remaining,
  targetSec,
  paused,
  onExtend,
  onTogglePause,
  nextSet,
  onContinue,
  reasonLabel,
}: RestTimerPanelProps) {
  const pct = targetSec > 0 ? Math.min(100, Math.max(0, ((targetSec - remaining) / targetSec) * 100)) : 0;

  return (
    <View style={styles.panel}>
      <View style={styles.topRow}>
        <View style={styles.timerBlock}>
          <Text style={[styles.label, paused && styles.labelPaused]}>{paused ? "Paused" : "Rest"}</Text>
          <Text style={styles.timer}>{formatTime(remaining)}</Text>
        </View>
        <View style={styles.controls}>
          <Pressable style={styles.extendBtn} onPress={onExtend} hitSlop={6}>
            <Text style={styles.extendText}>+10s</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={onTogglePause} hitSlop={6}>
            {paused ? <PlayIcon size={14} color={colors.text} /> : <PauseIcon size={14} color={colors.text} />}
          </Pressable>
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${pct}%` }]} />
      </View>

      {!!reasonLabel && <Text style={styles.reasonLabel}>{reasonLabel}</Text>}

      <View style={styles.nextRow}>
        <View style={styles.nextInfo}>
          <Text style={styles.nextLabel}>NEXT UP</Text>
          <Text style={styles.nextValue} numberOfLines={1}>
            {nextSet.exerciseName} · {nextSet.detail}
          </Text>
        </View>
        <Pressable style={styles.startBtn} onPress={onContinue}>
          <Text style={styles.startText}>SET {nextSet.setNumber}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    gap: 14,
    padding: 16,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    marginTop: 20,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timerBlock: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  label: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  },
  labelPaused: {
    color: "#FBBF24",
  },
  timer: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.text,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  extendBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  extendText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.text,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  reasonLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  nextInfo: {
    flex: 1,
    gap: 2,
  },
  nextLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.4)",
  },
  nextValue: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.text,
  },
  startBtn: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.text,
  },
  startText: {
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.bg,
  },
});
