export function slugify(text) {
  if (text === null || text === undefined) return '';
  return String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
