/**
 * UTF-8-safe base64 codec for the shareable brain link.
 *
 * btoa/atob alone only handle Latin-1 — titles with emoji, curly quotes,
 * or non-English scripts (common in saved tweets/videos) make btoa throw
 * InvalidCharacterError. Routing the JSON through TextEncoder/TextDecoder
 * makes every character survive the round trip.
 */
export function encodeShare(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeShare<T>(encoded: string): T {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
