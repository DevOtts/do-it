// git-branch backend: one branch per run (do-it/runs/{run_id}), one commit per write batch (D14).
// Uses git plumbing against a temporary index, so the user's checkout and index are never touched.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { StateStore, StoreError, ERR } from './interface.mjs';

const IDENT = { GIT_AUTHOR_NAME: 'do-it', GIT_AUTHOR_EMAIL: 'do-it@localhost', GIT_COMMITTER_NAME: 'do-it', GIT_COMMITTER_EMAIL: 'do-it@localhost' };
export const branchFor = (run) => `do-it/runs/${run}`;

export function git(repo, args, { input, env, allowFail } = {}) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      input, env: { ...process.env, ...IDENT, GIT_TERMINAL_PROMPT: '0', ...env }, maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (allowFail) return null;
    throw new StoreError(ERR.REMOTE_UNREACHABLE, `git ${args[0]} failed: ${String(e.stderr || e.message).trim().split('\n')[0]}`, { git: args[0] });
  }
}

export class GitBranchStore extends StateStore {
  constructor({ repo, remote = null }) {
    super('git-branch');
    if (!repo) throw new StoreError(ERR.DRIVER_UNCONFIGURED, 'git-branch needs a repo path');
    this.repo = path.resolve(repo);
    this.remote = remote;
    this.gitdir = git(this.repo, ['rev-parse', '--absolute-git-dir']).toString().trim();
    this._batch = null;
    this.unsynced = new Set();
  }

  tip(run) {
    const out = git(this.repo, ['rev-parse', '--verify', '-q', `refs/heads/${branchFor(run)}`], { allowFail: true });
    return out ? out.toString().trim() : null;
  }

  async batch(label, fn) {
    if (this._batch) throw new StoreError(ERR.BAD_LINE, 'batches do not nest');
    this._batch = { label, runs: new Map() };
    let result;
    try { result = await fn(); } catch (e) { this._batch = null; throw e; }
    const b = this._batch; this._batch = null;
    for (const [run, files] of b.runs) this._commit(run, files, label);
    return result;
  }

  _stage(p, bytes) {
    const run = p.split('/')[1];
    if (this._batch) {
      if (!this._batch.runs.has(run)) this._batch.runs.set(run, new Map());
      this._batch.runs.get(run).set(p, bytes);
    } else this._commit(run, new Map([[p, bytes]]), `write ${p}`);
  }

  _commit(run, files, label) {
    const parent = this.tip(run);
    const idx = path.join(this.gitdir, `do-it-index-${process.pid}-${randomBytes(4).toString('hex')}`);
    const env = { GIT_INDEX_FILE: idx };
    try {
      if (parent) git(this.repo, ['read-tree', parent], { env });
      const info = [];
      for (const [p, bytes] of files) {
        const sha = git(this.repo, ['hash-object', '-w', '--stdin'], { input: bytes }).toString().trim();
        info.push(`100644 ${sha}\t${p}`);
      }
      git(this.repo, ['update-index', '--add', '--index-info'], { input: info.join('\n') + '\n', env });
      const tree = git(this.repo, ['write-tree'], { env }).toString().trim();
      const args = ['commit-tree', tree, '-m', `do-it: ${label} (${files.size} file${files.size === 1 ? '' : 's'})`];
      if (parent) args.push('-p', parent);
      const commit = git(this.repo, args).toString().trim();
      git(this.repo, ['update-ref', `refs/heads/${branchFor(run)}`, commit, parent || '0000000000000000000000000000000000000000']);
    } finally { rmSync(idx, { force: true }); }
    if (this.remote) this.unsynced.add(run);
  }

  _read(p) {
    const run = p.split('/')[1];
    const over = this._batch?.runs.get(run)?.get(p);
    if (over) return over;
    if (!this.tip(run)) return null;
    const out = git(this.repo, ['cat-file', 'blob', `refs/heads/${branchFor(run)}:${p}`], { allowFail: true });
    return out;
  }

  async _get(p) { return this._read(p); }
  async _put(p, bytes) { this._stage(p, bytes); }
  async _append(p, lineBytes) {
    const cur = this._read(p);
    this._stage(p, cur ? Buffer.concat([cur, lineBytes]) : lineBytes);
  }

  async _list(g) {
    if (g.path === 'runs') {
      const out = git(this.repo, ['for-each-ref', '--format=%(refname:strip=4)', 'refs/heads/do-it/runs/'], { allowFail: true });
      return out ? out.toString().split('\n').filter(Boolean).map((n) => n + '/') : [];
    }
    const names = new Set();
    if (this.tip(g.run)) {
      const spec = `refs/heads/${branchFor(g.run)}:${g.path}`;
      const out = git(this.repo, ['ls-tree', '-z', spec], { allowFail: true });
      if (out) for (const rec of out.toString('utf8').split('\0').filter(Boolean)) {
        const [meta, name] = rec.split('\t');
        names.add(meta.includes(' tree ') ? name + '/' : name);
      }
    }
    const prefix = g.path + '/';
    for (const p of this._batch?.runs.get(g.run)?.keys() ?? []) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length), i = rest.indexOf('/');
      names.add(i < 0 ? rest : rest.slice(0, i + 1));
    }
    return [...names];
  }

  async _provenance(p) {
    const run = p.split('/')[1];
    const out = git(this.repo, ['log', '-1', '--format=%H', `refs/heads/${branchFor(run)}`, '--', p], { allowFail: true });
    return { commit: out ? out.toString().trim() : null };
  }

  // Verify the remote is reachable and push unsynced branches. Throws REMOTE_UNREACHABLE.
  async syncRemote() {
    if (!this.remote) return { pushed: 0 };
    git(this.repo, ['ls-remote', '--exit-code', this.remote], { allowFail: false });
    let pushed = 0;
    for (const run of [...this.unsynced]) {
      git(this.repo, ['push', '-q', this.remote, `refs/heads/${branchFor(run)}:refs/heads/${branchFor(run)}`]);
      this.unsynced.delete(run); pushed++;
    }
    return { pushed };
  }
}
