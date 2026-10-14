// Review cap (D10, G-10, PD-06): at most 3 rounds, then ESCALATED. A finding that repeats on two consecutive
// rounds ends STALLED before the cap.
export const REVIEW_CAP = 3;

// runRound(round) -> { findings: [fingerprint,...] } of major/blocker findings; empty means converged.
export async function reviewLoop(runRound, { cap = REVIEW_CAP } = {}) {
  let prev = new Set();
  const history = [];
  for (let round = 1; round <= cap; round++) {
    const { findings = [] } = await runRound(round);
    history.push({ round, findings });
    if (!findings.length) return { status: 'ok', outcome: 'CONVERGED', rounds: round, exit_code: 0, history };
    const repeat = findings.find((f) => prev.has(f));
    if (repeat !== undefined) return { status: 'needs_human', outcome: 'STALLED', rounds: round, exit_code: 2, reason: `finding ${repeat} repeated on consecutive rounds`, history };
    prev = new Set(findings);
  }
  return { status: 'needs_human', outcome: 'ESCALATED', rounds: cap, exit_code: 2, reason: `review cap ${cap} reached with findings open`, history };
}
