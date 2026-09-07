import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { colors } from "../constants/theme";
import { Splash } from "./screens/Splash";
import { ScreenLanding } from "./screens/ScreenLanding";
import { ScreenLogin } from "./screens/ScreenLogin";
import { ScreenForgotPassword } from "./screens/ScreenForgotPassword";
import { ScreenAccountCreation } from "./screens/ScreenAccountCreation";
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
import { markPlanPending, clearPlanPending } from "../lib/planStatus";
import { getPendingEmailConfirmation } from "../lib/pendingEmailConfirmation";
import { supabase } from "../lib/supabase";
import { prefetchSpeech } from "../lib/elevenLabsVoice";
import { STATIC_ONBOARDING_PROMPTS, historyPrompt } from "./prompts";

type PreScreen = "landing" | "login" | "forgotPassword" | null;

interface OnboardingFlowProps {
  userId: string | null;
  onComplete: () => void;
  /** True right after a deliberate logout (not a cold app launch) — goes straight to Landing
   *  instead of replaying the Splash intro, which only makes sense the first time someone ever
   *  opens the app. */
  skipSplash?: boolean;
}

const LAST_BUILT_SCREEN = 13;

export const OnboardingFlow = ({ userId, onComplete, skipSplash = false }: OnboardingFlowProps) => {
  const { state, screenIndex, ready, update, goTo, editStep, goNext, goBack, complete, clearDraft } =
    useOnboardingState();
  // Landing/Login/Forgot-Password sit between Splash and the rest of the flow but aren't
  // themselves numbered steps — same choice the source design made (kept out of screenIndex's
  // own switch) — so this is local UI state here rather than part of the persisted
  // OnboardingState. null means "render the numbered flow normally."
  const [preScreen, setPreScreen] = useState<PreScreen>(skipSplash ? "landing" : null);
  // Account Creation sits between Summary and Loading the same way — see case 12 below.
  const [showAccountCreation, setShowAccountCreation] = useState(false);
  // Closing the app while sitting on "check your email" (after a real signup already succeeded)
  // used to drop the user back at Summary on relaunch — showAccountCreation is local state, not
  // persisted, and screenIndex hadn't advanced yet. Resubmitting the same email/password there
  // fails ("New password should be different from the old password"). undefined = still loading.
  const [resumeEmail, setResumeEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getPendingEmailConfirmation().then((email) => {
      setResumeEmail(email);
      if (email) setShowAccountCreation(true);
    });
  }, []);

  // Plan generation (~15s per audit) is far slower than ScreenLoading's fixed animation
  // (5.8s) — without this, onboarding routinely hands off to Home before the plan exists,
  // and Home has no way to know one is still coming. ScreenLoading waits on this instead.
  const planReadyRef = useRef<Promise<void> | null>(null);
  // Bumped after a retry re-assigns planReadyRef.current to a fresh promise — planReadyRef is a
  // plain ref, so mutating it alone doesn't re-render; this forces one so ScreenLoading receives
  // the new promise as a fresh prop.
  const [, setPlanAttempt] = useState(0);

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

  if (!ready || resumeEmail === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Resolves once the plan-generation call has genuinely settled — rejects only on a real
  // failure (network/tool error), so ScreenLoading can tell that apart from a
  // slow-but-still-running call. A successful call doesn't guarantee the model actually called
  // generate_training_plan (it might ask a clarifying question or just reply conversationally
  // instead), so this verifies a plan row actually exists before treating it as done — Home
  // reads the pending flag to show an actionable state instead of the generic empty one.
  //
  // hidden:true (not false) — this reply is deliberately routed through the SAME "daily
  // greeting" channel useHomeData.ts already reads and shows prominently on Home, rather than
  // sitting as a real chat message a new user would have no reason to go looking for. Previously
  // this was hidden:false: the coach's actual explanation of why this plan/split/targets were
  // chosen was technically visible in the chat transcript, but nothing surfaced it — Home's own
  // greeting caption came from a separate, later synthetic call, so a new user landed on Home
  // seeing only a generic workout command with the real "why" buried in a transcript they had no
  // reason to open. Marking it hidden:true makes it the exact message useHomeData's greeting
  // query picks up as the first thing shown, with no new screen needed.
  const runPlanGeneration = () => {
    if (!userId) {
      console.warn("[onboarding] no session — skipping sync");
      return;
    }
    planReadyRef.current = syncOnboarding(userId, state)
      .then(() =>
        callBrain(
          userId,
          "I just finished onboarding — please set up my training plan and nutrition targets from what you know about me, and briefly explain why you chose this split and these targets.",
          'text',
          true,
          45000,
        ),
      )
      .then(async () => {
        const { data } = await supabase
          .from('training_plan')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle();
        if (data) await clearPlanPending();
        else await markPlanPending();
      })
      .catch((err) => {
        console.error("[onboarding] sync/plan generation failed:", err);
        markPlanPending();
        throw err;
      });
  };

  const retryPlanGeneration = () => {
    runPlanGeneration();
    setPlanAttempt((n) => n + 1);
  };

  // Runs once Account Creation succeeds — was Summary's onComplete directly before Account
  // Creation existed as its own step; unchanged otherwise.
  const finishOnboarding = () => {
    complete();
    runPlanGeneration();
    goNext();
  };

  switch (screenIndex) {
    case 0:
      if (preScreen === "login") {
        return (
          <ScreenLogin
            onBack={() => setPreScreen("landing")}
            onForgotPassword={() => setPreScreen("forgotPassword")}
          />
        );
      }
      if (preScreen === "forgotPassword") {
        return <ScreenForgotPassword onBack={() => setPreScreen("login")} />;
      }
      if (preScreen === "landing") {
        return (
          <ScreenLanding
            onGetStarted={() => {
              setPreScreen(null);
              goNext();
            }}
            onLogIn={() => setPreScreen("login")}
          />
        );
      }
      return <Splash onComplete={() => setPreScreen("landing")} />;
    case 1:
      return (
        <ScreenMic
          onNext={(micEnabled) => {
            update({ micEnabled });
            goNext();
          }}
          onBack={() => {
            // Stepping back to screenIndex 0 alone isn't enough — preScreen was reset to null
            // when Landing's "Get Started" advanced past it, so case 0 would find nothing to
            // restore and fall through to Splash instead of the Landing screen the user actually
            // came from. Confirmed live.
            setPreScreen("landing");
            goBack();
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
          initialDays={state.weeklyFrequency ?? undefined}
          onNext={(days) => {
            update({ weeklyFrequency: days });
            goNext();
          }}
          onBack={goBack}
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
      if (showAccountCreation) {
        return (
          <ScreenAccountCreation
            resumeEmail={resumeEmail ?? undefined}
            onBack={() => setShowAccountCreation(false)}
            onSuccess={() => {
              setShowAccountCreation(false);
              finishOnboarding();
            }}
          />
        );
      }
      return (
        <ScreenSummary
          state={state}
          onNavigateTo={editStep}
          onBack={goBack}
          onComplete={() => setShowAccountCreation(true)}
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
          onRetry={retryPlanGeneration}
        />
      );

    default:
      return null;
  }
};

const styles = {
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
} as const;
