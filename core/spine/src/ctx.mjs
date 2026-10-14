import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function realpathSafe(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

export function gitInfo(cwd, env) {
  try {
    const out = cp.execFileSync('git', ['rev-parse', '--show-toplevel', '--git-common-dir'], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n');
    const top = realpathSafe(out[0].trim());
    const common = realpathSafe(path.resolve(cwd, out[1].trim()));
    const main = path.basename(common) === '.git' ? path.dirname(common) : top;
    return { top, main: realpathSafe(main) };
  } catch {
    return null;
  }
}

// Home rule (ruling D7): DO_IT_HOME wins; else the main checkout of the git
// repository (so every worktree shares one .do-it/); else the working directory.
export function makeCtx(opts) {
  const env = opts.env || process.env;
  const cwd = realpathSafe(opts.cwd || process.cwd());
  const git = gitInfo(cwd, env);
  let root;
  let home;
  if (env.DO_IT_HOME) {
    root = realpathSafe(path.resolve(cwd, env.DO_IT_HOME));
    home = root;
  } else {
    root = git ? git.main : cwd;
    home = path.join(root, '.do-it');
  }
  return {
    cwd,
    env,
    git,
    repo: git ? git.top : cwd,
    root,
    home,
    userHome: env.HOME || os.homedir(),
    now: () => new Date().toISOString(),
  };
}
