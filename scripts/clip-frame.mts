/**
 * What a site recording says on screen besides the app itself.
 *
 * The owner's note of 2026-11-19: a module demo is a piece of marketing, not
 * a screen recording of a chore — it should show the features that set the
 * module apart, slowly, and say what each one is while it is on screen. So a
 * recipe can put a caption over the frame (`__clipSay`), and a stretch it
 * plays faster carries a "fast-forward" badge (`__clipFast`), so a routine
 * step sped up reads as an edit, not as an app that is quicker than it is.
 *
 * Every frame also carries a small tag saying the business on screen is a
 * sample (brief: "Sample project — real app, demonstration data"); the
 * figures on screen are seeded, and CLAUDE.md allows them only labelled.
 *
 * The caption is kept in sessionStorage, so a navigation inside a recipe
 * (the public form, then the board) keeps it rather than blinking it out.
 * Runs in the page (addInitScript); `data-noinvert` for the dark theme's
 * inversion, as with the pointer (clip-cursor.mts).
 */
export const CLIP_FRAME = () => {
  const put = () => {
    if (document.getElementById('clip-frame')) return;
    const st = document.createElement('style');
    st.textContent = `
      #clip-frame{position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
      #clip-frame .cf-say{position:absolute;left:50%;bottom:22px;max-width:920px;transform:translate(-50%,14px);opacity:0;display:flex;gap:16px;align-items:center;
        padding:13px 24px 13px 16px;border-radius:18px;background:rgba(16,13,12,.9);border:1px solid rgba(255,140,80,.42);
        box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(10px);transition:opacity .35s ease,transform .35s cubic-bezier(.2,.8,.2,1)}
      #clip-frame .cf-say.on{opacity:1;transform:translate(-50%,0)}
      #clip-frame .cf-say i{flex:none;width:8px;height:40px;border-radius:6px;background:linear-gradient(180deg,#ffb37a,#ff6a2b);box-shadow:0 0 14px rgba(255,122,61,.65)}
      #clip-frame .cf-say b{display:block;color:#fff;font-size:25px;line-height:1.2;font-weight:700;letter-spacing:-.01em}
      #clip-frame .cf-say span{display:block;color:#d8cfc8;font-size:17px;line-height:1.3;margin-top:3px;white-space:nowrap;font-weight:500}
      #clip-frame .cf-tag{position:absolute;right:16px;bottom:16px;text-align:right;padding:7px 11px;border-radius:10px;background:rgba(16,13,12,.78);border:1px solid rgba(255,255,255,.12);color:#cfc6bf;font-size:13px;line-height:1.3;font-weight:600}
      #clip-frame .cf-tag em{display:block;font-style:normal;color:#ff9a5c;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
      #clip-frame .cf-fast{position:absolute;right:20px;top:84px;padding:8px 14px;border-radius:999px;background:rgba(255,106,43,.92);color:#fff;font-size:17px;font-weight:800;letter-spacing:.02em;opacity:0;transform:scale(.85);transition:opacity .2s,transform .2s;box-shadow:0 8px 24px rgba(255,106,43,.45)}
      #clip-frame .cf-fast.on{opacity:1;transform:none}
      #clip-frame .cf-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:0 80px;
        background:radial-gradient(120% 90% at 50% 40%,rgba(40,22,14,.97),rgba(10,8,8,.985));opacity:0;transition:opacity .45s ease}
      #clip-frame .cf-card.on{opacity:1}
      html.cf-carding #clip-cursor{opacity:0!important}
      #clip-frame .cf-card em{font-style:normal;color:#ff9a5c;font-size:18px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
      #clip-frame .cf-card b{color:#fff;font-size:54px;line-height:1.08;font-weight:800;letter-spacing:-.02em;max-width:1000px}
      #clip-frame .cf-card span{color:#d8cfc8;font-size:22px;line-height:1.4;font-weight:500;max-width:880px}
      #clip-frame .cf-card i{width:120px;height:4px;border-radius:4px;background:linear-gradient(90deg,#ffb37a,#ff6a2b);box-shadow:0 0 18px rgba(255,122,61,.7)}`;
    document.documentElement.appendChild(st);
    const f = document.createElement('div');
    f.id = 'clip-frame';
    f.setAttribute('data-noinvert', '');
    f.innerHTML = '<div class="cf-tag"><em>Sample workspace</em>Real app · demonstration data</div><div class="cf-say"><i></i><div><b></b><span></span></div></div><div class="cf-fast"></div><div class="cf-card"><em></em><b></b><i></i><span></span></div>';
    document.documentElement.appendChild(f);
    const say = f.querySelector<HTMLElement>('.cf-say')!;
    const fast = f.querySelector<HTMLElement>('.cf-fast')!;
    const store = (k: string, v: string) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* none here */ } };
    const read = (k: string) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
    let swap = 0;
    const show = (title: string, sub: string, now: boolean) => {
      clearTimeout(swap);
      const fill = () => {
        say.querySelector('b')!.textContent = title;
        const s = say.querySelector('span')!;
        s.textContent = sub; s.style.display = sub ? '' : 'none';
        say.classList.toggle('on', !!title);
      };
      if (now || !say.classList.contains('on')) { fill(); return; }
      say.classList.remove('on');
      swap = window.setTimeout(fill, 260);
    };
    const card = f.querySelector<HTMLElement>('.cf-card')!;
    const w = window as unknown as { __clipSay: (t: string, s?: string) => void; __clipFast: (label: string) => void; __clipCard: (k: string, t: string, s: string) => void };
    /* A long film's chapter card: the whole frame, over the app ('' takes it away). */
    w.__clipCard = (k, t, sub) => {
      if (t) { card.querySelector('em')!.textContent = k; card.querySelector('b')!.textContent = t; card.querySelector('span')!.textContent = sub; }
      card.classList.toggle('on', !!t);
      document.documentElement.classList.toggle('cf-carding', !!t);
    };
    w.__clipSay = (title, sub = '') => { store('clip-say', title ? JSON.stringify([title, sub]) : ''); show(title, sub, false); };
    w.__clipFast = label => { store('clip-fast', label); fast.textContent = label; fast.classList.toggle('on', !!label); };
    const was = read('clip-say');
    if (was) { const [t, s] = JSON.parse(was) as string[]; show(t, s, true); }
    const fl = read('clip-fast');
    if (fl) { fast.textContent = fl; fast.classList.add('on'); }
  };
  if (document.documentElement) put(); else addEventListener('DOMContentLoaded', put);
};
