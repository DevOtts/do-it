#!/usr/bin/env node
// SessionStart hook. The spine is host-agnostic: it reads the session id from DO_IT_SESSION_ID or from
// the variables DO_IT_SESSION_ENV names. This hook is the host's half: it exports that one name into
// the Bash tool's environment (CLAUDE_ENV_FILE), so `do-it start` records the owning session with no
// flag and no export from the user. Only the NAME is written; the id is read live, so after /clear
// the new id is the one `do-it resume` sees. Never fails the session.
import { appendFileSync } from 'node:fs';

export const SESSION_VAR = 'CLAUDE_CODE_SESSION_ID';

try {
  const file = process.env.CLAUDE_ENV_FILE;
  if (file) appendFileSync(file, `export DO_IT_SESSION_ENV=${SESSION_VAR}\n`);
} catch { /* a missing env file must not block the session */ }
process.exit(0);
