/**
 * The Protected Central chat widget.
 *
 * Served from the app's own origin and dropped onto any website with one line:
 *
 *   <script src="https://app.protectedcentral.com/widget.js"
 *           data-pc-widget="<public key>" async></script>
 *
 * Optional attributes: `data-pc-compact` draws the launcher as a small round
 * button rather than a labelled pill; `data-pc-name` / `data-pc-email` fill in
 * who the visitor is, for a page that already knows.
 *
 * ── Why this is plain JavaScript and not part of the bundle ──
 *
 * It runs on somebody else's website, next to whatever framework they already
 * have. Shipping React into a stranger's page to draw a chat box would be rude
 * and slow, and would break the moment their page has a different React on it.
 * It touches nothing outside its own container and adds no globals beyond one
 * namespaced object.
 *
 * ── What it is allowed to know ──
 *
 * The public key, which names a widget and nothing else. No account id, no API
 * key, no session. The conversation it starts is readable only with the visitor
 * key the server hands back, which is kept in sessionStorage so a reload keeps
 * the thread and a new tab does not inherit somebody else's.
 *
 * The one exception is Protected Central's own help button, which is this same
 * file on the app's own origin: there it sends the cookie placeholder, and the
 * server swaps in the real session — same origin only — so the person
 * answering knows which customer is asking without taking their word for it.
 *
 * ── What it offers ──
 *
 * Whatever the widget's `features` name: chat, a ticket (raised and looked up
 * again), a booking link, and live help — sharing a screen with somebody at the
 * business. With chat alone it opens straight into the chat, as it always has.
 */
(function () {
  'use strict';

  var script = document.currentScript
    || document.querySelector('script[data-pc-widget]');
  if (!script) return;

  var KEY = script.getAttribute('data-pc-widget');
  if (!KEY) return;
  var COMPACT = script.hasAttribute('data-pc-compact');
  var KNOWN = {
    name: script.getAttribute('data-pc-name') || '',
    email: script.getAttribute('data-pc-email') || '',
    workspace: script.getAttribute('data-pc-workspace') || '',
  };

  /* The API lives wherever this script came from. Hard-coding the host would
     mean a staging widget silently talking to production. */
  var ORIGIN = new URL(script.src, window.location.href).origin;
  var SAME_ORIGIN = ORIGIN === window.location.origin;
  var API = ORIGIN + '/api/engage.php';
  var STORE = 'pc_chat_' + KEY;
  var TICKETS = 'pc_tickets_' + KEY;

  var state = {
    open: false, conv: null, vkey: null, sending: false, cfg: null, agent: null,
    view: 'home', features: ['chat'],
  };

  try {
    var saved = JSON.parse(window.sessionStorage.getItem(STORE) || 'null');
    if (saved && saved.conv && saved.vkey) { state.conv = saved.conv; state.vkey = saved.vkey; }
  } catch (e) { /* private mode: the widget still works, it just forgets on reload */ }

  function post(body) {
    /* Only on the app's own origin, and only the placeholder: the real token
       never reaches this script. Anywhere else nothing identifying is sent. */
    if (SAME_ORIGIN) body.token = 'cookie';
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

  function icon(paths, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('width', String(size || 20));
    s.setAttribute('height', String(size || 20));
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    paths.forEach(function (d) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  }
  var ICONS = {
    chat: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    screen: ['M2 4h20v12H2z', 'M8 20h8', 'M12 16v4'],
    ticket: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z'],
    search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
    calendar: ['M3 5h18v16H3z', 'M16 3v4', 'M8 3v4', 'M3 10h18'],
    back: ['M15 18l-6-6 6-6'],
    close: ['M18 6L6 18', 'M6 6l12 12'],
  };

  var root, panel, head, headTitle, backBtn, body, launcher;
  var log, input;

  function accent() { return (state.cfg && state.cfg.accent) || '#5b46e5'; }
  function has(f) { return state.features.indexOf(f) !== -1; }

  var BTN = 'display:flex;align-items:center;gap:10px;width:100%;padding:12px 13px;border:1px solid #e6e9f0;'
    + 'border-radius:12px;background:#fff;color:#0f172a;font-size:14px;font-weight:700;cursor:pointer;'
    + 'font-family:inherit;text-align:left;';
  var FIELD = 'width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #e6e9f0;border-radius:10px;'
    + 'font-size:14px;outline:none;font-family:inherit;background:#fff;color:#0f172a;';
  function primary() {
    return 'padding:11px 15px;border:0;border-radius:10px;background:' + accent() + ';color:#fff;'
      + 'font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;';
  }

  /* ── Views ─────────────────────────────────────────────────────────────── */

  function show(view) {
    state.view = view;
    while (body.firstChild) body.removeChild(body.firstChild);
    log = null; input = null;
    backBtn.style.display = view === 'home' || onlyChat() ? 'none' : 'flex';
    var titles = {
      home: (state.cfg && state.cfg.title) || 'Help',
      chat: (state.cfg && state.cfg.title) || 'Chat',
      screen: 'Share your screen',
      ticket: 'Raise a ticket',
      status: 'Check a ticket',
    };
    headTitle.textContent = titles[view] || 'Help';
    ({ home: homeView, chat: chatView, screen: screenView, ticket: ticketView, status: statusView }[view] || homeView)();
  }

  function onlyChat() { return state.features.length === 1 && has('chat'); }

  function homeView() {
    var wrap = el('div', 'padding:16px;display:flex;flex-direction:column;gap:9px;overflow-y:auto;flex:1;');
    var hello = (state.agent && state.agent.greeting) || (state.cfg && state.cfg.welcome) || 'Hello — how can we help?';
    wrap.appendChild(el('div', 'font-size:14px;color:#334155;line-height:1.55;margin-bottom:4px;', hello));

    function option(key, label, hint, go) {
      var b = el('button', BTN);
      b.type = 'button';
      var ic = el('span', 'display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;flex-shrink:0;background:' + accent() + '14;color:' + accent() + ';');
      ic.appendChild(icon(ICONS[key], 18));
      var txt = el('span', 'display:flex;flex-direction:column;gap:2px;min-width:0;');
      txt.appendChild(el('span', '', label));
      if (hint) txt.appendChild(el('span', 'font-size:12px;font-weight:500;color:#64748b;line-height:1.4;', hint));
      b.appendChild(ic); b.appendChild(txt);
      b.onclick = go;
      wrap.appendChild(b);
    }

    if (has('chat')) option('chat', 'Chat with us', state.agent ? 'Answered straight away, a person when needed' : 'We reply here', function () { show('chat'); });
    if (has('screen')) option('screen', 'Share your screen', 'Show us the problem and we talk you through it', function () { show('screen'); });
    if (has('ticket')) {
      option('ticket', 'Raise a ticket', 'We reply by email', function () { show('ticket'); });
      option('search', 'Check a ticket', 'See where one you raised has got to', function () { show('status'); });
    }
    if (has('meeting') && state.cfg && state.cfg.bookingSlug) {
      option('calendar', 'Book a call', 'Pick a time that suits you', function () {
        window.open(ORIGIN + '/book/' + encodeURIComponent(state.cfg.bookingSlug), '_blank', 'noopener');
      });
    }
    if (state.cfg && state.cfg.consentText) {
      wrap.appendChild(el('div', 'font-size:11.5px;color:#64748b;line-height:1.5;margin-top:4px;', state.cfg.consentText));
    }
    body.appendChild(wrap);
  }

  /* ── Chat ──────────────────────────────────────────────────────────────── */

  function bubble(role, text) {
    if (!log) return null;
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

  function note(text, into) {
    var target = into || log;
    if (!target) return;
    var n = el('div', 'align-self:center;font-size:11.5px;color:#64748b;text-align:center;padding:2px 8px;line-height:1.5;', text);
    target.appendChild(n);
    target.scrollTop = target.scrollHeight;
  }

  var history = [];
  var serverCount = 0;
  function remember(role, text) { history.push({ role: role, body: text }); }

  function chatView() {
    log = el('div', 'flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;');
    var bar = el('div', 'display:flex;gap:8px;padding:12px;border-top:1px solid #e6e9f0;flex-shrink:0;');
    input = el('input', FIELD + 'flex:1;min-width:0;');
    input.placeholder = 'Type a message…';
    input.setAttribute('aria-label', 'Message');
    input.onkeydown = function (e) { if (e.key === 'Enter') send(input.value); };
    var go = el('button', primary() + 'padding:10px 15px;font-size:13px;', 'Send');
    go.onclick = function () { send(input.value); };
    bar.appendChild(input); bar.appendChild(go);
    body.appendChild(log); body.appendChild(bar);

    if (!history.length) {
      var hello = (state.agent && state.agent.greeting)
        || (state.cfg && state.cfg.welcome)
        || 'Hello — how can we help?';
      remember('ai', hello);
      if (state.cfg && state.cfg.consentText && onlyChat()) remember('note', state.cfg.consentText);
      /* Back after a reload with a thread already going: fetch it, so they
         see what was said rather than a fresh greeting over an old chat. */
      if (state.conv && !serverCount) {
        post({ action: 'poll', conversationId: state.conv, visitorKey: state.vkey }).then(function (r) {
          if (!r.success) return;
          (r.messages || []).forEach(function (m) { remember(m.role, m.body); if (state.view === 'chat') bubble(m.role, m.body); });
          serverCount = (r.messages || []).length;
          if (r.handedOver) poll();
        });
      }
    }
    history.forEach(function (m) { if (m.role === 'note') note(m.body); else bubble(m.role, m.body); });
    input.focus();
    if (state.conv && serverCount) poll();
  }

  function send(text) {
    if (!text.trim() || state.sending) return;
    state.sending = true;
    remember('visitor', text);
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
      if (thinking) thinking.remove();
      state.sending = false;
      if (!r.success) { remember('note', r.message || 'That could not be sent.'); note(r.message || 'That could not be sent.'); return; }

      /* Counted as the server stores them — theirs, and every reply — so the
         poll below shows only what arrived since. */
      serverCount += 1 + (r.messages || []).length;
      (r.messages || []).forEach(function (m) { remember(m.role, m.body); bubble(m.role, m.body); });

      /* Said plainly rather than hidden. A chat that has quietly stopped
         thinking should offer the alternative rather than look broken. */
      if (r.degraded) {
        var d = 'The assistant is unavailable at the moment — a person will pick this up.';
        remember('note', d); note(d);
      }
      if (r.handedOver) {
        remember('note', 'A colleague has joined and will reply here.');
        note('A colleague has joined and will reply here.');
        poll();
      }
      if (r.tool && r.tool.message) { remember('note', r.tool.message); note(r.tool.message); }
      if (r.tool && r.tool.data && r.tool.data.bookingSlug && log) {
        var a = el('a', 'align-self:flex-start;font-size:13px;font-weight:700;color:' + accent() + ';text-decoration:underline;', 'Pick a time');
        a.href = ORIGIN + '/book/' + r.tool.data.bookingSlug;
        a.target = '_blank';
        a.rel = 'noopener';
        log.appendChild(a);
      }
    }).catch(function (e) {
      if (thinking) thinking.remove();
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
    polling = window.setInterval(function () {
      post({ action: 'poll', conversationId: state.conv, visitorKey: state.vkey }).then(function (r) {
        if (!r.success) return;
        var msgs = r.messages || [];
        if (msgs.length > serverCount) {
          msgs.slice(serverCount).forEach(function (m) {
            if (m.role === 'visitor') return;
            remember(m.role, m.body);
            if (state.view === 'chat') bubble(m.role, m.body);
          });
          serverCount = msgs.length;
        }
      });
    }, 15000);
  }

  /* ── Tickets ───────────────────────────────────────────────────────────── */

  function savedTickets() {
    try { return JSON.parse(window.localStorage.getItem(TICKETS) || '[]') || []; } catch (e) { return []; }
  }

  function labelled(text, field) {
    var l = el('label', 'display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:#475569;');
    l.appendChild(el('span', '', text));
    l.appendChild(field);
    return l;
  }

  function formWrap() {
    var f = el('form', 'padding:16px;display:flex;flex-direction:column;gap:11px;overflow-y:auto;flex:1;');
    f.setAttribute('novalidate', '');
    return f;
  }

  function ticketView() {
    var f = formWrap();
    var name = el('input', FIELD); name.value = KNOWN.name; name.autocomplete = 'name';
    var email = el('input', FIELD); email.type = 'email'; email.value = KNOWN.email; email.autocomplete = 'email';
    var subject = el('input', FIELD); subject.maxLength = 200;
    var msg = el('textarea', FIELD + 'resize:vertical;min-height:96px;line-height:1.5;'); msg.rows = 4;
    f.appendChild(labelled('Your name', name));
    if (!KNOWN.email) f.appendChild(labelled('Email, so we can reply', email));
    f.appendChild(labelled('What is it about?', subject));
    f.appendChild(labelled('Tell us what happened', msg));
    var out = el('div', 'font-size:12.5px;color:#b42318;line-height:1.5;');
    var go = el('button', primary(), 'Send ticket'); go.type = 'submit';
    f.appendChild(out); f.appendChild(go);
    f.onsubmit = function (e) {
      e.preventDefault();
      out.textContent = '';
      go.disabled = true; go.textContent = 'Sending…';
      post({
        action: 'ticket', widgetKey: KEY, name: name.value, email: email.value || KNOWN.email,
        subject: subject.value, message: msg.value, conversationId: state.conv || '',
        context: { page: window.location.href },
      }).then(function (r) {
        go.disabled = false; go.textContent = 'Send ticket';
        if (!r.success) { out.textContent = r.message || r.error || 'That could not be sent.'; return; }
        var list = savedTickets();
        list.unshift({ ref: r.reference, key: r.guestKey, subject: subject.value });
        try { window.localStorage.setItem(TICKETS, JSON.stringify(list.slice(0, 10))); } catch (x) { /* shown below either way */ }
        while (body.firstChild) body.removeChild(body.firstChild);
        var done = el('div', 'padding:18px;display:flex;flex-direction:column;gap:10px;');
        done.appendChild(el('div', 'font-size:16px;font-weight:800;color:#0f172a;', 'Ticket ' + r.reference + ' raised'));
        done.appendChild(el('div', 'font-size:13.5px;color:#334155;line-height:1.55;',
          'We will reply by email. To look it up here later you need the reference and this key — this browser remembers both, but keep a copy:'));
        done.appendChild(el('div', 'font-family:ui-monospace,monospace;font-size:12.5px;padding:10px;border-radius:10px;background:#f1f3f7;color:#0f172a;word-break:break-all;',
          r.reference + '  ·  ' + r.guestKey));
        var again = el('button', BTN + 'justify-content:center;', 'Back');
        again.onclick = function () { show('home'); };
        done.appendChild(again);
        body.appendChild(done);
      });
    };
    body.appendChild(f);
    (KNOWN.name ? subject : name).focus();
  }

  function statusView() {
    var f = formWrap();
    var list = savedTickets();
    var ref = el('input', FIELD + 'text-transform:uppercase;'); ref.value = list[0] ? list[0].ref : '';
    var key = el('input', FIELD + 'font-family:ui-monospace,monospace;'); key.value = list[0] ? list[0].key : '';
    if (list.length > 1) {
      var pick = el('select', FIELD);
      list.forEach(function (t, i) {
        var o = el('option', '', t.ref + (t.subject ? ' — ' + t.subject : ''));
        o.value = String(i);
        pick.appendChild(o);
      });
      pick.onchange = function () { var t = list[Number(pick.value)]; ref.value = t.ref; key.value = t.key; };
      f.appendChild(labelled('Tickets from this browser', pick));
    }
    f.appendChild(labelled('Reference', ref));
    f.appendChild(labelled('Key', key));
    var go = el('button', primary(), 'Look it up'); go.type = 'submit';
    var out = el('div', 'display:flex;flex-direction:column;gap:8px;');
    f.appendChild(go); f.appendChild(out);
    f.onsubmit = function (e) {
      e.preventDefault();
      while (out.firstChild) out.removeChild(out.firstChild);
      go.disabled = true;
      post({ action: 'ticket_status', widgetKey: KEY, ticketRef: ref.value, guestKey: key.value }).then(function (r) {
        go.disabled = false;
        if (!r.success || !r.ticket) {
          out.appendChild(el('div', 'font-size:12.5px;color:#b42318;', r.message || 'We could not find a ticket with that reference and key.'));
          return;
        }
        var t = r.ticket;
        out.appendChild(el('div', 'font-size:14px;font-weight:800;color:#0f172a;', t.reference + ' — ' + t.subject));
        out.appendChild(el('div', 'font-size:12.5px;color:#475569;', 'Status: ' + String(t.status).replace(/_/g, ' ')));
        if (t.resolution) out.appendChild(el('div', 'font-size:13px;color:#0f172a;line-height:1.5;', t.resolution));
        (r.messages || []).forEach(function (m) {
          var mine = m.role === 'customer' || m.role === 'visitor';
          out.appendChild(el('div', 'padding:9px 11px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;'
            + (mine ? 'background:#f1f3f7;color:#0f172a;' : 'background:' + accent() + '12;color:#0f172a;border:1px solid ' + accent() + '33;'), m.body));
        });
        if (!(r.messages || []).length) out.appendChild(el('div', 'font-size:12.5px;color:#64748b;', 'No replies yet.'));
      });
    };
    body.appendChild(f);
  }

  /* ── Live help: sharing a screen ───────────────────────────────────────────
   *
   * The browser shares the screen (or a window, or a tab) straight to the
   * browser of whoever joins from Customer Engagement → Live help. The server
   * only carries the handshake: this side posts one description of how to
   * reach it, polls until the other side has posted theirs, and from then on
   * the picture, their voice and the small messages go directly.
   */
  var live = null;

  function canShare() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.RTCPeerConnection);
  }

  function screenView() {
    if (live) { liveView(); return; }
    if (!canShare()) {
      var w = el('div', 'padding:18px;display:flex;flex-direction:column;gap:10px;');
      w.appendChild(el('div', 'font-size:14px;color:#0f172a;line-height:1.55;',
        'This browser cannot share its screen — phones and tablets generally cannot from a web page. Open this on a computer, or:'));
      if (has('ticket')) { var t = el('button', BTN, 'Raise a ticket instead'); t.onclick = function () { show('ticket'); }; w.appendChild(t); }
      if (has('chat')) { var c = el('button', BTN, 'Chat with us instead'); c.onclick = function () { show('chat'); }; w.appendChild(c); }
      body.appendChild(w);
      return;
    }

    var f = formWrap();
    f.appendChild(el('div', 'font-size:13.5px;color:#334155;line-height:1.55;',
      'Somebody here will see what you choose to share — a whole screen, one window or one tab — and can talk you through it. Nothing is recorded, and you can stop at any moment.'));
    var name = el('input', FIELD); name.value = KNOWN.name; name.autocomplete = 'name';
    var email = el('input', FIELD); email.type = 'email'; email.value = KNOWN.email; email.autocomplete = 'email';
    var topic = el('textarea', FIELD + 'resize:vertical;min-height:70px;line-height:1.5;'); topic.rows = 3; topic.maxLength = 500;
    if (!KNOWN.name) f.appendChild(labelled('Your name', name));
    if (!KNOWN.email) f.appendChild(labelled('Email, in case we get cut off', email));
    f.appendChild(labelled('What is going wrong?', topic));
    var micRow = el('label', 'display:flex;gap:8px;align-items:center;font-size:13px;color:#334155;cursor:pointer;');
    var mic = el('input', ''); mic.type = 'checkbox'; mic.checked = true;
    micRow.appendChild(mic); micRow.appendChild(el('span', '', 'Talk as well (uses your microphone)'));
    f.appendChild(micRow);
    var out = el('div', 'font-size:12.5px;color:#b42318;line-height:1.5;');
    var go = el('button', primary(), 'Choose what to share'); go.type = 'submit';
    f.appendChild(out); f.appendChild(go);
    f.onsubmit = function (e) {
      e.preventDefault();
      out.textContent = '';
      go.disabled = true;
      startShare({ name: name.value, email: email.value, topic: topic.value, mic: mic.checked })
        .catch(function (err) {
          go.disabled = false;
          out.textContent = err && err.message ? err.message : 'Sharing did not start.';
        });
    };
    body.appendChild(f);
  }

  function gathered(pc) {
    /* Wait for this browser's own addresses, then send them all at once — two
       writes per session instead of a stream. Four seconds is the cap: a
       relay address that has not arrived by then is not going to be the one
       that works. */
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      var t = window.setTimeout(resolve, 4000);
      pc.addEventListener('icegatheringstatechange', function () {
        if (pc.iceGatheringState === 'complete') { window.clearTimeout(t); resolve(); }
      });
    });
  }

  function startShare(who) {
    var display;
    /* The picker first: somebody who cancels it has asked for nothing, and
       must not leave a request waiting for a person to answer. */
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15, max: 24 } }, audio: false,
      selfBrowserSurface: 'include', surfaceSwitching: 'include',
    }).catch(function (e) {
      throw new Error(e && e.name === 'NotAllowedError'
        ? 'Sharing was cancelled. Press the button again when you are ready.'
        : 'This browser would not share the screen.');
    }).then(function (stream) {
      display = stream;
      if (!who.mic || !navigator.mediaDevices.getUserMedia) return null;
      /* Refused is fine: they can still type, and the person answering can
         still speak to them. */
      return navigator.mediaDevices.getUserMedia({ audio: true }).catch(function () { return null; });
    }).then(function (micStream) {
      return post({
        action: 'live_start', widgetKey: KEY, name: who.name || KNOWN.name, email: who.email || KNOWN.email,
        subject: who.topic, conversationId: state.conv || '',
        context: { page: window.location.href, workspace: KNOWN.workspace },
      }).then(function (r) {
        if (!r.success) {
          stopTracks(display); stopTracks(micStream);
          throw new Error(r.message || r.error || 'Could not ask for help just now.');
        }
        return connect(r, display, micStream);
      });
    });
  }

  function stopTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* already stopped */ } });
  }

  function connect(r, display, micStream) {
    var pc = new window.RTCPeerConnection({ iceServers: r.iceServers || [] });
    live = {
      id: r.sessionId, key: r.shareKey, pc: pc, display: display, mic: micStream,
      status: 'waiting', state: 'new', agent: '', meetUrl: '', messages: [], timer: null,
      relay: !!r.relay, surface: '', dc: null, audio: null,
    };
    var vt = display.getVideoTracks()[0];
    try { live.surface = (vt.getSettings() || {}).displaySurface || ''; } catch (e) { live.surface = ''; }
    if (vt && 'contentHint' in vt) vt.contentHint = 'detail';
    display.getTracks().forEach(function (t) { pc.addTrack(t, display); });
    if (micStream) micStream.getTracks().forEach(function (t) { pc.addTrack(t, micStream); });
    else pc.addTransceiver('audio', { direction: 'recvonly' });

    /* The browser's own "Stop sharing" bar ends the session, not only the
       picture: leaving somebody watching a frozen frame is worse than ending. */
    vt.addEventListener('ended', function () { endLive('sharer'); });

    live.dc = pc.createDataChannel('pc');
    live.dc.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'say' && m.text) { live.messages.push({ from: 'them', text: String(m.text).slice(0, 2000) }); if (state.view === 'screen') liveView(); }
      if (m.t === 'point') pointAt(Number(m.x), Number(m.y));
      if (m.t === 'end') endLive('agent-ended', true);
    };

    pc.ontrack = function (ev) {
      if (ev.track.kind !== 'audio') return;
      if (!live.audio) { live.audio = el('audio', 'display:none;'); live.audio.autoplay = true; document.body.appendChild(live.audio); }
      live.audio.srcObject = ev.streams[0] || new MediaStream([ev.track]);
    };
    pc.onconnectionstatechange = function () {
      if (!live) return;
      var s = pc.connectionState;
      if (s === 'connected') live.state = 'connected';
      else if (s === 'failed') live.state = 'failed';
      else if (s === 'connecting') live.state = 'connecting';
      if (state.view === 'screen') liveView();
      tick();
    };

    return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
      .then(function () { return gathered(pc); })
      .then(function () {
        return post({ action: 'live_offer', sessionId: live.id, shareKey: live.key, sdp: pc.localDescription.sdp });
      })
      .then(function (res) {
        if (!res.success) throw new Error(res.message || 'Could not set the session up.');
        show('screen');
        schedule(3000);
      })
      .catch(function (e) { endLive('failed'); throw e; });
  }

  function schedule(ms) {
    if (!live) return;
    window.clearTimeout(live.timer);
    live.timer = window.setTimeout(tick, ms);
  }

  function tick() {
    if (!live) return;
    var mine = live;
    post({ action: 'live_poll', sessionId: mine.id, shareKey: mine.key, state: mine.state }).then(function (r) {
      if (live !== mine) return;
      if (!r.success) { schedule(6000); return; }
      if (r.agentName) mine.agent = r.agentName;
      if (r.meetUrl && r.meetUrl !== mine.meetUrl) mine.meetUrl = r.meetUrl;
      if (r.answer && !mine.pc.currentRemoteDescription) {
        mine.status = 'live';
        mine.pc.setRemoteDescription({ type: 'answer', sdp: r.answer }).catch(function () {
          mine.state = 'failed';
        });
      }
      if (r.status === 'ended') {
        endLive(r.endedReason === 'expired' ? 'expired' : 'agent-ended', true);
        return;
      }
      if (state.view === 'screen') liveView();
      /* Quick while somebody is waiting to be answered; slow once the two
         browsers are talking, when this only listens for a Meet link or the
         end. */
      schedule(mine.state === 'connected' ? 10000 : 3000);
    });
  }

  var endedNote = '';
  function endLive(reason, fromServer) {
    if (!live) return;
    var l = live;
    live = null;
    window.clearTimeout(l.timer);
    stopTracks(l.display); stopTracks(l.mic);
    try { l.pc.close(); } catch (e) { /* already closed */ }
    if (l.audio) l.audio.remove();
    if (!fromServer) {
      post({ action: 'live_end', sessionId: l.id, shareKey: l.key, reason: reason === 'failed' ? 'failed' : 'sharer' });
    }
    endedNote = reason === 'expired'
      ? 'Nobody was free to join in time — sorry. Raise a ticket and we will come back to you.'
      : reason === 'agent-ended' ? 'Support has ended the session. Thank you.'
        : reason === 'failed' ? '' : 'You stopped sharing.';
    if (endedNote && state.view === 'screen') {
      while (body.firstChild) body.removeChild(body.firstChild);
      var w = el('div', 'padding:18px;display:flex;flex-direction:column;gap:10px;');
      w.appendChild(el('div', 'font-size:14px;color:#0f172a;line-height:1.55;', endedNote));
      if (l.meetUrl) {
        var a = el('a', 'font-size:13px;font-weight:700;color:' + accent() + ';', 'The Google Meet link is still open');
        a.href = l.meetUrl; a.target = '_blank'; a.rel = 'noopener';
        w.appendChild(a);
      }
      var back = el('button', BTN + 'justify-content:center;', 'Back');
      back.onclick = function () { show('home'); };
      w.appendChild(back);
      body.appendChild(w);
    }
  }

  function liveView() {
    if (!live) { screenView(); return; }
    while (body.firstChild) body.removeChild(body.firstChild);
    var w = el('div', 'padding:16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1;');
    var dot = live.state === 'connected' ? '#16a34a' : live.state === 'failed' ? '#b42318' : '#d97706';
    var line = el('div', 'display:flex;gap:8px;align-items:center;font-size:14px;font-weight:700;color:#0f172a;');
    line.appendChild(el('span', 'width:9px;height:9px;border-radius:50%;flex-shrink:0;background:' + dot + ';'));
    line.appendChild(el('span', '', live.state === 'connected'
      ? (live.agent || 'Support') + ' can see your screen'
      : live.state === 'failed' ? 'Could not connect directly'
        : live.status === 'live' ? 'Connecting…' : 'Waiting for somebody to join…'));
    w.appendChild(line);
    w.appendChild(el('div', 'font-size:12.5px;color:#475569;line-height:1.55;', live.state === 'failed'
      ? 'Your network would not allow a direct connection. Stay here — support can send you a Google Meet link instead, and it will appear below.'
      : live.state === 'connected'
        ? (live.mic ? 'You can talk to each other. ' : '') + 'They cannot click or type on your computer — they can only see it and point.'
        : 'We have been told. Keep this open; it usually takes a minute or two. Nothing is shared until somebody joins.'));

    if (live.meetUrl) {
      var a = el('a', primary() + 'text-align:center;text-decoration:none;display:block;', 'Join the Google Meet');
      a.href = live.meetUrl; a.target = '_blank'; a.rel = 'noopener';
      w.appendChild(a);
    }

    if (live.state === 'connected') {
      var msgs = el('div', 'display:flex;flex-direction:column;gap:6px;');
      live.messages.slice(-12).forEach(function (m) {
        msgs.appendChild(el('div', 'padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;max-width:85%;'
          + (m.from === 'me' ? 'align-self:flex-end;background:' + accent() + ';color:#fff;' : 'align-self:flex-start;background:#f1f3f7;color:#0f172a;'), m.text));
      });
      w.appendChild(msgs);
      var bar = el('div', 'display:flex;gap:8px;');
      var say = el('input', FIELD + 'flex:1;min-width:0;'); say.placeholder = 'Type to them…';
      say.setAttribute('aria-label', 'Message to support');
      var sayGo = el('button', primary() + 'padding:10px 13px;font-size:13px;', 'Send');
      var sendSay = function () {
        var text = say.value.trim();
        if (!text || !live || !live.dc || live.dc.readyState !== 'open') return;
        live.dc.send(JSON.stringify({ t: 'say', text: text.slice(0, 2000) }));
        live.messages.push({ from: 'me', text: text });
        liveView();
      };
      say.onkeydown = function (e) { if (e.key === 'Enter') sendSay(); };
      sayGo.onclick = sendSay;
      bar.appendChild(say); bar.appendChild(sayGo);
      w.appendChild(bar);
      if (state.view === 'screen') window.setTimeout(function () { say.focus(); }, 0);
    }

    var stop = el('button', BTN + 'justify-content:center;color:#b42318;border-color:#fecaca;', 'Stop sharing');
    stop.onclick = function () { endLive('sharer'); };
    w.appendChild(stop);
    body.appendChild(w);
  }

  /* Where the person answering points, drawn on this page. Only when a browser
     tab is what is being shared — on a whole screen or another window the same
     spot on this page would be pointing at something else entirely. */
  function pointAt(x, y) {
    if (!live || live.surface !== 'browser' || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return;
    var ring = el('div', 'position:fixed;z-index:2147483001;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;'
      + 'border-radius:50%;border:3px solid ' + accent() + ';box-shadow:0 0 0 6px ' + accent() + '33;'
      + 'left:' + Math.round(x * window.innerWidth) + 'px;top:' + Math.round(y * window.innerHeight) + 'px;');
    document.body.appendChild(ring);
    window.setTimeout(function () { ring.remove(); }, 2600);
  }

  /* ── Frame ─────────────────────────────────────────────────────────────── */

  function build() {
    var left = state.cfg && state.cfg.position === 'left';
    root = el('div', 'position:fixed;z-index:2147483000;bottom:20px;'
      + (left ? 'left:20px;' : 'right:20px;')
      + 'display:flex;flex-direction:column;align-items:' + (left ? 'flex-start' : 'flex-end') + ';'
      + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;');

    var label = (state.cfg && state.cfg.launcher) || 'Chat with us';
    launcher = el('button', COMPACT
      ? [
        'display:flex;align-items:center;justify-content:center;width:52px;height:52px;padding:0;border:0;border-radius:50%;',
        'background:' + accent() + ';color:#fff;cursor:pointer;box-shadow:0 10px 26px -8px rgba(15,23,42,.45);',
      ].join('')
      : [
        'display:flex;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:999px;',
        'background:' + accent() + ';color:#fff;font-size:14px;font-weight:700;cursor:pointer;',
        'box-shadow:0 10px 26px -8px rgba(15,23,42,.45);font-family:inherit;',
      ].join(''), COMPACT ? null : label);
    if (COMPACT) { launcher.appendChild(icon(ICONS.chat, 22)); launcher.title = label; }
    launcher.setAttribute('aria-label', 'Open the chat');
    launcher.onclick = toggle;

    panel = el('div', [
      'display:none;flex-direction:column;width:min(370px,calc(100vw - 32px));height:min(540px,calc(100vh - 120px));',
      'background:#fff;border-radius:18px;overflow:hidden;margin-bottom:12px;',
      'box-shadow:0 24px 60px -18px rgba(15,23,42,.5);border:1px solid #e6e9f0;',
    ].join(''));
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', label);

    head = el('div', 'position:relative;display:flex;align-items:center;gap:6px;padding:14px 44px 14px 16px;background:' + accent() + ';color:#fff;flex-shrink:0;');
    backBtn = el('button', 'display:none;align-items:center;background:none;border:0;color:#fff;cursor:pointer;padding:2px;margin-left:-6px;');
    backBtn.setAttribute('aria-label', 'Back');
    backBtn.appendChild(icon(ICONS.back, 18));
    backBtn.onclick = function () { show('home'); };
    var titles = el('div', 'min-width:0;');
    headTitle = el('div', 'font-size:15px;font-weight:800;', 'Help');
    titles.appendChild(headTitle);
    if (state.cfg && state.cfg.subtitle) {
      titles.appendChild(el('div', 'font-size:12px;opacity:.85;margin-top:2px;', state.cfg.subtitle));
    }
    var close = el('button', 'position:absolute;top:12px;right:12px;display:flex;background:none;border:0;color:#fff;cursor:pointer;padding:2px;');
    close.setAttribute('aria-label', 'Close');
    close.appendChild(icon(ICONS.close, 18));
    close.onclick = toggle;
    head.appendChild(backBtn); head.appendChild(titles); head.appendChild(close);

    body = el('div', 'flex:1;display:flex;flex-direction:column;min-height:0;');
    panel.appendChild(head); panel.appendChild(body);

    if (state.cfg && state.cfg.showBranding) {
      var mark = el('div', 'padding:7px;text-align:center;font-size:10.5px;color:#94a3b8;border-top:1px solid #f1f3f7;flex-shrink:0;', 'Powered by Protected Central');
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
      /* A session in progress is what they came back for. */
      if (live) show('screen');
      else if (!body.firstChild) show(onlyChat() ? 'chat' : 'home');
    }
  }

  /* So the page it sits on can open it from its own button — "Contact
     support" in a menu — without drawing a second launcher. */
  window.ProtectedCentralChat = {
    open: function (view) {
      if (!panel) return;
      if (!state.open) toggle();
      if (view && (view === 'home' || has(view === 'status' ? 'ticket' : view))) show(view);
    },
  };

  /* Nothing is drawn until the server has confirmed this widget is live and
     allowed on this host. A chat box that appears and then refuses every
     message is worse than one that never appears. */
  post({ action: 'widget', widgetKey: KEY }).then(function (r) {
    if (!r || !r.success) return;
    state.cfg = r.widget || {};
    state.agent = r.agent || null;
    try {
      var f = JSON.parse(state.cfg.features || '["chat"]');
      if (Array.isArray(f) && f.length) state.features = f.map(String);
    } catch (e) { /* the default: chat */ }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', build);
    } else {
      build();
    }
  });
}());
