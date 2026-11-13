import { m06 } from '../src/m06';
const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('s16', () => {
  expect(m06()).toBe('m06:util');
});
