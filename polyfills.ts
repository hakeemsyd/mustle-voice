// Hermes (React Native's engine) does not provide a global `DOMException`. Parts of the
// LiveKit / WebRTC / web-streams polyfill chain reference it at module-eval time, which
// throws "ReferenceError: Property 'DOMException' doesn't exist" before LiveKit's own
// shims run. Define a minimal one here and import this FIRST in index.ts so it exists
// before any LiveKit/ElevenLabs module is evaluated.
if (typeof (globalThis as any).DOMException === 'undefined') {
  class DOMException extends Error {
    code: number;
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name ?? 'Error';
      this.code = 0;
    }
  }
  (globalThis as any).DOMException = DOMException;
}

export {};
