/* Digital twin chat panel. Talks to the FastAPI backend in the separate
   `digital-twin` repo (see that repo's twin/schemas.py and twin/errors.py
   for the wire contract this file codes against). A docked <dialog>, opened
   from either the floating launcher or the Contact section's button — both
   share the [data-twin-open] hook.

   Turns render as a log (mono speaker tag + prose), not chat bubbles, and
   the reply is rendered through a small hand-rolled markdown-lite parser
   that only ever touches the DOM via createElement/createTextNode — it
   never sets innerHTML, so LLM output can't inject markup. */
(function () {
  'use strict';

  /* Local dev serves the portfolio itself (see README: port 5500 or 8000,
     the only localhost origins the backend's CORS allowlist accepts) and
     talks to a locally-run backend; production talks to the real API.
     digital-twin/twin/config.py's `allowed_origins_list` is the other half
     of this contract. */
  var API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : 'https://twin.abushamasanad.com';

  /* Mirrors twin/config.py's `max_message_chars` (413 input_too_long past
     this). Kept in sync here so the client prevents the 413 rather than
     relying on the server to reject it. */
  var MAX_CHARS = 2000;

  /* Backend's in-process soft deadline is 50s (twin/config.py's
     `request_deadline_s`); this is that plus margin for network overhead. */
  var REQUEST_TIMEOUT_MS = 60000;

  var STORAGE_KEY = 'twin.history.v1';
  var MAX_STORED_TURNS = 20; /* matches twin/config.py's max_history_messages */

  /* Cloudflare Turnstile. Mirrors the backend's own toggle — flip BOTH
     together: this constant plus TURNSTILE_SITE_KEY below, and
     TURNSTILE_ENABLED=true + TURNSTILE_SECRET_KEY on the backend
     (twin/config.py). Backend already rejects a request with a missing
     token once its side is on, so leave this false until a real site key
     is in place, or every message will 403 turnstile_failed. */
  var TURNSTILE_ENABLED = true;
  var TURNSTILE_SITE_KEY = '0x4AAAAAAE6OMTUXGJa8Xl1D'; /* Cloudflare dashboard → Turnstile → your widget. Public value, safe to ship. */
  var TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
  var TURNSTILE_TOKEN_TIMEOUT_MS = 15000;

  var THINK_LABELS = [
    { at: 0, text: 'QUERYING…' },
    { at: 8000, text: 'STILL THINKING…' },
    { at: 20000, text: 'DEEP QUERY — HANG ON' }
  ];

  var STARTERS = [
    'What did he build at Coretava?',
    'What is CoreAds?',
    'How deep is his React experience?',
    'Is he available for work?'
  ];

  /* error.code -> display copy. Anything not listed here falls back to
     error.message, which the backend guarantees is always safe to render
     verbatim (app.py's exception handlers never leak upstream text into
     it) — so an unmapped future code still degrades correctly. */
  var ERROR_COPY = {
    bad_request: 'Something about that request wasn’t understood. Try rephrasing.',
    invalid_role: 'Something about that request wasn’t understood. Try rephrasing.',
    system_role_forbidden: 'Something about that request wasn’t understood. Try rephrasing.',
    origin_not_allowed: 'This page isn’t allowed to reach the twin right now.',
    turnstile_failed: 'Verification failed — please try again.',
    input_too_long: function (err) {
      return 'That message is a bit long — keep it under ' + (err.limit || MAX_CHARS) + ' characters.';
    },
    moderation_blocked: 'That one’s outside what the twin can help with — try asking about Sanad’s work, skills, or availability instead.',
    upstream_failed: 'The twin is having trouble reaching its model provider right now.',
    deadline_exceeded: 'That took too long to answer. Please try again.',
    internal_error: 'Something went wrong on the twin’s end.'
  };

  var dialogEl = document.getElementById('twin');
  if (!dialogEl || !dialogEl.showModal || !window.fetch) return; /* no dialog/fetch support: leave the launcher hidden */

  var openers = document.querySelectorAll('[data-twin-open]');
  var streamEl = dialogEl.querySelector('[data-twin-stream]');
  var formEl = dialogEl.querySelector('[data-twin-form]');
  var inputEl = dialogEl.querySelector('[data-twin-input]');
  var countEl = dialogEl.querySelector('[data-twin-count]');
  var sendBtn = dialogEl.querySelector('[data-twin-send]');
  var resetBtn = dialogEl.querySelector('[data-twin-reset]');
  var closeBtn = dialogEl.querySelector('[data-twin-close]');
  var turnstileEl = dialogEl.querySelector('[data-twin-turnstile]');

  var history = []; /* [{role: 'user'|'assistant', content: string}] — the wire shape */
  var pending = false;
  var rateLimited = false;
  var rateLimitTimer = null;
  var thinkEl = null;
  var thinkTimers = [];
  var opener = null;
  var requestGen = 0; /* bumped by Reset so a reply already in flight can't land in a cleared thread */

  /* — small DOM builders, no innerHTML anywhere in this file — */

  function appendText(parent, text) {
    var parts = String(text).split('\n');
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) parent.appendChild(document.createElement('br'));
      if (parts[i]) parent.appendChild(document.createTextNode(parts[i]));
    }
  }

  function isSafeUrl(url) {
    return /^(https?:|mailto:)/i.test(url);
  }

  function appendLink(parent, label, url) {
    if (!isSafeUrl(url)) { appendText(parent, label); return; }
    var a = document.createElement('a');
    a.href = url;
    if (url.slice(0, 7).toLowerCase() !== 'mailto:') { a.target = '_blank'; a.rel = 'noopener'; }
    appendText(a, label);
    parent.appendChild(a);
  }

  function trimTrailingPunct(url) {
    var m = url.match(/^(.*?)([.,;:!?)'"]+)$/);
    return m ? m[1] : url;
  }

  /* Inline markdown: **bold**, `code`, [text](url), bare URLs/emails.
     Covers exactly what knowledge/style.md permits the twin to use (bold,
     short bullet lists, never code blocks in prose) plus safe auto-linking. */
  var INLINE_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https?:\/\/[^\s<]+)|([\w.+-]+@[\w-]+\.[a-zA-Z]{2,})/g;

  function appendInline(parent, text) {
    INLINE_RE.lastIndex = 0;
    var last = 0, m;
    while ((m = INLINE_RE.exec(text))) {
      if (m.index > last) appendText(parent, text.slice(last, m.index));
      if (m[1] !== undefined) {
        appendLink(parent, m[1], m[2]);
      } else if (m[3] !== undefined) {
        var strong = document.createElement('strong');
        appendText(strong, m[3]);
        parent.appendChild(strong);
      } else if (m[4] !== undefined) {
        var code = document.createElement('code');
        code.textContent = m[4];
        parent.appendChild(code);
      } else if (m[5] !== undefined) {
        var url = trimTrailingPunct(m[5]);
        appendLink(parent, url, url);
        INLINE_RE.lastIndex -= (m[5].length - url.length);
      } else if (m[6] !== undefined) {
        appendLink(parent, m[6], 'mailto:' + m[6]);
      }
      last = INLINE_RE.lastIndex;
    }
    if (last < text.length) appendText(parent, text.slice(last));
  }

  /* Block-level: blank-line-separated blocks; a block whose every line
     starts "- "/"* " becomes a <ul>, everything else is a <p>. */
  function renderMarkdown(text, into) {
    var blocks = String(text).split(/\n{2,}/);
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i].trim();
      if (!block) continue;

      var lines = block.split('\n');
      var isList = true;
      for (var j = 0; j < lines.length; j++) {
        if (!/^[-*]\s+/.test(lines[j])) { isList = false; break; }
      }

      if (isList) {
        var ul = document.createElement('ul');
        for (var k = 0; k < lines.length; k++) {
          var li = document.createElement('li');
          appendInline(li, lines[k].replace(/^[-*]\s+/, ''));
          ul.appendChild(li);
        }
        into.appendChild(ul);
      } else {
        var p = document.createElement('p');
        appendInline(p, block);
        into.appendChild(p);
      }
    }
  }

  function renderPlainBody(into, text) {
    var p = document.createElement('p');
    appendText(p, text);
    into.appendChild(p);
  }

  function makeTurn(displayRole, text) {
    var turn = document.createElement('div');
    turn.className = 'twin-turn twin-turn--' + displayRole;

    var tag = document.createElement('p');
    tag.className = 'twin-tag';
    var sr = document.createElement('span');
    sr.className = 'visually-hidden';
    sr.textContent = displayRole === 'user' ? 'You said: ' : 'Twin said: ';
    tag.appendChild(sr);
    tag.appendChild(document.createTextNode(displayRole === 'user' ? 'You' : 'Twin'));
    turn.appendChild(tag);

    var body = document.createElement('div');
    body.className = 'twin-body';
    if (displayRole === 'user') renderPlainBody(body, text);
    else renderMarkdown(text, body);
    turn.appendChild(body);

    return turn;
  }

  var SEG_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  /* Builds one real seven-segment digit from the page's own .led-digit /
     .seg-* markup (assets/css/telemetry.css) — used for the rate-limit
     countdown so even the least pleasant moment in this UI stays on-thesis. */
  function ledDigit(charDigit) {
    var span = document.createElement('span');
    span.className = 'led-digit';
    span.setAttribute('data-digit', charDigit);
    for (var i = 0; i < SEG_NAMES.length; i++) {
      var seg = document.createElement('i');
      seg.className = 'seg seg-' + SEG_NAMES[i];
      span.appendChild(seg);
    }
    return span;
  }

  function buildCountdownRow(seconds) {
    var row = document.createElement('div');
    row.className = 'twin-countdown-row';

    var label = document.createElement('span');
    label.className = 'mono-label';
    label.textContent = 'Retry in';
    row.appendChild(label);

    var readout = document.createElement('div');
    readout.className = 'readout readout--sm readout--amber twin-countdown';
    readout.setAttribute('data-revealed', ''); /* lit directly; not scroll-gated inside a dialog */
    var valueEl = document.createElement('div');
    valueEl.className = 'readout-value';
    readout.appendChild(valueEl);
    row.appendChild(readout);

    function setValue(n) {
      valueEl.textContent = '';
      var digits = String(Math.max(0, n));
      for (var i = 0; i < digits.length; i++) valueEl.appendChild(ledDigit(digits.charAt(i)));
      var suffix = document.createElement('span');
      suffix.className = 'readout-suffix';
      suffix.textContent = 's';
      valueEl.appendChild(suffix);
    }
    setValue(seconds);

    return { el: row, setValue: setValue };
  }

  /* — scroll lock, same recipe as portfolio.js's lightbox (private to that
     file's closure, so re-implemented here rather than shared) — */
  function lockScroll(on) {
    var root = document.documentElement;
    if (on) {
      var gap = window.innerWidth - root.clientWidth;
      if (gap > 0) document.body.style.paddingRight = gap + 'px';
      root.classList.add('scroll-locked');
      document.body.classList.add('scroll-locked');
    } else {
      root.classList.remove('scroll-locked');
      document.body.classList.remove('scroll-locked');
      document.body.style.paddingRight = '';
    }
  }

  function syncOpenState(open) {
    Array.prototype.forEach.call(openers, function (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function scrollToBottom() {
    streamEl.scrollTop = streamEl.scrollHeight;
  }

  /* — persistence: session-scoped on purpose, so a recruiter returning next
     week doesn't land in a stale thread — */
  function persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED_TURNS)));
    } catch (e) { /* private-browsing / storage disabled: thread just won't survive reload */ }
  }

  function restore() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      history = parsed.filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
      });
      for (var i = 0; i < history.length; i++) {
        streamEl.appendChild(makeTurn(history[i].role === 'user' ? 'user' : 'twin', history[i].content));
      }
    } catch (e) { /* corrupted or inaccessible storage: start fresh */ }
  }

  /* — suggested starter questions, shown only while the thread is empty — */
  function clearSuggestions() {
    var existing = streamEl.querySelector('[data-twin-suggest]');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function renderSuggestions() {
    if (history.length || streamEl.querySelector('[data-twin-suggest]')) return;
    var wrap = document.createElement('div');
    wrap.className = 'twin-suggest';
    wrap.setAttribute('data-twin-suggest', '');
    Array.prototype.forEach.call(STARTERS, function (q) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'twin-suggest-chip';
      chip.textContent = q;
      chip.addEventListener('click', function () {
        if (pending || rateLimited) return;
        send(q);
      });
      wrap.appendChild(chip);
    });
    streamEl.appendChild(wrap);
  }

  /* — thinking indicator: a segment sweep, with the label progression the
     backend design doc prescribes for its own latency budget — */
  function showThinking() {
    hideThinking();
    thinkEl = document.createElement('div');
    thinkEl.className = 'twin-thinking';
    thinkEl.setAttribute('role', 'status');

    var sweep = document.createElement('div');
    sweep.className = 'twin-sweep';
    for (var i = 0; i < 5; i++) {
      var cell = document.createElement('div');
      cell.className = 'twin-sweep-cell';
      sweep.appendChild(cell);
    }
    thinkEl.appendChild(sweep);

    var label = document.createElement('span');
    label.className = 'twin-thinking-label';
    label.textContent = THINK_LABELS[0].text;
    thinkEl.appendChild(label);

    streamEl.appendChild(thinkEl);
    scrollToBottom();

    thinkTimers = [];
    for (var j = 1; j < THINK_LABELS.length; j++) {
      (function (entry) {
        thinkTimers.push(setTimeout(function () { label.textContent = entry.text; }, entry.at));
      })(THINK_LABELS[j]);
    }
  }

  function hideThinking() {
    for (var i = 0; i < thinkTimers.length; i++) clearTimeout(thinkTimers[i]);
    thinkTimers = [];
    if (thinkEl && thinkEl.parentNode) thinkEl.parentNode.removeChild(thinkEl);
    thinkEl = null;
  }

  /* — composer state — */
  function updateCount() {
    var len = inputEl.value.length;
    countEl.textContent = len + '/' + MAX_CHARS;
    if (len > MAX_CHARS * 0.9) countEl.setAttribute('data-warn', '');
    else countEl.removeAttribute('data-warn');
    sendBtn.disabled = pending || rateLimited || len === 0 || len > MAX_CHARS;
  }

  function setPending(on) {
    pending = on;
    inputEl.disabled = on || rateLimited;
    updateCount();
  }

  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 130) + 'px';
  }

  function clearRateLimit() {
    if (rateLimitTimer) { clearInterval(rateLimitTimer); rateLimitTimer = null; }
    rateLimited = false;
    inputEl.disabled = pending;
    updateCount();
  }

  function lockForRateLimit(seconds, countdownRow) {
    rateLimited = true;
    inputEl.disabled = true;
    updateCount();
    var remaining = seconds;
    if (rateLimitTimer) clearInterval(rateLimitTimer);
    rateLimitTimer = setInterval(function () {
      remaining -= 1;
      if (countdownRow) countdownRow.setValue(remaining);
      if (remaining <= 0) {
        clearInterval(rateLimitTimer);
        rateLimitTimer = null;
        rateLimited = false;
        inputEl.disabled = pending;
        updateCount();
      }
    }, 1000);
  }

  /* — error row — */
  function renderError(err, networkErr, retryText) {
    var code = err && err.code;

    var box = document.createElement('div');
    box.className = 'twin-error';
    box.setAttribute('role', 'status');

    var msgP = document.createElement('p');
    var text;
    if (networkErr && !err) {
      text = networkErr.name === 'AbortError'
        ? 'That took too long to answer. Please try again.'
        : 'Couldn’t reach the twin — check your connection and try again.';
    } else if (code === 'rate_limited') {
      text = 'You’ve reached the message limit for now.';
    } else if (code && ERROR_COPY[code]) {
      var entry = ERROR_COPY[code];
      text = typeof entry === 'function' ? entry(err) : entry;
    } else if (err && err.message) {
      text = err.message; /* backend guarantees this is safe to render verbatim */
    } else {
      text = 'Something went wrong. Please try again.';
    }
    msgP.textContent = text;
    box.appendChild(msgP);

    var isServerFault = code === 'upstream_failed' || code === 'deadline_exceeded' || code === 'internal_error';

    if (err && err.request_id && isServerFault) {
      var idLine = document.createElement('span');
      idLine.className = 'twin-error-id';
      idLine.textContent = 'Reference: ' + err.request_id;
      box.appendChild(idLine);
    }

    if (code === 'rate_limited' && err.retry_after_seconds) {
      var countdownRow = buildCountdownRow(err.retry_after_seconds);
      box.appendChild(countdownRow.el);
      lockForRateLimit(err.retry_after_seconds, countdownRow);
    }

    var actions = document.createElement('div');
    actions.className = 'twin-error-actions';

    if (code !== 'rate_limited') {
      var retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn btn-ghost';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', function () {
        if (box.parentNode) box.parentNode.removeChild(box);
        inputEl.value = retryText;
        trySend();
      });
      actions.appendChild(retryBtn);
    }

    if (isServerFault || (networkErr && !err)) {
      var mail = document.createElement('a');
      mail.className = 'btn btn-ghost';
      mail.href = 'mailto:abushamasanad@gmail.com';
      mail.textContent = 'Email Sanad instead';
      actions.appendChild(mail);
    }

    if (actions.children.length) box.appendChild(actions);

    streamEl.appendChild(box);
  }

  function failTurn(turnEl, text, err, networkErr) {
    /* A turn the server never answered must not poison later context. */
    var lastEntry = history[history.length - 1];
    if (lastEntry && lastEntry.role === 'user' && lastEntry.content === text) history.pop();
    persist();
    turnEl.setAttribute('data-failed', '');
    renderError(err, networkErr, text);
  }

  /* — Cloudflare Turnstile: lazy-loaded, only once TURNSTILE_ENABLED is on
     and a visitor actually opens the chat — never adds a request for
     everyone else. Rendered once in explicit "execute" mode; a fresh
     single-use token is pulled per send() rather than once per page load,
     matching the backend verifying every request, not just the first. — */
  var turnstileWidgetId = null;
  var turnstileScriptPromise = null;
  var turnstilePending = null; /* {resolve, reject} for the in-flight execute() call, or null */

  function loadTurnstileScript() {
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise(function (resolve, reject) {
      if (window.turnstile) { resolve(); return; }
      var script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.onload = function () { resolve(); };
      /* Ad/privacy blockers commonly block challenges.cloudflare.com — this
         must reject, not hang, or a blocked visitor could never send. */
      script.onerror = function () { reject(new Error('Turnstile script failed to load')); };
      document.head.appendChild(script);
    });
    return turnstileScriptPromise;
  }

  function ensureTurnstileWidget() {
    return loadTurnstileScript().then(function () {
      if (turnstileWidgetId !== null || !turnstileEl) return;
      turnstileWidgetId = window.turnstile.render(turnstileEl, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        execution: 'execute',
        callback: function (token) {
          if (!turnstilePending) return;
          var p = turnstilePending; turnstilePending = null;
          p.resolve(token);
        },
        'error-callback': function () {
          if (turnstilePending) { var p = turnstilePending; turnstilePending = null; p.reject(new Error('Turnstile verification failed')); }
          return true; /* don't auto-retry inside the widget; our own Retry button drives retries */
        },
        'expired-callback': function () {
          if (turnstilePending) { var p = turnstilePending; turnstilePending = null; p.reject(new Error('Turnstile token expired')); }
        }
      });
    });
  }

  /* Resolves with a fresh single-use token, or rejects — never hangs
     forever, even if Cloudflare's script never loads. */
  function getTurnstileToken() {
    return ensureTurnstileWidget().then(function () {
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          if (!turnstilePending) return;
          turnstilePending = null;
          reject(new Error('Turnstile timed out'));
        }, TURNSTILE_TOKEN_TIMEOUT_MS);

        turnstilePending = {
          resolve: function (token) { clearTimeout(timer); resolve(token); },
          reject: function (err) { clearTimeout(timer); reject(err); }
        };
        window.turnstile.reset(turnstileWidgetId);
        window.turnstile.execute(turnstileWidgetId);
      });
    });
  }

  /* — the core request path — */
  function send(text) {
    var myGen = ++requestGen; /* invalidated if Reset fires before this resolves */
    clearSuggestions();

    var historyBefore = history.slice(); /* snapshot BEFORE appending this turn — the server appends `message` itself */
    history.push({ role: 'user', content: text });
    var turnEl = makeTurn('user', text);
    streamEl.appendChild(turnEl);
    persist();
    scrollToBottom();

    setPending(true);
    showThinking();

    var tokenStep = TURNSTILE_ENABLED ? getTurnstileToken() : Promise.resolve(null);

    tokenStep.then(function (turnstileToken) {
      if (myGen !== requestGen) return;

      var controller = window.AbortController ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;

      var payload = { message: text, history: historyBefore };
      if (turnstileToken) payload.turnstile_token = turnstileToken;

      return fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' }, /* the only header the backend's CORS allowlist permits */
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      }).then(function (result) {
        if (timeoutId) clearTimeout(timeoutId);
        if (myGen !== requestGen) return; /* the thread was reset while this was in flight */
        hideThinking();
        if (result.ok && result.data && typeof result.data.reply === 'string') {
          /* finish_reason "safe_fallback" is a success, not an error — the
             judge declined gracefully; render it exactly like any other reply. */
          history.push({ role: 'assistant', content: result.data.reply });
          streamEl.appendChild(makeTurn('twin', result.data.reply));
          persist();
        } else {
          var err = result.data && result.data.error ? result.data.error : null;
          failTurn(turnEl, text, err, null);
        }
      }).catch(function (networkErr) {
        if (timeoutId) clearTimeout(timeoutId);
        if (myGen !== requestGen) return;
        hideThinking();
        failTurn(turnEl, text, null, networkErr);
      });
    }, function () {
      /* Verification itself failed/timed out — never reached the network.
         Reuse the backend's own error shape so the existing turnstile_failed
         copy in ERROR_COPY handles this for free. */
      if (myGen !== requestGen) return;
      hideThinking();
      failTurn(turnEl, text, {
        code: 'turnstile_failed',
        message: 'Could not verify you’re human. Please try again.'
      }, null);
    }).then(function () {
      if (myGen !== requestGen) return;
      setPending(false);
      scrollToBottom();
    });
  }

  function trySend() {
    var text = inputEl.value.trim();
    if (!text || pending || rateLimited || text.length > MAX_CHARS) return;
    inputEl.value = '';
    autoGrow();
    updateCount();
    send(text);
  }

  /* — open / close — */
  function openPanel() {
    opener = document.activeElement;
    renderSuggestions();
    syncOpenState(true);
    lockScroll(true);
    dialogEl.showModal();
    inputEl.focus();
  }

  /* <dialog> doesn't close on a backdrop click by default; treat a click
     landing outside the panel's own box as a backdrop click. */
  dialogEl.addEventListener('click', function (e) {
    var rect = dialogEl.getBoundingClientRect();
    var inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                 e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) dialogEl.close();
  });

  dialogEl.addEventListener('close', function () {
    syncOpenState(false);
    lockScroll(false);
    if (opener && opener.focus) opener.focus();
    opener = null;
  });

  closeBtn.addEventListener('click', function () { dialogEl.close(); });

  resetBtn.addEventListener('click', function () {
    requestGen++; /* invalidate any reply still in flight for the old thread */
    hideThinking();
    setPending(false);
    history = [];
    persist();
    streamEl.textContent = '';
    clearRateLimit();
    renderSuggestions();
  });

  formEl.addEventListener('submit', function (e) { e.preventDefault(); trySend(); });

  inputEl.addEventListener('input', function () {
    autoGrow();
    updateCount();
  });

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); trySend(); }
  });

  Array.prototype.forEach.call(openers, function (btn) {
    btn.hidden = false; /* dialog support confirmed: reveal both entry points */
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', openPanel);
  });

  restore();
  updateCount();

  function init() {
    if (!history.length) renderSuggestions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
