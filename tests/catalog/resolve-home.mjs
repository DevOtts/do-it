// Reference resolver for the do-it root, as the catalog specifies it for every companion plugin.
//   DO_IT_HOME set                -> its value
//   else linked git worktree      -> {main checkout}/.do-it  (via git rev-parse --git-common-dir)
//   else                          -> {repo toplevel}/.do-it
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

export function resolveDoItHome({ cwd, env = process.env }) {
  if (env.DO_IT_HOME) return env.DO_IT_HOME;
  const git = (...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
  const common = resolve(cwd, git('rev-parse', '--git-common-dir'));
  return resolve(dirname(common), '.do-it');
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(resolveDoItHome({ cwd: process.cwd() }));
