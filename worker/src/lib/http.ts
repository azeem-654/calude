/**
 * The shapes every endpoint answers in.
 *
 * The PHP these replace each set their own headers and hand-rolled their own
 * JSON, which is how `smtp-send.php` came to answer `{success, message}` while
 * `auth.php` answered `{success, error}` and the client had to know which was
 * which. Same helpers everywhere now, and the client's existing expectations
 * are preserved exactly — `message` and `error` are both emitted on failure so
 * neither caller breaks.
 */

export function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(), ...extra },
  });
}

/**
 * The app and the API are the same origin on Cloudflare, so CORS is only here
 * for local development, where Vite serves on :5173 and the Worker on :8787.
 * Reflecting the origin keeps that working without opening the API to
 * credentialed cross-site requests — nothing here reads cookies.
 */
export function corsHeaders(origin = '*'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('Origin') ?? '*') });
}

/** Failure, in the shape both generations of client code understand. */
export function fail(message: string, status = 200, extra: Record<string, unknown> = {}): Response {
  return json({ success: false, error: message, message, ...extra }, status);
}

export function ok(extra: Record<string, unknown> = {}): Response {
  return json({ success: true, ...extra });
}

/** Parse a JSON body without throwing on an empty or malformed one. */
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

/**
 * An address that is safe to put in a mail header or an SMTP command.
 *
 * Carried over verbatim from the PHP, including why it refuses rather than
 * escapes: a carriage return inside a sending address writes a second line
 * straight into the SMTP conversation, and anything after that CRLF is read by
 * the server as a command of its own.
 */
const ADDR_BAD = /[\r\n\0<>,;]/;
const ADDR_OK = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function addr(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (!v || v.length > 254) return null;
  if (ADDR_BAD.test(v)) return null;
  return ADDR_OK.test(v) ? v : null;
}

/** A header value that cannot span two lines. */
export function headerSafe(value: unknown, max = 300): string {
  return String(value ?? '').replace(/[\r\n\0]/g, ' ').trim().slice(0, max);
}
