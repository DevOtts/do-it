import { m02 } from '../src/m02';
const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('s02', () => {
  expect(m02()).toBe('m02:util');
});
