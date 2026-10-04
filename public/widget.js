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
 * business, or a voice call with them in the browser ("Start an online call"). With
 * chat alone it opens straight into the chat, as it always has; with more, the
 * launcher reads "Help" and opens onto a home panel listing each way in, with
 * the owner's photo and name ("Azeem from Protected Central") when set.
 *
 * `data-pc-teaser` (the marketing site sets it) adds a see-through card above
 * the launcher, naming the same ways in, on every page until it is closed.
 */
(function () {
  'use strict';

  var script = document.currentScript
    || document.querySelector('script[data-pc-widget]');
  if (!script) return;

  var KEY = script.getAttribute('data-pc-widget');
  if (!KEY) return;
  var COMPACT = script.hasAttribute('data-pc-compact');
  var TEASER = script.hasAttribute('data-pc-teaser');
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
    phone: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'],
    mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
    micOff: ['M2 2l20 20', 'M18.9 13.4A7 7 0 0 0 19 12v-2', 'M5 10v2a7 7 0 0 0 12 5', 'M15 9.3V5a3 3 0 0 0-5.7-1.3', 'M9 9v3a3 3 0 0 0 5.1 2.1', 'M12 19v3'],
    speaker: ['M11 5L6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
    help: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01'],
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
      voice: 'Online call',
      ticket: 'Submit a ticket',
      status: 'Check a ticket',
    };
    headTitle.textContent = titles[view] || 'Help';
    ({ home: homeView, chat: chatView, screen: screenView, voice: voiceView, ticket: ticketView, status: statusView }[view] || homeView)();
  }

  function onlyChat() { return state.features.length === 1 && has('chat'); }

  /*
   * The ways in, in the order somebody in a hurry wants them: talk now, show
   * the problem, write, then the slower routes. One list, read by the home
   * panel and by the teaser, so the two can never offer different things —
   * and only what the widget's `features` switch on.
   */
  function homeOptions() {
    var cfg = state.cfg || {};
    var o = [];
    if (has('voice')) {
      o.push({
        key: 'phone', view: 'voice', label: 'Start an online call',
        hint: cfg.online === true ? 'A voice call in your browser — someone is here now'
          : cfg.online === false ? 'A voice call in your browser — nobody may be free right now'
            : 'A voice call in your browser, using your microphone',
      });
    }
    if (has('screen')) o.push({ key: 'screen', view: 'screen', label: 'Share your screen with us', hint: 'Show us the problem and we talk you through it' });
    if (has('chat')) o.push({ key: 'chat', view: 'chat', label: 'Live chat', hint: state.agent ? 'Answered straight away, a person when needed' : 'Write to us here and we reply here' });
    if (has('ticket')) {
      o.push({ key: 'ticket', view: 'ticket', label: 'Submit a ticket', hint: 'Tell us what happened — we reply by email' });
      o.push({ key: 'search', view: 'status', label: 'Check a ticket', hint: 'See where one you raised has got to' });
    }
    if (has('meeting') && cfg.bookingSlug) {
      o.push({
        key: 'calendar', view: '', label: 'Book a call', hint: 'Pick a time that suits you',
        go: function () { window.open(ORIGIN + '/book/' + encodeURIComponent(cfg.bookingSlug), '_blank', 'noopener'); },
      });
    }
    return o;
  }

  function homeView() {
    var wrap = el('div', 'padding:16px;display:flex;flex-direction:column;gap:9px;overflow-y:auto;flex:1;');
    var who = whoCard();
    if (who) wrap.appendChild(who);
    var hello = (state.agent && state.agent.greeting) || (state.cfg && state.cfg.welcome) || 'Hello — how can we help?';
    wrap.appendChild(el('div', 'font-size:14px;color:#334155;line-height:1.55;margin-bottom:4px;', hello));

    function option(key, label, hint, go, strong) {
      var b = el('button', BTN + 'padding:13px 14px;' + (strong ? 'border-color:' + accent() + '66;' : ''));
      b.type = 'button';
      var ic = el('span', 'display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;flex-shrink:0;background:' + accent() + '14;color:' + accent() + ';');
      ic.appendChild(icon(ICONS[key], 19));
      var txt = el('span', 'display:flex;flex-direction:column;gap:2px;min-width:0;');
      txt.appendChild(el('span', 'font-size:14.5px;', label));
      if (hint) txt.appendChild(el('span', 'font-size:12px;font-weight:500;color:#64748b;line-height:1.4;', hint));
      b.appendChild(ic); b.appendChild(txt);
      b.onclick = go;
      wrap.appendChild(b);
    }

    /* A call or a share already running comes first: it is what they are in. */
    if (live) {
      option(live.kind === 'voice' ? 'phone' : 'screen', live.kind === 'voice' ? 'Back to your call' : 'Back to your screen share',
        live.state === 'connected' ? 'Connected now' : 'Still waiting for somebody', function () { show(liveViewName(live)); }, true);
    }
    homeOptions().forEach(function (o) {
      option(o.key, o.label, o.hint, o.go || function () { show(o.view); });
    });
    if (state.cfg && state.cfg.consentText) {
      wrap.appendChild(el('div', 'font-size:11.5px;color:#64748b;line-height:1.5;margin-top:4px;', state.cfg.consentText));
    }
    body.appendChild(wrap);
  }

  /* ── Chat ──────────────────────────────────────────────────────────────────
   *
   * Live in both directions. Whenever a conversation exists the widget asks
   * for what has been said since its last look — every three seconds while
   * the chat is open on a visible tab, every twelve while it is closed, every
   * thirty while the tab is hidden, and not at all once nothing has happened
   * for half an hour (anything the visitor does wakes it). A reply that
   * arrives while the panel is shut puts a dot on the launcher.
   *
   * Messages are known by their id, not by how many there have been. Counting
   * broke the moment two arrived between polls in a different order, or the
   * visitor's own message came back on a poll before the call that sent it
   * had answered — and it only ever polled once a person had taken over, so
   * a business reply to a conversation the assistant still held never came.
   */

  var CHAT_ICONS = {
    attach: ['M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'],
  };

  var history = [];          // what the chat view draws: {id?, role, body, attachments?}
  var seenIds = {};          // every message id already in `history`
  var pendingBodies = [];    // sent, drawn, and not yet given an id by the server
  var greeted = false;
  var toldHandover = false;
  var lastDrawnRole = '';

  function remember(role, text) { history.push({ role: role, body: text }); }

  /* Somebody at the business, shown as themselves when the widget has been
     given a face and a name for them — never for the assistant, which must
     not look like a person. Only an https (or this install's own) address is
     drawn: it is a URL from configuration landing on a stranger's page. */
  function agentFace() {
    var c = state.cfg || {};
    var name = typeof c.agentName === 'string' ? c.agentName.slice(0, 60) : '';
    var src = '';
    if (typeof c.agentAvatar === 'string' && c.agentAvatar) {
      try {
        var u = new URL(c.agentAvatar, ORIGIN);
        if (u.protocol === 'https:' || u.origin === ORIGIN) src = u.href;
      } catch (e) { src = ''; }
    }
    return name || src ? { name: name, src: src } : null;
  }

  function bubble(role, text, attachments) {
    if (!log) return null;
    var mine = role === 'visitor';
    var b = el('div', [
      'max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.5;',
      'white-space:pre-wrap;word-wrap:break-word;',
      mine
        ? 'align-self:flex-end;background:' + accent() + ';color:#fff;'
        : 'align-self:flex-start;background:#f1f3f7;color:#0f172a;',
    ].join(''), text || null);
    if (attachments && attachments.length) {
      if (!text) b.style.padding = '4px';
      attachments.forEach(function (a) { b.appendChild(thumb(a)); });
    }

    var node = b;
    var face = role === 'agent' ? agentFace() : null;
    if (face) {
      /* The face goes on the first of a run of their messages, as a person
         would be introduced once rather than before every sentence. */
      node = el('div', 'align-self:flex-start;display:flex;gap:8px;align-items:flex-end;max-width:90%;');
      var pic = el('div', 'width:28px;height:28px;border-radius:50%;flex-shrink:0;overflow:hidden;display:flex;'
        + 'align-items:center;justify-content:center;font-size:12px;font-weight:800;color:' + accent() + ';background:' + accent() + '22;');
      var initial = face.name ? face.name.charAt(0).toUpperCase() : '';
      if (lastDrawnRole === 'agent') {
        pic.style.background = 'transparent';
      } else if (face.src) {
        var im = el('img', 'width:100%;height:100%;object-fit:cover;display:block;');
        im.alt = ''; im.src = face.src; im.referrerPolicy = 'no-referrer';
        im.onerror = function () { im.remove(); pic.textContent = initial; };
        pic.appendChild(im);
      } else {
        pic.textContent = initial;
      }
      var col = el('div', 'display:flex;flex-direction:column;gap:3px;min-width:0;');
      if (face.name && lastDrawnRole !== 'agent') col.appendChild(el('div', 'font-size:11.5px;font-weight:700;color:#64748b;padding-left:2px;', face.name));
      b.style.maxWidth = '100%';
      b.style.alignSelf = 'flex-start';
      col.appendChild(b);
      node.appendChild(pic); node.appendChild(col);
    }
    lastDrawnRole = role;
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
    return node;
  }

  function note(text, into) {
    var target = into || log;
    if (!target) return;
    var n = el('div', 'align-self:center;font-size:11.5px;color:#64748b;text-align:center;padding:2px 8px;line-height:1.5;', text);
    target.appendChild(n);
    target.scrollTop = target.scrollHeight;
    if (!into) lastDrawnRole = 'note';
  }

  function say(text) { remember('note', text); note(text); }

  function draw(m) {
    if (m.role === 'note') note(m.body);
    else bubble(m.role, m.body, m.attachments);
  }

  /* ── Pictures ──
   * Fetched with the conversation's key and drawn from memory: a picture has
   * no address anybody could open without that key, so there is nothing to
   * put in an <img src> but the bytes themselves. */
  var files = {};
  function fileUrl(id) {
    if (!files[id]) {
      var body = { action: 'file', conversationId: state.conv, visitorKey: state.vkey, fileId: id };
      if (SAME_ORIGIN) body.token = 'cookie';
      files[id] = fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(function (r) {
        var type = r.headers.get('Content-Type') || '';
        if (!r.ok || type.indexOf('image/') !== 0) throw new Error('missing');
        return r.blob();
      }).then(function (b) { return URL.createObjectURL(b); })
        .catch(function (e) { delete files[id]; throw e; });
    }
    return files[id];
  }

  function thumb(a) {
    var box = el('button', 'display:block;padding:0;border:0;background:#e2e8f0;border-radius:10px;overflow:hidden;cursor:zoom-in;margin:2px 0;'
      + 'min-width:60px;min-height:48px;max-width:220px;');
    box.type = 'button';
    box.setAttribute('aria-label', 'Open the picture full size');
    if (a.w && a.h) {
      var w = Math.min(220, a.w);
      box.style.width = w + 'px';
      box.style.aspectRatio = a.w + ' / ' + a.h;
      box.style.maxHeight = '260px';
    }
    var im = el('img', 'display:block;width:100%;height:100%;max-height:260px;object-fit:cover;');
    im.alt = 'Picture sent in the chat';
    box.appendChild(im);
    fileUrl(a.id).then(function (u) { im.src = u; box.onclick = function () { lightbox(u); }; })
      .catch(function () {
        box.removeChild(im);
        box.style.cursor = 'default';
        box.appendChild(el('span', 'display:block;padding:10px;font-size:12px;color:#475569;', 'Picture unavailable'));
      });
    return box;
  }

  function lightbox(src) {
    var o = el('div', 'position:fixed;inset:0;z-index:2147483002;background:rgba(15,23,42,.84);display:flex;'
      + 'align-items:center;justify-content:center;padding:16px;box-sizing:border-box;cursor:zoom-out;');
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-label', 'Picture, full size');
    var im = el('img', 'max-width:100%;max-height:100%;border-radius:8px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.4);');
    im.src = src; im.alt = 'Picture sent in the chat';
    o.appendChild(im);
    function close() { o.remove(); document.removeEventListener('keydown', key, true); }
    function key(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    o.onclick = close;
    document.addEventListener('keydown', key, true);
    document.body.appendChild(o);
  }

  /* Shrunk here, before it leaves: a phone photo is several megabytes and a
     screenshot is mostly text, both readable at 1600 pixels. JPEG at 0.8,
     then lower quality, then smaller, until it fits under 1.5 MB. */
  var MAX_SIDE = 1600;
  var MAX_BYTES = 1572864;
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) { reject(new Error('Only pictures can be sent here.')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var nw = img.naturalWidth, nh = img.naturalHeight;
        if (!nw || !nh) { reject(new Error('That file could not be read as a picture.')); return; }
        var scale = Math.min(1, MAX_SIDE / Math.max(nw, nh));
        var q = 0.8;
        for (var i = 0; i < 8; i++) {
          var w = Math.max(1, Math.round(nw * scale)), h = Math.max(1, Math.round(nh * scale));
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var g = c.getContext('2d');
          /* White under a transparent screenshot, or JPEG makes it black. */
          g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
          g.drawImage(img, 0, 0, w, h);
          var data = c.toDataURL('image/jpeg', q);
          var bytes = Math.floor((data.length - data.indexOf(',') - 1) * 3 / 4);
          if (bytes <= MAX_BYTES) { resolve({ data: data, w: w, h: h }); return; }
          if (q > 0.6) q -= 0.1; else scale *= 0.75;
        }
        reject(new Error('That picture is too large to send, even made smaller.'));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
      img.src = url;
    });
  }

  /* ── Messages in, from wherever they came ── */

  function addMessage(m, how) {
    if (!m) return;
    how = how || {};
    if (m.id) {
      if (seenIds[m.id]) return;
      seenIds[m.id] = 1;
    }
    /* Our own words, back on a poll before the call that sent them answered:
       already on screen, so only the id is kept. */
    if (m.role === 'visitor' && how.polled && !(m.attachments && m.attachments.length)) {
      var at = pendingBodies.indexOf(m.body);
      if (at !== -1) { pendingBodies.splice(at, 1); return; }
    }
    var entry = { id: m.id, role: m.role, body: m.body, attachments: m.attachments || [] };
    history.push(entry);
    if (state.view === 'chat' && log) draw(entry);
    if (m.role !== 'visitor' && how.polled && !how.baseline) {
      lastActivity = Date.now();
      if (!chatOnScreen()) markUnread(true);
    }
  }

  /* The answer to our own send: its id is ours now, whichever arrived first. */
  function claimOwn(m) {
    if (!m || !m.id || seenIds[m.id]) return;
    seenIds[m.id] = 1;
    var at = pendingBodies.indexOf(m.body);
    if (at !== -1) pendingBodies.splice(at, 1);
  }

  function chatOnScreen() {
    return state.open && state.view === 'chat' && document.visibilityState !== 'hidden';
  }

  /* A dot on the launcher, and an attribute a page can style or test for.
     The launcher itself is left exactly as it was drawn. */
  function markUnread(on) {
    if (!launcher) return;
    var dot = launcher.querySelector('[data-pc-unread-dot]');
    if (on) {
      launcher.setAttribute('data-pc-unread', '1');
      if (!dot) {
        dot = el('span', 'position:absolute;top:-2px;right:-2px;width:13px;height:13px;border-radius:50%;'
          + 'background:#ef4444;border:2px solid #fff;box-sizing:border-box;pointer-events:none;');
        dot.setAttribute('data-pc-unread-dot', '');
        dot.setAttribute('role', 'status');
        dot.setAttribute('aria-label', 'New reply');
        if (!launcher.style.position) launcher.style.position = 'relative';
        launcher.appendChild(dot);
      }
    } else {
      launcher.removeAttribute('data-pc-unread');
      if (dot) dot.remove();
    }
  }

  /* Opening the panel onto the chat: what was unread has been seen, and the
     poll goes back to its quick pace at once. */
  function chatOpened() {
    if (state.view === 'chat') markUnread(false);
    wakePoll();
  }

  /* ── The poll ── */

  var cursor = '';
  var pollTimer = null;
  var polling = false;
  var lastActivity = Date.now();
  var IDLE_STOP_MS = 30 * 60 * 1000;

  function pollDelay() {
    if (document.visibilityState === 'hidden') return 30000;
    return state.open && state.view === 'chat' ? 3000 : 12000;
  }

  function schedulePoll(ms) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
    if (!state.conv) return;
    /* Half an hour of nothing either way: the conversation is over in all but
       name, and asking every few seconds for ever would be a load test made
       of abandoned tabs. Anything the visitor does starts it again. */
    if (Date.now() - lastActivity > IDLE_STOP_MS) return;
    pollTimer = window.setTimeout(pollNow, ms == null ? pollDelay() : ms);
  }

  function pollNow() {
    window.clearTimeout(pollTimer);
    pollTimer = null;
    if (!state.conv || polling) return;
    polling = true;
    var baseline = !cursor;
    var conv = state.conv;
    post({ action: 'poll', conversationId: conv, visitorKey: state.vkey, since: cursor || undefined }).then(function (r) {
      polling = false;
      if (conv !== state.conv) return;
      if (!r.success) { schedulePoll(15000); return; }
      if (r.cursor) cursor = r.cursor;
      (r.messages || []).forEach(function (m) { addMessage(m, { polled: true, baseline: baseline }); });
      schedulePoll();
    });
  }

  function wakePoll() {
    lastActivity = Date.now();
    if (state.conv && !polling) schedulePoll(200);
  }

  /* Once the widget is drawn: a conversation carried over from before a
     reload is fetched straight away, so a reply that came in meanwhile is
     waiting — and marked — rather than appearing only when they look. */
  var booted = false;
  window.addEventListener('pc-widget-ready', function () {
    if (booted) return;
    booted = true;
    if (state.conv) schedulePoll(0);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        if (chatOnScreen()) markUnread(false);
        wakePoll();
      }
    });
  });

  /* ── The view ── */

  function chatView() {
    log = el('div', 'flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;');
    var bar = el('div', 'display:flex;gap:8px;padding:12px;border-top:1px solid #e6e9f0;flex-shrink:0;');
    var pick = el('input', 'display:none;');
    pick.type = 'file';
    pick.accept = 'image/*';
    pick.onchange = function () { if (pick.files && pick.files[0]) sendImage(pick.files[0]); pick.value = ''; };
    var clip = el('button', 'display:flex;align-items:center;justify-content:center;flex-shrink:0;width:40px;padding:0;'
      + 'border:1px solid #e6e9f0;border-radius:10px;background:#fff;color:#475569;cursor:pointer;');
    clip.type = 'button';
    clip.title = 'Attach a screenshot or picture (or paste one)';
    clip.setAttribute('aria-label', 'Attach a screenshot or picture');
    clip.appendChild(icon(CHAT_ICONS.attach, 18));
    clip.onclick = function () { pick.click(); };
    input = el('input', FIELD + 'flex:1;min-width:0;');
    input.placeholder = 'Type a message…';
    input.setAttribute('aria-label', 'Message');
    input.onkeydown = function (e) { if (e.key === 'Enter') send(input.value); };
    /* A screenshot is most often on the clipboard already. */
    input.addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); sendImage(f); return; }
        }
      }
    });
    var go = el('button', primary() + 'padding:10px 15px;font-size:13px;', 'Send');
    go.onclick = function () { send(input.value); };
    bar.appendChild(pick); bar.appendChild(clip); bar.appendChild(input); bar.appendChild(go);
    body.appendChild(log); body.appendChild(bar);

    if (!greeted) {
      greeted = true;
      var hello = (state.agent && state.agent.greeting)
        || (state.cfg && state.cfg.welcome)
        || 'Hello — how can we help?';
      var intro = [{ role: 'ai', body: hello }];
      if (state.cfg && state.cfg.consentText && onlyChat()) intro.push({ role: 'note', body: state.cfg.consentText });
      history = intro.concat(history);
    }
    lastDrawnRole = '';
    history.forEach(draw);
    input.focus();
    if (state.open) markUnread(false);
    wakePoll();
  }

  /* A conversation to write into, made on the first message or picture. */
  function ensureConv() {
    if (state.conv) return Promise.resolve({ success: true });
    return post({
      action: 'start', widgetKey: KEY,
      context: { page: window.location.href, referrer: document.referrer },
    }).then(function (r) {
      if (r.success) {
        state.conv = r.conversationId; state.vkey = r.visitorKey;
        cursor = '';
        try {
          window.sessionStorage.setItem(STORE, JSON.stringify({ conv: state.conv, vkey: state.vkey }));
        } catch (e) { /* nothing to do; the thread just will not survive a reload */ }
      }
      if (!r.success) throw new Error(r.message || 'Could not start the chat.');
      return r;
    });
  }

  function send(text) {
    if (!text.trim() || state.sending) return;
    state.sending = true;
    remember('visitor', text);
    pendingBodies.push(text);
    bubble('visitor', text);
    input.value = '';
    lastActivity = Date.now();

    var thinking = bubble('ai', '…');

    ensureConv().then(function () {
      wakePoll();
      return post({
        action: 'send', conversationId: state.conv, visitorKey: state.vkey, message: text,
      });
    }).then(function (r) {
      if (thinking) thinking.remove();
      state.sending = false;
      if (!r.success) {
        var at = pendingBodies.indexOf(text);
        if (at !== -1) pendingBodies.splice(at, 1);
        say(r.message || 'That could not be sent.');
        return;
      }
      claimOwn(r.message);
      (r.messages || []).forEach(function (m) { addMessage(m); });

      /* Said plainly rather than hidden. A chat that has quietly stopped
         thinking should offer the alternative rather than look broken. */
      if (r.degraded) say('The assistant is unavailable at the moment — a person will pick this up.');
      if (r.handedOver && !toldHandover) {
        toldHandover = true;
        say('A colleague has joined and will reply here.');
      }
      if (r.tool && r.tool.message) say(r.tool.message);
      if (r.tool && r.tool.data && r.tool.data.bookingSlug && log) {
        var a = el('a', 'align-self:flex-start;font-size:13px;font-weight:700;color:' + accent() + ';text-decoration:underline;', 'Pick a time');
        a.href = ORIGIN + '/book/' + r.tool.data.bookingSlug;
        a.target = '_blank';
        a.rel = 'noopener';
        log.appendChild(a);
      }
      wakePoll();
    }).catch(function (e) {
      if (thinking) thinking.remove();
      state.sending = false;
      note(e.message || 'Something went wrong. Please try again.');
    });
  }

  function sendImage(file) {
    if (state.sending) return;
    state.sending = true;
    lastActivity = Date.now();
    var wait = bubble('visitor', 'Sending picture…');
    var shrunk;
    shrink(file).then(function (img) {
      shrunk = img;
      return ensureConv();
    }).then(function () {
      return post({
        action: 'attach', conversationId: state.conv, visitorKey: state.vkey,
        image: shrunk.data, w: shrunk.w, h: shrunk.h,
      });
    }).then(function (r) {
      if (wait) wait.remove();
      state.sending = false;
      if (!r.success) { say(r.message || 'That picture could not be sent.'); return; }
      var a = r.message && r.message.attachments && r.message.attachments[0];
      /* Drawn from what is already in memory rather than fetched back. */
      if (a && !files[a.id]) files[a.id] = Promise.resolve(shrunk.data);
      addMessage(r.message);
      if (!toldPicture) {
        toldPicture = true;
        say('A person will look at your picture — the assistant cannot see images.');
      }
      wakePoll();
    }).catch(function (e) {
      if (wait) wait.remove();
      state.sending = false;
      say(e.message || 'That picture could not be sent.');
    });
  }
  var toldPicture = false;

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

  /* ── Live help: sharing a screen, or a voice call ──────────────────────────
   *
   * The browser shares the screen (or a window, or a tab) straight to the
   * browser of whoever joins from Customer Engagement → Live help. The server
   * only carries the handshake: this side posts one description of how to
   * reach it, polls until the other side has posted theirs, and from then on
   * the picture, their voice and the small messages go directly.
   *
   * "Start an online call" is the same session with a microphone and no screen
   * (`kind: 'voice'`). It rings in the business's app for RING_SECONDS
   * (lib/liveHelp.ts) — the server says how long — and if nobody answers, or
   * somebody presses Decline, the caller is told so plainly and offered a
   * message or a ticket instead. It is a call in the browser; there is no
   * telephone number anywhere in it, and nothing here says otherwise.
   */
  var live = null;

  function canShare() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.RTCPeerConnection);
  }
  function canCall() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);
  }
  /* Choosing where sound comes out is a Chrome and Edge thing (and Firefox
     behind a setting). Where it is missing the choice is not drawn at all —
     a list that changes nothing would be worse than none. */
  function canPickSpeaker() {
    return typeof window.HTMLMediaElement !== 'undefined' && 'setSinkId' in window.HTMLMediaElement.prototype;
  }

  function liveViewName(l) { return l && l.kind === 'voice' ? 'voice' : 'screen'; }
  function onLiveView() { return !!live && state.view === liveViewName(live); }

  /* Where to go instead, when a call or a share cannot happen. Only what this
     widget actually offers. */
  function fallbacks(into, lead) {
    if (has('chat')) {
      var c = el('button', BTN, lead ? 'Leave us a message' : 'Live chat instead');
      c.onclick = function () { show('chat'); };
      into.appendChild(c);
    }
    if (has('ticket')) {
      var t = el('button', BTN, lead ? 'Submit a ticket — we reply by email' : 'Submit a ticket instead');
      t.onclick = function () { show('ticket'); };
      into.appendChild(t);
    }
    if (has('meeting') && state.cfg && state.cfg.bookingSlug) {
      var b = el('button', BTN, 'Book a call at a time that suits you');
      b.onclick = function () { window.open(ORIGIN + '/book/' + encodeURIComponent(state.cfg.bookingSlug), '_blank', 'noopener'); };
      into.appendChild(b);
    }
  }

  function screenView() {
    if (live && live.kind === 'screen') { liveView(true); return; }
    if (live) { busyElsewhere(); return; }
    if (!canShare()) {
      var w = el('div', 'padding:18px;display:flex;flex-direction:column;gap:10px;');
      w.appendChild(el('div', 'font-size:14px;color:#0f172a;line-height:1.55;',
        'This browser cannot share its screen — phones and tablets generally cannot from a web page. Open this on a computer, or:'));
      if (has('voice') && canCall()) { var v = el('button', BTN, 'Call us instead'); v.onclick = function () { show('voice'); }; w.appendChild(v); }
      fallbacks(w, false);
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

  /* One live session at a time: a call and a screen share would fight over
     the same microphone, and the business would see two requests from one
     person. */
  function busyElsewhere() {
    var w = el('div', 'padding:18px;display:flex;flex-direction:column;gap:10px;');
    w.appendChild(el('div', 'font-size:14px;color:#0f172a;line-height:1.55;',
      live.kind === 'voice' ? 'You are on a call with us already.' : 'You are sharing your screen with us already — you can talk there too.'));
    var b = el('button', primary(), live.kind === 'voice' ? 'Back to the call' : 'Back to the screen share');
    b.onclick = function () { show(liveViewName(live)); };
    w.appendChild(b);
    body.appendChild(w);
  }

  /* ── "Start an online call" ── */

  function voiceView() {
    if (live && live.kind === 'voice') { liveView(true); return; }
    if (live) { busyElsewhere(); return; }
    var cfg = state.cfg || {};
    if (!canCall()) {
      var w = el('div', 'padding:18px;display:flex;flex-direction:column;gap:10px;');
      w.appendChild(el('div', 'font-size:14px;color:#0f172a;line-height:1.55;',
        'This browser cannot make a call from a web page. Try a current Chrome, Edge, Firefox or Safari, or:'));
      fallbacks(w, false);
      body.appendChild(w);
      return;
    }

    var f = formWrap();
    var who = cfg.agentName ? cfg.agentName : 'somebody here';
    f.appendChild(el('div', 'font-size:13.5px;color:#334155;line-height:1.55;',
      'Talk to ' + who + ' through your browser, using your microphone and speakers. It is not a phone call and needs no number. Nothing is recorded.'));
    /* Said only when it is known. `online` is null for a widget whose
       business never checks — then nothing is claimed either way. */
    if (cfg.online === true || cfg.online === false) {
      var st = el('div', 'display:flex;gap:7px;align-items:center;font-size:12.5px;font-weight:700;color:' + (cfg.online ? '#15803d' : '#92400e') + ';');
      st.appendChild(el('span', 'width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' + (cfg.online ? '#22c55e' : '#f59e0b') + ';'));
      st.appendChild(el('span', '', cfg.online
        ? 'Someone is here now.'
        : 'Nobody may be free right now. You can still try — if nobody answers, you can leave a message.'));
      f.appendChild(st);
    }
    var name = el('input', FIELD); name.value = KNOWN.name; name.autocomplete = 'name';
    var email = el('input', FIELD); email.type = 'email'; email.value = KNOWN.email; email.autocomplete = 'email';
    var topic = el('input', FIELD); topic.maxLength = 300;
    if (!KNOWN.name) f.appendChild(labelled('Your name', name));
    if (!KNOWN.email) f.appendChild(labelled('Email, in case we get cut off', email));
    f.appendChild(labelled('What is it about? (optional)', topic));
    var out = el('div', 'font-size:12.5px;color:#b42318;line-height:1.5;');
    var go = el('button', primary() + 'display:flex;align-items:center;justify-content:center;gap:8px;');
    go.type = 'submit';
    go.appendChild(icon(ICONS.phone, 16));
    go.appendChild(el('span', '', 'Call now'));
    f.appendChild(out); f.appendChild(go);
    f.onsubmit = function (e) {
      e.preventDefault();
      out.textContent = '';
      go.disabled = true;
      /* Remembered for the fallbacks: somebody nobody answered should not be
         asked their name again on the ticket form. */
      if (name.value && !KNOWN.name) KNOWN.name = name.value;
      if (email.value && !KNOWN.email) KNOWN.email = email.value;
      startCall({ name: name.value, email: email.value, topic: topic.value })
        .catch(function (err) {
          go.disabled = false;
          out.textContent = err && err.message ? err.message : 'The call did not start.';
        });
    };
    body.appendChild(f);
  }

  function startCall(who) {
    /* The microphone first: somebody who refuses it has asked for nothing,
       and must not leave a call ringing in somebody's app. */
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .catch(function (e) {
        throw new Error(e && e.name === 'NotAllowedError'
          ? 'A call needs your microphone. Allow it for this site and press Call now again — or leave us a message instead.'
          : 'No microphone could be used on this device.');
      })
      .then(function (micStream) {
        return post({
          action: 'live_start', kind: 'voice', widgetKey: KEY, name: who.name || KNOWN.name, email: who.email || KNOWN.email,
          subject: who.topic, conversationId: state.conv || '',
          context: { page: window.location.href, workspace: KNOWN.workspace },
        }).then(function (r) {
          if (!r.success) {
            stopTracks(micStream);
            throw new Error(r.message || r.error || 'Could not call just now.');
          }
          return connect(r, null, micStream, 'voice');
        });
      });
  }

  /* The sound of a phone ringing at the far end, so a caller is not left in
     silence wondering whether anything is happening. Made here rather than
     fetched — two tones, two seconds on, four off — and only after the press
     on "Call now", so no browser blocks it. */
  var ringer = null;
  function ringback(on) {
    if (!on) {
      if (ringer) { window.clearInterval(ringer.t); try { ringer.ctx.close(); } catch (e) { /* closed */ } ringer = null; }
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (ringer || !AC) return;
    try {
      var ctx = new AC();
      var g = ctx.createGain(); g.gain.value = 0; g.connect(ctx.destination);
      [440, 480].forEach(function (hz) { var o = ctx.createOscillator(); o.frequency.value = hz; o.connect(g); o.start(); });
      var beat = function () {
        var t = ctx.currentTime;
        g.gain.setValueAtTime(0.04, t);
        g.gain.setValueAtTime(0, t + 2);
      };
      beat();
      ringer = { ctx: ctx, t: window.setInterval(beat, 6000) };
    } catch (e) { ringer = null; }
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
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(function () { return null; });
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
        return connect(r, display, micStream, 'screen');
      });
    });
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

  function stopTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* already stopped */ } });
  }

  function connect(r, display, micStream, kind) {
    var pc = new window.RTCPeerConnection({ iceServers: r.iceServers || [] });
    live = {
      kind: kind, id: r.sessionId, key: r.shareKey, pc: pc, display: display, mic: micStream,
      status: 'waiting', state: 'new', agent: '', meetUrl: '', messages: [], timer: null,
      relay: !!r.relay, surface: '', dc: null, audio: null,
      /* Audio: whether this side is muted, whether the other side says it is,
         how loud they are played, and through which output. */
      muted: false, theyMuted: false, volume: 1, sinkId: '',
      startedAt: Date.now(), ringSeconds: Number(r.ringSeconds) || 0, connectedAt: 0,
      clock: null, ui: null, drawn: '',
    };
    if (display) {
      var vt = display.getVideoTracks()[0];
      try { live.surface = (vt.getSettings() || {}).displaySurface || ''; } catch (e) { live.surface = ''; }
      if (vt && 'contentHint' in vt) vt.contentHint = 'detail';
      display.getTracks().forEach(function (t) { pc.addTrack(t, display); });
      /* The browser's own "Stop sharing" bar ends the session, not only the
         picture: leaving somebody watching a frozen frame is worse than ending. */
      vt.addEventListener('ended', function () { endLive('sharer'); });
    }
    if (micStream) micStream.getTracks().forEach(function (t) { pc.addTrack(t, micStream); });
    else pc.addTransceiver('audio', { direction: 'recvonly' });

    live.dc = pc.createDataChannel('pc');
    live.dc.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!live) return;
      if (m.t === 'say' && m.text) { live.messages.push({ from: 'them', text: String(m.text).slice(0, 2000) }); redraw(); }
      if (m.t === 'point') pointAt(Number(m.x), Number(m.y));
      if (m.t === 'mute') { live.theyMuted = !!m.on; paintAudio(); }
      if (m.t === 'end') endLive('agent-ended', true);
    };
    live.dc.onopen = function () {
      /* Somebody who muted before the other side arrived is still muted. */
      if (live && live.muted) try { live.dc.send(JSON.stringify({ t: 'mute', on: true })); } catch (e) { /* closing */ }
    };

    pc.ontrack = function (ev) {
      if (ev.track.kind !== 'audio' || !live) return;
      if (!live.audio) {
        live.audio = el('audio', 'display:none;');
        live.audio.autoplay = true;
        live.audio.setAttribute('data-pc-remote-audio', '');
        document.body.appendChild(live.audio);
      }
      live.audio.srcObject = ev.streams[0] || new MediaStream([ev.track]);
      live.audio.volume = live.volume;
      if (live.sinkId && live.audio.setSinkId) live.audio.setSinkId(live.sinkId).catch(function () { /* default output */ });
    };
    pc.onconnectionstatechange = function () {
      if (!live) return;
      var s = pc.connectionState;
      if (s === 'connected') {
        live.state = 'connected';
        if (!live.connectedAt) live.connectedAt = Date.now();
        ringback(false);
      } else if (s === 'failed') live.state = 'failed';
      else if (s === 'connecting') live.state = 'connecting';
      redraw();
      tick();
    };

    /* A clock for the ring and the call's length, and the "who is talking"
       lights. Painted in place, not by redrawing the view, so a list somebody
       has open or a half-typed message is not thrown away every second. */
    live.clock = window.setInterval(function () { paintAudio(); levels(); }, 400);

    return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
      .then(function () { return gathered(pc); })
      .then(function () {
        return post({ action: 'live_offer', sessionId: live.id, shareKey: live.key, sdp: pc.localDescription.sdp });
      })
      .then(function (res) {
        if (!res.success) throw new Error(res.message || 'Could not set the session up.');
        if (kind === 'voice') ringback(true);
        show(liveViewName(live));
        schedule(kind === 'voice' ? 2000 : 3000);
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
        ringback(false);
        mine.pc.setRemoteDescription({ type: 'answer', sdp: r.answer }).catch(function () {
          mine.state = 'failed';
        });
      }
      if (r.status === 'ended') {
        endLive(r.endedReason === 'expired' ? 'expired' : r.endedReason === 'declined' ? 'declined' : 'agent-ended', true);
        return;
      }
      redraw();
      /* Quick while somebody is waiting to be answered — quickest while a
         call rings, when a second is a long time — and slow once the two
         browsers are talking, when this only listens for a Meet link or the
         end. */
      schedule(mine.state === 'connected' ? 10000 : mine.kind === 'voice' && mine.status === 'waiting' ? 2000 : 3000);
    });
  }

  var endedNote = '';
  function endLive(reason, fromServer) {
    if (!live) return;
    var l = live;
    live = null;
    window.clearTimeout(l.timer);
    window.clearInterval(l.clock);
    ringback(false);
    stopTracks(l.display); stopTracks(l.mic);
    try { l.pc.close(); } catch (e) { /* already closed */ }
    if (l.audio) l.audio.remove();
    if (!fromServer) {
      post({ action: 'live_end', sessionId: l.id, shareKey: l.key, reason: reason === 'failed' ? 'failed' : 'sharer' });
    }
    var voice = l.kind === 'voice';
    var nobody = reason === 'expired' || reason === 'declined';
    endedNote = reason === 'expired'
      ? (voice ? 'No one is available to take your call right now — sorry.' : 'Nobody was free to join in time — sorry.')
      : reason === 'declined'
        ? ((l.agent || (state.cfg && state.cfg.agentName) || 'We') + ' could not take the call just now — sorry.')
        : reason === 'agent-ended' ? (voice ? 'The call has ended. Thank you for calling.' : 'Support has ended the session. Thank you.')
          : reason === 'failed' ? ''
            : voice ? (l.connectedAt ? 'You hung up.' : 'Call cancelled.') : 'You stopped sharing.';
    if (endedNote && state.view === liveViewName(l)) {
      while (body.firstChild) body.removeChild(body.firstChild);
      var w = el('div', 'padding:18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1;');
      w.appendChild(el('div', 'font-size:14px;color:#0f172a;line-height:1.55;font-weight:' + (nobody ? '700' : '400') + ';', endedNote));
      if (voice && l.connectedAt) w.appendChild(el('div', 'font-size:12.5px;color:#64748b;', 'Call length ' + clockText(Date.now() - l.connectedAt)));
      if (nobody) {
        w.appendChild(el('div', 'font-size:13px;color:#334155;line-height:1.55;',
          'Leave a message and we will get back to you' + (KNOWN.email ? ' at ' + KNOWN.email : '') + ':'));
        fallbacks(w, true);
      }
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

  /* A closed tab sends nothing on its own, and the business would otherwise
     see a call ringing — or a screen "live" — for minutes after the person
     has gone. A beacon is the one request a page being closed still sends. */
  window.addEventListener('pagehide', function () {
    if (!live || !navigator.sendBeacon) return;
    try { navigator.sendBeacon(API, JSON.stringify({ action: 'live_end', sessionId: live.id, shareKey: live.key, reason: 'sharer' })); } catch (e) { /* closing anyway */ }
  });

  function clockText(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  /* Draw the live view again only when something on it has changed: every
     poll used to rebuild it, which closed an open list and threw away what
     somebody was halfway through typing. */
  function redraw() {
    if (!onLiveView()) return;
    var sig = [live.state, live.status, live.meetUrl, live.agent, live.messages.length].join('|');
    if (sig === live.drawn) return;
    liveView(true);
  }

  function liveView() {
    if (!live) { (state.view === 'voice' ? voiceView : screenView)(); return; }
    var l = live;
    l.drawn = [l.state, l.status, l.meetUrl, l.agent, l.messages.length].join('|');
    while (body.firstChild) body.removeChild(body.firstChild);
    var voice = l.kind === 'voice';
    var w = el('div', 'padding:16px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1;');
    var dot = l.state === 'connected' ? '#16a34a' : l.state === 'failed' ? '#b42318' : '#d97706';
    var line = el('div', 'display:flex;gap:8px;align-items:center;font-size:14px;font-weight:700;color:#0f172a;');
    line.appendChild(el('span', 'width:9px;height:9px;border-radius:50%;flex-shrink:0;background:' + dot + ';'));
    var them = l.agent || (state.cfg && state.cfg.agentName) || 'Support';
    line.appendChild(el('span', 'flex:1;min-width:0;', l.state === 'connected'
      ? (voice ? 'On a call with ' + them : them + ' can see your screen')
      : l.state === 'failed' ? 'Could not connect directly'
        : l.status === 'live' ? 'Connecting…' : voice ? 'Ringing…' : 'Waiting for somebody to join…'));
    /* The ring's count, then the call's length — painted every tick. */
    var dur = el('span', 'font-size:12.5px;font-weight:700;color:#64748b;font-variant-numeric:tabular-nums;');
    dur.setAttribute('data-pc-clock', '');
    line.appendChild(dur);
    w.appendChild(line);
    w.appendChild(el('div', 'font-size:12.5px;color:#475569;line-height:1.55;', l.state === 'failed'
      ? 'Your network would not allow a direct connection. Stay here — support can send you a Google Meet link instead, and it will appear below.'
      : l.state === 'connected'
        ? (voice ? 'You are talking through your browser. Use the controls below to mute or change your microphone or speaker.'
          : (l.mic ? 'You can talk to each other. ' : '') + 'They cannot click or type on your computer — they can only see it and point.')
        : voice ? 'Somebody here is being called in their app. Keep this open — if nobody can answer, you can leave a message instead.'
          : 'We have been told. Keep this open; it usually takes a minute or two. Nothing is shared until somebody joins.'));

    if (l.meetUrl) {
      var a = el('a', primary() + 'text-align:center;text-decoration:none;display:block;', 'Join the Google Meet');
      a.href = l.meetUrl; a.target = '_blank'; a.rel = 'noopener';
      w.appendChild(a);
    }

    /* The sound controls, as soon as there is anything to control: on a call
       from the first ring (somebody may want to mute before anyone answers),
       on a screen share once it is live. */
    if (voice || l.state === 'connected') w.appendChild(audioPanel(l));

    if (!voice && l.state === 'connected') {
      var msgs = el('div', 'display:flex;flex-direction:column;gap:6px;');
      l.messages.slice(-12).forEach(function (m) {
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
        var again = body.querySelector('input[aria-label="Message to support"]');
        if (again) again.focus();
      };
      say.onkeydown = function (e) { if (e.key === 'Enter') sendSay(); };
      sayGo.onclick = sendSay;
      bar.appendChild(say); bar.appendChild(sayGo);
      w.appendChild(bar);
    }

    var stop = el('button', BTN + 'justify-content:center;color:#b42318;border-color:#fecaca;',
      voice ? (l.status === 'waiting' ? 'Cancel call' : 'Hang up') : 'Stop sharing');
    stop.onclick = function () { endLive('sharer'); };
    w.appendChild(stop);
    body.appendChild(w);
    paintAudio();
  }

  /* ── Sound: mute, microphone, speaker, volume, who is talking ── */

  function audioPanel(l) {
    var box = el('div', 'display:flex;flex-direction:column;gap:9px;padding:11px;border:1px solid #e6e9f0;border-radius:12px;background:#f8fafc;');
    box.setAttribute('data-pc-audio', '');

    /* Who is talking, and who is muted — both ends. */
    var row = el('div', 'display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:#334155;');
    function talker(label, attr) {
      var t = el('span', 'display:inline-flex;align-items:center;gap:6px;min-width:0;');
      var d = el('span', 'width:9px;height:9px;border-radius:50%;flex-shrink:0;background:#cbd5e1;transition:background .15s;');
      var x = el('span', '', label);
      t.setAttribute(attr, '');
      t.appendChild(d); t.appendChild(x);
      row.appendChild(t);
      return { dot: d, text: x, label: label, wrap: t };
    }
    var me = talker('You', 'data-pc-me');
    var them = talker(l.agent || (state.cfg && state.cfg.agentName) || 'Support', 'data-pc-them');
    box.appendChild(row);

    var controls = el('div', 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
    var mute = el('button', 'display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid #e6e9f0;border-radius:10px;background:#fff;color:#0f172a;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;');
    mute.type = 'button';
    mute.disabled = !l.mic;
    mute.onclick = function () { setMuted(!l.muted); };
    controls.appendChild(mute);

    var volWrap = el('label', 'display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#475569;flex:1;min-width:140px;');
    volWrap.appendChild(icon(ICONS.speaker, 16));
    var vol = el('input', 'flex:1;min-width:0;accent-color:' + accent() + ';');
    vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.value = String(l.volume);
    vol.setAttribute('aria-label', 'Speaker volume');
    vol.oninput = function () {
      l.volume = Number(vol.value);
      if (l.audio) l.audio.volume = l.volume;
    };
    volWrap.appendChild(vol);
    controls.appendChild(volWrap);
    box.appendChild(controls);

    var pickers = el('div', 'display:flex;flex-direction:column;gap:7px;');
    var micSel = el('select', FIELD + 'padding:7px 9px;font-size:12.5px;');
    var micWrap = labelled('Microphone', micSel); micWrap.style.display = 'none';
    var spkSel = el('select', FIELD + 'padding:7px 9px;font-size:12.5px;');
    var spkWrap = labelled('Speaker', spkSel); spkWrap.style.display = 'none';
    var problem = el('div', 'font-size:12px;color:#b42318;line-height:1.5;');
    pickers.appendChild(micWrap); pickers.appendChild(spkWrap); pickers.appendChild(problem);
    box.appendChild(pickers);
    if (!l.mic) box.appendChild(el('div', 'font-size:12px;color:#64748b;line-height:1.5;', 'Your microphone is off for this session, so they can hear nothing from you — type to them instead.'));

    micSel.onchange = function () {
      problem.textContent = '';
      switchMic(l, micSel.value).catch(function () { problem.textContent = 'That microphone could not be used — the one before it is still on.'; });
    };
    spkSel.onchange = function () {
      problem.textContent = '';
      l.sinkId = spkSel.value;
      if (l.audio && l.audio.setSinkId) {
        l.audio.setSinkId(l.sinkId).catch(function () { problem.textContent = 'That speaker could not be used.'; });
      }
    };
    fillDevices(l, micSel, micWrap, spkSel, spkWrap);

    l.ui = { me: me, them: them, mute: mute };
    return box;
  }

  /* The lists hold real devices only, named as the browser names them — the
     names are there because the microphone permission was already given. */
  function fillDevices(l, micSel, micWrap, spkSel, spkWrap) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function (list) {
      var ins = list.filter(function (d) { return d.kind === 'audioinput' && d.deviceId; });
      var outs = list.filter(function (d) { return d.kind === 'audiooutput' && d.deviceId; });
      var t = l.mic && l.mic.getAudioTracks()[0];
      var current = '';
      try { current = t ? (t.getSettings() || {}).deviceId || '' : ''; } catch (e) { current = ''; }
      if (l.mic && ins.length > 1) {
        ins.forEach(function (d, i) {
          var o = el('option', '', d.label || 'Microphone ' + (i + 1));
          o.value = d.deviceId;
          if (d.deviceId === current) o.selected = true;
          micSel.appendChild(o);
        });
        micWrap.style.display = '';
      }
      if (canPickSpeaker() && outs.length > 1) {
        outs.forEach(function (d, i) {
          var o = el('option', '', d.label || 'Speaker ' + (i + 1));
          o.value = d.deviceId;
          if (d.deviceId === (l.sinkId || 'default')) o.selected = true;
          spkSel.appendChild(o);
        });
        spkWrap.style.display = '';
      }
    }).catch(function () { /* the lists stay hidden; the default devices still work */ });
  }

  /* Swap the microphone without hanging up: a new track into the same sender,
     so the other side notices nothing but the better sound. */
  function switchMic(l, deviceId) {
    return navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true },
    }).then(function (s) {
      if (live !== l) { stopTracks(s); return null; }
      var t = s.getAudioTracks()[0];
      t.enabled = !l.muted;
      var sender = l.pc.getSenders().filter(function (x) { return x.track && x.track.kind === 'audio'; })[0];
      if (!sender) { stopTracks(s); throw new Error('no sender'); }
      return sender.replaceTrack(t).then(function () {
        var old = l.mic;
        l.mic = s;
        stopTracks(old);
      });
    });
  }

  function setMuted(on) {
    var l = live;
    if (!l || !l.mic) return;
    l.muted = on;
    l.mic.getAudioTracks().forEach(function (t) { t.enabled = !on; });
    if (l.dc && l.dc.readyState === 'open') {
      try { l.dc.send(JSON.stringify({ t: 'mute', on: on })); } catch (e) { /* closing */ }
    }
    paintAudio();
  }

  /* How loud each side is, from the connection's own statistics: what this
     microphone is sending, and what is arriving from theirs. No second audio
     pipeline, and nothing that needs a press to be allowed to start. */
  function levels() {
    var l = live;
    if (!l || !l.ui || l.state !== 'connected' || !l.pc.getStats || l.measuring) return;
    l.measuring = true;
    l.pc.getStats().then(function (stats) {
      var mine = 0;
      var theirs = 0;
      stats.forEach(function (s) {
        if (s.kind !== 'audio' || typeof s.audioLevel !== 'number') return;
        if (s.type === 'media-source') mine = Math.max(mine, s.audioLevel);
        if (s.type === 'inbound-rtp') theirs = Math.max(theirs, s.audioLevel);
      });
      l.measuring = false;
      l.levels = { me: l.muted ? 0 : mine, them: theirs };
      paintAudio();
    }).catch(function () { l.measuring = false; });
  }

  function paintAudio() {
    var l = live;
    if (!l) return;
    var clock = body && body.querySelector('[data-pc-clock]');
    if (clock) {
      clock.textContent = l.connectedAt ? clockText(Date.now() - l.connectedAt)
        : l.kind === 'voice' && l.status === 'waiting' ? clockText(Date.now() - l.startedAt) : '';
    }
    if (!l.ui || !l.ui.me.wrap.isConnected) return;
    var lv = l.levels || { me: 0, them: 0 };
    var on = l.state === 'connected';
    function paint(t, muted, level, idle) {
      var talking = on && !muted && level > 0.02;
      t.dot.style.background = muted ? '#b42318' : talking ? '#22c55e' : '#cbd5e1';
      t.text.textContent = t.label + ' — ' + (muted ? 'muted' : talking ? 'talking' : idle);
    }
    paint(l.ui.me, l.muted || !l.mic, lv.me, on ? 'quiet' : 'ready');
    paint(l.ui.them, l.theyMuted, lv.them, on ? 'quiet' : 'not connected yet');
    var m = l.ui.mute;
    while (m.firstChild) m.removeChild(m.firstChild);
    m.appendChild(icon(l.muted || !l.mic ? ICONS.micOff : ICONS.mic, 15));
    m.appendChild(el('span', '', !l.mic ? 'No microphone' : l.muted ? 'Unmute' : 'Mute'));
    m.setAttribute('aria-pressed', l.muted ? 'true' : 'false');
    m.style.background = l.muted ? '#fef2f2' : '#fff';
    m.style.color = l.muted ? '#b42318' : '#0f172a';
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

  /*
   * The launcher says what it is. A bare round icon read as "chat" and
   * nothing else, so a visitor who wanted to talk or show a screen never
   * opened it. A widget that offers more than chat says "Help" (or whatever
   * the owner typed), and a green dot appears only when somebody at the
   * business really has the app open — `online` from the server, never a
   * decoration.
   */
  function launcherLabel() {
    var typed = (state.cfg && state.cfg.launcher) || '';
    /* "Chat with us" is the column's default, not a choice: on a widget that
       also takes calls and tickets it would undersell the rest. */
    if (typed && (typed !== 'Chat with us' || onlyChat())) return typed;
    return onlyChat() ? 'Chat with us' : 'Help';
  }

  function onlineDot(ring) {
    var d = el('span', 'width:10px;height:10px;border-radius:50%;flex-shrink:0;background:#22c55e;box-shadow:0 0 0 2px ' + ring + ';');
    d.setAttribute('aria-hidden', 'true');
    return d;
  }

  /* The owner's photo, or their initial, or nothing. */
  function face(size) {
    var cfg = state.cfg || {};
    if (cfg.agentAvatar) {
      var img = el('img', 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#fff;border:2px solid rgba(255,255,255,.85);box-sizing:border-box;');
      img.src = cfg.agentAvatar;
      img.alt = '';
      img.decoding = 'async';
      return img;
    }
    if (cfg.agentName) {
      return el('span', 'display:inline-flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;border-radius:50%;flex-shrink:0;'
        + 'background:' + accent() + ';color:#fff;font-weight:800;font-size:' + Math.round(size * 0.42) + 'px;', cfg.agentName.trim().charAt(0).toUpperCase());
    }
    return null;
  }

  /* "Azeem from Protected Central" and whether anybody is in — the two
     things a visitor wants to know before they choose how to get in touch.
     Every word of it is something the owner typed or the server knows. */
  function whoCard() {
    var cfg = state.cfg || {};
    var who = cfg.agentName || '';
    var biz = cfg.businessName || '';
    if (!who && cfg.online !== true && cfg.online !== false) return null;
    var row = el('div', 'display:flex;gap:12px;align-items:center;padding:4px 2px 6px;');
    var f = face(46);
    if (f) row.appendChild(f);
    var txt = el('div', 'display:flex;flex-direction:column;gap:3px;min-width:0;');
    if (who) txt.appendChild(el('div', 'font-size:15px;font-weight:800;color:#0f172a;line-height:1.3;', who + (biz ? ' from ' + biz : '')));
    if (cfg.online === true || cfg.online === false) {
      var st = el('div', 'display:flex;gap:6px;align-items:center;font-size:12.5px;color:#475569;line-height:1.4;');
      st.appendChild(el('span', 'width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' + (cfg.online ? '#22c55e' : '#cbd5e1') + ';'));
      st.appendChild(el('span', '', cfg.online
        ? 'Online now'
        : 'Away right now — leave a message and we will reply'));
      txt.appendChild(st);
    }
    row.appendChild(txt);
    return row;
  }

  function build() {
    var left = state.cfg && state.cfg.position === 'left';
    root = el('div', 'position:fixed;z-index:2147483000;bottom:20px;'
      + (left ? 'left:20px;' : 'right:20px;')
      + 'display:flex;flex-direction:column;align-items:' + (left ? 'flex-start' : 'flex-end') + ';'
      + 'max-width:calc(100vw - 40px);'
      + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;');

    var label = launcherLabel();
    var online = !!(state.cfg && state.cfg.online === true);
    launcher = el('button', COMPACT
      ? [
        'position:relative;display:flex;align-items:center;justify-content:center;width:52px;height:52px;padding:0;border:0;border-radius:50%;',
        'background:' + accent() + ';color:#fff;cursor:pointer;box-shadow:0 10px 26px -8px rgba(15,23,42,.45);',
      ].join('')
      : [
        'display:flex;align-items:center;gap:9px;padding:8px 18px 8px 9px;min-height:48px;border:0;border-radius:999px;',
        'background:' + accent() + ';color:#fff;font-size:15px;font-weight:800;cursor:pointer;',
        'box-shadow:0 10px 26px -8px rgba(15,23,42,.45);font-family:inherit;letter-spacing:.01em;',
      ].join(''));
    launcher.type = 'button';
    if (COMPACT) {
      launcher.appendChild(icon(ICONS.chat, 22));
      if (online) { var badge = onlineDot(accent()); badge.style.position = 'absolute'; badge.style.top = '4px'; badge.style.right = '4px'; launcher.appendChild(badge); }
      launcher.title = label + (online ? ' — online now' : '');
    } else {
      var lead = face(32);
      if (lead) launcher.appendChild(lead);
      else {
        var bub = el('span', 'display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.18);flex-shrink:0;');
        bub.appendChild(icon(onlyChat() ? ICONS.chat : ICONS.help, 18));
        launcher.appendChild(bub);
      }
      launcher.appendChild(el('span', '', label));
      if (online) launcher.appendChild(onlineDot(accent()));
    }
    /* "Open the chat" stays at the front of the name for every widget — it
       is what a screen reader user, and every test that drives this, listens
       for — and the visible label is in it too, so "click Help" works by voice. */
    launcher.setAttribute('aria-label', 'Open the chat' + (onlyChat() ? '' : ' and other ways to reach us')
      + ' — ' + label + (online ? ' (online now)' : ''));
    launcher.onclick = toggle;

    panel = el('div', [
      'display:none;flex-direction:column;width:min(370px,calc(100vw - 32px));height:min(560px,calc(100vh - 120px));',
      'background:#fff;border-radius:18px;overflow:hidden;margin-bottom:12px;',
      'box-shadow:0 24px 60px -18px rgba(15,23,42,.5);border:1px solid #e6e9f0;',
    ].join(''));
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', label);

    head = el('div', 'position:relative;display:flex;align-items:center;gap:8px;padding:14px 44px 14px 16px;background:' + accent() + ';color:#fff;flex-shrink:0;');
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
    head.appendChild(backBtn);
    var headFace = face(28);
    if (headFace) head.appendChild(headFace);
    head.appendChild(titles); head.appendChild(close);

    body = el('div', 'flex:1;display:flex;flex-direction:column;min-height:0;');
    panel.appendChild(head); panel.appendChild(body);

    if (state.cfg && state.cfg.showBranding) {
      var mark = el('div', 'padding:7px;text-align:center;font-size:10.5px;color:#94a3b8;border-top:1px solid #f1f3f7;flex-shrink:0;', 'Powered by Protected Central');
      panel.appendChild(mark);
    }

    root.appendChild(panel); root.appendChild(launcher);
    document.body.appendChild(root);
    teaser();
    /* The widget arrives after the page; a page waiting to offer its options
       is told rather than left polling. */
    try { window.dispatchEvent(new Event('pc-widget-ready')); } catch (e) { /* very old browser */ }
  }

  function toggle() {
    state.open = !state.open;
    panel.style.display = state.open ? 'flex' : 'none';
    launcher.style.display = state.open ? 'none' : 'flex';
    if (!state.open) teaser();
    if (state.open) {
      dropTeaser(false);
      /* A session in progress is what they came back for. */
      if (live) show(liveViewName(live));
      else if (!body.firstChild) show(onlyChat() ? 'chat' : 'home');
      chatOpened();
    }
  }

  /*
   * The teaser: on the marketing site only (the page asks for it with
   * `data-pc-teaser`), a card above the launcher naming the ways in. It is
   * there on every page, a moment after the widget is — a visitor who wants
   * to talk to somebody should not have to find out that they can — until
   * they close it, which holds for the visit, or open the widget.
   *
   * It is see-through (frosted, not opaque) so the page scrolling behind it
   * stays visible: it is always present, so it must not hide what somebody is
   * reading. Browsers without `backdrop-filter` get a lighter solid card
   * instead, because unblurred text behind text is unreadable.
   *
   * Never on a narrow screen, where even a see-through card sits on most of
   * what somebody is reading. The entrance and the soft pulse on the first
   * option are skipped for somebody who asked for less motion.
   */
  var teaserCard = null;
  var teaserTimer = 0;
  var TEASED = 'pc_teased_' + KEY;
  function teaserStyles() {
    if (document.getElementById('pc-teaser-css')) return;
    var st = document.createElement('style');
    st.id = 'pc-teaser-css';
    st.textContent = ''
      + '@keyframes pcTeaseIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}'
      + '@keyframes pcTeaseRow{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}'
      + '@keyframes pcTeasePulse{0%{box-shadow:0 0 0 0 var(--pc-ring)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}'
      + '.pc-tease{animation:pcTeaseIn .35s cubic-bezier(.2,.8,.2,1) both}'
      + '.pc-tease-row{animation:pcTeaseRow .35s ease both;transition:background .15s ease,transform .15s ease}'
      + '.pc-tease-row:hover,.pc-tease-row:focus-visible{background:rgba(255,255,255,.55)!important;transform:translateX(3px)}'
      + '.pc-tease-row:hover .pc-tease-ic{transform:scale(1.12) rotate(-6deg)}'
      + '.pc-tease-ic{transition:transform .2s ease}'
      + '.pc-tease-pulse{animation:pcTeasePulse 2.4s ease-out infinite}'
      + '@media (prefers-reduced-motion: reduce){.pc-tease,.pc-tease-row,.pc-tease-pulse{animation:none!important}.pc-tease-row,.pc-tease-ic{transition:none!important}.pc-tease-row:hover{transform:none}}';
    document.head.appendChild(st);
  }
  function teaser() {
    if (!TEASER || onlyChat()) return;
    try { if (window.sessionStorage.getItem(TEASED)) return; } catch (e) { /* private mode: show it */ }
    teaserTimer = window.setTimeout(function () {
      if (state.open || live || teaserCard || window.innerWidth < 720 || window.innerHeight < 560) return;
      var opts = homeOptions().filter(function (o) { return o.view !== 'status'; }).slice(0, 4);
      if (!opts.length) return;
      teaserStyles();

      var glass = window.CSS && CSS.supports && (CSS.supports('backdrop-filter', 'blur(4px)') || CSS.supports('-webkit-backdrop-filter', 'blur(4px)'));
      teaserCard = el('div', 'position:relative;width:min(300px,calc(100vw - 40px));box-sizing:border-box;margin-bottom:12px;padding:14px 14px 10px;'
        + (glass
          ? 'background:rgba(255,255,255,.58);-webkit-backdrop-filter:blur(7px) saturate(1.5);backdrop-filter:blur(7px) saturate(1.5);'
          : 'background:rgba(255,255,255,.94);')
        + 'border:1px solid rgba(255,255,255,.7);border-radius:16px;box-shadow:0 18px 44px -16px rgba(15,23,42,.45);color:#0f172a;');
      teaserCard.className = 'pc-tease';
      teaserCard.setAttribute('role', 'complementary');
      teaserCard.setAttribute('aria-label', 'Ways to reach us');
      var x = el('button', 'position:absolute;top:8px;right:8px;display:flex;background:none;border:0;color:#475569;cursor:pointer;padding:3px;');
      x.type = 'button';
      x.setAttribute('aria-label', 'Dismiss');
      x.appendChild(icon(ICONS.close, 15));
      x.onclick = function () { dropTeaser(true); };
      teaserCard.appendChild(x);

      var top = el('div', 'display:flex;gap:10px;align-items:center;padding-right:22px;margin-bottom:8px;');
      var f = face(34);
      if (f) top.appendChild(f);
      var cfg = state.cfg || {};
      top.appendChild(el('div', 'font-size:14px;font-weight:800;line-height:1.35;',
        cfg.agentName ? 'Questions? Talk to ' + cfg.agentName + (cfg.businessName ? ' at ' + cfg.businessName : '') : 'Questions? We are here to help.'));
      teaserCard.appendChild(top);
      opts.forEach(function (o, i) {
        var b = el('button', 'display:flex;align-items:center;gap:9px;width:100%;padding:8px 6px;border:0;border-top:1px solid rgba(15,23,42,.08);background:none;'
          + 'border-radius:8px;color:#0f172a;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left;'
          + 'animation-delay:' + (120 + i * 70) + 'ms;');
        b.type = 'button';
        b.className = 'pc-tease-row';
        var ic = el('span', 'display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;flex-shrink:0;'
          + 'background:' + accent() + '1f;color:' + accent() + ';--pc-ring:' + accent() + '55;');
        /* The first way in — a call, when there is one — breathes, so the eye
           finds it; the rest stay still. */
        ic.className = 'pc-tease-ic' + (i === 0 ? ' pc-tease-pulse' : '');
        ic.appendChild(icon(ICONS[o.key], 15));
        b.appendChild(ic);
        b.appendChild(el('span', '', o.label));
        b.onclick = function () {
          dropTeaser(false);
          if (o.go) { o.go(); return; }
          if (!state.open) toggle();
          show(o.view);
        };
        teaserCard.appendChild(b);
      });
      root.insertBefore(teaserCard, launcher);
    }, 1200);
  }
  function dropTeaser(forGood) {
    window.clearTimeout(teaserTimer);
    if (forGood) { try { window.sessionStorage.setItem(TEASED, '1'); } catch (e) { /* private mode */ } }
    if (teaserCard) { teaserCard.remove(); teaserCard = null; }
  }

  /* So the page it sits on can open it from its own button — "Contact
     support" in a menu — without drawing a second launcher. */
  window.ProtectedCentralChat = {
    open: function (view) {
      if (!panel) return;
      if (!state.open) toggle();
      if (view && (view === 'home' || has(view === 'status' ? 'ticket' : view))) show(view);
    },
    /* What this widget offers, so a page can name only what will work. */
    features: function () { return state.features.slice(); },
    /* Whether somebody at the business is in, as the server said: true,
       false, or null for "not known" — so a page claims no more than this. */
    online: function () { return state.cfg ? (state.cfg.online === true ? true : state.cfg.online === false ? false : null) : null; },
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
