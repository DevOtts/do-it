#!/usr/bin/env node
// Deterministic bundler: core/spine/src/*.mjs -> core/spine/do-it.mjs.
// Sorted module order, relative import/export stripped, node: imports hoisted
// and de-duplicated, schemas embedded. Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, 'src');
const schemaDir = path.join(here, '..', 'schemas');
const driversDir = path.join(here, '..', 'drivers', 'secrets');
const renderersDir = path.join(here, '..', 'renderers');
const outFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, 'do-it.mjs');

const IMPORT_RE = /^import\s[\s\S]*?\sfrom\s+(['"])([^'"]+)\1;?[ \t]*$/gm;
const DECL_RE = /^(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+)(\w+)/gm;

const nodeImports = new Set();
const seen = new Map();
const bodies = [];

// src modules first, then the secrets drivers (core/drivers/secrets), each sorted.
const sources = [
  ...fs.readdirSync(srcDir).filter((f) => f.endsWith('.mjs')).sort().map((f) => ({ file: f, full: path.join(srcDir, f) })),
  ...(fs.existsSync(renderersDir) ? fs.readdirSync(renderersDir).filter((f) => f.endsWith('.mjs')).sort().map((f) => ({ file: 'renderers/' + f, full: path.join(renderersDir, f) })) : []),
  ...(fs.existsSync(driversDir) ? fs.readdirSync(driversDir).filter((f) => f.endsWith('.mjs')).sort().map((f) => ({ file: 'drivers/secrets/' + f, full: path.join(driversDir, f) })) : []),
];
const files = sources.map((s) => s.file);
for (const { file, full } of sources) {
  let text = fs.readFileSync(full, 'utf8');
  text = text.replace(IMPORT_RE, (stmt, _q, spec) => {
    if (spec.startsWith('node:')) {
      nodeImports.add(stmt.replace(/\s+/g, ' ').trim().replace(/;?$/, ';'));
      return '';
    }
    if (spec.startsWith('./') || spec.startsWith('../')) return '';
    throw new Error(file + ': only node: and relative imports are allowed, found ' + spec);
  });
  if (/^export\s+(default|\{|\*)/m.test(text)) throw new Error(file + ': only named declaration exports are supported');
  text = text.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '');
  let m;
  DECL_RE.lastIndex = 0;
  while ((m = DECL_RE.exec(text))) {
    if (seen.has(m[1])) throw new Error('duplicate top-level name ' + m[1] + ' in ' + seen.get(m[1]) + ' and ' + file);
    seen.set(m[1], file);
  }
  bodies.push('// ---- ' + file + ' ----\n' + text.trim() + '\n');
}

const schemas = {};
for (const f of fs.readdirSync(schemaDir).filter((n) => n.endsWith('.schema.json')).sort()) {
  schemas[f] = JSON.parse(fs.readFileSync(path.join(schemaDir, f), 'utf8'));
}

const out = [
  '#!/usr/bin/env node',
  '// do-it spine: built by core/spine/build.mjs from core/spine/src. Do not edit.',
  ...Array.from(nodeImports).sort(),
  '',
  'const EMBEDDED_SCHEMAS = ' + JSON.stringify(schemas) + ';',
  '',
  bodies.join('\n'),
  'const doItResult = cliMain(process.argv.slice(2), { cwd: process.cwd(), env: process.env });',
  'process.stdout.write(doItResult.stdout);',
  'process.exitCode = doItResult.exit;',
  '',
].join('\n');

fs.writeFileSync(outFile, out);
fs.chmodSync(outFile, 0o755);
process.stdout.write('built ' + path.relative(process.cwd(), outFile) + ' (' + files.length + ' modules, ' + out.length + ' bytes)\n');
