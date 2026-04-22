export function formatDateTime(value: string | null) {
  if (!value) {
    return '없음';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function titleFromSlug(value: string) {
  return value
    .split(/[_:-]/g)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}
