/* Grochu life — rdzeń: konto, synchronizacja z Supabase (jedna sesja, wiele tabel), sekcje i dolne koło nawigacji.
   Bez zewnętrznych bibliotek: Supabase Auth (GoTrue), REST (PostgREST), Realtime i Edge Functions przez fetch/WebSocket.

   Sekcja rejestruje się przez GL.register({ id, label, icon, cloud: { table, flatten, unflatten }, init(ctx) }).
   init zwraca { getState, applyState, show?, hide? }. Model synchronizacji jak w Habbitckerze: stan sekcji spłaszczany
   do elementów, każdy element ma znacznik czasu zmiany, przy łączeniu wygrywa nowszy (także usunięcia).
   Każda sekcja ma swoją tabelę (user_data, makro_data, gym_data: user_id, data jsonb, updated_at), konto jest wspólne. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://xumjkmfctdutouvfgzsh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_EPRQnKETbD-CYt_TXALc8Q_v_PoC0yK'; // klucz publiczny (przeglądarkowy)
  const AUTH_KEY = 'glife.auth';
  const NAV_KEY = 'glife.nav';
  // Podgląd lokalny bez konta: http://localhost:5180/?local — dane tylko na urządzeniu.
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('local');

  /* ---------- pamięć lokalna ---------- */
  const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } };
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  function merge(local, remote) {
    const items = {}, ts = {};
    const keys = new Set([...Object.keys(local.ts), ...Object.keys(remote.ts), ...Object.keys(local.items), ...Object.keys(remote.items)]);
    keys.forEach(k => {
      const lt = local.ts[k] || 0, rt = remote.ts[k] || 0;
      const src = lt > rt ? local : remote;
      ts[k] = Math.max(lt, rt);
      if (k in src.items) items[k] = src.items[k];
    });
    return { items, ts };
  }

  /* ---------- sieć ---------- */
  async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
    const res = await fetch(SUPABASE_URL + path, {
      method,
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch (_) { }
    if (!res.ok) { const err = new Error(json?.msg || json?.message || json?.error_description || json?.error || `HTTP ${res.status}`); err.status = res.status; err.code = json?.error_code || json?.code; throw err; }
    return json;
  }

  /* ---------- sesja ---------- */
  let session = read(AUTH_KEY);
  const saveSession = s => {
    session = s && { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user_id: s.user?.id || session?.user_id, email: s.user?.email || session?.email };
    write(AUTH_KEY, session);
  };
  // Sesja zostaje na urządzeniu; wylogowanie tylko, gdy Supabase jednoznacznie ją odrzuci (nigdy przy braku internetu).
  const SESSION_DEAD = /refresh_token_not_found|refresh_token_already_used|session_not_found|session_expired|user_not_found|invalid refresh token/i;
  let refreshing = null;
  async function token() {
    if (!session) throw Object.assign(new Error('Niezalogowany'), { status: 401 });
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    if (!refreshing) {
      const rt = session.refresh_token;
      refreshing = (async () => {
        try {
          saveSession(await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: rt } }));
          wsSend({ topic: TOPIC, event: 'access_token', payload: { access_token: session.access_token } });
        } catch (e) {
          if ((e.status === 400 || e.status === 401) && SESSION_DEAD.test(`${e.code} ${e.message}`) && session?.refresh_token === rt) { saveSession(null); emit(); }
          throw e;
        } finally { refreshing = null; }
      })();
    }
    await refreshing;
    return session.access_token;
  }

  /* ---------- magazyny (jeden na sekcję/tabelę) ---------- */
  const stores = [];            // { id, table, flatten, unflatten, app, metaKey, running, timer, version, status, error }
  let status = 'idle', lastSync = null, lastError = '';
  const listeners = new Set();
  const emit = () => {
    status = stores.some(s => s.status === 'syncing') ? 'syncing' : stores.some(s => s.status === 'error') ? 'error' : stores.some(s => s.status === 'offline') ? 'offline' : stores.some(s => s.status === 'ok') ? 'ok' : 'idle';
    listeners.forEach(f => f());
  };
  const meta = st => read(st.metaKey) || { flat: null, ts: {}, dirty: false };
  function trackLocal(st) {
    const m = meta(st), flat = st.flatten(st.app.getState()), now = Date.now();
    if (!m.flat) Object.keys(flat).forEach(k => { m.ts[k] = 1; }); // pierwsze uruchomienie: stary znacznik, remis → chmura
    else new Set([...Object.keys(m.flat), ...Object.keys(flat)]).forEach(k => { if (!same(m.flat[k], flat[k])) { m.ts[k] = now; m.dirty = true; } });
    m.flat = flat;
    write(st.metaKey, m);
  }
  function schedule(st, ms = 300) { clearTimeout(st.timer); if (session) st.timer = setTimeout(() => sync(st), ms); }
  const scheduleAll = (ms = 0) => stores.forEach(st => schedule(st, ms));

  async function sync(st) {
    if (!session || !st.app) return;
    if (st.running) return st.running.then(() => sync(st));
    st.running = (async () => {
      st.status = 'syncing'; emit();
      try {
        const tok = await token();
        const rows = await api(`/rest/v1/${st.table}?select=data${st.key ? `&section=eq.${st.key}` : ''}`, { token: tok });
        const remote = rows?.[0]?.data?.items ? rows[0].data : { items: {}, ts: {} };
        trackLocal(st); // stan lokalny dopiero po pobraniu, żeby objąć kliknięcia z czasu pobierania
        const m = meta(st), local = { items: m.flat, ts: m.ts };
        const merged = merge(local, remote);
        if (!same(merged.items, local.items)) st.app.applyState(st.unflatten(merged.items));
        const needPush = !same(merged, remote);
        write(st.metaKey, { flat: merged.items, ts: merged.ts, dirty: needPush });
        const v = st.version;
        if (needPush) {
          await api(`/rest/v1/${st.table}?on_conflict=${st.key ? 'user_id,section' : 'user_id'}`, {
            method: 'POST', token: tok, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: { user_id: session.user_id, ...(st.key ? { section: st.key } : {}), data: merged, updated_at: new Date().toISOString() },
          });
        }
        if (st.version === v) write(st.metaKey, { ...meta(st), dirty: false }); else schedule(st, 0);
        st.status = 'ok'; st.error = ''; lastSync = new Date(); lastError = '';
      } catch (e) {
        st.status = navigator.onLine === false || e instanceof TypeError ? 'offline' : 'error';
        st.error = lastError = e.message || String(e);
      } finally { st.running = null; emit(); }
    })();
    return st.running;
  }
  const syncAll = () => Promise.all(stores.map(sync));

  /* ---------- na żywo: Supabase Realtime (protokół Phoenix), jedno połączenie na wszystkie tabele ---------- */
  const TOPIC = 'realtime:glife';
  let ws = null, hb = null, wsRef = 0, wsRetry = 0, wsTimer = null;
  const wsSend = m => { if (ws?.readyState === 1) ws.send(JSON.stringify({ ...m, ref: String(++wsRef) })); };
  function rtConnect() {
    if (!session || ws || !stores.length || !('WebSocket' in window)) return;
    clearTimeout(wsTimer);
    let sock;
    try { sock = new WebSocket(`${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_KEY)}&vsn=1.0.0`); }
    catch (_) { return rtRetry(); }
    ws = sock;
    sock.onopen = async () => {
      let tok; try { tok = await token(); } catch (_) { sock.close(); return; }
      sock.send(JSON.stringify({
        topic: TOPIC, event: 'phx_join', ref: String(++wsRef), join_ref: '1',
        payload: { access_token: tok, config: { broadcast: { self: false }, presence: { key: '' }, private: false,
          postgres_changes: [...new Set(stores.map(st => st.table))].map(table => ({ event: '*', schema: 'public', table, filter: `user_id=eq.${session.user_id}` })) } },
      }));
      clearInterval(hb);
      hb = setInterval(() => wsSend({ topic: 'phoenix', event: 'heartbeat', payload: {} }), 25000);
    };
    sock.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m.topic !== TOPIC) return;
      if (m.event === 'postgres_changes') {
        // life_data ma wiersz na sekcję: zmiana przychodzi z kolumną section
        const d = m.payload?.data, sec = d?.record?.section || d?.old_record?.section;
        const hit = stores.filter(s => s.table === d?.table && (!s.key || !sec || s.key === sec));
        hit.length ? hit.forEach(st => schedule(st, 0)) : scheduleAll(0);
      } else if (m.event === 'phx_reply' && m.payload?.status === 'ok') { wsRetry = 0; scheduleAll(0); }
      else if (m.event === 'phx_error' || m.event === 'phx_close') sock.close();
    };
    sock.onclose = () => { clearInterval(hb); if (ws === sock) { ws = null; rtRetry(); } };
    sock.onerror = () => { try { sock.close(); } catch (_) { } };
  }
  function rtRetry() { if (!session) return; clearTimeout(wsTimer); wsTimer = setTimeout(rtConnect, Math.min(30000, 1000 * 2 ** wsRetry++)); }
  function rtClose() { clearTimeout(wsTimer); clearInterval(hb); if (ws) { const s = ws; ws = null; s.onclose = null; try { s.close(); } catch (_) { } } }

  window.addEventListener('online', () => { scheduleAll(0); rtConnect(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { scheduleAll(0); rtConnect(); } });
  setInterval(() => { if (!document.hidden) scheduleAll(0); }, 20000); // zapas, gdyby połączenie na żywo nie działało

  const Cloud = window.Cloud = {
    get user() { return session ? { email: session.email, id: session.user_id } : LOCAL ? { email: 'podgląd lokalny', id: 'local' } : null; },
    get local() { return LOCAL; },
    get status() { return status; },
    get lastSync() { return lastSync; },
    get lastError() { return lastError; },
    get dirty() { return stores.some(st => meta(st).dirty); },
    get stores() { return stores.map(st => ({ id: st.id, table: st.table, status: st.status, error: st.error, dirty: !!meta(st).dirty })); },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    async signIn(email, password) {
      saveSession(await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })); emit();
      await syncAll(); rtConnect();
    },
    async signUp(email, password) {
      const s = await api('/auth/v1/signup', { method: 'POST', body: { email, password } });
      if (!s?.access_token) throw Object.assign(new Error('Konto utworzone, ale wymaga potwierdzenia e-mailem'), { code: 'needs_confirm' });
      saveSession(s); emit();
      await syncAll(); rtConnect();
    },
    // Wylogowanie: najpierw wysyła zmiany; jeśli się nie da, nie wylogowuje (żeby nic nie zginęło). Potem czyści dane z urządzenia.
    async signOut() {
      if (!session) return;
      await syncAll();
      if (stores.some(st => st.status !== 'ok')) throw new Error('Brak połączenia — najpierw trzeba wysłać zmiany do chmury.');
      try { await api('/auth/v1/logout', { method: 'POST', token: session.access_token }); } catch (_) { }
      rtClose();
      saveSession(null);
      stores.forEach(st => { write(st.metaKey, null); st.status = 'idle'; st.reset?.(); });
      lastSync = null; emit();
    },
    syncNow: () => syncAll(),
    // Funkcja serwerowa Supabase (np. meal-scan — analiza zdjęcia posiłku przez AI).
    async fn(name, body) { return api('/functions/v1/' + name, { method: 'POST', token: await token(), body }); },
  };

  /* ================================================================ wspólne narzędzia ================================================================ */
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vibrate = p => { try { navigator.vibrate?.(p); } catch (_) { } };
  // Krótki „tik” dotykowy. Android: Vibration API. iPhone/iPad nie ma vibrate, a od iOS 26.5 tik z kodu nie działa;
  // tik daje tylko systemowy przełącznik <input type="checkbox" switch> pod prawdziwym palcem (patrz iosZip niżej).
  const IOS = (typeof navigator.vibrate !== 'function' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)))
    || (LOCAL && new URLSearchParams(location.search).has('ios'));   // podgląd lokalny: ?local&ios wymusza ścieżkę iPhone'a
  let hapT = 0;
  function haptic(ms = 5) {
    if (IOS) { iosZip.tick(); return; }
    const t = performance.now(); if (t - hapT < 24) return; hapT = t;
    vibrate(ms);
  }

  /* iPhone: tiki w trakcie przeciągania (technika jak w bibliotece haptick, MIT).
     Koło przykrywa niewidoczny przełącznik. Dotyk, który na nim się zaczął, WebKit śledzi przez całe przeciąganie
     i porównuje palec z miejscem, gdzie przełącznik jest TERAZ. Żeby zagrać tik, przesuwamy przełącznik daleko
     na stronę, po której jest jego gałka — następny ruch palca go przełącza, a to przełączenie to systemowy tik.
     Gdy nie ma czego zagrać, przełącznik stoi daleko po drugiej stronie, więc palec go nie ruszy. */
  const iosZip = (() => {
    const ARM_MS = 260, GAP = 2, FAR = 10000;  // WebKit zaczyna śledzić ok. 200 ms po dotknięciu; tik najwyżej co 2 ruchy
    let input = null, active = false, on = false, armedAt = 0, queued = 0, since = Infinity;
    const place = side => { input.style.transform = `translateX(${side === 'L' ? -FAR : FAR}px)`; };
    const flipSide = () => (on ? 'R' : 'L');   // gałka wyłączonego jest po lewej — tam przesuwamy, żeby ją przełączyć
    const holdSide = () => (on ? 'L' : 'R');
    function release(now) {
      if (!queued || now < armedAt || since < GAP) return false;
      queued = 0; since = 0; place(flipSide()); on = !on;
      return true;
    }
    return {
      mount(host) {
        if (!IOS) return null;
        input = document.createElement('input');
        input.type = 'checkbox'; input.setAttribute('switch', ''); input.setAttribute('aria-hidden', 'true'); input.tabIndex = -1;
        input.className = 'wheel-switch';
        host.appendChild(input);
        addEventListener('pointermove', () => {      // przed obsługą koła, żeby tik z tego ruchu wszedł od razu
          if (!active) return;
          since++;
          if (!release(performance.now()) && performance.now() >= armedAt && !input.style.transform) place(holdSide());
        }, { capture: true, passive: true });
        const stop = () => { active = false; queued = 0; if (input) input.style.transform = ''; };
        addEventListener('pointerup', stop, { capture: true });
        addEventListener('pointercancel', stop, { capture: true });
        return input;
      },
      begin() { if (!input) return; active = true; on = input.checked; armedAt = performance.now() + ARM_MS; queued = 0; since = Infinity; input.style.transform = ''; },
      tick() { if (!active) return; queued = 1; release(performance.now()); },
    };
  })();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let toastT = null;
  function toast(msg, { tone } = {}) {
    let el = document.getElementById('gl-toast');
    if (!el) { el = document.createElement('div'); el.id = 'gl-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.dataset.tone = tone || '';
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600);
  }

  // Arkusz od dołu w warstwie sekcji: zamyka się tłem, Esc i przyciskami [data-close]. Zwraca { el, close }.
  function sheet(layer, html, { cls = '', onClose } = {}) {
    const ov = document.createElement('div');
    ov.className = 'sheet-ov';
    ov.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    layer.appendChild(ov);
    const onKey = e => { if (e.key === 'Escape') close(); };
    function close() {
      if (ov.classList.contains('out')) return;
      ov.classList.add('out'); document.removeEventListener('keydown', onKey);
      setTimeout(() => ov.remove(), calm() ? 0 : 300);
      onClose?.();
    }
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    return { el: ov.firstChild, close };
  }

  /* ================================================================ sekcje ================================================================ */
  const defs = [];
  const GL = window.GL = {
    register(def) { defs.push(def); },
    toast, vibrate, haptic, calm, esc,
    get active() { return sections[cur]?.id; },
    go: id => { const i = sections.findIndex(s => s.id === id); if (i >= 0) navTo(i); },
  };

  const $ = s => document.querySelector(s);
  let sections = [];   // { id, label, icon, el, scroller, layer, api }
  let cur = 0;          // aktywna sekcja (indeks)
  let pos = 0;          // ciągła pozycja koła (indeks z ułamkiem) — steruje kołem i przesunięciem sekcji

  function boot() {
    const stage = $('#stage'), layers = $('#layers');
    // focus()/scrollIntoView() w sekcji nie może przewinąć sceny w bok
    stage.addEventListener('scroll', () => { if (stage.scrollLeft || stage.scrollTop) stage.scrollLeft = stage.scrollTop = 0; });
    defs.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    sections = defs.map(def => {
      const el = document.createElement('section');
      el.className = `sec s-${def.id}`; el.dataset.sec = def.id;
      el.innerHTML = '<div class="sec-scroll"><div class="sec-body"></div></div>';
      stage.appendChild(el);
      const layer = document.createElement('div');
      layer.className = `sec-layer s-${def.id}`; layer.dataset.sec = def.id;
      layers.appendChild(layer);
      const s = { id: def.id, label: def.label, icon: def.icon, el, scroller: el.firstChild, root: el.firstChild.firstChild, layer, def, api: null };
      const ctx = {
        id: def.id, root: s.root, scroller: s.scroller, layer, section: el,
        get active() { return sections[cur] === s; },
        changed: () => { const st = stores.find(x => x.id === def.id); if (st) { st.version++; trackLocal(st); schedule(st); } },
        cloud: Cloud, toast, vibrate, haptic, calm, esc,
        sheet: (html, opts) => sheet(layer, html, opts),
        go: GL.go,
        // pełny ekran (np. trwający trening): chowa dolne koło
        fullscreen: on => { s.full = !!on; if (ctx.active) document.body.classList.toggle('layer-full', s.full); },
      };
      try { s.api = def.init(ctx) || {}; } catch (e) { console.error(def.id, e); s.root.innerHTML = `<p class="gl-err">Sekcja „${esc(def.label)}” nie wczytała się: ${esc(e.message)}</p>`; s.api = {}; }
      if (def.cloud && s.api.getState) {
        const st = { id: def.id, table: def.cloud.table, key: def.cloud.key || null, flatten: def.cloud.flatten, unflatten: def.cloud.unflatten, app: s.api, metaKey: `glife.${def.id}.sync`, version: 0, status: 'idle', error: '', reset: s.api.reset };
        stores.push(st);
        if (!read(st.metaKey)) trackLocal(st);
      }
      return s;
    });
    const saved = sections.findIndex(s => s.id === read(NAV_KEY));
    cur = saved >= 0 ? saved : Math.min(1, sections.length - 1);
    pos = cur;
    buildNav();
    layout(pos);
    sections[cur].api.show?.();
    sections.forEach((s, i) => { s.el.classList.toggle('on', i === cur); s.layer.classList.toggle('on', i === cur); });
    document.body.dataset.sec = sections[cur].id;
    updateGate();
    let wasLogged = !!Cloud.user;
    Cloud.onChange(() => { const now = !!Cloud.user; if (now !== wasLogged) { wasLogged = now; updateGate(); } });
    if (session) { syncAll(); rtConnect(); }
    navigator.storage?.persist?.().catch(() => { });
  }

  /* ---------- dolne koło: ikony na łuku wygiętym w dół, przesuwane palcem ---------- */
  const SPACING = () => Math.min(92, Math.max(70, innerWidth / 4.6));
  let navItems = [], navEl, arcEl;
  function buildNav() {
    navEl = $('#wheel');
    navEl.innerHTML = `<svg class="wheel-arc" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="wa" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1c1c1c"/><stop offset="1" stop-color="#0b120e"/></linearGradient><linearGradient id="wl" x1="0" x2="1"><stop offset="0" stop-color="#A31C1B" stop-opacity="0"/><stop offset=".5" stop-color="#d13b39"/><stop offset="1" stop-color="#A31C1B" stop-opacity="0"/></linearGradient></defs><path class="wa-fill" d="M0 6 Q200 62 400 6 L400 120 L0 120 Z" fill="url(#wa)"/><path class="wa-line" d="M0 6 Q200 62 400 6" fill="none" stroke="url(#wl)" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>
      <div class="wheel-glow" aria-hidden="true"></div>
      <div class="wheel-zip" aria-hidden="true"></div>
      <div class="wheel-track" role="tablist" aria-label="Sekcje"></div>
      <div class="wheel-label" aria-hidden="true"><span></span></div>`;
    arcEl = navEl.querySelector('.wheel-arc');
    const track = navEl.querySelector('.wheel-track');
    navItems = sections.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'wi'; b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', s.label);
      b.innerHTML = `<span class="wi-ic">${s.icon}</span>`;
      b.addEventListener('click', e => { if (dragMoved) { e.preventDefault(); return; } navTo(i); });
      track.appendChild(b);
      return b;
    });
    zipEl = navEl.querySelector('.wheel-zip');
    // iPhone: przełącznik na całym kole. Dotknięcie bez przesuwania = tik + przejście do ikony pod palcem.
    const sw = iosZip.mount(navEl);
    if (sw) sw.addEventListener('click', e => {
      e.stopPropagation();
      if (performance.now() - dragEndAt < 400) return;   // klik, który WebKit wysyła na końcu przeciągania
      sw.style.pointerEvents = 'none';
      const hit = document.elementFromPoint(e.clientX || lastX, e.clientY || lastY)?.closest('.wi');
      sw.style.pointerEvents = '';
      const i = navItems.indexOf(hit); if (i >= 0) navTo(i);
    });
    setLabel(cur, true);
    bindDrag(navEl);
    addEventListener('resize', () => layout(pos));
  }

  let labelIdx = -1;
  function setLabel(i, instant) {
    if (i === labelIdx) return;
    const dir = i > labelIdx ? 1 : -1;
    labelIdx = i;
    const box = navEl.querySelector('.wheel-label'), old = box.querySelector('span:not(.out)');
    const sp = document.createElement('span'); sp.textContent = sections[i].label;
    box.appendChild(sp);
    navItems.forEach((b, j) => b.setAttribute('aria-selected', j === i));
    if (instant || calm()) { box.querySelectorAll('span').forEach(x => x !== sp && x.remove()); return; }
    sp.animate([{ opacity: 0, transform: `translateX(${dir * 26}px)`, filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (old) { old.classList.add('out'); old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 26}px)`, filter: 'blur(4px)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).onfinish = () => old.remove(); }
  }

  /* ---------- zamek błyskawiczny: ząbki na łuku jadą razem z ikonami, każdy ząbek = mini wibracja ---------- */
  const TEETH = 7;      // ząbków na jedną sekcję
  let zipEl = null, zipTeeth = [], zipIdx = null, zipLive = false;
  function zip(p) {
    const sp = SPACING(), w = navEl.clientWidth || innerWidth, H = navEl.clientHeight || 104, step = sp / TEETH;
    const n = Math.ceil(w / step) + 2;
    while (zipTeeth.length < n) { const i = document.createElement('i'); zipEl.appendChild(i); zipTeeth.push(i); }
    const shift = (((p * sp) % step) + step) % step, base = Math.floor(p * TEETH);
    zipTeeth.forEach((el, j) => {
      if (j >= n) { el.style.display = 'none'; return; }
      el.style.display = '';
      const x = j * step - shift, t = Math.min(1, Math.max(0, x / w));
      const yLine = (6 * (1 - t) ** 2 + 124 * t * (1 - t) + 6 * t * t) / 120 * H;  // ten sam łuk co w SVG
      const ang = Math.atan((112 - 224 * t) * H / 120 / w) * 180 / Math.PI;
      const side = (base + j) % 2 ? 1 : -1;                                      // ząbki na przemian nad i pod linią
      const near = Math.max(0, 1 - Math.abs(x - w / 2) / (sp * 1.1));
      el.style.transform = `translate(${x}px, ${yLine}px) rotate(${ang}deg) translateY(${side * (3.5 - near * 1.5)}px)`;
      el.style.setProperty('--near', near.toFixed(3));
    });
    // każdy ząbek mijający środek = tik; przejście do kolejnej sekcji = mocniejszy
    const idx = Math.round(p * TEETH);
    if (zipIdx !== null && idx !== zipIdx && zipLive) haptic(idx % TEETH === 0 ? 14 : 4);
    zipIdx = idx;
  }

  // Ustawia koło i sekcje dla ciągłej pozycji p.
  function layout(p) {
    if (zipEl) zip(p);
    const sp = SPACING(), w = navEl.clientWidth || innerWidth;
    navItems.forEach((b, i) => {
      const d = i - p, a = Math.abs(d);
      const x = d * sp;
      const y = -(Math.min(a, 3) ** 2) * 9 - Math.min(a, 1) * 6;   // łuk wygięty w dół: środek najniżej
      const sc = 1.18 - Math.min(a, 2.2) * 0.2;
      const op = Math.max(0, 1 - Math.max(0, a - 0.35) * 0.42);
      b.style.transform = `translate(${x}px, ${y}px) scale(${sc}) rotate(${d * 7}deg)`;
      b.style.opacity = op;
      b.style.setProperty('--hot', Math.max(0, 1 - a * 1.6).toFixed(3));
      b.style.visibility = Math.abs(x) > w * 0.75 ? 'hidden' : '';
      b.tabIndex = i === Math.round(p) ? 0 : -1;
    });
    sections.forEach((s, i) => {
      const d = i - p, a = Math.abs(d);
      if (a >= 1.15) { s.el.style.visibility = 'hidden'; s.el.style.transform = ''; return; }
      s.el.style.visibility = '';
      s.el.style.transform = `translate3d(${d * 104}%,0,0) scale(${1 - Math.min(a, 1) * 0.1}) rotateY(${-d * 9}deg)`;
      s.el.style.opacity = 1 - Math.min(a, 1) * 0.75;
      s.el.style.filter = a > 0.02 ? `blur(${Math.min(a, 1) * 6}px) saturate(${1 - Math.min(a, 1) * 0.5})` : '';
      s.el.style.borderRadius = a > 0.02 ? `${Math.min(a * 120, 28)}px` : '';
      s.el.style.pointerEvents = a < 0.5 ? '' : 'none';
    });
    setLabel(Math.max(0, Math.min(sections.length - 1, Math.round(p))));
  }

  // Animacja sprężynowa do indeksu docelowego.
  let anim = null;
  function navTo(i, v0 = 0) {
    i = Math.max(0, Math.min(sections.length - 1, i));
    cancelAnimationFrame(anim);
    if (calm()) { pos = i; layout(pos); settle(i); return; }
    let v = v0, last = performance.now();
    const k = 170, c = 2 * Math.sqrt(k) * 0.86; // lekko niedotłumiona sprężyna: miękki dojazd z minimalnym odbiciem
    const step = t => {
      const dt = Math.min(0.032, (t - last) / 1000); last = t;
      v += (-k * (pos - i) - c * v) * dt;
      pos += v * dt;
      if (Math.abs(pos - i) < 0.0015 && Math.abs(v) < 0.01) { pos = i; layout(pos); settle(i); zipLive = false; navEl.classList.remove('zip'); return; }
      layout(pos);
      anim = requestAnimationFrame(step);
    };
    zipLive = true; navEl.classList.add('zip');
    activate(i);
    anim = requestAnimationFrame(step);
  }
  function activate(i) {
    if (i === cur) return;
    const prev = sections[cur];
    cur = i; write(NAV_KEY, sections[i].id);
    sections.forEach((s, j) => s.el.classList.toggle('on', j === i));
    sections.forEach(s => s.layer.classList.toggle('on', s === sections[i]));
    document.body.dataset.sec = sections[i].id;
    document.body.classList.toggle('layer-full', !!sections[i].full);
    try { prev.api.hide?.(); } catch (e) { console.error(e); }
    try { sections[i].api.show?.(); } catch (e) { console.error(e); }
    document.dispatchEvent(new CustomEvent('gl:section', { detail: sections[i].id }));
  }
  function settle(i) {
    sections.forEach(s => { if (s !== sections[i]) return; s.el.style.filter = ''; s.el.style.transform = ''; s.el.style.borderRadius = ''; });
  }

  let dragMoved = false, dragEndAt = 0, lastX = 0, lastY = 0;
  function bindDrag(el) {
    let sx = 0, sp0 = 0, samples = [], id = null, sy = 0, axis = null;
    el.addEventListener('pointerdown', e => {
      if (e.button) return;
      id = e.pointerId; sx = lastX = e.clientX; sy = lastY = e.clientY; sp0 = pos; samples = [[performance.now(), pos]]; dragMoved = false; axis = null;
      iosZip.begin();
      if (!IOS) haptic(6); // chwyt koła
      cancelAnimationFrame(anim);
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; lastX = e.clientX; lastY = e.clientY;
      // na iPhonie bez przechwytywania wskaźnika: dotyk i tak trzyma się przełącznika, a przechwycenie psułoby jego śledzenie
      if (!axis) { if (Math.hypot(dx, dy) < 6) return; axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; if (axis === 'x') { if (!IOS) { try { el.setPointerCapture(id); } catch (_) { } } el.classList.add('drag', 'zip'); zipLive = true; haptic(6); } }
      if (axis !== 'x') return;
      dragMoved = true;
      let p = sp0 - dx / (SPACING() * 1.35); // koło jedzie trochę wolniej niż palec — łatwiej trafić w sąsiednią sekcję
      const max = sections.length - 1;
      if (p < 0) p = -Math.pow(-p, 0.6) * 0.45; else if (p > max) p = max + Math.pow(p - max, 0.6) * 0.45; // gumka na końcach
      pos = p; layout(pos);
      const t = performance.now(); samples.push([t, pos]); while (samples.length > 2 && t - samples[0][0] > 90) samples.shift();
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; el.classList.remove('drag');
      if (!dragMoved) { zipLive = false; el.classList.remove('zip'); if (axis) dragEndAt = performance.now(); if (axis === 'x') navTo(cur); return; }
      const [t0, p0] = samples[0], [t1, p1] = samples[samples.length - 1];
      const v = t1 > t0 ? (p1 - p0) / ((t1 - t0) / 1000) : 0;
      const target = Math.round(pos + Math.max(-0.55, Math.min(0.55, v * 0.12))); // szybkie machnięcie = najwyżej jedna sekcja dalej
      dragEndAt = performance.now();
      navTo(target, v);
      setTimeout(() => { dragMoved = false; }, 0);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // kółko myszy / gładzik na komputerze
    let wheelT = 0;
    el.addEventListener('wheel', e => { e.preventDefault(); const t = Date.now(); if (t - wheelT < 260) return; const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(d) < 8) return; wheelT = t; navTo(cur + Math.sign(d)); }, { passive: false });
    el.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { navTo(cur + 1); navItems[Math.min(cur, navItems.length - 1)].focus(); } else if (e.key === 'ArrowLeft') { navTo(cur - 1); navItems[cur].focus(); } });
  }

  /* ================================================================ ekran logowania ================================================================ */
  let mode = 'in';
  function updateGate() {
    const logged = !!Cloud.user;
    const gate = $('#auth');
    document.body.classList.toggle('gate', !logged);
    if (!logged) {
      gate.hidden = false;
      requestAnimationFrame(() => gate.classList.add('on'));
      setTimeout(() => $('#a-email')?.focus(), 400);
    } else if (!gate.hidden) {
      gate.classList.remove('on'); gate.classList.add('leave');
      document.body.classList.add('entering');
      setTimeout(() => { gate.hidden = true; gate.classList.remove('leave'); document.body.classList.remove('entering'); }, 900);
    }
  }
  function bindAuth() {
    const form = $('#auth-form'), err = $('#auth-err'), btn = $('#a-submit');
    document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.auth;
      document.querySelectorAll('[data-auth]').forEach(x => x.setAttribute('aria-selected', x === b));
      $('.auth-tabs').dataset.m = mode;
      $('#a-pass2-row').hidden = mode !== 'up';
      $('#a-pass').autocomplete = mode === 'up' ? 'new-password' : 'current-password';
      btn.textContent = mode === 'up' ? 'Załóż konto' : 'Zaloguj się';
      err.hidden = true;
    }));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#a-email').value.trim(), pass = $('#a-pass').value;
      const fail = m => { err.textContent = m; err.hidden = false; form.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 360 }); };
      if (!email || !/.+@.+\..+/.test(email)) return fail('Podaj poprawny e-mail.');
      if (pass.length < 6) return fail('Hasło musi mieć co najmniej 6 znaków.');
      if (mode === 'up' && pass !== $('#a-pass2').value) return fail('Hasła się różnią.');
      btn.disabled = true; btn.classList.add('busy'); err.hidden = true;
      try {
        if (mode === 'up') await Cloud.signUp(email, pass); else await Cloud.signIn(email, pass);
        if (window.PasswordCredential) { try { await navigator.credentials.store(new PasswordCredential({ id: email, password: pass })); } catch (_) { } }
      } catch (ex) {
        fail(/invalid login|invalid_credentials/i.test(`${ex.code} ${ex.message}`) ? 'Zły e-mail albo hasło.'
          : /already registered|user_already_exists/i.test(`${ex.code} ${ex.message}`) ? 'To konto już istnieje — zaloguj się.'
          : ex instanceof TypeError ? 'Brak internetu.' : ex.message);
      } finally { btn.disabled = false; btn.classList.remove('busy'); }
    });
  }

  /* ---------- telefon: bez przybliżania ---------- */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });

  /* ---------- PWA ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !LOCAL) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));

  document.addEventListener('DOMContentLoaded', () => { bindAuth(); boot(); });
})();
