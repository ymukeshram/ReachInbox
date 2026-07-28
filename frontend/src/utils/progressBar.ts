type Listener = (active: boolean) => void;

let count = 0;
const listeners = new Set<Listener>();

function emit() {
  const active = count > 0;
  listeners.forEach(fn => fn(active));
}

export function subscribeProgress(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startProgress() {
  count++;
  emit();
}

export function stopProgress() {
  count = Math.max(0, count - 1);
  emit();
}
