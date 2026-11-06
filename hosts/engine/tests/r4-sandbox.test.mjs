// Moved from tests/e2e/r4.test.mjs (epic E1): the one R4 case that needs a live Engine.
import { test } from 'node:test';

test('T-R4-05 sandboxes equal slices needing a build (D16) [REAL]', async (t) => {
  // Sandboxes are created by the Engine. With no reachable Engine the case cannot be VERIFIED; the stub never plays it.
  const { probeEngine } = await import('../live/probe.mjs');
  const rec = await probeEngine({});
  if (!rec.reachable) { t.skip('IMPLEMENTED-NOT-VERIFIED: no live Engine (' + rec.error + ')'); return; }
  t.skip('IMPLEMENTED-NOT-VERIFIED: Engine reachable at ' + rec.baseUrl + ' but Engine PR #727 only injects cards and reads their state: no do-it W3 pipeline or drain is installed, so no card runs and no sandbox is created to sample (sampler and check are ready in tests/e2e/lib/worktrees.mjs)');
});
