// A review-it checkpoint verdict file, judged the way build-it's checkpoints
// reader and review-it's status-sync judge it: only report prose counts
// (fenced ``` and ~~~ code, indented code and HTML comments are ignored), one
// checkpoint id, and every overall `verdict:` line says the same value,
// exactly PASS or FAIL. Anything ambiguous is not a pass.

export function proseLines(text) {
  const out = [];
  let fence = null;
  let comment = false;
  for (const raw of text.split(/\r?\n/)) {
    if (fence) {
      const close = raw.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      out.push('');
      continue;
    }
    if (comment) { if (raw.includes('-->')) comment = false; out.push(''); continue; }
    const open = raw.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) { fence = open[1]; out.push(''); continue; }
    if (/^\s*<!--/.test(raw)) { if (!raw.includes('-->')) comment = true; out.push(''); continue; }
    if (/^( {4,}|\t)/.test(raw)) { out.push(''); continue; }
    out.push(raw.trim());
  }
  return out;
}

// Returns { state: pass|fail|invalid|contradictory, reason }.
export function parseVerdict(text, id) {
  if (!text.trim()) return { state: 'invalid', reason: 'the file is empty' };
  const cps = new Set();
  const overall = [];
  const tasks = [];
  let inTask = false;
  for (const line of proseLines(text)) {
    if (line === '') { inTask = false; continue; }
    let m = /^checkpoint\s*:\s*(.*)$/i.exec(line);
    if (m) { cps.add(m[1].trim()); continue; }
    if (/^task\s*:/i.test(line)) { inTask = true; continue; }
    m = /^verdict\s*:\s*(.*)$/i.exec(line);
    if (m) (inTask ? tasks : overall).push(m[1].trim().split(/\s+/)[0].replace(/^[`*]+|[`*.,;]+$/g, ''));
  }
  if (cps.size === 0) return { state: 'invalid', reason: 'no "checkpoint: ' + id + '" line outside code and comments' };
  if (cps.size > 1) return { state: 'invalid', reason: 'names more than one checkpoint (' + [...cps].join(', ') + ')' };
  if (!cps.has(id)) return { state: 'invalid', reason: 'does not name checkpoint ' + id + ' (names ' + [...cps][0] + ')' };
  if (!overall.length) return { state: 'invalid', reason: 'no "verdict: PASS|FAIL" line outside code and comments' };
  const odd = [...new Set([...overall, ...tasks])].filter((v) => v !== 'PASS' && v !== 'FAIL');
  if (odd.length) return { state: 'invalid', reason: 'verdict value ' + odd.map((v) => JSON.stringify(v)).join(', ') + ' is not PASS or FAIL' };
  if (new Set(overall).size > 1) return { state: 'contradictory', reason: 'the overall verdict lines say both PASS and FAIL' };
  const v = overall[0];
  if (v === 'PASS' && tasks.some((t) => t !== 'PASS')) return { state: 'contradictory', reason: 'overall PASS but a task block is not PASS' };
  return { state: v === 'PASS' ? 'pass' : 'fail', reason: v === 'PASS' ? null : 'review-it verdict is FAIL' };
}
