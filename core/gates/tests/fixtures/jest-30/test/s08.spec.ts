import * as fs from 'fs';
import * as path from 'path';
const stall = process.env.FIXTURE_STALL;
if (stall && __filename.endsWith(stall + '.spec.ts')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);

test('s08', () => {
  const t = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'table.json'), 'utf8'));
  expect(t.rows.length).toBe(3);
});
