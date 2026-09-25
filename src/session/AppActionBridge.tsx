import { useCallback, useRef } from 'react';
import { AppActionListener, type AppAction } from './AppActionListener';
import { useActiveSessionContext, type RestLengthScope, type SessionStatus } from './ActiveSessionContext';
import { navigateFromAppAction } from '../navigation/navigationRef';
import { notifyHomeRefresh } from '../lib/homeRefreshBridge';

interface AppActionBridgeProps {
  userId: string | null;
}

const REST_SCOPES = new Set<RestLengthScope>(['current', 'upcoming', 'both']);

export const AppActionBridge = ({ userId }: AppActionBridgeProps) => {
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
      case 'go_to_exercise': {
        const name = String(action.payload?.exercise_name ?? '');
        if (name) session.goToExercise(name);
        break;
      }
      case 'add_set':
        session.addSet();
        break;
      case 'undo_last_set':
        session.undoLastSet();
        break;
      case 'log_set': {
        const reps = Number(action.payload?.reps);
        if (!Number.isFinite(reps) || reps <= 0) break;
        const weight = Number(action.payload?.weight_kg);
        session.logSet(
          Number.isFinite(weight) && weight > 0 ? weight : null,
          Math.round(reps),
          action.payload?.unit === 'seconds' ? 'seconds' : undefined,
          { source: 'coach' },
        );
        break;
      }
      case 'end_workout':
        session.endSession(
          (action.payload?.status as SessionStatus) ?? 'completed',
          (action.payload?.reason as string | null) ?? null,
        );
        break;
      case 'discard_workout':
        void session.discardSession().then(() => navigateFromAppAction('Home'));
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
            loadScheme: typeof action.payload?.load_scheme === 'string' ? action.payload.load_scheme : null,
          });
        }
        break;
      }
      case 'refresh_home':
        notifyHomeRefresh();
        break;
      case 'adjust_rest_timer': {
        const restAction = String(action.payload?.action ?? '');
        if (restAction === 'extend') {
          const seconds = Number(action.payload?.seconds);
          session.extendRest(Number.isFinite(seconds) && seconds > 0 ? seconds : undefined, 'coach');
        } else if (restAction === 'set') {
          const seconds = Number(action.payload?.seconds);
          const scope = action.payload?.scope as RestLengthScope;
          if (Number.isFinite(seconds) && seconds > 0 && REST_SCOPES.has(scope)) {
            session.setRestLength(Math.round(seconds), scope, 'coach');
          }
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
};
