import { m04 } from '../src/m04';
const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('s04', () => {
  expect(m04()).toBe('m04:m03:m02:util');
});
