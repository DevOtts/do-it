#!/usr/bin/env node
// Generates the animated README SVGs under assets/ (pure CSS keyframes, no JS, no external refs).
// usage: node scripts/gen-motion-assets.mjs [--check]
//   hero and pipeline: the static originals (assets/*-static.svg) are the poster frames and the source;
//   the animated files are derived from them. Use cases are generated whole, each with a -static twin.
// Every element's default style is its final state, so removing the <style> block, or a reader with
// prefers-reduced-motion set, gets the finished picture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = (f) => path.join(ROOT, 'assets', f);

const pct = (t, T) => +((t / T) * 100).toFixed(3);
function kf(name, T, stops) {
  const s = [...stops].sort((a, b) => a[0] - b[0]);
  if (s[0][0] > 0) s.unshift([0, s[0][1]]);
  if (s[s.length - 1][0] < T) s.push([T, s[s.length - 1][1]]);
  const body = s.map(([t, p]) => pct(Math.min(t, T), T) + '%{' + Object.entries(p).map(([k, v]) => k + ':' + v).join(';') + '}').join('');
  return '@keyframes ' + name + '{' + body + '}';
}
const rule = (sel, name, T, extra = '') => sel + '{animation:' + name + ' ' + T + 's linear infinite' + extra + '}';
const REDUCE = '@media (prefers-reduced-motion:reduce){*{animation:none!important}.pk{display:none}}';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BASE = { fill: '#10203a', stroke: '#1e2d44' };
const LIT = {
  blue: { fill: '#0b3a52', stroke: '#38bdf8' },
  amber: { fill: '#2a2208', stroke: '#fbbf24' },
  red: { fill: '#3a0f12', stroke: '#f87171' },
  green: { fill: '#06352b', stroke: '#34d399' },
};
const PKT = { blue: '#38bdf8', amber: '#fbbf24', red: '#f87171', green: '#34d399' };

// ---------------------------------------------------------------- hero and pipeline (derived from static)
function addClass(svg, startTag, cls) {
  if (!svg.includes(startTag)) throw new Error('hero/pipeline anchor missing: ' + startTag);
  return svg.replace(startTag, startTag.replace(/^<(\w+) /, '<$1 class="' + cls + '" '));
}
function litRules(prefix, T, visits, kind = 'blue') {
  // visits: [[id, arriveSeconds, holdSeconds, kind?]]
  let css = '';
  for (const [id, a, hold, k] of visits) {
    const L = LIT[k || kind];
    css += kf(prefix + id, T, [[0, BASE], [Math.max(a - 0.05, 0), BASE], [a, L], [a + hold, L], [a + hold + 0.8, BASE], [T, BASE]]);
    css += rule('.' + prefix + id, prefix + id, T);
  }
  return css;
}
function walk(points, speed, t0, dwellAt = {}) {
  // points: [[x,y,id?]] -> keyframe stops with arrival time per id
  const stops = [];
  const arrive = {};
  let t = t0;
  points.forEach((p, i) => {
    if (i > 0) { const q = points[i - 1]; t += Math.hypot(p[0] - q[0], p[1] - q[1]) / speed; }
    stops.push([t, p]);
    if (p[2]) arrive[p[2]] = t;
    if (dwellAt[p[2]]) { t += dwellAt[p[2]]; stops.push([t, p]); }
  });
  return { stops, arrive, end: t };
}

function heroAnimated(src) {
  const T = 14;
  let s = src;
  const path = [[250, 285, 'msg'], [407, 285, 'router'], [624, 230, 'prompt'], [760, 230, 'plan'], [896, 230, 'build'], [896, 290], [624, 290], [624, 350, 'review'], [760, 350, 'deploy'], [896, 350, 'conclude'], [990, 300, 'out']];
  const w = walk(path, 150, 0.8, { router: 0.2, prompt: 0.15, plan: 0.3, build: 0.2, review: 0.15, deploy: 0.3, conclude: 0.3 });
  const a = w.arrive;
  const pk = w.stops.map(([t, p]) => [t, { transform: 'translate(' + p[0] + 'px,' + p[1] + 'px)', opacity: 1 }]);
  pk.unshift([0, { transform: 'translate(250px,285px)', opacity: 0 }], [0.6, { transform: 'translate(250px,285px)', opacity: 0 }]);
  pk[2][1].opacity = 1;
  pk.push([w.end + 0.6, { transform: 'translate(990px,300px)', opacity: 0 }]);
  let css = kf('pk', T, pk) + rule('.pk', 'pk', T);
  const nodeFor = [['msg', 'box_msg'], ['router', 'box_router'], ['prompt', 'n_prompt'], ['plan', 'n_plan'], ['build', 'n_build'], ['review', 'n_review'], ['deploy', 'n_deploy'], ['conclude', 'n_conclude']];
  s = addClass(s, '<rect x="60" y="230" width="190"', 'lit_box_msg');
  s = addClass(s, '<rect x="312" y="200" width="190"', 'lit_box_router');
  const tags = { n_prompt: '<rect x="564" y="210"', n_plan: '<rect x="700" y="210"', n_build: '<rect x="836" y="210"', n_review: '<rect x="564" y="330"', n_deploy: '<rect x="700" y="330"', n_conclude: '<rect x="836" y="330"' };
  for (const [k, tag] of Object.entries(tags)) s = addClass(s, tag, 'lit_' + k);
  css += litRules('lit_', T, nodeFor.map(([k, id]) => [id, a[k] - 0.05, 0.9]));
  // spine bar: lit while the packet is inside the router
  s = addClass(s, '<rect x="332" y="326" width="150"', 'lit_spine');
  css += kf('lit_spine', T, [[0, { fill: '#0b3a52' }], [a.router, { fill: '#0b3a52' }], [a.router + 0.1, { fill: '#38bdf8' }], [a.router + 0.7, { fill: '#0b3a52' }], [T, { fill: '#0b3a52' }]]) + rule('.lit_spine', 'lit_spine', T);
  // gates pulse as the packet passes the node below or above them
  const gates = [['<circle cx="760" cy="196" r="9"', 'g_ratify', a.plan], ['<circle cx="760" cy="384" r="9"', 'g_deploy', a.deploy], ['<circle cx="896" cy="384" r="9"', 'g_accept', a.conclude]];
  for (const [tag, id, t] of gates) {
    s = addClass(s, tag, id);
    css += kf(id, T, [[0, { fill: 'none' }], [t - 0.05, { fill: 'none' }], [t, { fill: '#fbbf24' }], [t + 1.1, { fill: 'none' }], [T, { fill: 'none' }]]) + rule('.' + id, id, T);
  }
  // delivery text
  s = s.replace('<text x="1010" y="292"', '<text class="deliv" x="1010" y="292"');
  css += kf('deliv', T, [[0, { fill: '#7dd3fc' }], [a.out - 0.05, { fill: '#7dd3fc' }], [a.out, { fill: '#34d399' }], [a.out + 2.5, { fill: '#34d399' }], [a.out + 3, { fill: '#7dd3fc' }], [T, { fill: '#7dd3fc' }]]) + rule('.deliv', 'deliv', T);
  // host chips take turns
  const chips = ['<rect x="60" y="492" width="200"', '<rect x="280" y="492" width="200"', '<rect x="500" y="492" width="200"', '<rect x="720" y="492" width="200"'];
  chips.forEach((tag, i) => {
    const id = 'host' + i, t = i * 3.5;
    s = addClass(s, tag, id);
    css += kf(id, T, [[0, i === 0 ? LIT.blue : { fill: '#10203a', stroke: i === 0 ? '#38bdf8' : '#1e2d44' }], [Math.max(t - 0.05, 0), LIT.blue], [t + 3.3, LIT.blue], [t + 3.5, i === 3 ? LIT.blue : BASE], [T, i === 3 ? LIT.blue : BASE]]) + rule('.' + id, id, T);
  });
  // chips that are not first get stroke back to base at wrap handled by keyframes above
  const pkt = '<g class="pk"><circle r="9" fill="#38bdf8" opacity="0.25"/><circle r="5" fill="#e8eefc"/></g>';
  s = s.replace('</defs>', '</defs>');
  s = s.replace('</desc>', '</desc>\n  <style>' + css + REDUCE + '</style>');
  s = s.replace('</svg>', '  ' + pkt + '\n</svg>');
  return s;
}

function pipelineAnimated(src) {
  const T = 14;
  let s = src;
  const ids = ['prompt', 'plan', 'build', 'review', 'deploy', 'conclude'];
  const xs = [115, 285, 455, 625, 795, 965];
  const rects = [50, 220, 390, 560, 730, 900];
  rects.forEach((x, i) => { s = addClass(s, '<rect x="' + x + '" y="130" width="130"', 'lit_' + ids[i]); });
  const t0 = 0.8, step = 1.4;
  const at = (i) => t0 + i * step;
  const pts = xs.map((x, i) => [x, 155, ids[i]]);
  const stops = [[0, { transform: 'translate(' + xs[0] + 'px,155px)', opacity: 0 }], [at(0) - 0.2, { transform: 'translate(' + xs[0] + 'px,155px)', opacity: 0 }]];
  pts.forEach((p, i) => { stops.push([at(i) - (i ? 0.1 : 0), { transform: 'translate(' + p[0] + 'px,155px)', opacity: 1 }]); if (i < 5) stops.push([at(i) + 0.55, { transform: 'translate(' + p[0] + 'px,155px)', opacity: 1 }]); });
  stops.push([at(5) + 0.9, { transform: 'translate(1065px,155px)', opacity: 1 }], [at(5) + 1.4, { transform: 'translate(1065px,155px)', opacity: 0 }]);
  let css = kf('pk', T, stops) + rule('.pk', 'pk', T);
  css += litRules('lit_', T, ids.map((id, i) => [id, at(i) - 0.1, 0.8, id === 'conclude' ? 'green' : 'blue']));
  // owner pack glows at the ratify gate (the plan node)
  s = s.replace('<rect x="200" y="60" width="170"', '<rect class="op" x="200" y="60" width="170"');
  css += kf('op', T, [[0, { fill: '#2a2208' }], [at(1) - 0.3, { fill: '#2a2208' }], [at(1), { fill: '#5a4510' }], [at(1) + 1.2, { fill: '#2a2208' }], [T, { fill: '#2a2208' }]]) + rule('.op', 'op', T);
  // failure loops march, then flash as the packet passes review
  s = s.replace('<path d="M625 180 V230 H455 V180"', '<path class="loop1" d="M625 180 V230 H455 V180"');
  s = s.replace('<path d="M795 180 V280 H455 V180"', '<path class="loop2" d="M795 180 V280 H455 V180"');
  css += kf('march', 1, [[0, { 'stroke-dashoffset': 0 }], [1, { 'stroke-dashoffset': -24 }]]);
  css += '.loop1,.loop2{animation:march 1.2s linear infinite}';
  // spine pulses on each stage report
  s = s.replace('<rect x="50" y="360" width="1000" height="56"', '<rect class="spine" x="50" y="360" width="1000" height="56"');
  css += kf('spine', T, [[0, { fill: '#0b3a52' }], ...ids.flatMap((_, i) => [[at(i) + 0.1, { fill: '#0b3a52' }], [at(i) + 0.3, { fill: '#0f5272' }], [at(i) + 0.9, { fill: '#0b3a52' }]]), [T, { fill: '#0b3a52' }]]) + rule('.spine', 'spine', T);
  // finish line flag lights at the end
  s = s.replace('<text x="1090" y="228"', '<text class="fin" x="1090" y="228"');
  css += kf('fin', T, [[0, { fill: '#34d399', opacity: 0.55 }], [at(5) + 0.2, { fill: '#34d399', opacity: 0.55 }], [at(5) + 0.6, { fill: '#a7f3d0', opacity: 1 }], [at(5) + 3, { fill: '#34d399', opacity: 1 }], [at(5) + 3.5, { fill: '#34d399', opacity: 0.55 }], [T, { fill: '#34d399', opacity: 0.55 }]]) + rule('.fin', 'fin', T);
  const pkt = '<g class="pk"><circle r="9" fill="#38bdf8" opacity="0.25"/><circle r="5" fill="#e8eefc"/></g>';
  s = s.replace('</desc>', '</desc>\n  <style>' + css + REDUCE + '</style>');
  s = s.replace('</svg>', '  ' + pkt + '\n</svg>');
  return s;
}

// ---------------------------------------------------------------- use case journeys
const F = 'font-family="Helvetica, Arial, sans-serif"';
const M = 'font-family="Menlo, Consolas, monospace"';

function journey(u) {
  const T = u.T;
  const n = u.nodes.length, w = n <= 5 ? 140 : 128, gap = (1100 - n * w) / (n - 1);
  const nx = (i) => 50 + i * (w + gap), cx = (i) => nx(i) + w / 2;
  const NY = 130, NH = 54, RAIL = 108;
  let css = '', body = '';
  // title
  body += `<text x="50" y="50" ${F} font-size="26" font-weight="700" fill="#e8eefc">${esc(u.title)}</text>\n`;
  body += `<text x="50" y="74" ${M} font-size="13" fill="#7dd3fc">${esc(u.sub)}</text>\n`;
  // rail and nodes
  body += `<path d="M${cx(0)} ${RAIL} H${cx(n - 1)}" stroke="#1e2d44" stroke-width="2" fill="none"/>\n`;
  u.nodes.forEach((nd, i) => {
    body += `<path d="M${cx(i)} ${RAIL} V${NY}" stroke="#1e2d44" stroke-width="2" fill="none"/>\n`;
    body += `<rect class="nd lit_n${i}" x="${nx(i)}" y="${NY}" width="${w}" height="${NH}" rx="10" fill="${nd.gate ? '#2a2208' : '#10203a'}" stroke="${nd.gate ? '#fbbf24' : '#1e2d44'}" stroke-width="2"/>\n`;
    body += `<text x="${cx(i)}" y="${NY + 24}" text-anchor="middle" ${M} font-size="15" font-weight="700" fill="#e8eefc">${esc(nd.name)}</text>\n`;
    body += `<text x="${cx(i)}" y="${NY + 42}" text-anchor="middle" ${M} font-size="11" fill="${nd.gate ? '#fbbf24' : '#7dd3fc'}">${esc(nd.sub)}</text>\n`;
    if (i < n - 1) body += `<path d="M${nx(i) + w + 6} ${NY + NH / 2} H${nx(i + 1) - 10}" stroke="#38bdf8" stroke-width="2" fill="none"/><path d="M${nx(i + 1) - 12} ${NY + NH / 2 - 5} L${nx(i + 1) - 4} ${NY + NH / 2} L${nx(i + 1) - 12} ${NY + NH / 2 + 5} Z" fill="#38bdf8"/>\n`;
  });
  // node lit rules from visits
  u.nodes.forEach((nd, i) => {
    const base = nd.gate ? { fill: '#2a2208', stroke: '#fbbf24' } : BASE;
    const vs = u.visits.filter((v) => v.node === i);
    if (!vs.length) return;
    const st = [[0, base]];
    for (const v of vs) { const L = LIT[v.kind || (nd.gate ? 'amber' : 'blue')]; st.push([Math.max(v.t - 0.05, 0), st[st.length - 1][1]], [v.t, L], [v.t + v.dwell, L], [v.t + v.dwell + 0.7, base]); }
    st.push([T, base]);
    css += kf('lit_n' + i, T, st) + rule('.lit_n' + i, 'lit_n' + i, T);
  });
  // final node ends green (poster = finished)
  const lastNode = u.nodes.length - 1;
  body = body.replace(`class="nd lit_n${lastNode}" x="${nx(lastNode)}" y="${NY}" width="${w}" height="${NH}" rx="10" fill="#10203a" stroke="#1e2d44"`, `class="nd lit_n${lastNode}" x="${nx(lastNode)}" y="${NY}" width="${w}" height="${NH}" rx="10" fill="${LIT.green.fill}" stroke="${LIT.green.stroke}"`);
  {
    const vs = u.visits.filter((v) => v.node === lastNode), v = vs[vs.length - 1];
    css += kf('lit_n' + lastNode, T, [[0, BASE], [Math.max(v.t - 0.05, 0), BASE], [v.t, LIT.green], [T, LIT.green]]) + rule('.lit_n' + lastNode, 'lit_n' + lastNode, T);
  }
  // loops (dashed arcs under the nodes)
  (u.loops || []).forEach((lp, k) => {
    const x1 = cx(lp.from), x2 = cx(lp.to), y0 = NY + NH, y1 = y0 + 22;
    body += `<path class="loop l${k}" d="M${x1} ${y0} V${y1} H${x2} V${y0 + 5}" stroke="#f59e0b" stroke-width="2" stroke-dasharray="7 5" fill="none"/><path d="M${x2 - 5} ${y0 + 9} L${x2} ${y0 + 1} L${x2 + 5} ${y0 + 9} Z" fill="#f59e0b"/>\n`;
    body += `<text x="${(x1 + x2) / 2}" y="${y1 + 15}" text-anchor="middle" ${M} font-size="11" fill="#f59e0b">${esc(lp.label)}</text>\n`;
    const st = [[0, { opacity: 1 }]];
    lp.times.forEach((t) => st.push([t - 0.05, { opacity: 0.15 }], [t, { opacity: 1 }], [t + 1.3, { opacity: 1 }], [t + 1.6, { opacity: 0.35 }]));
    st.push([T, { opacity: 1 }]);
    css += kf('l' + k, T, st) + rule('.l' + k, 'l' + k, T);
  });
  // packet on the rail
  {
    const pos = (i) => 'translate(' + cx(i) + 'px,' + RAIL + 'px)';
    const first = u.visits[0], last = u.visits[u.visits.length - 1];
    const st = [[0, { transform: pos(first.node), opacity: 0, fill: PKT.blue }], [first.t - 0.4, { transform: pos(first.node), opacity: 0, fill: PKT.blue }]];
    u.visits.forEach((v, i) => {
      const col = PKT[v.pkt || 'blue'];
      st.push([v.t - (i ? 0.05 : 0), { transform: pos(v.node), opacity: 1, fill: col }], [v.t + v.dwell, { transform: pos(v.node), opacity: 1, fill: col }]);
    });
    st.push([last.t + last.dwell + 0.6, { transform: pos(last.node), opacity: 0, fill: PKT.green }]);
    css += kf('pk', T, st) + rule('.pk', 'pk', T);
    body += `<g class="pk" opacity="0"><circle r="11" opacity="0.28"/><circle r="6"/></g>\n`;
  }
  // human bubble (use case 3)
  if (u.bubble) {
    const b = u.bubble, bx = cx(b.node), bw = b.text.length * 7.4 + 28;
    body += `<g class="bub"><rect x="${bx - bw / 2}" y="${NY + NH + 14}" width="${bw}" height="26" rx="13" fill="#2a2208" stroke="#fbbf24"/><text x="${bx}" y="${NY + NH + 32}" text-anchor="middle" ${M} font-size="13" fill="#fbbf24">${esc(b.text)}</text></g>\n`;
    css += kf('bub', T, [[0, { opacity: 1 }], [b.t - 0.05, { opacity: 0 }], [b.t, { opacity: 1 }], [T, { opacity: 1 }]]) + rule('.bub', 'bub', T);
  }
  // files strip
  const FY = 248;
  body += `<text x="50" y="${FY - 8}" ${M} font-size="12" fill="#5b6b85">${esc(u.filesLabel)}</text>\n`;
  let fx = 50;
  u.files.forEach((f, i) => {
    const cw = f.text.length * 7.3 + 26;
    const col = f.color || '#38bdf8';
    body += `<g class="fc f${i}"><rect x="${fx}" y="${FY}" width="${cw}" height="28" rx="14" fill="#0b1a2e" stroke="${col}"/><text x="${fx + cw / 2}" y="${FY + 19}" text-anchor="middle" ${M} font-size="12" fill="#e8eefc">${esc(f.text)}</text></g>\n`;
    css += kf('f' + i, T, [[0, { opacity: 0 }], [f.t, { opacity: 0 }], [f.t + 0.5, { opacity: 1 }], [T, { opacity: 1 }]]) + rule('.f' + i, 'f' + i, T);
    fx += cw + 12;
  });
  // log panel
  const LY = 298;
  body += `<rect x="50" y="${LY}" width="710" height="166" rx="10" fill="#0a1626" stroke="#1e2d44"/>\n`;
  body += `<text x="66" y="${LY + 20}" ${M} font-size="11" fill="#5b6b85">what happens, in order</text>\n`;
  u.log.forEach((l, i) => {
    body += `<text class="lg g${i}" x="66" y="${LY + 46 + i * 21}" ${M} font-size="13" fill="${l.color || '#e8eefc'}">${esc(l.text)}</text>\n`;
    css += kf('g' + i, T, [[0, { opacity: 0 }], [l.t, { opacity: 0 }], [l.t + 0.45, { opacity: 1 }], [T, { opacity: 1 }]]) + rule('.g' + i, 'g' + i, T);
  });
  // right panel: state.json status stack, round stack, meter, extras
  const RX = 790, RW = 360;
  body += `<rect x="${RX}" y="${LY}" width="${RW}" height="46" rx="10" fill="#0a1626" stroke="#1e2d44"/>\n`;
  body += `<text x="${RX + 14}" y="${LY + 28}" ${M} font-size="12" fill="#5b6b85">state.json status</text>\n`;
  const stackRules = (arr, prefix, x, y, size, anchor) => {
    arr.forEach((it, i) => {
      const next = arr[i + 1], last = !next;
      const col = it.color || '#e8eefc';
      body += `<text class="${prefix}${i}" x="${x}" y="${y}" text-anchor="${anchor}" ${M} font-size="${size}" font-weight="700" fill="${col}"${last ? '' : ' opacity="0"'}>${esc(it.label)}</text>\n`;
      const st = [[0, { opacity: 0 }], [Math.max(it.t - 0.05, 0), { opacity: 0 }], [it.t, { opacity: 1 }]];
      if (next) st.push([next.t - 0.05, { opacity: 1 }], [next.t, { opacity: 0 }]);
      else st.push([T, { opacity: 1 }]);
      css += kf(prefix + i, T, st) + rule('.' + prefix + i, prefix + i, T);
    });
  };
  stackRules(u.status, 'st', RX + RW - 14, LY + 29, 14, 'end');
  // meter
  const MY = LY + 70;
  body += `<text x="${RX}" y="${MY}" ${M} font-size="12" fill="#5b6b85">token-meter.jsonl (one row per event)</text>\n`;
  body += `<rect x="${RX}" y="${MY + 10}" width="${RW}" height="12" rx="6" fill="#10203a" stroke="#1e2d44"/>\n`;
  body += `<rect class="mt" x="${RX}" y="${MY + 10}" width="${RW}" height="12" rx="6" fill="#38bdf8" style="transform-box:fill-box;transform-origin:left center"/>\n`;
  {
    const fin = u.meter[u.meter.length - 1][1];
    const st = [[0, { transform: 'scaleX(0)' }]];
    u.meter.forEach(([t, v]) => st.push([t, { transform: 'scaleX(' + +(v / fin).toFixed(3) + ')' }]));
    css += kf('mt', T, st) + rule('.mt', 'mt', T);
    body += `<text x="${RX}" y="${MY + 40}" ${M} font-size="11" fill="#5b6b85">${esc(u.meterNote)}</text>\n`;
  }
  // extras
  let ey = MY + 54;
  (u.extras || []).forEach((x, i) => {
    if (x.kind === 'flip') {
      const cw = 170, col = i % 2;
      const ex = RX + x.col * (cw + 20), exy = x.y;
      body += `<rect x="${ex}" y="${exy}" width="${cw}" height="26" rx="13" fill="#10203a" stroke="#1e2d44"/><text x="${ex + cw / 2}" y="${exy + 18}" text-anchor="middle" ${M} font-size="12" fill="#5b6b85">${esc(x.base)}</text>\n`;
      body += `<g class="ex${i}"><rect x="${ex}" y="${exy}" width="${cw}" height="26" rx="13" fill="${LIT.green.fill}" stroke="#34d399"/><text x="${ex + cw / 2}" y="${exy + 18}" text-anchor="middle" ${M} font-size="12" fill="#34d399">${esc(x.text)}</text></g>\n`;
      css += kf('ex' + i, T, [[0, { opacity: 0 }], [x.t, { opacity: 0 }], [x.t + 0.4, { opacity: 1 }], [T, { opacity: 1 }]]) + rule('.ex' + i, 'ex' + i, T);
    } else {
      const col = x.color || '#fbbf24', cw = x.text.length * 7.3 + 26;
      body += `<g class="ex${i}"><rect x="${RX}" y="${ey}" width="${cw}" height="28" rx="14" fill="#0b1a2e" stroke="${col}"/><text x="${RX + cw / 2}" y="${ey + 19}" text-anchor="middle" ${M} font-size="12" fill="${col}">${esc(x.text)}</text></g>\n`;
      const st = [[0, { opacity: 0 }], [x.t, { opacity: 0 }], [x.t + 0.4, { opacity: 1 }]];
      if (x.until) st.push([x.until, { opacity: 1 }], [x.until + 0.4, { opacity: 0 }], [T, { opacity: 0 }]);
      else st.push([T, { opacity: 1 }]);
      css += kf('ex' + i, T, st) + rule('.ex' + i, 'ex' + i, T);
      if (x.until) body = body.replace(`<g class="ex${i}">`, `<g class="ex${i}" opacity="0">`);
      ey += 36;
    }
  });
  if (u.foot) body += `<text x="50" y="${LY + 188}" ${M} font-size="11" fill="#5b6b85">${esc(u.foot)}</text>\n`;
  const H = 496;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 ${H}" width="1200" height="${H}" role="img" aria-labelledby="t d">\n  <title id="t">${esc(u.alt.title)}</title>\n  <desc id="d">${esc(u.alt.desc)}</desc>\n`;
  const bg = `  <rect x="1" y="1" width="1198" height="${H - 2}" rx="18" fill="#0b1220" stroke="#1e2d44" stroke-width="2"/>\n`;
  const mk = (withStyle) => head + (withStyle ? `  <style>${css}${REDUCE}</style>\n` : '') + bg + body.split('\n').map((l) => '  ' + l).join('\n') + '</svg>\n';
  return { animated: mk(true), staticSvg: mk(false).replace(/<g class="pk"[\s\S]*?<\/g>\n\s*/, '') };
}

// ---------------------------------------------------------------- the four use cases
const CASES = {
  'do-it-uc-feature': {
    T: 19,
    title: 'Use case 1: a small feature, overnight',
    sub: 'preset feature  /  one message before bed  /  host: Claude Code',
    nodes: [
      { name: 'intake', sub: 'T3' }, { name: 'plan', sub: 'T1' }, { name: 'ratify', sub: 'owner gate', gate: true },
      { name: 'build slice', sub: 'T2' }, { name: 'verify', sub: 'T2' }, { name: 'conclude', sub: 'T2' },
    ],
    visits: [
      { node: 0, t: 1.0, dwell: 1.2 }, { node: 1, t: 3.2, dwell: 1.6 }, { node: 2, t: 5.6, dwell: 1.4, kind: 'amber', pkt: 'amber' },
      { node: 3, t: 8.0, dwell: 2.2 }, { node: 4, t: 10.8, dwell: 2.2 }, { node: 5, t: 14.0, dwell: 1.8 },
    ],
    status: [
      { t: 1.0, label: 'INTAKE' }, { t: 3.2, label: 'PLANNING' }, { t: 5.6, label: 'AWAIT_RATIFY', color: '#fbbf24' }, { t: 8.0, label: 'BUILDING' },
      { t: 10.8, label: 'VERIFYING' }, { t: 14.0, label: 'CONCLUDING' }, { t: 16.0, label: 'DONE', color: '#34d399' },
    ],
    meter: [[1.2, 0.05], [3.0, 0.08], [4.8, 0.3], [7.4, 0.34], [10.2, 0.7], [13.0, 0.84], [15.8, 0.92]],
    meterNote: 'cumulative, drawn to shape only (no scale)',
    filesLabel: 'plain files under .do-it/runs/<run-id>/',
    files: [
      { text: 'state.json', t: 0.8 }, { text: 'events.jsonl', t: 1.0 }, { text: 'token-meter.jsonl', t: 1.0 },
      { text: 'results/ (it-result/1)', t: 4.8 }, { text: 'ledger.json', t: 11.2, color: '#34d399' },
    ],
    log: [
      { t: 1.0, text: '> "add slugify to the utils, tests must pass"', color: '#7dd3fc' },
      { t: 3.2, text: 'planner T1 writes the plan; every decision resolved or defaulted' },
      { t: 5.6, text: 'ratify: you approve the plan and its recorded defaults', color: '#fbbf24' },
      { t: 8.0, text: 'builder T2 builds; its last act is an it-result/1 file' },
      { t: 11.2, text: 'spine record: DOD-1..DOD-4 VERIFIED, evidence/DOD-n.log' },
      { t: 14.0, text: 'stop-gate: 4 of 4 rows terminal, so the run may end', color: '#34d399' },
    ],
    extras: [
      { kind: 'flip', col: 0, y: 414, base: 'DOD-1 OPEN', text: 'DOD-1 VERIFIED', t: 11.4 },
      { kind: 'flip', col: 1, y: 414, base: 'DOD-2 OPEN', text: 'DOD-2 VERIFIED', t: 12.0 },
      { kind: 'flip', col: 0, y: 444, base: 'DOD-3 OPEN', text: 'DOD-3 VERIFIED', t: 12.6 },
      { kind: 'flip', col: 1, y: 444, base: 'DOD-4 OPEN', text: 'DOD-4 VERIFIED', t: 13.2 },
    ],
    foot: 'measured on the overnight feature fixture, real Claude Code host: 442.5 input plus output tokens per VERIFIED row (T3 and cache excluded)',
    alt: {
      title: 'Use case: a small feature, overnight',
      desc: 'An animation of one message travelling through intake, plan, the ratify gate, a build slice, verify and conclude. Plain files appear as it goes: state.json, events.jsonl, token-meter.jsonl, it-result/1 result files and the ledger. Four definition-of-done rows flip from OPEN to VERIFIED and the stop-gate lets the run end with 4 of 4 rows terminal. The status in state.json moves from INTAKE to DONE.',
    },
  },
  'do-it-uc-limit': {
    T: 21,
    title: 'Use case 2: the usage limit hits mid-build',
    sub: 'park, wake, resume: the run continues from files, not from memory',
    nodes: [
      { name: 'plan', sub: 'T1' }, { name: 'ratify', sub: 'owner gate', gate: true }, { name: 'build slice', sub: 'T2' },
      { name: 'verify', sub: 'T2' }, { name: 'conclude', sub: 'T2' },
    ],
    visits: [
      { node: 0, t: 1.0, dwell: 1.4 }, { node: 1, t: 3.2, dwell: 1.0, kind: 'amber', pkt: 'amber' },
      { node: 2, t: 5.2, dwell: 5.4, kind: 'red', pkt: 'red' },
      { node: 3, t: 13.6, dwell: 1.8 }, { node: 4, t: 16.4, dwell: 1.6 },
    ],
    status: [
      { t: 1.0, label: 'PLANNING' }, { t: 3.2, label: 'AWAIT_RATIFY', color: '#fbbf24' }, { t: 5.2, label: 'BUILDING' },
      { t: 7.6, label: 'PARKED', color: '#f87171' }, { t: 11.2, label: 'BUILDING' }, { t: 13.6, label: 'VERIFYING' },
      { t: 16.4, label: 'CONCLUDING' }, { t: 18.0, label: 'DONE', color: '#34d399' },
    ],
    meter: [[1.2, 0.1], [3.0, 0.28], [6.0, 0.4], [7.4, 0.5], [12.0, 0.52], [15.0, 0.78], [18.0, 0.9]],
    meterNote: 'the meter keeps counting across the park',
    filesLabel: 'plain files under .do-it/runs/<run-id>/',
    files: [
      { text: 'state.json', t: 0.8 }, { text: 'token-meter.jsonl', t: 1.0 }, { text: 'results/ (it-result/1)', t: 7.0, color: '#f87171' },
      { text: 'park.json', t: 8.6, color: '#f87171' },
    ],
    log: [
      { t: 5.2, text: 'builder T2 starts the build slice' },
      { t: 7.0, text: 'result file says: status usage_limit, exit_code 3', color: '#f87171' },
      { t: 8.2, text: 'do-it park --reason usage_limit --reset-at <ISO time>', color: '#f87171' },
      { t: 9.0, text: 'state PARKED; park.json holds the state files and next action' },
      { t: 11.2, text: 'reset time passes; the wake hook (if the host has one) runs do-it resume', color: '#7dd3fc' },
      { t: 12.4, text: 'a fresh conductor reads the files and picks up the same slice', color: '#34d399' },
    ],
    extras: [
      { text: 'waiting for the reset time', color: '#f87171', t: 8.8, until: 11.0 },
    ],
    foot: 'a host with no wake hook stays PARKED until you run do-it resume; nothing is lost either way',
    alt: {
      title: 'Use case: the usage limit hits mid-build',
      desc: 'An animation of a run that reaches the build slice and hits a usage limit. The build result reports usage_limit with exit code 3, the spine parks the run and writes park.json, the status in state.json becomes PARKED, time passes until the reset, then do-it resume lets a fresh conductor continue the same slice, through verify to conclude and DONE.',
    },
  },
  'do-it-uc-ownerpack': {
    T: 21,
    title: 'Use case 3: one question pack, then the run resumes',
    sub: 'ask once: every open decision travels in a single numbered owner pack',
    nodes: [
      { name: 'plan', sub: 'T1' }, { name: 'ratify', sub: 'owner pack', gate: true }, { name: 'build slice', sub: 'T2' },
      { name: 'verify', sub: 'T2' }, { name: 'conclude', sub: 'T2' },
    ],
    visits: [
      { node: 0, t: 1.0, dwell: 1.8 }, { node: 1, t: 3.6, dwell: 7.6, kind: 'amber', pkt: 'amber' },
      { node: 2, t: 12.6, dwell: 2.2 }, { node: 3, t: 15.4, dwell: 1.6 }, { node: 4, t: 17.6, dwell: 1.4 },
    ],
    bubble: { node: 1, t: 8.6, text: 'you: 1 yes 2 no 3: B' },
    status: [
      { t: 1.0, label: 'PLANNING' }, { t: 3.6, label: 'AWAIT_RATIFY', color: '#fbbf24' }, { t: 12.6, label: 'BUILDING' },
      { t: 15.4, label: 'VERIFYING' }, { t: 17.6, label: 'CONCLUDING' }, { t: 19.2, label: 'DONE', color: '#34d399' },
    ],
    meter: [[1.2, 0.1], [3.4, 0.3], [4.4, 0.3], [11.0, 0.3], [14.4, 0.62], [17.0, 0.82], [19.0, 0.9]],
    meterNote: 'flat while it waits for you: no model is running',
    filesLabel: 'plain files under .do-it/runs/<run-id>/',
    files: [
      { text: 'state.json', t: 0.8 }, { text: 'token-meter.jsonl', t: 1.0 }, { text: 'owner-pack.json', t: 4.0, color: '#fbbf24' },
      { text: 'owner-pack.md / .html', t: 4.4, color: '#fbbf24' }, { text: 'answers.json', t: 9.6, color: '#34d399' },
    ],
    log: [
      { t: 1.0, text: 'planner T1 writes READINESS.json: decisions resolved or defaulted' },
      { t: 3.6, text: 'the questions only you can answer go into one numbered pack', color: '#fbbf24' },
      { t: 4.8, text: 'shown as a native question, else HTML, else Markdown (host decides)' },
      { t: 8.6, text: 'you reply in one line: 1 yes 2 no 3: B', color: '#fbbf24' },
      { t: 9.6, text: 'do-it answer parses it into answers.json (source: reply)', color: '#34d399' },
      { t: 12.6, text: 'ratified: the build starts from the recorded answers' },
    ],
    extras: [
      { text: 'waiting for you, not burning tokens', color: '#fbbf24', t: 4.4, until: 9.6 },
    ],
    foot: 'slices that do not depend on your answer keep moving meanwhile; an unanswered question falls back to its recorded default',
    alt: {
      title: 'Use case: an owner pack that asks a human and resumes',
      desc: 'An animation of a run that plans, then stops at the ratify gate with one numbered owner pack. The status in state.json is AWAIT_RATIFY while the run waits and the token meter stays flat. The owner replies in one line, do-it answer writes answers.json, the status moves to BUILDING, and the run continues through verify and conclude to DONE.',
    },
  },
  'do-it-uc-review': {
    T: 23,
    title: 'Use case 4: a review loop that converges, then deploy',
    sub: 'preset feature  /  review loops back to build, with a hard round limit',
    nodes: [
      { name: 'build slice', sub: 'T2' }, { name: 'verify', sub: 'T2' }, { name: 'review', sub: 'T2 / max 3 rounds' },
      { name: 'deploy', sub: 'owner gate', gate: true }, { name: 'conclude', sub: 'T2' },
    ],
    visits: [
      { node: 0, t: 1.0, dwell: 0.8 }, { node: 1, t: 2.4, dwell: 0.6 }, { node: 2, t: 3.6, dwell: 1.0 },
      { node: 0, t: 5.6, dwell: 0.6 }, { node: 1, t: 6.8, dwell: 0.5 }, { node: 2, t: 7.8, dwell: 1.0 },
      { node: 0, t: 9.8, dwell: 0.6 }, { node: 1, t: 11.0, dwell: 0.5 }, { node: 2, t: 12.0, dwell: 1.4, kind: 'green', pkt: 'green' },
      { node: 3, t: 14.4, dwell: 2.0, kind: 'amber', pkt: 'amber' }, { node: 4, t: 17.6, dwell: 1.6 },
    ],
    loops: [{ from: 2, to: 0, label: 'findings above minor loop back to build', times: [4.6, 8.8] }],
    status: [
      { t: 1.0, label: 'BUILDING' }, { t: 2.4, label: 'VERIFYING' }, { t: 3.6, label: 'REVIEWING' }, { t: 4.8, label: 'FIXING', color: '#f59e0b' },
      { t: 6.8, label: 'VERIFYING' }, { t: 7.8, label: 'REVIEWING' }, { t: 9.0, label: 'FIXING', color: '#f59e0b' }, { t: 11.0, label: 'VERIFYING' },
      { t: 12.0, label: 'REVIEWING' }, { t: 14.4, label: 'DEPLOYING', color: '#fbbf24' }, { t: 17.6, label: 'CONCLUDING' }, { t: 19.4, label: 'DONE', color: '#34d399' },
    ],
    meter: [[1.8, 0.1], [3.4, 0.2], [5.2, 0.3], [7.2, 0.4], [8.6, 0.5], [10.6, 0.6], [13.0, 0.72], [16.0, 0.8], [19.0, 0.9]],
    meterNote: 'each round appends rows; the round cap bounds the cost',
    filesLabel: 'plain files under .do-it/runs/<run-id>/',
    files: [
      { text: 'state.json (review.round)', t: 0.8 }, { text: 'token-meter.jsonl', t: 1.0 },
      { text: 'results/ (it-result/1)', t: 3.0 }, { text: 'ledger.json', t: 12.6, color: '#34d399' },
    ],
    log: [
      { t: 3.6, text: 'round 1: reviewer finds issues above minor, loop to build', color: '#f59e0b' },
      { t: 7.8, text: 'round 2: loop to build again, within the 3-round cap', color: '#f59e0b' },
      { t: 12.0, text: 'round 3: converged with minors; exit by rule, not by mood', color: '#34d399' },
      { t: 12.8, text: 'the 2 minors become backlog cards, they do not block' },
      { t: 14.4, text: 'deploy gate: you approve; legs are verified one by one', color: '#fbbf24' },
      { t: 17.6, text: 'conclude: the run closes when every finish-line row is terminal' },
    ],
    extras: [
      { text: 'backlog cards from minors: 2', color: '#34d399', t: 13.0 },
    ],
    foot: 'measured on the review-loop fixture (converge variant): ends in round 3 with 2 minors; deploy legs are exercised against fixtures only',
    alt: {
      title: 'Use case: a review loop that converges, then a deploy',
      desc: 'An animation of build, verify and review repeating as findings above minor loop back to build. The state.json status alternates between VERIFYING, REVIEWING and FIXING until round 3, where the review converges with two minors that become backlog cards. The run then reaches the deploy gate, the owner approves, and the run concludes with status DONE.',
    },
  },
};

// ---------------------------------------------------------------- write
function build() {
  const out = {};
  const heroStatic = fs.readFileSync(A('do-it-hero-static.svg'), 'utf8');
  const pipeStatic = fs.readFileSync(A('do-it-pipeline-static.svg'), 'utf8');
  out['do-it-hero.svg'] = heroAnimated(heroStatic);
  out['do-it-pipeline.svg'] = pipelineAnimated(pipeStatic);
  for (const [name, u] of Object.entries(CASES)) {
    const r = journey(u);
    out[name + '.svg'] = r.animated;
    out[name + '-static.svg'] = r.staticSvg;
  }
  return out;
}

const files = build();
if (process.argv.includes('--check')) {
  const bad = Object.entries(files).filter(([f, c]) => !fs.existsSync(A(f)) || fs.readFileSync(A(f), 'utf8') !== c).map(([f]) => f);
  if (bad.length) { console.error('stale assets: ' + bad.join(', ') + ' (run node scripts/gen-motion-assets.mjs)'); process.exit(1); }
  console.log('motion assets are current (' + Object.keys(files).length + ' files)');
} else {
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(A(f), c);
  console.log('wrote ' + Object.keys(files).join(', '));
}
