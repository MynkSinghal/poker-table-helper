// Keep the screen on while a game is running (Screen Wake Lock, Safari 16.4+).
type Sentinel = { release: () => Promise<void> };
let lock: Sentinel | null = null;
export async function keepAwake() {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    if (wl && !lock) { lock = await wl.request('screen'); (lock as unknown as EventTarget).addEventListener?.('release', () => { lock = null; }); }
  } catch { lock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && lock === null && started) keepAwake(); });
let started = false;
export function startAwake() { started = true; keepAwake(); }
