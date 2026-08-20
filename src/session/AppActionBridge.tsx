import { useCallback } from 'react';
import { AppActionListener, type AppAction } from './AppActionListener';
import { useActiveSessionContext, type SessionStatus } from './ActiveSessionContext';

interface AppActionBridgeProps {
  userId: string | null;
}

export function AppActionBridge({ userId }: AppActionBridgeProps) {
  const session = useActiveSessionContext();

  const onAction = useCallback(
    (action: AppAction) => {
      switch (action.type) {
        case 'skip_exercise':
          session.skipExercise();
          break;
        case 'end_workout':
          session.endSession((action.payload?.status as SessionStatus) ?? 'completed');
          break;
        case 'swap_exercise': {
          const fromName = String(action.payload?.from_name ?? '').toLowerCase();
          const match = session.exercises
            .slice(session.currentExerciseIndex + 1)
            .find((e) => e.name.toLowerCase() === fromName);
          if (match) {
            session.swapQueuedExercise(match.id, {
              id: String(action.payload?.to_exercise_id ?? ''),
              name: String(action.payload?.to_name ?? ''),
            });
          }
          break;
        }
      }
    },
    [session],
  );

  return <AppActionListener userId={userId} onAction={onAction} />;
}
