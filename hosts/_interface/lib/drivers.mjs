// Shared driver implementations (isolation, secrets, stateStore) for adapters that keep run state on disk.
// Secrets: a value is handed to the callback and never returned, logged or stored (G-7).
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

export function createDrivers({ workdir, repo } = {}) {
  const secretValues = new Set();
  return {
    isolation: {
      // With a repo the isolation is a git worktree; otherwise a scratch directory.
      create(name) {
        const d = join(workdir, 'iso', name);
        if (repo) {
          mkdirSync(dirname(d), { recursive: true });
          const r = spawnSync('git', ['-C', repo, 'worktree', 'add', '-b', name, d], { encoding: 'utf8' });
          if (r.status !== 0) throw new Error(`worktree add failed: ${r.stderr.trim()}`);
        } else mkdirSync(d, { recursive: true });
        return d;
      },
      remove(name) {
        const d = join(workdir, 'iso', name);
        if (repo) spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', d]);
        rmSync(d, { recursive: true, force: true });
      },
    },
    secrets: {
      use(ref, fn) {
        const v = process.env[ref.replace(/^env:/, '')];
        if (v === undefined) return { present: false };
        secretValues.add(v);
        mkdirSync(workdir, { recursive: true });
        appendFileSync(join(workdir, 'secrets.log'), `used ${ref}\n`);
        fn(v);
        return { present: true };
      },
      redact(text) { let t = String(text); for (const v of secretValues) t = t.split(v).join('[REDACTED]'); return t; },
      describe(ref) { return { ref, present: process.env[ref.replace(/^env:/, '')] !== undefined }; },
    },
    stateStore: {
      put(key, value) { const p = join(workdir, 'runs', key); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(value)); },
      get(key) { const p = join(workdir, 'runs', key); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; },
      append(key, row) { const p = join(workdir, 'runs', key); mkdirSync(dirname(p), { recursive: true }); appendFileSync(p, JSON.stringify(row) + '\n'); },
      list(prefix = '') { const d = join(workdir, 'runs', prefix); return existsSync(d) ? readdirSync(d) : []; },
    },
  };
}
