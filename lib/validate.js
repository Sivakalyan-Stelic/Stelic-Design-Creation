import { ID_RE } from './http.js';

export function cleanName(v) {
  return String(v || '').trim().slice(0, 200) || 'Untitled project';
}

// Accepts the project body the front end sends and returns a safe copy, or an error string.
export function validateProjectData(data) {
  if (!data || typeof data !== 'object') return { error: 'Missing project data' };
  if (!Array.isArray(data.sheets) || data.sheets.length === 0) return { error: 'A project needs at least one sheet' };
  if (data.sheets.length > 100) return { error: 'Too many sheets (limit 100)' };
  for (const sh of data.sheets) {
    if (!sh || typeof sh !== 'object' || !Array.isArray(sh.items)) return { error: 'Each sheet needs an items list' };
    if (sh.items.length > 300) return { error: 'Too many visuals on one sheet (limit 300)' };
  }
  if (JSON.stringify(data).length > 3_000_000) return { error: 'Project is too large to save' };
  return { value: { name: cleanName(data.name), by: String(data.by || '').slice(0, 120), sheets: data.sheets } };
}

export function validId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}
