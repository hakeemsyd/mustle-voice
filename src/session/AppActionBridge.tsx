import { useCallback, useRef } from 'react';
import { AppActionListener, type AppAction } from './AppActionListener';
import { useActiveSessionContext, type SessionStatus } from './ActiveSessionContext';
import { navigateFromAppAction } from '../navigation/navigationRef';

interface AppActionBridgeProps {
  userId: string | null;
}

export function AppActionBridge({ userId }: AppActionBridgeProps) {
  const session = useActiveSessionContext();
  // The context's own value is a new object on nearly every render during an active session
  // (elapsedSec ticks every second, sets/messages/rest state all change constantly) — confirmed
  // live: depending on it directly here meant onAction's identity churned just as often, which
  // tore down and rebuilt AppActionListener's Supabase Realtime channel (and its own 4s deferred
  // backlog fetch) on every single one of those renders instead of once. A ref breaks that: this
  // reads whatever session is current at call time without onAction's own identity ever changing.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const onAction = useCallback((action: AppAction) => {
    const session = sessionRef.current;
    switch (action.type) {
      case 'skip_exercise':
        session.skipExercise();
        break;
      case 'add_set':
        session.addSet();
        break;
      case 'undo_last_set':
        session.undoLastSet();
        break;
      case 'end_workout':
        session.endSession((action.payload?.status as SessionStatus) ?? 'completed');
        break;
      case 'start_workout': {
        const planSessionId = String(action.payload?.plan_session_id ?? '');
        if (planSessionId) {
          session.start({ type: 'strength', planSessionId });
          navigateFromAppAction('ActiveSession');
        }
        break;
      }
      case 'swap_exercise': {
        const fromName = String(action.payload?.from_name ?? '').toLowerCase();
        const match = session.exercises
          .slice(session.currentExerciseIndex)
          .find((e) => e.name.toLowerCase() === fromName);
        if (match) {
          session.swapQueuedExercise(match.id, {
            id: String(action.payload?.to_exercise_id ?? ''),
            name: String(action.payload?.to_name ?? ''),
          });
        }
        break;
      }
      case 'adjust_rest_timer': {
        const restAction = String(action.payload?.action ?? '');
        if (restAction === 'extend') {
          const seconds = Number(action.payload?.seconds);
          session.extendRest(Number.isFinite(seconds) && seconds > 0 ? seconds : undefined, 'coach');
        } else if (restAction === 'skip') {
          session.finishRest();
        } else if (restAction === 'pause') {
          session.pauseRest();
        } else if (restAction === 'resume') {
          session.resumeRest();
        }
        break;
      }
    }
  }, []);

  return <AppActionListener userId={userId} onAction={onAction} />;
}
