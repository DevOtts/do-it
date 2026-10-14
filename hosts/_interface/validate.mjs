#!/usr/bin/env node
// Minimal JSON-schema subset validator for the do-it host schemas.
// Usage: validate.mjs --kind adapter|capabilities FILE   (exit 0 valid, 1 invalid)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}
function isType(t, v) {
  if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
  return typeOf(v) === t;
}

export function validate(schema, data) {
  const errors = [];
  const root = schema;
  const resolve = (s) => {
    if (s && s.$ref) {
      const parts = s.$ref.replace(/^#\//, '').split('/');
      return parts.reduce((o, k) => o[k], root);
    }
    return s;
  };
  const walk = (s, v, path) => {
    s = resolve(s);
    const at = path || '(root)';
    if (s.type && !isType(s.type, v)) {
      errors.push({ path: at, message: `expected ${s.type}, got ${typeOf(v)}` });
      return;
    }
    if (s.enum && !s.enum.some((e) => e === v)) {
      errors.push({ path: at, message: `must be one of ${s.enum.join(', ')}` });
    }
    if (typeof v === 'string' && s.minLength !== undefined && v.length < s.minLength) {
      errors.push({ path: at, message: `string shorter than ${s.minLength}` });
    }
    if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) {
      errors.push({ path: at, message: `must be >= ${s.minimum}` });
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) {
        errors.push({ path: at, message: `needs at least ${s.minItems} items` });
      }
      if (s.items) v.forEach((item, i) => walk(s.items, item, `${path}[${i}]`));
    }
    if (typeOf(v) === 'object') {
      for (const k of s.required || []) {
        if (!(k in v)) errors.push({ path: path ? `${path}.${k}` : k, message: 'required property missing' });
      }
      const props = s.properties || {};
      for (const [k, sub] of Object.entries(props)) {
        if (k in v) walk(sub, v[k], path ? `${path}.${k}` : k);
      }
      if (s.additionalProperties === false) {
        for (const k of Object.keys(v)) {
          if (!(k in props)) errors.push({ path: path ? `${path}.${k}` : k, message: 'unknown property' });
        }
      }
    }
  };
  walk(schema, data, '');
  return errors;
}

export const SCHEMA_FILES = {
  adapter: join(HERE, 'host-adapter.schema.json'),
  capabilities: join(HERE, 'capabilities.schema.json'),
};

export function validateFile(kind, file) {
  const schema = JSON.parse(readFileSync(SCHEMA_FILES[kind], 'utf8'));
  const data = JSON.parse(readFileSync(file, 'utf8'));
  return validate(schema, data);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const ki = args.indexOf('--kind');
  const kind = ki >= 0 ? args[ki + 1] : undefined;
  const file = args.filter((a, i) => !a.startsWith('--') && i !== ki + 1)[0];
  if (!SCHEMA_FILES[kind] || !file) {
    console.error('usage: validate.mjs --kind adapter|capabilities FILE');
    process.exit(2);
  }
  let errors;
  try {
    errors = validateFile(kind, file);
  } catch (e) {
    console.error(`(root): ${e.message}`);
    process.exit(1);
  }
  if (errors.length) {
    for (const e of errors) console.error(`${e.path}: ${e.message}`);
    process.exit(1);
  }
  console.log('valid');
}
