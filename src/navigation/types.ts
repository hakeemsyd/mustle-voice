export type RootStackParamList = {
  Tabs: undefined;
  PreWorkoutPreview: { planSessionId: string };
  // The running session lives in ActiveSessionContext, not in route params — that's what
  // lets it survive minimize and be restored from the MiniSessionBar.
  ActiveSession: undefined;
  SessionReport: { workoutLogId: string };
  Settings: undefined;
  Calendar: { initialScope?: "today" | "week" | "month" } | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
