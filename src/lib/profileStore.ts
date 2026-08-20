type Listener = () => void;

let cache: { userId: string; displayName: string | null } | null = null;
const listeners = new Set<Listener>();

export function getCachedDisplayName(userId: string | null): string | null {
  return cache && cache.userId === userId ? cache.displayName : null;
}

export function setCachedDisplayName(userId: string, displayName: string | null) {
  cache = { userId, displayName };
  listeners.forEach((listener) => listener());
}

export function subscribeToProfile(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
