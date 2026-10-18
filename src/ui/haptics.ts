// Haptic tick. Android: Vibration API. iOS Safari 17.4+: toggling a native <input switch>
// fires the system haptic (the trick the ios-haptics package uses). Fails silently elsewhere.
let label: HTMLLabelElement | null = null;
export function tick() {
  try {
    if (typeof navigator.vibrate === 'function' && navigator.vibrate(8)) return;
    if (!label) {
      label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.appendChild(input);
      document.body.appendChild(label);
    }
    label.click();
  } catch { /* no haptics available */ }
}
