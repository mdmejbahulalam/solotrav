/** Only allow same-site relative paths after login (prevents open-redirect abuse). */
export function safeNext(next: string | null | undefined, fallback = '/home'): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n]/.test(next)) return fallback;
  if (next.startsWith('/login') || next.startsWith('/signup')) return fallback;
  return next;
}
