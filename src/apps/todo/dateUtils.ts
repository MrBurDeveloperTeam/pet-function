export const toLocalDateStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
export const todayStr = (now: Date = new Date()) => toLocalDateStr(now);

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real calendar date in the app's canonical YYYY-MM-DD
 *  format. Strict validation keeps lexical date comparisons truthful. */
export const isValidLocalDateStr = (value: unknown): value is string => {
  if (typeof value !== 'string' || !LOCAL_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};
