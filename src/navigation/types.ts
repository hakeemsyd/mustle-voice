import type { SessionThreadMessage } from "../session/ActiveSessionContext";

export type RootStackParamList = {
  Tabs: undefined;
  PreWorkoutPreview: { planSessionId: string };
  // The running session lives in ActiveSessionContext, not in route params — that's what
  // lets it survive minimize and be restored from the ActiveWorkoutBanner.
  ActiveSession: undefined;
  SessionReport: { workoutLogId: string; sessionMessages?: SessionThreadMessage[] };
  Calendar: { initialScope?: "today" | "week" | "month" } | undefined;
  GlobalChat: { initialMode?: "mic" | "keyboard"; jumpToMessageId?: string } | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
