#!/usr/bin/env node
// README checker (epic R1). Modes: --order --claims --length --header --links --badges --tone --all
// usage: node scripts/check-readme.mjs [--file README.md] [--root DIR] [--mode ...]
// Exit 0 when every requested check passes; 1 with one line per violation on stdout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SECTIONS = ['The bottleneck it kills', 'Installation', 'How it works', 'The spine', 'Token economy', 'Five things you can say', 'What the morning report looks like', "What's inside", 'do-it x the family', 'Status', 'Security considerations', 'Platform compatibility', 'License'];
export const FOOTER = '_Built by [DevOtts](https://github.com/DevOtts)._';
const LENGTH_CAP = 450;

export function slug(h) {
  return h.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
}

function outsideCode(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

export function headings(text) {
  const out = [];
  let fence = false;
  text.split('\n').forEach((line, i) => {
    if (line.startsWith('```')) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
  });
  return out;
}

export function sectionBody(text, name) {
  const hs = headings(text).filter((h) => h.level === 2);
  const i = hs.findIndex((h) => h.text === name);
  if (i === -1) return '';
  const lines = text.split('\n');
  return lines.slice(hs[i].line, i + 1 < hs.length ? hs[i + 1].line - 1 : lines.length).join('\n');
}

export function checkOrder(text) {
  const errs = [];
  if (!text.startsWith('<div align="center">')) errs.push('first line is not the centered div opening');
  const hs = headings(text).filter((h) => h.level === 2).map((h) => h.text);
  let at = -1;
  for (const s of SECTIONS) {
    const i = hs.indexOf(s);
    if (i === -1) errs.push('missing section: ' + s);
    else if (i < at) errs.push('section out of order: ' + s);
    else at = i;
  }
  return errs;
}

export function checkLength(text) {
  const n = text.replace(/\n$/, '').split('\n').length;
  return n < LENGTH_CAP ? [] : ['README has ' + n + ' lines; the cap is fewer than ' + LENGTH_CAP];
}

// Digit-bearing sentences in Token economy and Status need a measured claim marker with the number in the sentence.
export function checkClaims(text, claimsFile) {
  const errs = [];
  const claims = JSON.parse(fs.readFileSync(claimsFile, 'utf8')).claims;
  const byId = new Map(claims.map((c) => [c.id, c]));
  for (const name of ['Token economy', 'Status']) {
    const body = sectionBody(text, name);
    if (!body) continue;
    const startLine = headings(text).find((h) => h.level === 2 && h.text === name).line;
    const lines = body.split('\n');
    let fence = false;
    lines.forEach((raw, idx) => {
      if (raw.startsWith('```')) { fence = !fence; return; }
      if (fence) return;
      // claim markers sit at the end of the sentence line or on the line after it
      const next = lines[idx + 1] || '';
      const markers = [...(raw + ' ' + (/^\s*<!-- claim:/.test(next) ? next : '')).matchAll(/<!-- claim:([\w.]+) -->/g)].map((m) => m[1]);
      const own = raw.replace(/<!-- claim:[\w.]+ -->/g, '').trim();
      const clean = outsideCode(own).replace(/https?:\/\/\S+/g, '').replace(/\b\d+\.\d+\.\d+\b/g, '').replace(/\bT[123]\b/g, '').replace(/^\s*\d+\.\s+/, '').replace(/^\s*\|?\s*\d+\s*\|/, '|');
      const ids = [...markers];
      for (const id of ids) {
        const c = byId.get(id);
        if (!c) errs.push('README line ' + (startLine + idx + 1) + ': claim ' + id + ' is not in tests/claims.json');
        else if (c.status !== 'measured') errs.push('README line ' + (startLine + idx + 1) + ': claim ' + id + ' is ' + c.status + ', not measured');
      }
      if (!/\d/.test(clean)) return;
      if (!ids.length) { errs.push('README line ' + (startLine + idx + 1) + ': digit-bearing claim without a ledger entry: ' + own.slice(0, 80)); return; }
      for (const id of ids) {
        const c = byId.get(id);
        if (c && typeof c.value === 'number' && !new RegExp('(^|[^\\d.])' + String(c.value).replace('.', '\\.') + '([^\\d]|$)').test(clean)) {
          errs.push('README line ' + (startLine + idx + 1) + ': claim ' + id + ' value ' + c.value + ' is not in the sentence');
        }
      }
    });
    // marker-only lines must have a digit sentence above, and ids were validated through the line above
    lines.forEach((raw, idx) => {
      if (/^\s*<!-- claim:/.test(raw)) {
        for (const m of raw.matchAll(/<!-- claim:([\w.]+) -->/g)) {
          const c = byId.get(m[1]);
          if (!c) errs.push('README line ' + (startLine + idx + 1) + ': claim ' + m[1] + ' is not in tests/claims.json');
        }
      }
    });
  }
  return [...new Set(errs)];
}

export function checkHeader(text, { releaseExists }) {
  const errs = [];
  const end = text.indexOf('\n</div>');
  if (!text.startsWith('<div align="center">') || end === -1) return ['header block is not wrapped in the centered div'];
  const h = text.slice(0, end);
  if (!/<h1>do-it<\/h1>/.test(h)) errs.push('no <h1>do-it</h1>');
  if (!/<h3><strong>[^<]+<\/strong><\/h3>/.test(h)) errs.push('no h3 with a strong tagline');
  if (!/<em>[^<]+<\/em>/.test(h)) errs.push('no em positioning line');
  const hero = /<a href="#how-it-works"><img src="assets\/do-it-hero\.svg" width="100%" alt="([^"]*)"><\/a>/.exec(h);
  if (!hero) errs.push('hero image is not inside a link to #how-it-works with width="100%"');
  else if (hero[1].length < 60) errs.push('hero alt text is shorter than 60 characters');
  const badges = [...h.matchAll(/https:\/\/img\.shields\.io\/[^"]+/g)];
  const expected = releaseExists ? 6 : 5;
  if (badges.length !== expected) errs.push('expected ' + expected + ' badges, found ' + badges.length);
  const nav = h.split('\n').find((l) => l.includes('&nbsp;·&nbsp;'));
  if (!nav) errs.push('no nav row separated by &nbsp;·&nbsp;');
  const callouts = (h.match(/^> \[!(NOTE|IMPORTANT)\]/gm) || []).length;
  if (callouts < 1 || callouts > 2) errs.push('expected one or two callouts, found ' + callouts);
  return errs;
}

export function checkBadges(text, { releaseExists }) {
  const errs = [];
  const labels = ['Quick Start', 'License MIT', 'Native Claude Code', 'portable SKILL.md', 'author DevOtts'];
  const imgs = [...text.slice(0, text.indexOf('\n</div>')).matchAll(/<img src="(https:\/\/img\.shields\.io\/[^"]+)" alt="([^"]*)"/g)];
  for (const [, url] of imgs) if (!url.includes('style=for-the-badge')) errs.push('badge without style=for-the-badge: ' + url);
  for (const l of labels) if (!imgs.some((m) => m[2] === l)) errs.push('missing badge label: ' + l);
  if (!releaseExists && imgs.some((m) => /version/i.test(m[2]))) errs.push('version badge present but no release tag exists');
  return errs;
}

export function checkLinks(text, root) {
  const errs = [];
  const slugs = new Set(headings(text).map((h) => slug(h.text)));
  const body = text.replace(/```[\s\S]*?```/g, '');
  for (const m of body.matchAll(/(?:href|src)="([^"]+)"|\]\(([^)\s]+)\)/g)) {
    const t = m[1] || m[2];
    if (/^https?:|^mailto:/.test(t)) continue;
    if (t.startsWith('#')) { if (!slugs.has(t.slice(1))) errs.push('broken anchor: ' + t); continue; }
    if (!fs.existsSync(path.join(root, t.split('#')[0]))) errs.push('broken file link: ' + t);
  }
  return errs;
}

export function checkTone(text) {
  const errs = [];
  const prose = outsideCode(text);
  for (const re of [/coming soon/i, /next month/i, /\b20[2-9]\d-\d\d\b/, /\b(TODO|TBD|FIXME|WIP)\b/, /lorem ipsum/i]) if (re.test(prose)) errs.push('tone: matches ' + re);
  for (const m of prose.replace(/<\/?(div|h[1-6]|strong|em|a|img|br|p|details|summary|sub|sup)\b[^>]*>/g, '').matchAll(/<[A-Za-z][^>\n]*>/g)) errs.push('tone: angle-bracket placeholder ' + m[0]);
  const status = sectionBody(text, 'Status');
  if (!/honest claim/i.test(status)) errs.push('Status has no honest claim paragraph');
  if (/hermes|openclaw/i.test(text)) errs.push('out-of-scope host named');
  return errs;
}

export function checkInstall(text, { root, installFile, depFile }) {
  const errs = [];
  const body = sectionBody(text, 'Installation');
  const hs = [...body.matchAll(/^### (.*)$/gm)].map((m) => m[1]);
  const want = ['Claude Code (native)', 'Codex', 'OpenCode', 'Engine', 'Others'];
  if (JSON.stringify(hs) !== JSON.stringify(want)) errs.push('Installation H3s are ' + JSON.stringify(hs));
  if (!/^> \[!TIP\]/m.test(body)) errs.push('Installation has no TIP block');
  const engine = body.split('### Engine')[1] || '';
  if (!engine.split('### Others')[0].includes('hosts/engine/README.md')) errs.push('Engine H3 does not link hosts/engine/README.md');
  if (!/sequentially/.test(body.split('### Others')[1] || '')) errs.push('Installation does not end with the sequential degrade note');
  const cmds = JSON.parse(fs.readFileSync(installFile, 'utf8')).hosts;
  const claude = body.split('### Claude Code (native)')[1].split('### Codex')[0];
  for (const c of cmds['claude-code'].commands) if (!claude.includes(c)) errs.push('missing Claude Code command: ' + c);
  for (const c of cmds.universal.commands) if (!body.includes(c)) errs.push('missing universal command: ' + c);
  for (const h of ['codex', 'opencode']) for (const c of cmds[h].commands) if (!body.includes(c)) errs.push('missing ' + h + ' command: ' + c);
  let resolved = false;
  try { resolved = JSON.parse(fs.readFileSync(depFile, 'utf8')).outcome === 'resolved'; } catch { resolved = false; }
  const says = /installs the family/.test(text);
  if (says && !resolved) errs.push('README says "installs the family" but the dependency evidence is not resolved');
  if (!resolved && !text.includes('do-it doctor --install')) errs.push('unresolved dependencies and no do-it doctor --install instruction');
  return errs;
}

export function checkFooter(text, root) {
  const errs = [];
  const last = text.trimEnd().split('\n').pop();
  if (last !== FOOTER) errs.push('last line is not the DevOtts footer');
  const lic = sectionBody(text, 'License');
  if (!lic.includes('](LICENSE)') || !/MIT/.test(lic)) errs.push('License section does not link LICENSE and name MIT');
  if (!fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').startsWith('MIT License')) errs.push('LICENSE does not start with "MIT License"');
  return errs;
}

function main(argv) {
  const flag = (k) => argv.includes('--' + k);
  const get = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };
  const root = path.resolve(get('root', path.join(HERE, '..')));
  const file = path.resolve(root, get('file', 'README.md'));
  const text = fs.readFileSync(file, 'utf8');
  const all = flag('all');
  const tags = fs.existsSync(path.join(root, '.git')) ? (await_tags(root)) : '';
  const ctx = { root, releaseExists: tags.trim().length > 0, installFile: path.join(root, 'tests', 'install-commands.json'), depFile: path.join(root, 'tests', 'plugin', 'evidence', 'dependency-resolution.json') };
  let errs = [];
  if (all || flag('order')) errs = errs.concat(checkOrder(text));
  if (all || flag('claims')) errs = errs.concat(checkClaims(text, path.join(root, 'tests', 'claims.json')));
  if (all || flag('length')) errs = errs.concat(checkLength(text));
  if (all || flag('header')) errs = errs.concat(checkHeader(text, ctx));
  if (all || flag('badges')) errs = errs.concat(checkBadges(text, ctx));
  if (all || flag('links')) errs = errs.concat(checkLinks(text, root));
  if (all || flag('tone')) errs = errs.concat(checkTone(text));
  if (all || flag('install')) errs = errs.concat(checkInstall(text, ctx));
  if (all || flag('footer')) errs = errs.concat(checkFooter(text, root));
  for (const e of errs) console.log(e);
  return errs.length ? 1 : 0;
}

import cp from 'node:child_process';
function await_tags(root) {
  const r = cp.spawnSync('git', ['tag'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
