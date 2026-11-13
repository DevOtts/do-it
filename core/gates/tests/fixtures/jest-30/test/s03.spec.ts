import { m03 } from '../src/m03';
const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('s03', () => {
  expect(m03()).toBe('m03:m02:util');
});
