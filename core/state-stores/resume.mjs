// Cold-start resume (D17, DECISIONS D15): empty working directory + a git ref + the previous it-result file.
// Missing result file => BLOCKED RESULT_FILE_MISSING, nothing written. Never guessed.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { StoreError, ERR, EXIT, sha256 } from './interface.mjs';
import { GitBranchStore, branchFor, git } from './git-branch.mjs';
import { LocalFsStore } from './local-fs.mjs';

const blocked = (reason, detail) => ({ status: 'BLOCKED', exit: EXIT.BLOCKED, reason, ...detail, written: [] });

// repo: path or URL holding the run branch. resultPath: run-relative (results/build-S1.json).
export async function resume({ repo, runId, resultPath, workdir, branch = branchFor(runId) }) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'do-it-resume-'));
  try {
    execFileSync('git', ['init', '-q', '--bare', scratch]);
    try {
      git(scratch, ['fetch', '-q', repo, `+refs/heads/${branch}:refs/heads/${branch}`]);
    } catch (e) {
      throw new StoreError(ERR.REMOTE_UNREACHABLE, `cannot fetch ${branch} from ${repo}: ${e.message}`, { repo, branch });
    }
    const src = new GitBranchStore({ repo: scratch });
    const rel = resultPath.startsWith('runs/') ? resultPath : `runs/${runId}/${resultPath}`;
    let resultBuf;
    try { resultBuf = await src.get(rel); } catch (e) {
      if (e.code === ERR.NOT_FOUND) return blocked(ERR.RESULT_FILE_MISSING, { path: rel });
      throw e;
    }
    let result;
    try { result = JSON.parse(resultBuf.toString('utf8')); } catch { return blocked('RESULT_INVALID', { path: rel }); }
    const next_action = result?.resume?.next_action;
    if (result?.schema !== 'it-result/1' || typeof next_action !== 'string' || !next_action) return blocked('RESULT_INVALID', { path: rel });
    let stateBuf;
    try { stateBuf = await src.get(`runs/${runId}/state.json`); } catch (e) {
      if (e.code === ERR.NOT_FOUND) return blocked('STATE_MISSING', { path: `runs/${runId}/state.json` });
      throw e;
    }
    const hadLocal = await fs.stat(path.join(workdir, '.do-it')).then(() => true, () => false);
    await fs.mkdir(workdir, { recursive: true });
    const dst = new LocalFsStore({ root: path.join(workdir, '.do-it') });
    const written = [];
    const copy = async (dir) => {
      for (const n of await src.list(dir)) {
        if (n.endsWith('/')) { await copy(dir.replace(/\/$/, '') + '/' + n); continue; }
        const p = dir.replace(/\/$/, '') + '/' + n;
        await dst.put(p, await src.get(p)); written.push(p);
      }
    };
    await copy(`runs/${runId}/`);
    const rebuilt = await dst.get(`runs/${runId}/state.json`);
    return {
      status: 'RESUMED', exit: EXIT.OK, next_action, had_local_state: hadLocal,
      state_sha256: sha256(rebuilt), stored_state_sha256: sha256(stateBuf), written,
    };
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
}
