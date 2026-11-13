import { m01 } from '../src/m01';
const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('s01', () => {
  expect(m01()).toBe('m01:util');
});
