export const nameKey = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Same person by name: equal after normalising, or one name is the other plus extra words ("Mohamed Ali" ~ "mohamed ali hassan"). */
export function sameName(a: string, b: string) {
  const x = nameKey(a), y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 3 && (l.startsWith(s + " ") || l.endsWith(" " + s));
}
