export class CliError extends Error {
  constructor(outcome, exit, extra) {
    super(outcome);
    this.outcome = outcome;
    this.exit = exit;
    this.extra = extra || {};
  }
}

export function fail(outcome, exit, extra) {
  return new CliError(outcome, exit === undefined ? 1 : exit, extra);
}
