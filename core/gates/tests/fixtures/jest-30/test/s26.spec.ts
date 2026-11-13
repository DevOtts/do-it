jest.mock('../src/mocked-only', () => ({}));
const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('s26', () => {
  expect(true).toBe(true);
});
