/**
 * `src` if it is safe to load as an image or audio source, else `''`. Browsers ignore
 * whitespace and control characters when parsing a URL scheme, so those are stripped
 * before checking. Custom schemes stay allowed for webviews (`tauri://`, `app://`);
 * script-capable ones are dropped, and `data:` URLs must match `kind`.
 */
export function safeSrc(src: string, kind: 'image' | 'audio' = 'image'): string {
  const s = src.replace(/[^!-~]/g, '').toLowerCase();
  if (/^(?:javascript|vbscript):/.test(s)) return '';
  if (s.startsWith('data:') && !s.startsWith(`data:${kind}/`)) return '';
  return src;
}
