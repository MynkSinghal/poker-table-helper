export const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
export const bbs = (chips: number, bb: number) => {
  const v = chips / bb;
  const s = Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
  return (v > 0.05 ? '+' : v < -0.05 ? '' : '') + (s === '-0.0' ? '0.0' : s);
};
export const pct = (x: number) => `${Math.round(x * 100)}%`;
