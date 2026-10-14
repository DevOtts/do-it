// ATTENDED-GATE.html generator and result ingest (PRD D23). Self-contained: no external URLs.
// One tickable row per attended check with id, origin tag, round and fingerprint, PASS and FAIL controls and a note box.
// Export produces JSON { schema: "attended-gate-result/1", rows: [...] } that ingest() accepts.
import fs from 'node:fs';
import path from 'node:path';

export const ORIGINS = ['plan', 'build', 'review'];
export const RESULT_SCHEMA = 'attended-gate-result/1';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Runs in the page. Reads each row wrapper (data-wrap) and returns the export object.
export function buildExport(doc) {
  const rows = Array.from(doc.querySelectorAll('[data-wrap]')).map((w) => {
    const val = (sel) => { const e = w.querySelector(sel); return e ? e.value : ''; };
    return {
      row: w.dataset.row, origin: w.dataset.origin, round: Number(w.dataset.round), fingerprint: w.dataset.fingerprint,
      ticked: !!(w.querySelector('input[type=checkbox]') || {}).checked,
      verdict: w.dataset.verdict || null,
      note: val('[data-field=note]'), test_path: val('[data-field=test_path]'), cannot_automate: val('[data-field=cannot_automate]'),
    };
  });
  return { schema: 'attended-gate-result/1', rows };
}

const SCRIPT = `
${buildExport.toString()}
document.addEventListener('click', function (ev) {
  var t = ev.target;
  if (t && t.dataset && t.dataset.verdictBtn) {
    var w = t.closest('[data-wrap]');
    w.dataset.verdict = t.dataset.verdictBtn;
    var cb = w.querySelector('input[type=checkbox]'); if (cb) cb.checked = true;
  }
  if (t && t.id === 'export') {
    document.getElementById('export-out').value = JSON.stringify(buildExport(document), null, 2);
  }
});
`;

export function generate(rows, { title = 'ATTENDED-GATE', run_id = '' } = {}) {
  for (const r of rows) {
    if (!r.id) throw new Error('row id required');
    if (!ORIGINS.includes(r.origin)) throw new Error(`origin must be one of ${ORIGINS.join(', ')}: ${r.id}`);
  }
  const body = rows.map((r) => `<section class="row" data-wrap data-row="${esc(r.id)}" data-origin="${esc(r.origin)}" data-round="${esc(r.round ?? 1)}" data-fingerprint="${esc(r.fingerprint ?? '')}">
  <label><input type="checkbox" data-row="${esc(r.id)}" data-origin="${esc(r.origin)}"> <b>${esc(r.id)}</b> <span class="tag">${esc(r.origin)}</span> <span class="meta">round ${esc(r.round ?? 1)} · ${esc(r.fingerprint ?? '')}</span></label>
  <p>${esc(r.text ?? '')}</p>
  <button type="button" data-verdict-btn="PASS">PASS</button> <button type="button" data-verdict-btn="FAIL">FAIL</button>
  <textarea data-field="note" placeholder="note"></textarea>
  <input data-field="test_path" placeholder="FAIL: regression test path"> <input data-field="cannot_automate" placeholder="FAIL: or why it cannot be automated">
</section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>body{font:15px/1.4 system-ui,sans-serif;max-width:46rem;margin:1rem auto;padding:0 1rem}.row{border:1px solid #8884;border-radius:6px;padding:.6rem;margin:.6rem 0}.tag{background:#8882;border-radius:4px;padding:0 .4rem}.meta{color:#888;font-size:12px}textarea,input[data-field]{display:block;width:100%;margin:.3rem 0;box-sizing:border-box}[data-verdict=PASS]{border-color:#2a7}[data-verdict=FAIL]{border-color:#c33}</style>
</head><body>
<h1>${esc(title)}</h1><p class="meta">run ${esc(run_id)} · tick only what a machine cannot check; a FAIL needs a test path or a reason.</p>
${body}
<button type="button" id="export">Export result JSON</button>
<textarea id="export-out" rows="10" readonly></textarea>
<script>${SCRIPT}</script>
</body></html>
`;
}

export function writeGate(file, rows, opts) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, generate(rows, opts));
  return file;
}

// Accepts the exported JSON. FAIL rows open a ratchet entry; rows without a verdict stay unanswered.
export function ingest(result, expectedRows = null) {
  if (!result || result.schema !== RESULT_SCHEMA || !Array.isArray(result.rows)) throw Object.assign(new Error('RESULT_INVALID'), { outcome: 'RESULT_INVALID' });
  const known = expectedRows ? new Set(expectedRows.map((r) => r.id)) : null;
  const passed = []; const unanswered = []; const ratchet = [];
  for (const r of result.rows) {
    if (known && !known.has(r.row)) throw Object.assign(new Error('RESULT_ROW_UNKNOWN ' + r.row), { outcome: 'RESULT_ROW_UNKNOWN' });
    if (!ORIGINS.includes(r.origin)) throw Object.assign(new Error('RESULT_ORIGIN_INVALID ' + r.row), { outcome: 'RESULT_ORIGIN_INVALID' });
    if (r.verdict === 'PASS' && r.ticked) passed.push(r.row);
    else if (r.verdict === 'FAIL') ratchet.push({ id: r.row, origin: r.origin, round: r.round, fingerprint: r.fingerprint, note: r.note || '', test_path: r.test_path || null, cannot_automate: r.cannot_automate || null });
    else unanswered.push(r.row);
  }
  return { passed, unanswered, ratchet };
}
