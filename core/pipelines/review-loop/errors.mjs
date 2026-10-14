// Named failures for the review loop. outcome is the token the CLI prints; exit follows CONTRACT section 3.
export class ReviewError extends Error {
  constructor(outcome, exit = 1, extra = {}) { super(outcome); this.outcome = outcome; this.exit = exit; this.extra = extra; }
}
export const fail = (outcome, exit, extra) => new ReviewError(outcome, exit, extra);
