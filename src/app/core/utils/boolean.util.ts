export function parseApiBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on', 'active'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off', 'inactive'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}
