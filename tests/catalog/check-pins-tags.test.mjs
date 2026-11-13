// T-H1-02 (H1-02): check-pins --tags fails when a pinned version has no matching tag v<version> on the remote.
// Uses a local bare-repo fixture via DO_IT_PIN_REMOTE_ROOT, so no network is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = join(ROOT, 'scripts', 'check-pins.mjs');
const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });

function fixture({ promptItPin, tags }) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'h1-pins-')));
  const remotes = join(base, 'remotes');
  const work = join(base, 'work');
  mkdirSync(join(remotes, 'DevOtts'), { recursive: true });
  mkdirSync(work, { recursive: true });
  // bare remote for prompt-it with the given tags
  const bare = join(remotes, 'DevOtts', 'prompt-it.git');
  git(['init', '--bare', '-q', bare], base);
  git(['init', '-q', work], base);
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init'], work);
  for (const t of tags) git(['tag', t], work);
  git(['push', '-q', bare, '--tags', 'HEAD:refs/heads/main'], work);
  // bare remote for do-it (self) with tag matching its pin, so only prompt-it can fail
  const selfBare = join(remotes, 'DevOtts', 'do-it.git');
  git(['init', '--bare', '-q', selfBare], base);
  git(['tag', 'v1.0.5'], work);
  git(['push', '-q', selfBare, 'v1.0.5'], work);
  // companions ledger root
  const root = join(base, 'root');
  mkdirSync(join(root, 'core'), { recursive: true });
  writeFileSync(join(root, 'core', 'companions.json'), JSON.stringify({
    schema: 'do-it-companions/1',
    marketplace: 'devotts',
    self: { name: 'do-it', version: '1.0.5' },
    companions: [
      { name: 'prompt-it', repo: 'DevOtts/prompt-it', version: promptItPin, required: true, status: 'published', skill_dir: 'plugins/prompt-it' },
    ],
  }, null, 2));
  return { base, root, remotes };
}

function run(fx) {
  return spawnSync('node', [CHECK, '--root', fx.root, '--tags'], {
    encoding: 'utf8',
    env: { ...process.env, DO_IT_PIN_REMOTE_ROOT: fx.remotes, GIT_TERMINAL_PROMPT: '0' },
  });
}

test('T-H1-02 pin with no remote tag v<version> exits 1 naming the sibling and version', () => {
  const fx = fixture({ promptItPin: '9.9.9', tags: ['v1.0.0'] });
  try {
    const r = run(fx);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /prompt-it/);
    assert.match(r.stdout, /9\.9\.9/);
    assert.match(r.stdout, /DevOtts\/prompt-it/);
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test('T-H1-02 pin with a matching remote tag passes (exit 0)', () => {
  const fx = fixture({ promptItPin: '1.0.0', tags: ['v1.0.0'] });
  try {
    const r = run(fx);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /no drift/);
  } finally {
    rmSync(fx.base, { recursive: true, force: true });
  }
});

test('T-H1-02 existing checks stay green: --lint on the real ledger still passes', () => {
  const r = spawnSync('node', [CHECK, '--lint'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(ROOT, 'core', 'companions.json')));
});
