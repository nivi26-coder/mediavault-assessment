import type { AssetStatus } from './types';

const UNITS = ['B', 'KB', 'MB', 'GB'];

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const STATUS_LABELS: Record<AssetStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  archived: 'Archived',
};

export function statusLabel(status: AssetStatus): string {
  return STATUS_LABELS[status];
}

// A glyph per status, shown alongside (never instead of) the color and the
// text label — so the four statuses stay distinguishable for someone who
// can't tell the colors apart, and read as a progression (hollow → half →
// checked → put away) rather than four arbitrary hues. Always rendered
// `aria-hidden`; the pill's own text is what's announced to screen readers.
const STATUS_ICONS: Record<AssetStatus, string> = {
  draft: '○',
  in_review: '◐',
  approved: '✓',
  archived: '▾',
};

export function statusIcon(status: AssetStatus): string {
  return STATUS_ICONS[status];
}
