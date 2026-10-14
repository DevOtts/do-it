// Zero channels reached: write the owner pack to disk, html then markdown, and end BLOCKED (D12, CONTRACT s6).
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { renderHtml } from '../../../core/renderers/html.mjs';
import { renderMarkdown } from '../../../core/renderers/markdown.mjs';
import { ask } from './channels.mjs';

const writeAtomic = (file, text) => { writeFileSync(file + '.tmp', text); renameSync(file + '.tmp', file); };

export async function deliverPack(pack, transports, { runDir, emit = () => {} } = {}) {
  const events = [];
  const log = (row) => { events.push(row); emit(row); };
  const r = await ask(pack, transports, { emit: log });
  if (r.delivered.length) return { ...r, blocked: false, events };
  mkdirSync(runDir, { recursive: true });
  const html = join(runDir, 'owner-pack.html'), md = join(runDir, 'owner-pack.md');
  writeAtomic(html, renderHtml(pack));
  writeAtomic(md, renderMarkdown(pack));
  log({ event: 'pack_written_to_disk', files: [html, md] });
  return { ...r, blocked: true, status: 'blocked', reason: 'NO_CHANNEL_REACHED', exit: 3, files: [html, md], events };
}
