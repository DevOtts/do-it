// Pure renderer: owner pack -> one self-contained HTML string. No script, no
// external resource; every dynamic value is escaped.
export function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function replyExample(questions) {
  const parts = [];
  for (const q of questions) {
    if (q.recommendation === null || q.recommendation === undefined || q.recommendation === '') continue;
    parts.push(q.options.includes(q.recommendation) ? q.n + ' ' + q.recommendation : q.n + ': ' + q.recommendation);
  }
  return parts.join(' ');
}

export function renderHtml(pack) {
  const out = [];
  out.push('<!doctype html>');
  out.push('<html lang="en">');
  out.push('<head>');
  out.push('<meta charset="utf-8" />');
  out.push('<meta name="pack-id" content="' + escapeHtml(pack.pack_id) + '" />');
  out.push('<title>do-it owner pack</title>');
  out.push('<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.5}li{margin:1rem 0}code{background:#eee;padding:0 .25rem}.meta{color:#555}</style>');
  out.push('</head>');
  out.push('<body>');
  out.push('<h1>Owner pack</h1>');
  out.push('<p class="meta">Run ' + escapeHtml(pack.run_id) + ' / pack ' + escapeHtml(String(pack.pack_id).slice(0, 12)) + '</p>');
  out.push('<ol>');
  for (const q of pack.questions) {
    const rec = q.recommendation === null || q.recommendation === undefined ? 'none' : q.recommendation;
    const def = q.default === null || q.default === undefined ? 'none' : q.default;
    out.push('<li id="q' + q.n + '" value="' + q.n + '">');
    out.push('<p><strong>' + escapeHtml(q.text) + '</strong> <span class="meta">(' + escapeHtml(q.kind) + (q.reversible ? '' : ', irreversible') + ')</span></p>');
    out.push('<p>Options: ' + (q.options.length ? q.options.map((o) => '<code>' + escapeHtml(o) + '</code>').join(' ') : 'free text') + '</p>');
    out.push('<p>Recommendation: ' + escapeHtml(rec) + '</p>');
    out.push('<p>Default: ' + escapeHtml(def) + '</p>');
    out.push('</li>');
  }
  out.push('</ol>');
  const ex = replyExample(pack.questions);
  out.push('<p>Reply tersely, for example <code>' + escapeHtml(ex || '1 yes') + '</code>. Use <code>all except N N</code> to accept every recommendation but the named ones, or <code>N: free text</code>.</p>');
  out.push('</body>');
  out.push('</html>');
  return out.join('\n') + '\n';
}
