import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { SwitchWorkoutSheet } from "../components/SwitchWorkoutSheet";
import { useSessionPreview } from "../hooks/useSessionPreview";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { useActiveSessionContext, type SessionTarget } from "../session/ActiveSessionContext";
import { colors, fonts } from "../constants/theme";
import { ArrowLeftIcon } from "../icons/ArrowLeftIcon";
import { SwitchIcon } from "../icons/SwitchIcon";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "PreWorkoutPreview">;

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function relativeDay(iso: string): string {
  const then = new Date(iso);
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PreWorkoutPreviewScreen({ route, navigation }: Props) {
  const { planSessionId } = route.params;
  const { loading, error, focus, exercises, lastTime } = useSessionPreview(planSessionId);
  const insets = useScreenInsets();
  const session = useActiveSessionContext();
  const [switchOpen, setSwitchOpen] = useState(false);

  const isEmpty = !loading && !error && exercises.length === 0;
  const canResume = lastTime?.status === "partial" && lastTime.exercises.length > 0;

  const startSession = (target: SessionTarget, resume = false) => {
    session.start(target, resume && lastTime ? lastTime.exercises : undefined);
    navigation.replace("ActiveSession");
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeftIcon size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>SESSION PREVIEW</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.skeletonWrap}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeletonLine} />
            ))}
          </View>
        ) : error || isEmpty ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{error ? "Couldn't load this session" : "Nothing scheduled"}</Text>
            <Text style={styles.emptySub}>
              {error ?? "No exercises found for this session yet."}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>{todayLabel()}</Text>
              <Text style={styles.title}>{focus?.toUpperCase() ?? "TRAINING"}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>EXERCISES</Text>
              <View style={styles.exerciseList}>
                {exercises.map((exercise, i) => (
                  <View key={exercise.id} style={styles.exerciseRow}>
                    <Text style={styles.exerciseIndex}>{String(i + 1).padStart(2, "0")}</Text>
                    <Text style={styles.exerciseName} numberOfLines={1}>
                      {exercise.name}
                    </Text>
                    <Text style={styles.exerciseMeta}>
                      {exercise.sets} × {exercise.repScheme}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>COACH GUIDANCE</Text>
              <View style={styles.guidanceCard}>
                <Text style={styles.guidanceText}>
                  Report each set as you go — by voice or text — and your coach tracks load and
                  pacing live. Targets here are the plan; adjust out loud if the weight feels wrong.
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{canResume ? "PICK UP WHERE YOU LEFT OFF" : "LAST TIME"}</Text>
              <View style={styles.feedbackCard}>
                {lastTime && lastTime.exercises.length > 0 ? (
                  <>
                    <Text style={styles.lastWhen}>
                      {canResume ? `Stopped ${relativeDay(lastTime.at).toLowerCase()}` : relativeDay(lastTime.at)}
                    </Text>
                    {lastTime.exercises.map((done) => (
                      <Text key={done.name} style={styles.feedbackText}>
                        {done.name} — {done.sets} sets · {done.reps} reps
                        {done.load && done.load !== "bodyweight" ? ` · ${done.load}` : ""}
                      </Text>
                    ))}
                  </>
                ) : (
                  <Text style={styles.feedbackText}>
                    First tracked run of this session — nothing to compare against yet.
                  </Text>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {!loading && !error && !isEmpty && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <Pressable
            style={styles.startBtn}
            onPress={() => startSession({ type: "strength", planSessionId }, canResume)}
          >
            <Text style={styles.startText}>{canResume ? "CONTINUE SESSION" : "START SESSION"}</Text>
          </Pressable>
          {canResume && (
            <Pressable onPress={() => startSession({ type: "strength", planSessionId }, false)} hitSlop={8}>
              <Text style={styles.restartLink}>Restart from the beginning instead</Text>
            </Pressable>
          )}
          <Pressable style={styles.switchBtn} onPress={() => setSwitchOpen(true)}>
            <SwitchIcon size={14} color={colors.muted} />
            <Text style={styles.switchText}>Switch Workout</Text>
          </Pressable>
        </View>
      )}

      <SwitchWorkoutSheet
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        currentPlanSessionId={planSessionId}
        confirmDescription={`This replaces ${focus ?? "today's session"} with a different type — nothing's been logged yet, so nothing is lost.`}
        onConfirm={(target) => {
          setSwitchOpen(false);
          startSession({ ...target, switchedFromSessionId: planSessionId } as SessionTarget);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: 0.5,
    color: colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 18,
  },
  hero: {
    gap: 4,
    paddingTop: 4,
    paddingBottom: 6,
  },
  eyebrow: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accent,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: 0.4,
    color: colors.text,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  exerciseList: {
    gap: 8,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseIndex: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.muted,
    width: 22,
  },
  exerciseName: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13.5,
    color: colors.text,
  },
  exerciseMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  guidanceCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  guidanceText: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.text,
  },
  feedbackCard: {
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lastWhen: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 2,
  },
  feedbackText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    fontStyle: "italic",
    color: colors.muted,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  switchBtn: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.muted,
  },
  restartLink: {
    textAlign: "center",
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    textDecorationLine: "underline",
  },
  startBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.text,
  },
  startText: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.9,
    color: colors.bg,
  },
  skeletonWrap: {
    gap: 10,
  },
  skeletonLine: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.surface,
    opacity: 0.6,
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  emptySub: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
});
