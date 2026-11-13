#!/usr/bin/env node
// Pass-through around the real `do-it gate decide` (A1_DECIDE_ENTRY, a JSON argv array) that counts calls the way
// fake-decide.mjs does (one line per call in FAKE_DECIDE_COUNT_FILE), so "decide once per run" is asserted against the
// real command. Exit code, stdout and stderr are the real decide's.
import cp from 'node:child_process';
import fs from 'node:fs';

const env = process.env;
if (env.FAKE_DECIDE_COUNT_FILE) fs.appendFileSync(env.FAKE_DECIDE_COUNT_FILE, 'call\n');
const real = JSON.parse(env.A1_DECIDE_ENTRY);
const r = cp.spawnSync(real[0], [...real.slice(1), ...process.argv.slice(2)], { stdio: 'inherit', env });
process.exit(r.status === null ? 1 : r.status);
