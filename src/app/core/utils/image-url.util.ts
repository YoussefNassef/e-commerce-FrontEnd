import { environment } from '../models/environment';

const apiBase = environment.apiBaseUrl.replace(/\/+$/, '');
const apiOrigin = apiBase.replace(/\/api$/, '');

export function normalizeImageUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl) {
    return '';
  }

  const value = rawUrl.trim();
  if (!value) {
    return '';
  }

  if (value.startsWith('/upload')) {
    return `${apiBase}${value}`;
  }

  if (value.startsWith('upload')) {
    return `${apiBase}/${value}`;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value.replace('/upload/', '/api/upload/');
  }

  if (value.includes('/upload/')) {
    return `${apiOrigin}${value.replace('/upload/', '/api/upload/')}`;
  }

  return value;
}
