// Pure renderer: owner pack -> markdown. Last line is an example reply.
import { replyExample } from './html.mjs';

export function renderMarkdown(pack) {
  const out = [];
  out.push('<!-- pack-id: ' + pack.pack_id + ' -->');
  out.push('# Owner pack');
  out.push('');
  for (const q of pack.questions) {
    const rec = q.recommendation === null || q.recommendation === undefined ? 'none' : q.recommendation;
    const def = q.default === null || q.default === undefined ? 'none' : q.default;
    out.push(q.n + '. ' + q.text);
    out.push('   Options: ' + (q.options.length ? q.options.join(' | ') : 'free text'));
    out.push('   Recommendation: ' + rec);
    out.push('   Default: ' + def);
    out.push('');
  }
  out.push('Example reply: `' + (replyExample(pack.questions) || '1 yes') + '`');
  return out.join('\n') + '\n';
}
