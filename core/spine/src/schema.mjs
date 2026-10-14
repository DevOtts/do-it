import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.mjs';
import { canonicalJson } from './hash.mjs';

// JSON Schema subset: type, enum, const, required, properties, items,
// additionalProperties, pattern, minLength, minimum, maximum, minItems, oneOf.
export function schemaTypeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

export function schemaTypeMatches(want, v) {
  const t = schemaTypeOf(v);
  if (want === t) return true;
  if (want === 'number' && t === 'integer') return true;
  return false;
}

export function schemaDeepEqual(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

export function validateSchema(schema, data, pointer) {
  const errors = [];
  schemaWalk(schema, data, pointer || '', errors);
  return errors;
}

export function schemaWalk(schema, data, ptr, errors) {
  if (!schema || schema === true) return;
  if (schema.oneOf) {
    let passing = 0;
    for (const sub of schema.oneOf) {
      const e = [];
      schemaWalk(sub, data, ptr, e);
      if (e.length === 0) passing++;
    }
    if (passing !== 1) errors.push({ pointer: ptr, message: 'must match exactly one of oneOf (matched ' + passing + ')' });
    return;
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => schemaTypeMatches(t, data))) {
      errors.push({ pointer: ptr, message: 'expected type ' + types.join('|') + ' but got ' + schemaTypeOf(data) });
      return;
    }
  }
  if (schema.const !== undefined && !schemaDeepEqual(schema.const, data)) {
    errors.push({ pointer: ptr, message: 'must equal ' + JSON.stringify(schema.const) });
  }
  if (schema.enum !== undefined && !schema.enum.some((v) => schemaDeepEqual(v, data))) {
    errors.push({ pointer: ptr, message: 'must be one of ' + schema.enum.map((v) => JSON.stringify(v)).join(', ') });
  }
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({ pointer: ptr, message: 'must be at least ' + schema.minLength + ' characters' });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(data)) {
      errors.push({ pointer: ptr, message: 'must match pattern ' + schema.pattern });
    }
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push({ pointer: ptr, message: 'must be at least ' + schema.minimum });
    if (schema.maximum !== undefined && data > schema.maximum) errors.push({ pointer: ptr, message: 'must be at most ' + schema.maximum });
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({ pointer: ptr, message: 'must have at least ' + schema.minItems + ' items' });
    }
    if (schema.items) data.forEach((item, i) => schemaWalk(schema.items, item, ptr + '/' + i, errors));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        errors.push({ pointer: ptr + '/' + schemaEscape(key), message: 'is required' });
      }
    }
    for (const key of Object.keys(data)) {
      const child = ptr + '/' + schemaEscape(key);
      if (props[key] !== undefined) schemaWalk(props[key], data[key], child, errors);
      else if (schema.additionalProperties === false) errors.push({ pointer: child, message: 'is not an allowed property' });
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        schemaWalk(schema.additionalProperties, data[key], child, errors);
      }
    }
  }
}

export function schemaEscape(key) {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

// The built file embeds every schema (EMBEDDED_SCHEMAS); in source mode they are
// read from core/schemas.
export function loadSchemaFile(name) {
  if (typeof EMBEDDED_SCHEMAS !== 'undefined' && EMBEDDED_SCHEMAS[name]) return EMBEDDED_SCHEMAS[name];
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.join(here, '..', '..', 'schemas', name);
  if (!fs.existsSync(file)) throw fail('SCHEMA_NOT_FOUND', 1, { schema: name });
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
