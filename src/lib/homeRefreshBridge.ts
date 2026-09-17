type Listener = () => void;

const listeners = new Set<Listener>();

/** Fired when the coach changes something Home displays (today's session, the plan, targets)
 *  while the user is already looking at Home. Home otherwise only refetches on focus and when a
 *  voice call ends, so a session created mid-conversation stayed invisible until the user
 *  navigated away and back — and "the coach said it did something, but the screen disagrees" is
 *  exactly the class of failure create_custom_session exists to end. */
export function notifyHomeRefresh() {
  listeners.forEach((listener) => listener());
}

export function subscribeToHomeRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
