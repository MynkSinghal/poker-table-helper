import type { Analysis, AnalyzeInput } from './advisor';

let worker: Worker | null = null;
let seq = 0;
type Listener = (a: Analysis) => void;
let listener: Listener | null = null;
let current = 0;

function ensure() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ id: number; analysis?: Analysis; error?: string }>) => {
    if (e.data.id !== current) return;
    if (e.data.analysis && listener) listener(e.data.analysis);
    if (e.data.error) console.error('engine:', e.data.error);
  };
  return worker;
}
export function onAnalysis(fn: Listener) { listener = fn; }
export function requestAnalysis(key: string, input: AnalyzeInput) {
  current = ++seq;
  ensure().postMessage({ id: current, key, input });
}
