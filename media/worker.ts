/**
 * crmpro-media — the media engine as a Cloudflare Container.
 *
 * One container instance per job (named by the job id), started on demand
 * and stopped when it has been idle, so nothing runs — or is billed — while
 * nobody is processing video. It has no route and no workers.dev address:
 * the only way in is the main Worker's service binding (`MEDIA`), which is
 * why the engine inside runs open (MEDIA_ENGINE_OPEN=1, see the Dockerfile).
 *
 * The engine answers a job's status while it works; the main Worker asks
 * every few seconds while somebody watches and every five minutes on the
 * cron. A render can still outlast every poll, so before stopping an idle
 * container we ask whether it is in the middle of something — stopping a
 * busy one would throw away twenty minutes of encoding.
 */
import { Container, getContainer } from '@cloudflare/containers';

interface Env { ENGINE: DurableObjectNamespace<MediaEngine> }

export class MediaEngine extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '10m';

  override async onActivityExpired(): Promise<void> {
    try {
      const r = await this.containerFetch('http://engine/busy', 8080);
      const { busy } = await r.json<{ busy: number }>();
      if (busy > 0) { this.renewActivityTimeout(); return; }
    } catch { /* not answering: stop it */ }
    await this.stop();
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    let id = 'health';
    if (url.pathname === '/jobs' && req.method === 'POST') {
      const body = await req.clone().json<{ id?: string }>().catch(() => ({} as { id?: string }));
      id = String(body.id ?? '');
    } else {
      const m = url.pathname.match(/^\/jobs\/([A-Za-z0-9_-]{6,80})$/);
      if (m) id = m[1];
      else if (url.pathname !== '/health') return new Response('not found', { status: 404 });
    }
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return Response.json({ error: 'bad id' }, { status: 400 });
    return getContainer(env.ENGINE, id).fetch(req);
  },
};
