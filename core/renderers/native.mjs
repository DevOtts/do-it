// Pure renderer: owner pack -> payload for a host's native question tool.
export function nativeEligible(pack, max) {
  const qs = pack.questions;
  if (!(max > 0) || !qs.length || qs.length > max) return false;
  return qs.every((q) => q.options.length >= 2 && q.options.length <= 4);
}

export function renderNative(pack) {
  return {
    pack_id: pack.pack_id,
    questions: pack.questions.map((q) => ({
      n: q.n,
      header: 'Q' + q.n,
      question: q.text,
      multiSelect: false,
      options: q.options.map((o) => ({ label: o, description: o === q.recommendation ? 'Recommended' : '' })),
    })),
  };
}
