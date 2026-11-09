// Stub spine for the hooks: records each call, answers from DO_IT_STUB_FIXTURE (JSON file keyed by "gate stop", "gate ceiling", "park").
// A fixture value that is an array answers in sequence: the n-th call of that name gets element n (the last one repeats).
import { readFileSync } from 'node:fs';
import { createStubSpine } from '../../_interface/fake/spine-stub.mjs';

const args = process.argv.slice(2);
const name = args[0] === 'gate' ? `gate ${args[1]}` : args[0];
const fixture = process.env.DO_IT_STUB_FIXTURE ? JSON.parse(readFileSync(process.env.DO_IT_STUB_FIXTURE, 'utf8')) : {};
const spine = createStubSpine({ logPath: process.env.DO_IT_STUB_LOG, fixture });
const seen = spine.calls().filter((c) => c.name === name).length;
let answer = spine.call(name, { args }) ?? {};
if (Array.isArray(answer)) answer = answer[Math.min(seen, answer.length - 1)] ?? {};
const { _exit = 0, ...out } = answer;
process.stdout.write(JSON.stringify(out));
process.exit(_exit);
