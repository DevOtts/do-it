// SEEDED-DEFECT: the upper bound is exclusive by mistake, so clamp(10, 0, 10) gives 9.
export function clamp(n, lo, hi) {
  if (n < lo) return lo;
  if (n >= hi) return hi - 1;
  return n;
}
