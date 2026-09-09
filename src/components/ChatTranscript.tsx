import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Image, Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts } from "../constants/theme";
import type { ChatMessage } from "../hooks/useHomeChat";
import { MMark } from "../icons/MMark";
import { PlanBreakdownCard } from "./PlanBreakdownCard";
import { DailyWorkoutCard } from "./DailyWorkoutCard";
import { NutritionSummaryCard } from "./NutritionSummaryCard";
import { ProgressReportCard } from "./ProgressReportCard";
import { ReadinessCard } from "./ReadinessCard";
import { TopLiftsCard } from "./TopLiftsCard";
import { PreviousWorkoutCard } from "./PreviousWorkoutCard";
import { CoachMessageText } from "./CoachMessageText";

interface ChatTranscriptProps {
  messages: ChatMessage[];
  coachTyping: boolean;
  onStartDay?: (planSessionId: string) => void;
  onModifyPlan?: () => void;
  onOpenPreview?: (planSessionId: string) => void;
  /** Which treatment the structured cards use. The thread itself is always the dark surface;
   *  this only picks how the cards inside it are toned, and they default to the light (white
   *  card on dark thread) treatment the design uses. */
  cardVariant?: "dark" | "light";
}

export interface ChatTranscriptHandle {
  /** Scrolls to a specific message (a History-entry tap, e.g.) and briefly highlights it. A
   *  no-op if the message isn't currently laid out (not yet loaded into `messages`) — the
   *  caller is responsible for loading it first (see useHomeChat's loadMessageContext). */
  scrollToMessageId: (id: string) => void;
}

export const ChatTranscript = forwardRef<ChatTranscriptHandle, ChatTranscriptProps>(
  ({ messages, coachTyping, onStartDay, onModifyPlan, onOpenPreview, cardVariant = "light" }, ref) => {
    const scrollRef = useRef<ScrollView>(null);
    const offsetsRef = useRef<Record<string, number>>({});
    const [highlightId, setHighlightId] = useState<string | null>(null);

    useEffect(() => {
      const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      return () => clearTimeout(timer);
    }, [messages.length, coachTyping]);

    // Opening the keyboard shrinks this scroll view's own visible height (KeyboardAvoidingView
    // pads the screen below it) without changing `messages` at all, so the effect above never
    // re-fires — the last message, previously sitting flush with the old, taller viewport's
    // bottom, was left behind the keyboard.
    //
    // `keyboardWillShow` alone wasn't enough: it fires the instant the keyboard *starts* rising,
    // before KeyboardAvoidingView's own padding animation has actually shrunk this ScrollView's
    // layout — so `scrollToEnd()` at that point still measures the OLD, taller height and lands
    // short. `keyboardDidShow` fires once the keyboard (and that resize) has actually finished,
    // so it's the one that lands on the真 correct offset; `keyboardWillShow` is kept alongside it
    // purely so the scroll starts moving immediately instead of visibly waiting for the keyboard
    // to finish first.
    useEffect(() => {
      const scrollToEnd = () => scrollRef.current?.scrollToEnd({ animated: true });
      const willShow = Keyboard.addListener("keyboardWillShow", scrollToEnd);
      const didShow = Keyboard.addListener("keyboardDidShow", scrollToEnd);
      return () => {
        willShow.remove();
        didShow.remove();
      };
    }, []);

    useImperativeHandle(ref, () => ({
      scrollToMessageId: (id: string) => {
        const offset = offsetsRef.current[id];
        if (offset === undefined) return;
        scrollRef.current?.scrollTo({ y: Math.max(0, offset - 24), animated: true });
        setHighlightId(id);
        setTimeout(() => setHighlightId((current) => (current === id ? null : current)), 1500);
      },
    }));

    return (
      <View style={styles.stage}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {messages.map((m) =>
          m.role === "user" ? (
            <View
              key={m.id}
              onLayout={(e) => {
                offsetsRef.current[m.id] = e.nativeEvent.layout.y;
              }}
              style={[
                m.imageUrl ? styles.userImageRow : styles.userRow,
                highlightId === m.id && styles.rowHighlight,
              ]}
            >
              {m.imageUrl ? (
                <Image source={{ uri: m.imageUrl }} style={styles.userImage} resizeMode="cover" />
              ) : (
                <Text style={styles.userText}>{m.text}</Text>
              )}
            </View>
          ) : (
            <React.Fragment key={m.id}>
              <View
                onLayout={(e) => {
                  offsetsRef.current[m.id] = e.nativeEvent.layout.y;
                }}
                style={[styles.coachMsg, highlightId === m.id && styles.rowHighlight]}
              >
                <View style={styles.coachMsgAvatar}>
                  <MMark size={10.8} color={colors.accentOn} />
                </View>
                <View style={styles.coachMsgBody}>
                  <CoachMessageText text={m.text} style={styles.coachMsgText} variant="plain" />
                </View>
              </View>
              {m.card?.type === "plan_breakdown" && onStartDay && onModifyPlan && (
                <PlanBreakdownCard
                  card={m.card}
                  onStartDay={onStartDay}
                  onModify={onModifyPlan}
                  onOpenPreview={onOpenPreview}
                  variant={cardVariant}
                />
              )}
              {m.card?.type === "daily_workout" && onStartDay && (
                <DailyWorkoutCard card={m.card} onStartSession={onStartDay} variant={cardVariant} />
              )}
              {m.card?.type === "nutrition_summary" && <NutritionSummaryCard card={m.card} variant={cardVariant} />}
              {m.card?.type === "progress_report" && <ProgressReportCard card={m.card} variant={cardVariant} />}
              {m.card?.type === "readiness" && <ReadinessCard card={m.card} variant={cardVariant} />}
              {m.card?.type === "top_lifts" && <TopLiftsCard card={m.card} variant={cardVariant} />}
              {m.card?.type === "previous_workout" && <PreviousWorkoutCard card={m.card} />}
            </React.Fragment>
          ),
        )}

        {coachTyping && (
          <View style={styles.coachMsg}>
            <View style={styles.coachMsgAvatar}>
              <MMark size={10.8} color={colors.accentOn} />
            </View>
            <Text style={styles.coachMsgTyping}>···</Text>
          </View>
        )}
      </ScrollView>
      {/* The gap between the thread and whatever sits below it (dock/chips) was a hard cutoff —
          content simply stopped mid-line against flat black. Fades the last 48px into the
          background instead, matching the reference's own bottom mask on this scroll box. */}
      <LinearGradient
        colors={["rgba(8,8,8,0)", colors.bg]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  stage: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 52,
    gap: 16,
  },
  // No bubbles anywhere — a hard brand rule. A user turn is distinguished from a coach turn by
  // alignment and colour weight only, never by a container.
  userRow: {
    maxWidth: "84%",
    alignSelf: "flex-end",
  },
  userText: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "right",
    color: colors.muted,
  },
  userImageRow: {
    maxWidth: "60%",
    alignSelf: "flex-end",
  },
  userImage: {
    width: "100%",
    height: 220,
    borderRadius: 14,
  },
  rowHighlight: {
    backgroundColor: "rgba(200,241,53,0.1)",
    borderRadius: 12,
  },
  coachMsg: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    gap: 8,
  },
  coachMsgAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  coachMsgBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  coachMsgText: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  coachMsgTyping: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: "rgba(255,255,255,0.4)",
  },
});
