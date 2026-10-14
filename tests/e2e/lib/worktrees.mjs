// Worktree sampler for the D16 sandbox case (T-R4-05): count `git worktree list` before, at peak and after.
import cp from 'node:child_process';

export function worktreeCount(repoDir, env) {
  const out = cp.execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repoDir, encoding: 'utf8', env: env || process.env });
  return out.split('\n').filter((l) => l.startsWith('worktree ')).length;
}

// Polls while `work` (async) runs; returns { before, peak, after }.
export async function sampleWorktrees(repoDir, work, opts) {
  const interval = (opts && opts.intervalMs) || 25;
  const before = worktreeCount(repoDir, opts && opts.env);
  let peak = before;
  const timer = setInterval(() => { peak = Math.max(peak, worktreeCount(repoDir, opts && opts.env)); }, interval);
  try { await work(); } finally { clearInterval(timer); }
  peak = Math.max(peak, worktreeCount(repoDir, opts && opts.env));
  return { before, peak, after: worktreeCount(repoDir, opts && opts.env) };
}

// D16: peak minus baseline must equal the cards that need a build, and the run must reap what it made.
// Returns an error string, or null when the sample is right (the harness exits 1 on a string).
export function sandboxMismatch(sample, needsBuild) {
  if (sample.peak - sample.before !== needsBuild) return 'peak ' + sample.peak + ' minus baseline ' + sample.before + ' is not ' + needsBuild + ' (cards with needs_build)';
  if (sample.after !== sample.before) return 'worktree count after the run is ' + sample.after + ', baseline was ' + sample.before + ' (not reaped)';
  return null;
}
