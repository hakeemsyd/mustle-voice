import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { colors } from "../constants/theme";
import { Splash } from "./screens/Splash";
import { ScreenMic } from "./screens/ScreenMic";
import { useOnboardingState } from "./useOnboardingState";
import { ScreenGender } from "./screens/ScreenGender";
import { ScreenName } from "./screens/ScreenName";
import { ScreenHistory } from "./screens/ScreenHistory";
import { ScreenGoal } from "./screens/ScreenGoal";
import { ScreenFrequency } from "./screens/ScreenFrequency";
import { ScreenBiometrics } from "./screens/ScreenBiometrics";
import { ScreenInjuries } from "./screens/ScreenInjuries";
import { ScreenPush } from "./screens/ScreenPush";
import { ScreenHealthKit } from "./screens/ScreenHealthKit";
import { ScreenSummary } from "./screens/ScreenSummary";
import { ScreenLoading } from "./screens/ScreenLoading";
import { syncOnboarding } from "../lib/onboardingSync";
import { callBrain } from "../lib/brain";
import { prefetchSpeech } from "../lib/elevenLabsVoice";
import { STATIC_ONBOARDING_PROMPTS, historyPrompt } from "./prompts";

interface OnboardingFlowProps {
  userId: string | null;
  onComplete: () => void;
}

const LAST_BUILT_SCREEN = 13;

export const OnboardingFlow = ({ userId, onComplete }: OnboardingFlowProps) => {
  const { state, screenIndex, ready, update, goTo, goNext, goBack, complete, clearDraft } =
    useOnboardingState();

  // Plan generation (~15s per audit) is far slower than ScreenLoading's fixed animation
  // (5.8s) — without this, onboarding routinely hands off to Home before the plan exists,
  // and Home has no way to know one is still coming. ScreenLoading waits on this instead.
  const planReadyRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (screenIndex > LAST_BUILT_SCREEN) {
      clearDraft();
      onComplete();
    }
  }, [screenIndex, onComplete, clearDraft]);

  // Every voice screen's TTS otherwise only starts fetching once that screen mounts, stacking
  // a 1-3s network round trip on top of the STT round trip that already happened for the
  // previous answer — real dead air between turns. These prompts are fixed strings known
  // before the flow even reaches them, so warm the cache as early as possible (the user still
  // has the mic-permission/gender screens ahead of them, no coach speech yet, to absorb it).
  useEffect(() => {
    STATIC_ONBOARDING_PROMPTS.forEach(prefetchSpeech);
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  switch (screenIndex) {
    case 0:
      return <Splash onComplete={goNext} />;
    case 1:
      return (
        <ScreenMic
          onNext={(micEnabled) => {
            update({ micEnabled });
            goNext();
          }}
        />
      );

    case 2:
      return (
        <ScreenGender
          onNext={(gender) => {
            update({ gender });
            goNext();
          }}
          onBack={goBack}
        />
      );

    case 3:
      return (
        <ScreenName
          onNext={(name) => {
            update({ userName: name });
            // Only prompt whose text depends on a just-given answer — can't prefetch it
            // upfront like the static ones, but the name is known well before ScreenHistory
            // actually mounts (the transcribing/filling/processing phases of this screen,
            // plus a full screen transition, all still have to happen first).
            prefetchSpeech(historyPrompt(name));
            goNext();
          }}
          onBack={goBack}
          forceTypeMode={!state.micEnabled}
        />
      );

    case 4:
      return (
        <ScreenHistory
          userName={state.userName || "friend"}
          onNext={(history) => {
            update({ trainingHistory: history });
            goNext();
          }}
          onBack={goBack}
          forceTypeMode={!state.micEnabled}
        />
      );

    case 5:
      return (
        <ScreenGoal
          onNext={(goal) => {
            update({ primaryGoal: goal });
            goNext();
          }}
          onBack={goBack}
          forceTypeMode={!state.micEnabled}
        />
      );

    case 6:
      return (
        <ScreenFrequency
          onNext={(days) => {
            update({ weeklyFrequency: days });
            goNext();
          }}
          onBack={goBack}
          forceTypeMode={!state.micEnabled}
        />
      );

    case 7:
      return (
        <ScreenBiometrics
          onNext={(height, weight, units) => {
            update({ height, weight, units });
            goNext();
          }}
          onBack={goBack}
          forceTypeMode={!state.micEnabled}
        />
      );

    case 8:
      return (
        <ScreenInjuries
          onNext={(injuries, injuryDescription) => {
            update({ injuries, injuryDescription: injuryDescription ?? "" });
            goNext();
          }}
          onBack={goBack}
          forceTypeMode={!state.micEnabled}
        />
      );

    case 9:
      // Coach Selection (case 10) is temporarily out of the active flow —
      // Notifications goes straight to Apple Health, matching the reference.
      return (
        <ScreenPush
          onNext={(pushEnabled) => {
            update({ pushEnabled });
            goTo(11);
          }}
          onBack={goBack}
        />
      );

    case 11:
      return (
        <ScreenHealthKit
          onNext={(connected) => {
            update({ healthKitConnected: connected });
            goNext();
          }}
          onBack={() => goTo(9)}
        />
      );

    case 12:
      return (
        <ScreenSummary
          state={state}
          onNavigateTo={goTo}
          onBack={goBack}
          onComplete={() => {
            complete();
            if (userId) {
              // Resolves (never rejects) once the plan-generation call has settled either way —
              // ScreenLoading awaits this so it never hands off to Home before the plan is real.
              planReadyRef.current = syncOnboarding(userId, state)
                .then(() =>
                  callBrain(
                    userId,
                    "I just finished onboarding — please set up my training plan and nutrition targets from what you know about me.",
                    'text',
                    false,
                    45000,
                  ),
                )
                .then(
                  () => undefined,
                  (err) => {
                    console.error("[onboarding] sync/plan generation failed:", err);
                  },
                );
            } else {
              console.warn("[onboarding] no session — skipping sync");
            }
            goNext();
          }}
        />
      );

    case 13:
      return (
        <ScreenLoading
          readyPromise={planReadyRef.current}
          onComplete={() => {
            clearDraft();
            onComplete();
          }}
        />
      );

    default:
      return null;
  }
};

const styles = {
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
} as const;
