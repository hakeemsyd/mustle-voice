import React, { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import type { ChatMessage } from "../hooks/useHomeChat";
import { MMark } from "../icons/MMark";
import { PlanBreakdownCard } from "./PlanBreakdownCard";
import { DailyWorkoutCard } from "./DailyWorkoutCard";
import { NutritionSummaryCard } from "./NutritionSummaryCard";
import { ProgressReportCard } from "./ProgressReportCard";
import { ReadinessCard } from "./ReadinessCard";
import { TopLiftsCard } from "./TopLiftsCard";
import { CoachMessageText } from "./CoachMessageText";

interface ChatTranscriptProps {
  messages: ChatMessage[];
  coachTyping: boolean;
  /** Softens the user bubble's neon tint while a voice call is live — the
   *  accent-dim reads too intense against the ambient wash behind it. */
  voiceActive?: boolean;
  onStartDay?: (planSessionId: string) => void;
  onModifyPlan?: () => void;
}

export const ChatTranscript = ({
  messages,
  coachTyping,
  voiceActive = false,
  onStartDay,
  onModifyPlan,
}: ChatTranscriptProps) => {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages.length, coachTyping]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.stage}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {messages.map((m) =>
        m.role === "user" ? (
          <View key={m.id} style={[styles.bubbleUser, voiceActive && styles.bubbleUserVoice]}>
            <Text style={styles.bubbleText}>{m.text}</Text>
          </View>
        ) : (
          <React.Fragment key={m.id}>
            <View style={styles.coachMsg}>
              <View style={styles.coachMsgAvatar}>
                <MMark size={11} color={colors.accent} />
              </View>
              <View style={styles.coachMsgBody}>
                <CoachMessageText text={m.text} style={styles.coachMsgText} />
                {m.card?.type === "plan_breakdown" && onStartDay && onModifyPlan && (
                  <PlanBreakdownCard card={m.card} onStartDay={onStartDay} onModify={onModifyPlan} />
                )}
              </View>
            </View>
            {m.card?.type === "daily_workout" && onStartDay && (
              <DailyWorkoutCard card={m.card} onStartSession={onStartDay} />
            )}
            {m.card?.type === "nutrition_summary" && <NutritionSummaryCard card={m.card} />}
            {m.card?.type === "progress_report" && <ProgressReportCard card={m.card} />}
            {m.card?.type === "readiness" && <ReadinessCard card={m.card} />}
            {m.card?.type === "top_lifts" && <TopLiftsCard card={m.card} />}
          </React.Fragment>
        ),
      )}

      {coachTyping && (
        <View style={styles.coachMsg}>
          <View style={styles.coachMsgAvatar}>
            <MMark size={11} color={colors.accent} />
          </View>
          <Text style={styles.coachMsgTyping}>···</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  stage: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 44,
    gap: 20,
  },
  bubbleUser: {
    maxWidth: "82%",
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  bubbleUserVoice: {
    backgroundColor: "rgba(190,235,170,0.12)",
    borderColor: "rgba(190,235,170,0.3)",
  },
  bubbleText: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 27,
    letterSpacing: -0.09,
    color: colors.text,
  },
  coachMsg: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  coachMsgAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  coachMsgBody: {
    flex: 1,
    gap: 4,
  },
  coachMsgText: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 27,
    letterSpacing: -0.09,
    color: "rgba(255,255,255,0.92)",
  },
  coachMsgTyping: {
    fontFamily: fonts.body,
    fontSize: 17,
    color: "rgba(255,255,255,0.4)",
  },
});
