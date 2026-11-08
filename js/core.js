/* Grochu life — rdzeń: konto, synchronizacja z Supabase (jedna sesja, wiele tabel), sekcje i boczne menu.
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
  // Krótki „tik” dotykowy. Android: Vibration API. iPhone nie ma vibrate, a od iOS 26.5 tik z kodu nie działa —
  // tik daje tylko prawdziwe dotknięcie systemowego przełącznika, dlatego w przyciskach menu leży niewidoczny (HAP).
  let hapT = 0;
  function haptic(ms = 5) {
    const t = performance.now(); if (t - hapT < 24) return; hapT = t;
    vibrate(ms);
  }
  const HAP = '<label class="hap" aria-hidden="true"><input type="checkbox" switch tabindex="-1"></label>';
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

  // Lista rozwijana pod przyciskiem ze strzałką (np. Treningi / Plany / Postępy). items: [[id, nazwa], …].
  // Rysowana w warstwie sekcji, przyklejona do prawej krawędzi przycisku; zamyka się dotknięciem obok i Esc.
  function dropdown(layer, anchor, items, value, onPick) {
    const r = anchor.getBoundingClientRect();
    const wrap = document.createElement('div');
    wrap.className = 'dd-ov';
    wrap.innerHTML = `<div class="dd" role="menu" style="top:${Math.round(r.bottom + 8)}px;right:${Math.round(innerWidth - r.right)}px">${items.map(([id, l], i) =>
      `<button type="button" class="dd-i${id === value ? ' on' : ''}" role="menuitemradio" aria-checked="${id === value}" data-id="${esc(id)}" style="--i:${i}"><span>${esc(l)}</span><i class="dd-ck" aria-hidden="true"></i>${HAP}</button>`).join('')}</div>`;
    layer.appendChild(wrap);
    anchor.classList.add('open'); anchor.setAttribute('aria-expanded', 'true');
    const onKey = e => { if (e.key === 'Escape') close(); };
    function close() {
      if (wrap.classList.contains('out')) return;
      wrap.classList.add('out'); anchor.classList.remove('open'); anchor.setAttribute('aria-expanded', 'false');
      removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), calm() ? 0 : 240);
    }
    wrap.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT') return;
      const b = e.target.closest('.dd-i');
      if (b) { haptic(6); close(); if (b.dataset.id !== value) onPick(b.dataset.id); return; }
      if (e.target === wrap) close();
    });
    addEventListener('keydown', onKey);
    setTimeout(() => wrap.querySelector('.dd-i.on, .dd-i')?.focus({ preventScroll: true }), 60);
    return close;
  }
  const CHEV = '<svg class="vd-ch" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // przycisk ze strzałką do nagłówka sekcji; zmiana nazwy podjeżdża od dołu
  const dropBtnHtml = (label, attrs = '') => `<button type="button" class="vdrop" aria-haspopup="menu" aria-expanded="false" ${attrs}><span class="vd-l">${esc(label)}</span>${CHEV}${HAP}</button>`;
  function setDropLabel(btn, label) {
    const l = btn.querySelector('.vd-l'); if (!l || l.textContent === label) return;
    l.textContent = label;
    if (!calm()) l.animate([{ opacity: 0, transform: 'translateY(60%)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
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
        dropdown: (anchor, items, value, onPick) => dropdown(layer, anchor, items, value, onPick),
        dropBtnHtml, setDropLabel,
        go: GL.go,
        // pełny ekran (np. trwający trening): chowa przycisk menu
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
    buildNav();
    sections[cur].api.show?.();
    sections.forEach((s, i) => { s.el.classList.toggle('on', i === cur); s.layer.classList.toggle('on', i === cur); });
    document.body.dataset.sec = sections[cur].id;
    updateGate();
    let wasLogged = !!Cloud.user;
    Cloud.onChange(() => { const now = !!Cloud.user; if (now !== wasLogged) { wasLogged = now; updateGate(); } });
    if (session) { syncAll(); rtConnect(); }
    navigator.storage?.persist?.().catch(() => { });
  }

  /* ---------- boczne menu: przycisk z ikoną i nazwą sekcji, wysuwana z prawej lista sekcji ---------- */
  const X_IC = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  const BURGER = '<span class="mb-lines" aria-hidden="true"><i></i><i></i><i></i></span>';
  let menuBtn, drawer, scrim, items = [], menuOpen = false;
  function buildNav() {
    menuBtn = $('#menu-btn'); drawer = $('#drawer'); scrim = $('#scrim');
    drawer.innerHTML = `<div class="dr-head"><span class="dr-brand">Grochu life<i>.</i></span><button class="dr-x" type="button" aria-label="Zamknij menu">${X_IC}${HAP}</button></div>
      <nav class="dr-list" aria-label="Sekcje"></nav>
      <div class="dr-foot"><span class="dr-mail"></span></div>`;
    const list = drawer.querySelector('.dr-list');
    items = sections.map((s, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dr-item'; b.dataset.sec = s.id; b.style.setProperty('--i', i);
      b.innerHTML = `<span class="dr-ic">${s.icon}</span><span class="dr-l">${esc(s.label)}</span><i class="dr-dot" aria-hidden="true"></i>${HAP}`;
      b.addEventListener('click', e => { if (e.target.tagName === 'INPUT') return; haptic(6); goTo(i); });
      list.appendChild(b);
      return b;
    });
    menuBtn.addEventListener('click', e => { if (e.target.tagName === 'INPUT') return; haptic(6); menuOpen ? closeMenu() : openMenu(); });
    drawer.querySelector('.dr-x').addEventListener('click', e => { if (e.target.tagName === 'INPUT') return; closeMenu(); });
    scrim.addEventListener('click', closeMenu);
    addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) closeMenu(); });
    bindEdgeSwipe();
    markActive();
  }
  // hamburger w prawym górnym rogu; w menu bieżąca sekcja ma kropkę
  function markActive() {
    const s = sections[cur];
    items.forEach((b, j) => { b.classList.toggle('on', j === cur); b.setAttribute('aria-current', j === cur ? 'page' : 'false'); });
    if (!menuBtn.firstChild) menuBtn.innerHTML = `${BURGER}${HAP}`;
    menuBtn.setAttribute('aria-label', `Menu — ${s.label}`);
  }
  function openMenu() {
    if (menuOpen) return;
    menuOpen = true;
    drawer.querySelector('.dr-mail').textContent = Cloud.user?.email || '';
    drawer.style.transform = ''; scrim.style.opacity = '';
    document.body.classList.add('menu-open');
    drawer.setAttribute('aria-hidden', 'false'); menuBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => items[cur]?.focus({ preventScroll: true }), 250);
  }
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    drawer.style.transform = ''; scrim.style.opacity = '';
    document.body.classList.remove('menu-open');
    drawer.setAttribute('aria-hidden', 'true'); menuBtn.setAttribute('aria-expanded', 'false');
  }

  // przejście między sekcjami: stara odpływa i rozmywa się, nowa wjeżdża z boku (kierunek wg kolejności w menu)
  function goTo(i) {
    closeMenu();
    if (i === cur || i < 0 || i >= sections.length) return;
    const from = sections[cur], to = sections[i], dir = i > cur ? 1 : -1;
    activate(i);
    markActive();
    if (calm()) return;
    from.el.classList.add('leaving');
    from.el.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translate3d(${-dir * 7}%,0,0) scale(.95)`, filter: 'blur(6px)' }],
      { duration: 360, easing: 'cubic-bezier(.6,0,.8,.4)' }).onfinish = () => from.el.classList.remove('leaving');
    to.el.animate([{ opacity: 0, transform: `translate3d(${dir * 9}%,0,0) scale(.98)`, filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
      { duration: 620, delay: 140, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  }
  const navTo = goTo;

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
    sections[i].scroller.scrollTop = sections[i].scroller.scrollTop; // bez skoku przewinięcia
    document.dispatchEvent(new CustomEvent('gl:section', { detail: sections[i].id }));
  }

  // przesunięcie palcem w lewo od prawej krawędzi otwiera menu (menu jedzie za palcem); w otwartym menu przesunięcie w prawo je zamyka
  const EDGE = 24;
  const edgeOk = () => !menuOpen && !document.body.classList.contains('gate') && !document.body.classList.contains('layer-full');
  function bindEdgeSwipe() {
    let sx = 0, sy = 0, mode = null, axis = null, dx = 0;
    const W = () => drawer.offsetWidth || 300;
    // dotyk zaczęty przy prawej krawędzi należy do menu: sekcje nie dostają go (np. przesunięcie nawyku w lewo = wyczyść)
    addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && edgeOk() && e.clientX > innerWidth - EDGE) e.stopPropagation(); }, true);
    addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; axis = null; dx = 0;
      mode = edgeOk() && sx > innerWidth - EDGE ? 'open' : menuOpen && (drawer.contains(e.target) || e.target === scrim) ? 'close' : null;
    }, { passive: true });
    addEventListener('touchmove', e => {
      if (!mode) return;
      const t = e.touches[0]; dx = t.clientX - sx;
      if (!axis) { if (Math.hypot(dx, t.clientY - sy) < 8) return; axis = Math.abs(dx) > Math.abs(t.clientY - sy) ? 'x' : 'y'; if (axis === 'y') { mode = null; return; } document.body.classList.add('menu-drag'); }
      const w = W(), shown = mode === 'open' ? Math.max(0, Math.min(w, -dx)) : Math.max(0, Math.min(w, w - dx));
      drawer.style.transform = `translateX(${w - shown}px)`;
      scrim.style.opacity = String(shown / w);
      document.body.style.setProperty('--menu-p', (shown / w).toFixed(3));
    }, { passive: true });
    addEventListener('touchend', () => {
      if (!mode) return;
      const m = mode; mode = null;
      document.body.classList.remove('menu-drag'); document.body.style.removeProperty('--menu-p');
      if (axis !== 'x') return;
      if (m === 'open') { if (dx < -70) { haptic(6); openMenu(); } else { drawer.style.transform = ''; scrim.style.opacity = ''; } }
      else if (dx > 60) closeMenu(); else { drawer.style.transform = ''; scrim.style.opacity = ''; }
    });
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
