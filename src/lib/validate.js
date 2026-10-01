import { badRequest } from './errors.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validate and clean an input object against a schema.
 * Each rule: { type: 'string'|'int'|'number'|'bool'|'array'|'object', label, required,
 *   min, max (length or value), email, pattern, oneOf, default, items (rule for array items) }
 * Throws a 400 HttpError with { fields: { name: message } } and a summary message.
 */
export function validate(input, schema) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {}, fields = {};
  for (const [key, rule] of Object.entries(schema)) {
    const res = check(src[key], rule);
    if (res.error) fields[key] = res.error;
    else if (res.value !== undefined) out[key] = res.value;
  }
  const keys = Object.keys(fields);
  if (keys.length) throw badRequest(fields[keys[0]], { fields });
  return out;
}

export function check(raw, rule) {
  const label = rule.label || 'This field';
  let v = raw;
  if (typeof v === 'string' && rule.type !== 'raw') v = v.trim();
  const empty = v === undefined || v === null || v === '';
  if (empty) {
    if (rule.required) return { error: `${label} is required.` };
    return { value: rule.default };
  }
  switch (rule.type || 'string') {
    case 'string': {
      if (typeof v !== 'string') return { error: `${label} must be text.` };
      if (rule.min && v.length < rule.min) return { error: `${label} must be at least ${rule.min} characters.` };
      if (rule.max && v.length > rule.max) return { error: `${label} must be ${rule.max} characters or fewer.` };
      if (rule.email) { v = v.toLowerCase(); if (!EMAIL.test(v)) return { error: 'Enter a valid email address.' }; }
      if (rule.pattern && !rule.pattern.test(v)) return { error: rule.patternMessage || `${label} has an invalid format.` };
      if (rule.oneOf && !rule.oneOf.includes(v)) return { error: `${label} must be one of: ${rule.oneOf.join(', ')}.` };
      return { value: v };
    }
    case 'int': case 'number': {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || (rule.type === 'int' && !Number.isInteger(n))) return { error: `${label} must be a ${rule.type === 'int' ? 'whole ' : ''}number.` };
      if (rule.min !== undefined && n < rule.min) return { error: `${label} must be at least ${rule.min}.` };
      if (rule.max !== undefined && n > rule.max) return { error: `${label} must be at most ${rule.max}.` };
      if (rule.oneOf && !rule.oneOf.includes(n)) return { error: `${label} is not an allowed value.` };
      return { value: n };
    }
    case 'bool':
      if (typeof v === 'boolean') return { value: v };
      if (v === 'true' || v === 'false') return { value: v === 'true' };
      return { error: `${label} must be true or false.` };
    case 'array': {
      if (!Array.isArray(v)) return { error: `${label} must be a list.` };
      if (rule.min !== undefined && v.length < rule.min) return { error: `${label} needs at least ${rule.min} item${rule.min === 1 ? '' : 's'}.` };
      if (rule.max !== undefined && v.length > rule.max) return { error: `${label} can have at most ${rule.max} items.` };
      if (!rule.items) return { value: v };
      const vals = [];
      for (let i = 0; i < v.length; i++) {
        const r = rule.items.schema ? tryValidate(v[i], rule.items.schema) : check(v[i], rule.items);
        if (r.error) return { error: `${label}, item ${i + 1}: ${r.error}` };
        vals.push(r.value);
      }
      return { value: vals };
    }
    case 'object':
      if (typeof v !== 'object' || Array.isArray(v)) return { error: `${label} is invalid.` };
      return rule.schema ? tryValidate(v, rule.schema) : { value: v };
    default:
      return { value: v };
  }
}

function tryValidate(v, schema) {
  try { return { value: validate(v, schema) }; } catch (e) { return { error: e.message }; }
}

/** Parse a positive integer id from a route param. */
export function id(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`That ${label} isn't valid.`);
  return n;
}

export const password = { type: 'string', label: 'Password', required: true, min: 8, max: 200 };
export const email = { type: 'string', label: 'Email', required: true, email: true, max: 200 };
