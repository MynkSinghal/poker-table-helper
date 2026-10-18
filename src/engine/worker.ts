/// <reference lib="webworker" />
// Runs the engine off the main thread so taps and drags stay at 120 Hz.
// Each request gets a quick answer first (sampled), then the exact/final one.
import { analyze, type AnalyzeInput } from './advisor';

let latest = 0;
self.onmessage = (e: MessageEvent<{ id: number; key: string; input: AnalyzeInput }>) => {
  const { id, key, input } = e.data;
  latest = id;
  try {
    const q = analyze(input, key, true);
    (self as unknown as Worker).postMessage({ id, analysis: q });
    // let a newer request pre-empt the slow pass
    setTimeout(() => {
      if (latest !== id) return;
      const full = analyze(input, key, false);
      if (latest === id) (self as unknown as Worker).postMessage({ id, analysis: full });
    }, 0);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
