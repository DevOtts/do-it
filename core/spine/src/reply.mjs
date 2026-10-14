// G-16: deterministic owner-reply parser. No locale-dependent calls: only
// toLowerCase (never toLocaleLowerCase), NFKC and fixed regexes, so the same
// text yields the same answers on every host, locale and time zone.
export function normalizeReply(text) {
  return String(text)
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[  -​  　﻿]/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

function replyMatchOption(rest, options) {
  const lowRest = rest.toLowerCase();
  const sameLen = lowRest.length === rest.length;
  const sorted = options.slice().sort((a, b) => b.length - a.length);
  for (const opt of sorted) {
    if (!opt) continue;
    let hit = rest.startsWith(opt);
    if (!hit && sameLen) hit = lowRest.startsWith(opt.toLowerCase()) && opt.toLowerCase().length === opt.length;
    if (hit && (rest.length === opt.length || rest[opt.length] === ' ')) return { option: opt, length: opt.length };
  }
  return null;
}

// Returns { items:[{n,answer,free_text}], except:null|{all:true,numbers:[]}, errors:[{kind,n?,...}] }.
export function parseReply(text, questions) {
  const byN = new Map(questions.map((q) => [q.n, q]));
  const out = { items: [], except: null, errors: [] };
  const segments = normalizeReply(text).split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    let rest = seg;
    while (rest) {
      let m;
      if ((m = /^(?:(?:approve|accept)\s+)?all(?:\s+except\b)?\s*/i.exec(rest))) {
        const isExcept = /except/i.test(m[0]);
        rest = rest.slice(m[0].length);
        const numbers = [];
        if (isExcept) {
          let nm;
          while ((nm = /^(\d+)\s*(?:,\s*|and\b\s*|&\s*)?/i.exec(rest))) {
            numbers.push(Number(nm[1]));
            rest = rest.slice(nm[0].length);
          }
        }
        out.except = { numbers: ((out.except && out.except.numbers) || []).concat(numbers) };
        continue;
      }
      if ((m = /^(\d+)\s*:\s*(.*)$/.exec(rest))) {
        out.items.push({ n: Number(m[1]), answer: m[2].trim(), free_text: true });
        rest = '';
        continue;
      }
      if ((m = /^(\d+)\s+(.+)$/.exec(rest))) {
        const n = Number(m[1]);
        const body = m[2];
        const q = byN.get(n);
        if (!q) {
          const tok = /^\S+/.exec(body)[0];
          out.items.push({ n, answer: tok, free_text: false });
          rest = body.slice(tok.length).trim();
          continue;
        }
        const hit = q.options.length ? replyMatchOption(body, q.options) : null;
        if (hit) {
          out.items.push({ n, answer: hit.option, free_text: false });
          rest = body.slice(hit.length).trim();
          continue;
        }
        const tok = /^\S+/.exec(body)[0];
        out.items.push({ n, answer: tok, free_text: false });
        rest = body.slice(tok.length).trim();
        continue;
      }
      out.errors.push({ kind: 'unparseable', token: rest.split(' ')[0] });
      rest = '';
    }
  }
  return out;
}
