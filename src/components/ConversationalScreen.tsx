import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Orb, type OrbState } from "../onboarding/Orb";
import { ProgressDots } from "../onboarding/ProgressDots";

import { BackIcon } from "../icons/BackIcon";

import { colors, fonts } from "../constants/theme";
import { useWordTyping } from "../hooks/useWordTyping";

import { VoiceButton } from "./VoiceButton";
import { TypeInsteadButton } from "./TypeInsteadButton";
import { ConversationAnswerCard } from "./ConversationAnswerCard";
import { ConversationContinueButton } from "./ConversationContinueButton";
import { UseVoiceInsteadButton } from "./UseVoiceInsteadButton";

type Phase =
  | "speaking" // coach message revealing word by word
  | "pause" // fully visible, waiting before shrink
  | "shrank" // message shrinking
  | "listening" // YOU SPEAK zone visible
  | "filling" // autofill text typing
  | "processing"; // orb processing, then advance

const WORD_SPEED_COACH = 90;
const WORD_SPEED_FILL = 110;
const PAUSE_AFTER_COACH = 1500;

interface ConversationalScreenProps {
  coachMessage: string;
  autoFillText: string;
  typeInputPlaceholder?: string;
  typeInputUnit?: string;
  typeSlot?: React.ReactNode;
  typeValid?: boolean;
  forceTypeMode?: boolean;
  dotIndex: number;
  showBack?: boolean;
  onBack?: () => void;
  onComplete: (value: string) => void;
}

export const ConversationalScreen = ({
  coachMessage,
  autoFillText,
  typeInputPlaceholder = "Type here...",
  typeInputUnit,
  typeSlot,
  typeValid,
  forceTypeMode = false,
  dotIndex,
  showBack = true,
  onBack,
  onComplete,
}: ConversationalScreenProps) => {
  const [phase, setPhase] = useState<Phase>(
    forceTypeMode ? "listening" : "speaking",
  );
  const [typeMode, setTypeMode] = useState(forceTypeMode);
  const [typeValue, setTypeValue] = useState("");

  const fontSize = useSharedValue(26);
  const lineHeight = useSharedValue(34);
  const marginTop = useSharedValue(56);
  const opacity = useSharedValue(1);
  const youSpeakFade = useSharedValue(1);

  const animatedMessageStyle = useAnimatedStyle(() => ({
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    marginTop: marginTop.value,
    opacity: opacity.value,
  }));

  const youSpeakFadeStyle = useAnimatedStyle(() => ({
    opacity: youSpeakFade.value,
  }));

  const { count: coachCount, words: coachWords } = useWordTyping(
    coachMessage,
    phase === "speaking",
    WORD_SPEED_COACH,
  );

  const {
    count: fillCount,
    isDone: fillDone,
    words: fillWords,
  } = useWordTyping(autoFillText, phase === "filling", WORD_SPEED_FILL);

  // speaking → pause
  useEffect(() => {
    if (phase === "speaking" && coachCount >= coachWords.length) {
      const timer = setTimeout(() => setPhase("pause"), 100);
      return () => clearTimeout(timer);
    }
  }, [phase, coachCount, coachWords.length]);

  // pause → shrank (shrink animation)
  useEffect(() => {
    if (phase === "pause") {
      fontSize.value = withTiming(14, { duration: 350 });
      lineHeight.value = withTiming(20, { duration: 350 });
      marginTop.value = withTiming(12, { duration: 350 });
      opacity.value = withTiming(0.6, { duration: 350 });

      const timer = setTimeout(() => setPhase("shrank"), PAUSE_AFTER_COACH);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // shrank → listening
  useEffect(() => {
    if (phase === "shrank") {
      const timer = setTimeout(() => setPhase("listening"), 400);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // filling → processing
  useEffect(() => {
    if (phase === "filling" && fillDone) {
      const timer = setTimeout(() => setPhase("processing"), 400);
      return () => clearTimeout(timer);
    }
  }, [phase, fillDone]);

  // processing → complete
  useEffect(() => {
    if (phase === "processing") {
      youSpeakFade.value = withTiming(0.35, { duration: 400 });

      const timer = setTimeout(() => {
        onComplete(typeMode ? typeValue.trim() : autoFillText);
      }, 1800);
      return () => clearTimeout(timer);
    } else {
      youSpeakFade.value = withTiming(1, { duration: 200 });
    }
  }, [phase]);

  const orbState: OrbState = (() => {
    switch (phase) {
      case "speaking":
      case "pause":
        return "speaking";
      case "shrank":
        return "breathing";
      case "listening":
      case "filling":
        return "listening";
      case "processing":
        return "processing";
    }
  })();

  const youSpeakVisible =
    phase === "listening" || phase === "filling" || phase === "processing";

  const handleVoiceTap = () => {
    if (phase === "listening") {
      setPhase("filling");
    }
  };

  const typeCanSubmit = typeValid !== undefined ? typeValid : !!typeValue.trim();

  const handleTypeSubmit = () => {
    if (!typeCanSubmit) return;
    setPhase("processing");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        {showBack ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onBack}>
            <BackIcon />
          </TouchableOpacity>
        ) : (
          <View style={styles.topBarSpacer} />
        )}

        <ProgressDots total={11} current={dotIndex} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
        {!typeMode ? (
          <Animated.View
            style={styles.flex}
            layout={LinearTransition.springify()}
            entering={FadeIn.duration(250)}
            exiting={FadeOut.duration(250)}
          >
            <View style={styles.orbContainer}>
              <Orb state={orbState} size={190} />
            </View>

            <Animated.Text style={[styles.message, animatedMessageStyle]}>
              {phase === "speaking"
                ? coachWords.slice(0, coachCount).join(" ")
                : coachMessage}
            </Animated.Text>

            <View style={styles.flexSpacer} />

            {youSpeakVisible && (
              <Animated.View
                entering={FadeInUp.duration(300)}
                style={styles.bottomContainer}
              >
                {phase === "listening" ? (
                  <VoiceButton onPress={handleVoiceTap} />
                ) : (
                  <Animated.View
                    layout={LinearTransition.springify()}
                    entering={FadeIn.duration(250)}
                    style={[styles.responseCard, youSpeakFadeStyle]}
                  >
                    <Animated.Text style={styles.responseText}>
                      {fillWords
                        .slice(0, phase === "processing" ? undefined : fillCount)
                        .join(" ")}
                    </Animated.Text>
                  </Animated.View>
                )}

                <TypeInsteadButton
                  disabled={phase !== "listening"}
                  onPress={() => setTypeMode(true)}
                />
              </Animated.View>
            )}
          </Animated.View>
        ) : (
          <Animated.View
            style={styles.flex}
            layout={LinearTransition.springify()}
            entering={FadeIn.duration(250)}
            exiting={FadeOut.duration(250)}
          >
            <Animated.Text
              entering={FadeInUp.duration(250)}
              style={styles.typingMessage}
            >
              {coachMessage}
            </Animated.Text>

            {typeSlot ?? (
              <ConversationAnswerCard
                value={typeValue}
                placeholder={typeInputPlaceholder}
                unit={typeInputUnit}
                onChangeText={setTypeValue}
              />
            )}

            <View style={styles.flexSpacer} />

            <Animated.View
              entering={FadeInUp.duration(300)}
              style={styles.bottomContainer}
            >
              <ConversationContinueButton
                disabled={!typeCanSubmit}
                onPress={handleTypeSubmit}
              />

              {!forceTypeMode && (
                <UseVoiceInsteadButton
                  onPress={() => {
                    setTypeMode(false);
                    setTypeValue("");
                  }}
                />
              )}
            </Animated.View>
          </Animated.View>
        )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  flex: {
    flex: 1,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  topBarSpacer: {
    width: 24,
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
  },

  orbContainer: {
    alignItems: "center",
  },

  message: {
    textAlign: "center",
    fontFamily: fonts.bodyExtraBold,
    color: colors.text,
    maxWidth: 300,
    alignSelf: "center",
    paddingHorizontal: 8,
  },

  typingMessage: {
    marginTop: 40,
    marginBottom: 24,
    color: "rgba(255,255,255,0.55)",
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21,
  },

  flexSpacer: {
    flex: 1,
  },

  bottomContainer: {
    paddingBottom: 24,
    gap: 16,
  },

  responseCard: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.2)",
    backgroundColor: "rgba(200,241,53,0.06)",
    paddingHorizontal: 22,
    paddingVertical: 14,
    justifyContent: "center",
  },

  responseText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
    textAlign: "center",
  },
});
