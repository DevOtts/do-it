// Stub spine for the hooks: records each call, answers from DO_IT_STUB_FIXTURE (JSON file keyed by "gate stop", "gate ceiling", "park").
import { readFileSync } from 'node:fs';
import { createStubSpine } from '../../_interface/fake/spine-stub.mjs';

const args = process.argv.slice(2);
const name = args[0] === 'gate' ? `gate ${args[1]}` : args[0];
const fixture = process.env.DO_IT_STUB_FIXTURE ? JSON.parse(readFileSync(process.env.DO_IT_STUB_FIXTURE, 'utf8')) : {};
const spine = createStubSpine({ logPath: process.env.DO_IT_STUB_LOG, fixture });
const { _exit = 0, ...answer } = spine.call(name, { args }) ?? {};
process.stdout.write(JSON.stringify(answer));
process.exit(_exit);
