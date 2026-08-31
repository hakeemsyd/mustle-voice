type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyAccountReset() {
  listeners.forEach((listener) => listener());
}

export function subscribeToAccountReset(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
