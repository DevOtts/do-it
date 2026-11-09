// CP-03 R6-S1-M13 source lint: the spine opens no file but through core/spine/src/fs-atomic.mjs, whose readers
// take regular files only (capped) and whose appender refuses a FIFO, a device or a symlink without blocking.
// A raw readFileSync / appendFileSync / openSync / createReadStream / writeFileSync anywhere else in src/ can
// hang the spine on a FIFO, which the hook then turns into an unchecked stop.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const RAW = /\b(?:fs\.)?(readFileSync|appendFileSync|openSync|createReadStream|createWriteStream|writeFileSync)\b/;
// Allowlist: `file:CALL` pairs that are permitted. Empty on purpose: every read and append the spine makes
// goes through fs-atomic.mjs (readRegularFile / readText / readJsonIfExists / readJsonRegular / appendRegular /
// atomicWrite). Add an entry only with a comment saying why that file can never be a FIFO.
const ALLOW = new Set([]);

test('CP03 R6-S1-M13 lint: no raw file open, read or append in core/spine/src outside fs-atomic.mjs', () => {
  const hits = [];
  for (const name of fs.readdirSync(SRC).filter((n) => n.endsWith('.mjs')).sort()) {
    if (name === 'fs-atomic.mjs') continue;
    fs.readFileSync(path.join(SRC, name), 'utf8').split('\n').forEach((line, i) => {
      const m = RAW.exec(line);
      if (m && !ALLOW.has(name + ':' + m[1])) hits.push(name + ':' + (i + 1) + ' ' + m[1] + '  ' + line.trim());
    });
  }
  assert.deepEqual(hits, [], 'route these through fs-atomic.mjs:\n' + hits.join('\n'));
});

// CP-03 R7-S1-L6: build.mjs bundles core/renderers and core/drivers/secrets into the spine as well, so the
// same rule holds there.
test('CP03 R7-S1-L6 lint: no raw file open, read or append in any other bundled source (renderers, secrets drivers)', () => {
  const core = path.resolve(SRC, '..', '..');
  const hits = [];
  for (const sub of ['renderers', path.join('drivers', 'secrets')]) {
    const dir = path.join(core, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) {
      fs.readFileSync(path.join(dir, name), 'utf8').split('\n').forEach((line, i) => {
        const m = RAW.exec(line);
        if (m) hits.push(sub + '/' + name + ':' + (i + 1) + ' ' + m[1] + '  ' + line.trim());
      });
    }
  }
  assert.deepEqual(hits, [], 'route these through core/spine/src/fs-atomic.mjs:\n' + hits.join('\n'));
});

test('CP03 R6-S1-M13 lint: fs-atomic.mjs opens for append only through appendRegular', () => {
  const text = fs.readFileSync(path.join(SRC, 'fs-atomic.mjs'), 'utf8');
  assert.doesNotMatch(text, /\bappendFileSync\b|\bcreateReadStream\b|\bcreateWriteStream\b|\breadFileSync\b/);
});
