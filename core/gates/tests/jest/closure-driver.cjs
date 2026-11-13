'use strict';
// Child of the closure [REAL] tests: builds jest's own context in the fixture repository (cwd) and prints keys.json for
// the given spec paths. usage (cwd = repo): node closure-driver.cjs <manifest file> <spec path>...
const fs = require('node:fs');
const filter = require('../../adapters/jest/filter.cjs');
const closure = require('../../adapters/jest/closure.cjs');
const common = require('../../adapters/jest/common.cjs');

(async () => {
  const [manifestFile, ...paths] = process.argv.slice(2);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const repo = common.repoRootOf(process.cwd());
  const ctx = await filter.buildContext(process.cwd(), []);
  const keys = closure.buildKeys({ paths, repo, manifest, resolver: ctx.resolver, config: ctx.config, depResolver: ctx.depResolver, snapshotPath: ctx.snapshotPath, argv: [], version: ctx.version });
  process.stdout.write(JSON.stringify(keys));
})().catch((e) => { process.stderr.write(String((e && e.stack) || e) + '\n'); process.exit(1); });
