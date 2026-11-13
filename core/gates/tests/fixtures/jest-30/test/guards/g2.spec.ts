import * as fs from 'fs';
import * as path from 'path';
const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('g2 tree', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8');
  expect(text).toContain('jest-30-fixture');
});
