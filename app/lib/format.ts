export function formatDate(d: Date | string | number | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : typeof d === 'number' ? new Date(d * 1000) : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateTime(d: Date | string | number | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : typeof d === 'number' ? new Date(d * 1000) : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function timeAgo(d: Date | string | number | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : typeof d === 'number' ? new Date(d * 1000) : new Date(d);
  const ms = Date.now() - date.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d2 = Math.floor(h / 24);
  if (d2 < 30) return `${d2} d ago`;
  return formatDate(date);
}

export function formatHours(n: number | null | undefined): string {
  if (n == null) return '';
  return `${n.toFixed(2).replace(/\.00$/, '')} h`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
