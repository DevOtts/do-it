// Fixture gate command. Flags (any order):
//   --touch FILE        write Date.now() to FILE at start
//   --append FILE TEXT  append "TEXT " to FILE at start
//   --ppid FILE         write process.ppid to FILE
//   --until FILE        idle until FILE exists (poll 50 ms)
//   --hold-ms N         idle N ms
//   --exit N            exit code (default 0)
import fs from 'node:fs';

const a = process.argv.slice(2);
let until = null;
let hold = 0;
let code = 0;
for (let i = 0; i < a.length; i++) {
  const k = a[i];
  if (k === '--touch') fs.writeFileSync(a[++i], String(Date.now()));
  else if (k === '--append') { const f = a[++i]; fs.appendFileSync(f, a[++i] + ' '); }
  else if (k === '--ppid') fs.writeFileSync(a[++i], String(process.ppid));
  else if (k === '--until') until = a[++i];
  else if (k === '--hold-ms') hold = Number(a[++i]);
  else if (k === '--exit') code = Number(a[++i]);
}
const t0 = Date.now();
const tick = () => {
  if (until && !fs.existsSync(until)) return setTimeout(tick, 50);
  if (Date.now() - t0 < hold) return setTimeout(tick, Math.min(50, hold - (Date.now() - t0)));
  process.exit(code);
};
tick();
