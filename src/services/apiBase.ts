/**
 * Where the API lives.
 *
 * In production the app and the API are the same origin: the Cloudflare Worker
 * serves the built site and every `/api/*` route, so an empty base means "ask
 * the host that served this page".
 *
 * In development Vite serves the page on its own port and cannot answer an API
 * call, so requests go to the Worker running locally under `npx wrangler dev`,
 * which listens on 8787 and is the same code that runs in production. There is
 * no separate development backend to start.
 */
export const API_BASE = import.meta.env.DEV ? 'http://localhost:8787' : '';
