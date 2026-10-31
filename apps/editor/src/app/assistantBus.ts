// Requests to the assistant from the rest of the editor (the journey bar's
// "do it for me", later the compile and problems panels). The panel picks
// them up when mounted; one waits while it is not.

type Listener = (text: string) => void;

const listeners = new Set<Listener>();
let pending: string | null = null;

export const assistantBus = {
  /** Sends a request; the panel sends it to the model as if typed. */
  ask(text: string): void {
    if (listeners.size) for (const l of listeners) l(text);
    else pending = text;
  },
  /** The panel subscribes while mounted and takes any request that waited. */
  subscribe(l: Listener): () => void {
    listeners.add(l);
    if (pending) {
      const t = pending;
      pending = null;
      queueMicrotask(() => l(t));
    }
    return () => {
      listeners.delete(l);
    };
  },
};
