const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('s28', () => {
  const name = 'x';
  const mod = require(`../src/dyn/${name}`);
  expect(mod.dyn).toBe('x');
});
