// Named failures for the routing lane. outcome is the token the CLI prints; exit mirrors CONTRACT section 3.
export class RouteError extends Error {
  constructor(outcome, exit, extra) {
    super(outcome + (extra && extra.message ? ': ' + extra.message : ''));
    this.outcome = outcome;
    this.exit = exit === undefined ? 1 : exit;
    this.extra = extra || {};
  }
}

export function fail(outcome, exit, extra) {
  return new RouteError(outcome, exit, extra);
}

export function runCli(main) {
  try {
    const out = main();
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(0);
  } catch (e) {
    if (e instanceof RouteError) {
      process.stdout.write(JSON.stringify({ outcome: e.outcome, ...e.extra }) + '\n');
      process.exit(e.exit);
    }
    process.stderr.write(String(e && e.stack || e) + '\n');
    process.exit(1);
  }
}
