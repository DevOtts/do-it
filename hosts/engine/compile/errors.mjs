// Compile errors carry a stable code (T-N1-03/05/12/14) and exit 1 (FAILED).
export class CompileError extends Error {
  constructor(code, message, detail = {}) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'CompileError';
    this.code = code;
    this.exit = 1;
    this.detail = detail;
  }
}
