import { m05 } from '../src/m05';
const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('s05', () => {
  expect(m05()).toBe('m05:m04:m03:m02:util');
});
