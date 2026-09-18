/**
 * The Protected Central chat widget.
 *
 * Served from the app's own origin and dropped onto any website with one line:
 *
 *   <script src="https://app.protectedcentral.com/widget.js"
 *           data-pc-widget="<public key>" async></script>
 *
 * ── Why this is plain JavaScript and not part of the bundle ──
 *
 * It runs on somebody else's website, next to whatever framework they already
 * have. Shipping React into a stranger's page to draw a chat box would be rude
 * and slow, and would break the moment their page has a different React on it.
 * This is ~9KB, touches nothing outside its own container, and adds no globals
 * beyond one namespaced object.
 *
 * ── What it is allowed to know ──
 *
 * The public key, which names a widget and nothing else. No account id, no API
 * key, no session. The conversation it starts is readable only with the visitor
 * key the server hands back, which is kept in sessionStorage so a reload keeps
 * the thread and a new tab does not inherit somebody else's.
 */
(function () {
  'use strict';

  var script = document.currentScript
    || document.querySelector('script[data-pc-widget]');
  if (!script) return;

  var KEY = script.getAttribute('data-pc-widget');
  if (!KEY) return;

  /* The API lives wherever this script came from. Hard-coding the host would
     mean a staging widget silently talking to production. */
  var ORIGIN = new URL(script.src, window.location.href).origin;
  var API = ORIGIN + '/api/engage.php';
  var STORE = 'pc_chat_' + KEY;

  var state = { open: false, conv: null, vkey: null, sending: false, cfg: null, agent: null };

  try {
    var saved = JSON.parse(window.sessionStorage.getItem(STORE) || 'null');
    if (saved && saved.conv && saved.vkey) { state.conv = saved.conv; state.vkey = saved.vkey; }
  } catch (e) { /* private mode: the widget still works, it just forgets on reload */ }

  function post(body) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); }).catch(function () {
      return { success: false, message: 'Could not reach support just now.' };
    });
  }

  /* Everything a visitor types is rendered as text, never as HTML. This is the
     one place in the product where content from one stranger is shown back to
     another, and innerHTML here would be a cross-site scripting hole on the
     customer's own domain. */
  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.setAttribute('style', css);
    if (text != null) n.textContent = text;
    return n;
  }

  var root, panel, log, input, launcher;

  function accent() { return (state.cfg && state.cfg.accent) || '#5b46e5'; }

  function bubble(role, text) {
    var mine = role === 'visitor';
    var b = el('div', [
      'max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.5;',
      'white-space:pre-wrap;word-wrap:break-word;',
      mine
        ? 'align-self:flex-end;background:' + accent() + ';color:#fff;'
        : 'align-self:flex-start;background:#f1f3f7;color:#0f172a;',
    ].join(''), text);
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }

  function note(text) {
    var n = el('div', 'align-self:center;font-size:11.5px;color:#64748b;text-align:center;padding:2px 8px;', text);
    log.appendChild(n);
    log.scrollTop = log.scrollHeight;
  }

  function send(text) {
    if (!text.trim() || state.sending) return;
    state.sending = true;
    bubble('visitor', text);
    input.value = '';

    var thinking = bubble('ai', '…');

    var go = state.conv
      ? Promise.resolve({ success: true })
      : post({
          action: 'start', widgetKey: KEY,
          context: { page: window.location.href, referrer: document.referrer },
        }).then(function (r) {
          if (r.success) {
            state.conv = r.conversationId; state.vkey = r.visitorKey;
            try {
              window.sessionStorage.setItem(STORE, JSON.stringify({ conv: state.conv, vkey: state.vkey }));
            } catch (e) { /* nothing to do; the thread just will not survive a reload */ }
          }
          return r;
        });

    go.then(function (started) {
      if (!started.success) throw new Error(started.message || 'Could not start the chat.');
      return post({
        action: 'send', conversationId: state.conv, visitorKey: state.vkey, message: text,
      });
    }).then(function (r) {
      thinking.remove();
      state.sending = false;
      if (!r.success) { note(r.message || 'That could not be sent.'); return; }

      (r.messages || []).forEach(function (m) { bubble(m.role, m.body); });

      /* Said plainly rather than hidden. A chat that has quietly stopped
         thinking should offer the alternative rather than look broken. */
      if (r.degraded) {
        note('The assistant is unavailable at the moment — a person will pick this up.');
      }
      if (r.handedOver) {
        note('A colleague has joined and will reply here.');
        poll();
      }
      if (r.tool && r.tool.message) note(r.tool.message);
      if (r.tool && r.tool.data && r.tool.data.bookingSlug) {
        var a = el('a', 'align-self:flex-start;font-size:13px;font-weight:700;color:' + accent() + ';text-decoration:underline;', 'Pick a time');
        a.href = ORIGIN + '/book/' + r.tool.data.bookingSlug;
        a.target = '_blank';
        a.rel = 'noopener';
        log.appendChild(a);
      }
    }).catch(function (e) {
      thinking.remove();
      state.sending = false;
      note(e.message || 'Something went wrong. Please try again.');
    });
  }

  /* Once a human is on the thread, ask for their replies. Every fifteen
     seconds: often enough to feel live, rare enough that a busy support inbox
     is not a load test. */
  var polling = null;
  function poll() {
    if (polling || !state.conv) return;
    var seen = log.childElementCount;
    polling = window.setInterval(function () {
      post({ action: 'poll', conversationId: state.conv, visitorKey: state.vkey }).then(function (r) {
        if (!r.success) return;
        var msgs = r.messages || [];
        if (msgs.length > seen) {
          msgs.slice(seen).forEach(function (m) { if (m.role !== 'visitor') bubble(m.role, m.body); });
          seen = msgs.length;
        }
      });
    }, 15000);
  }

  function build() {
    root = el('div', 'position:fixed;z-index:2147483000;bottom:20px;'
      + ((state.cfg && state.cfg.position === 'left') ? 'left:20px;' : 'right:20px;')
      + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;');

    launcher = el('button', [
      'display:flex;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:999px;',
      'background:' + accent() + ';color:#fff;font-size:14px;font-weight:700;cursor:pointer;',
      'box-shadow:0 10px 26px -8px rgba(15,23,42,.45);font-family:inherit;',
    ].join(''), (state.cfg && state.cfg.launcher) || 'Chat with us');
    launcher.setAttribute('aria-label', 'Open the chat');
    launcher.onclick = toggle;

    panel = el('div', [
      'display:none;flex-direction:column;width:min(370px,calc(100vw - 32px));height:min(520px,calc(100vh - 120px));',
      'background:#fff;border-radius:18px;overflow:hidden;margin-bottom:12px;',
      'box-shadow:0 24px 60px -18px rgba(15,23,42,.5);border:1px solid #e6e9f0;',
    ].join(''));

    var head = el('div', 'padding:14px 16px;background:' + accent() + ';color:#fff;flex-shrink:0;');
    head.appendChild(el('div', 'font-size:15px;font-weight:800;', (state.cfg && state.cfg.title) || 'Chat'));
    if (state.cfg && state.cfg.subtitle) {
      head.appendChild(el('div', 'font-size:12px;opacity:.85;margin-top:2px;', state.cfg.subtitle));
    }
    var close = el('button', 'position:absolute;top:12px;right:14px;background:none;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1;', '×');
    close.setAttribute('aria-label', 'Close the chat');
    close.onclick = toggle;
    head.style.position = 'relative';
    head.appendChild(close);

    log = el('div', 'flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;');

    var bar = el('div', 'display:flex;gap:8px;padding:12px;border-top:1px solid #e6e9f0;flex-shrink:0;');
    input = el('input', 'flex:1;padding:10px 12px;border:1px solid #e6e9f0;border-radius:10px;font-size:14px;outline:none;font-family:inherit;min-width:0;');
    input.placeholder = 'Type a message…';
    input.onkeydown = function (e) { if (e.key === 'Enter') send(input.value); };
    var go = el('button', 'padding:10px 15px;border:0;border-radius:10px;background:' + accent() + ';color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;', 'Send');
    go.onclick = function () { send(input.value); };
    bar.appendChild(input); bar.appendChild(go);

    panel.appendChild(head); panel.appendChild(log); panel.appendChild(bar);

    if (state.cfg && state.cfg.showBranding) {
      var mark = el('div', 'padding:7px;text-align:center;font-size:10.5px;color:#94a3b8;border-top:1px solid #f1f3f7;', 'Powered by Protected Central');
      panel.appendChild(mark);
    }

    root.appendChild(panel); root.appendChild(launcher);
    document.body.appendChild(root);
  }

  function toggle() {
    state.open = !state.open;
    panel.style.display = state.open ? 'flex' : 'none';
    launcher.style.display = state.open ? 'none' : 'flex';
    if (state.open) {
      if (!log.childElementCount) {
        var hello = (state.agent && state.agent.greeting)
          || (state.cfg && state.cfg.welcome)
          || 'Hello — how can we help?';
        bubble('ai', hello);
        if (state.cfg && state.cfg.consentText) note(state.cfg.consentText);
      }
      input.focus();
      if (state.conv) poll();
    }
  }

  /* Nothing is drawn until the server has confirmed this widget is live and
     allowed on this host. A chat box that appears and then refuses every
     message is worse than one that never appears. */
  post({ action: 'widget', widgetKey: KEY }).then(function (r) {
    if (!r || !r.success) return;
    state.cfg = r.widget || {};
    state.agent = r.agent || null;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', build);
    } else {
      build();
    }
  });
}());
