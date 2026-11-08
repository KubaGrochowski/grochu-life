/* Grochu life — sekcja Nawyki (port Habbitcker): tygodniowy tracker nawyków.
   Dane lokalnie (localStorage, klucz glife.habits.v1) i w chmurze (tabela user_data — ten sam format co w Habbitckerze). */
(() => {
  'use strict';

  const STORAGE_KEY = 'glife.habits.v1';
  const VIEW_KEY = 'glife.habits.view', HELLO_KEY = 'glife.habits.hello', TIMER_KEY = 'glife.habits.timer';
  const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  const DAYS_FULL = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  const MONTHS_NOM = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
  const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const ALL = [0, 1, 2, 3, 4, 5, 6];
  const TIMES = [['am', 'Rano'], ['pm', 'Popołudnie'], ['eve', 'Wieczór']];
  const VIEWS = ['week', 'calendar', 'summary'];

  /* ---------- spłaszczanie stanu (dokładnie jak w hbtrack/js/cloud.js, żeby dane z chmury wczytały się bez zmian) ---------- */
  function flatten(s) {
    const items = { start: s.start, order: s.habits.map(h => h.id) };
    s.habits.forEach(h => { items['h:' + h.id] = h; });
    Object.entries(s.entries || {}).forEach(([hid, days]) => Object.entries(days).forEach(([k, v]) => { if (v != null) items[`e:${hid}|${k}`] = v; }));
    Object.entries(s.notes || {}).forEach(([k, v]) => { if (v) items['n:' + k] = v; });
    Object.keys(s.skips || {}).forEach(k => { items['k:' + k] = 1; }); // odpuszczone zaległości: 'idNawyku|data'
    Object.entries(s.spent || {}).forEach(([k, v]) => { if (v) items['p:' + k] = v; }); // zatrzymany timer: 'idNawyku|data' → sekundy
    Object.entries(s.breaks || {}).forEach(([k, v]) => { items['b:' + k] = v; }); // przerwy: id → { from, to }
    return items;
  }
  function unflatten(items) {
    const habitsById = {};
    Object.keys(items).forEach(k => { if (k.startsWith('h:')) habitsById[k.slice(2)] = items[k]; });
    const order = (items.order || []).filter(id => habitsById[id]);
    Object.keys(habitsById).forEach(id => { if (!order.includes(id)) order.push(id); });
    const entries = {}, notes = {}, skips = {}, spent = {}, breaks = {};
    Object.keys(items).forEach(k => {
      if (k.startsWith('e:')) { const [hid, day] = k.slice(2).split('|'); if (habitsById[hid]) (entries[hid] ??= {})[day] = items[k]; }
      else if (k.startsWith('n:')) notes[k.slice(2)] = items[k];
      else if (k.startsWith('k:')) { if (habitsById[k.slice(2).split('|')[0]]) skips[k.slice(2)] = 1; }
      else if (k.startsWith('b:')) breaks[k.slice(2)] = items[k];
      else if (k.startsWith('p:')) { if (habitsById[k.slice(2).split('|')[0]]) spent[k.slice(2)] = items[k]; }
    });
    return { start: items.start, habits: order.map(id => habitsById[id]), entries, notes, skips, spent, breaks };
  }

  /* ---------- ikony ---------- */
  const CHECK = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const DOTS = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.6" fill="currentColor"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="13" cy="8" r="1.6" fill="currentColor"/></svg>';
  const PENCIL = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.5 2.5l3 3L5.5 13.5H2.5v-3l8-8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 4l3 3" stroke="currentColor" stroke-width="1.6"/></svg>';
  const UNDO = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 6.5h6.5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.8 3.5L2.8 6.5l3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const XMARK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  const GRIP = '<svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4"/><circle cx="7" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="7" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="7" cy="13" r="1.4"/></g></svg>';
  const CLOCK = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.5V8l2.4 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PLAY = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.6v8.8L10.2 6z" fill="currentColor"/></svg>';
  const STOP = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor"/></svg>';
  const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M1.5 7h11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const BACK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5.5 3 2 6.5 5.5 10M2.5 6.5H9a3 3 0 0 1 0 6H7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PAUSE = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.6" stroke="currentColor" stroke-width="1.6"/><path d="M8 7v6M12 7v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const FLAME = '<svg width="11" height="13" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 .5c.4 2.4 3.8 3.9 3.8 7.6a3.8 3.8 0 0 1-7.6 0c0-1.5.8-2.6 1.6-3.3.1 1.2.7 2 1.5 2.3C5 5.1 5.1 2.6 6 .5z" fill="currentColor"/></svg>';
  const BOAT = '<svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true"><path d="M12 2v14H4z" fill="currentColor" opacity=".9"/><path d="M14 5v11h7z" fill="currentColor" opacity=".55"/><path d="M2 18h22l-3 4H6z" fill="currentColor"/></svg>';
  const WATER = '<i class="wv"></i><i class="wv b"></i>';
  // Fale w karcie przerwy: ścieżka dłuższa niż widok, przesuwana w pętli o pełne okresy
  const wavePath = (amp, len) => { let d = 'M0 20'; for (let x = 0; x < 400; x += len) d += ` Q${x + len / 4} ${20 - amp} ${x + len / 2} 20 T${x + len} 20`; return d + ' V40 H0 Z'; };
  const SEA_SVG = `<svg class="waves" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path class="w1" d="${wavePath(5, 50)}"/><path class="w2" d="${wavePath(7, 100)}" transform="translate(0 3)"/><path class="w3" d="${wavePath(3, 50)}" transform="translate(0 9)"/></svg>`;

  GL.register({
    id: 'habits', label: 'Nawyki', order: 20,
    icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19c0-8 5-13.5 15-14-.4 9.5-5.6 14.5-13 14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19.5c2.5-4.5 5.5-7.5 9.5-9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    cloud: { table: 'user_data', flatten, unflatten },
    init(ctx) {
      const { root, layer, scroller, calm, esc } = ctx;
      const toast = m => ctx.toast(m);

      /* ---------- szkielet sekcji ---------- */
      root.innerHTML = `
        <header class="sec-head hb-head">
          <div class="hb-top">
            <div class="hb-tl"><div class="eyebrow hb-range"></div><h1 class="sec-title">Nawyki</h1></div>
            <div class="hb-acts">
              <button class="icon-btn hb-brk" type="button" data-break-open aria-label="Przerwa" title="Przerwa">${PAUSE}</button>
              <button class="btn btn-primary hb-add" type="button"><span class="plus" aria-hidden="true">${PLUS}</span>Dodaj</button>
            </div>
          </div>
          <div class="hb-hero">
            <b class="hb-pct">0%</b>
            <div class="hb-hero-r"><span class="hb-today"></span><div class="hb-meter" aria-hidden="true"><i></i></div></div>
            <button class="hb-now" type="button" hidden>${BACK}Dziś</button>
          </div>
        </header>
        <div class="hb-wrap">
          <nav class="seg hb-views" role="tablist" aria-label="Widok" style="--n:3;--i:0">
            <button class="seg-b" type="button" role="tab" data-view="week">Tydzień</button>
            <button class="seg-b" type="button" role="tab" data-view="calendar">Kalendarz</button>
            <button class="seg-b" type="button" role="tab" data-view="summary">Podsumowanie</button>
          </nav>
          <section class="hb-v hb-v-week">
            <div class="o-days hb-days"></div>
            <div class="day-note hb-note" hidden></div>
            <div class="timer-card hb-timer" hidden></div>
            <div class="o-list hb-list"></div>
          </section>
          <section class="hb-v hb-v-cal" hidden></section>
          <section class="hb-v hb-v-sum" hidden></section>
          <p class="empty hb-empty" hidden></p>
        </div>`;
      const $ = s => root.querySelector(s);
      const L = s => layer.querySelector(s);
      const el = {
        range: $('.hb-range'), pct: $('.hb-pct'), today: $('.hb-today'), meter: $('.hb-meter i'), now: $('.hb-now'), add: $('.hb-add'),
        views: $('.hb-views'), week: $('.hb-v-week'), cal: $('.hb-v-cal'), sum: $('.hb-v-sum'), days: $('.hb-days'), note: $('.hb-note'),
        timer: $('.hb-timer'), list: $('.hb-list'), empty: $('.hb-empty'),
      };
      const list = el.list;

      /* ---------- daty ---------- */
      const pad = n => String(n).padStart(2, '0');
      const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
      const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
      const dow = d => (d.getDay() + 6) % 7; // 0 = poniedziałek
      const startOfWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -dow(x)); };
      const todayKey = () => key(new Date());
      // Start = poniedziałek tygodnia pierwszego nawyku (albo bieżący tydzień, gdy brak danych).
      function withStart(s) {
        if (!s.start) {
          const c = s.habits.map(h => h.created).filter(Boolean).sort()[0];
          s.start = key(startOfWeek(c ? fromKey(c) : new Date()));
        }
        if (!s.notes || typeof s.notes !== 'object') s.notes = {};
        if (!s.skips || typeof s.skips !== 'object') s.skips = {};
        if (!s.spent || typeof s.spent !== 'object') s.spent = {};
        if (!s.breaks || typeof s.breaks !== 'object') s.breaks = {}; // przerwy (urlop, choroba): id → { from, to }
        // Timer jest osobnym rodzajem nawyku: dawne „tak/nie z czasem” i „liczbowe z timerem” stają się nawykami-timerami w minutach.
        s.habits.forEach(h => {
          const e = s.entries[h.id];
          if (h.type === 'bool' && h.timer && h.dur) {
            const m = Math.round(h.timer === 'h' ? h.dur * 60 : h.dur);
            Object.assign(h, { type: 'num', target: m, unit: 'min', step: 5, clock: true, timer: 'min' }); delete h.dur;
            if (e) Object.keys(e).forEach(k => { if (e[k] >= 1) e[k] = m; else delete e[k]; });
          } else if (h.type === 'num' && (h.timer === 'min' || h.timer === 'h') && !h.clock) {
            if (h.timer === 'h') { h.target = +(h.target * 60).toFixed(2); h.step = Math.max(1, Math.round(h.step * 60)); if (e) Object.keys(e).forEach(k => { e[k] = +(e[k] * 60).toFixed(2); }); }
            Object.assign(h, { unit: 'min', clock: true, timer: 'min' });
          }
        });
        Object.keys(s.spent).forEach(k => { if ((k.split('|')[1] || '') < todayKey()) delete s.spent[k]; });
        // odpuszczone zaległości starsze niż tydzień nie są już potrzebne
        const old = key(addDays(new Date(), -7));
        Object.keys(s.skips).forEach(k => { if ((k.split('|')[1] || '') < old) delete s.skips[k]; });
        return s;
      }

      /* ---------- stan ---------- */
      const empty = () => withStart({ habits: [], entries: {} });
      function load() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.habits) && s.entries) return withStart(s); }
        } catch (_) { }
        return empty();
      }
      const writeLocal = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch (_) { return false; } };
      let state = load();
      writeLocal(); // utrwala datę startu (tydzień 1) — bez oznaczania zmiany
      function save() {
        if (!writeLocal()) { toast('Nie udało się zapisać danych w przeglądarce'); return; }
        ctx.changed();
      }
      // Stan z chmury (po synchronizacji): zapis lokalny bez oznaczania go jako zmiany z tego urządzenia.
      function applyState(s) {
        state = withStart({ habits: s.habits || [], entries: s.entries || {}, notes: s.notes || {}, skips: s.skips || {}, spent: s.spent || {}, breaks: s.breaks || {}, start: s.start });
        writeLocal();
        render();
      }
      // Po wylogowaniu: czyste dane na urządzeniu.
      function reset() {
        closeSheet(true);
        if (timer) { timer = null; clearInterval(timerInt); timerInt = null; }
        timerCard = null;
        try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(TIMER_KEY); } catch (_) { }
        state = empty(); levels.clear(); shownPct = null;
        render();
      }

      let weekStart = startOfWeek(new Date());
      // Telefon: widok jednego dnia (selDay); komputer: cały tydzień.
      const mq = window.matchMedia('(max-width:680px)');
      const isMobile = () => mq.matches;
      const dayOnly = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
      let selDay = dayOnly(new Date());
      // Animacje: wejście listy (po nawigacji), kierunek przesunięcia dnia/tygodnia/miesiąca, ostatnio zmienione kółko, zmiana widoku.
      let animList = true, slideDir = 0, justCell = null, viewDir = 0;
      const levels = new Map(); // 'idNawyku|data' → poziom wody (%) z poprzedniego rysowania, żeby płynnie przelać do nowego
      let userAct = false, hero = { k: null, v: null }, party = false, partyLater = false, timerDone = null, recordToast = null;
      let edit = null;
      let rowMenu = null;
      let view = 'week';
      let monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      try { const v = localStorage.getItem(VIEW_KEY); if (v === 'calendar' || v === 'summary') view = v; } catch (_) { }

      const habitsActive = () => state.habits.filter(h => !h.archived);
      const getVal = (h, k) => { const v = state.entries[h.id]?.[k]; return v == null ? null : v; };
      function setVal(h, k, v) {
        state.entries[h.id] ??= {};
        if (v == null) delete state.entries[h.id][k]; else state.entries[h.id][k] = v;
        userAct = true;
        save();
      }

      /* ---------- logika ---------- */
      const prog = (h, v) => v == null ? 0 : h.type === 'bool' ? (v >= 1 ? 1 : 0) : Math.min(1, v / h.target);
      // Przerwa: dni wolne od wszystkich nawyków — nie liczą się do procentów, nie przerywają serii, nie dają zaległości.
      const breakAt = k => Object.values(state.breaks || {}).find(b => b.from <= k && k <= b.to) || null;
      // „X razy w tygodniu”: ile razy zrobione w tygodniu dnia d (przed d albo do dziś włącznie)
      function weekDone(h, d, before) {
        const ws = startOfWeek(d), t = todayKey(), lim = before ? key(d) : t; let n = 0;
        for (let i = 0; i < 7; i++) { const k = key(addDays(ws, i)); if (k > lim || (before && k === lim)) break; if (prog(h, getVal(h, k)) >= 1) n++; }
        return n;
      }
      function status(h, d) {
        const k = key(d), t = todayKey();
        if (k < h.created) return 'pre'; // nawyku jeszcze nie było (albo zaczyna się w przyszłości)
        if (h.once && k !== h.once) return 'off'; // jednorazowy: tylko w swoim dniu
        if (!h.days.includes(dow(d))) return 'off';
        if (breakAt(k)) return 'rest';
        if (k > t) return 'future';
        const v = getVal(h, k);
        let st;
        if (h.type === 'bool') st = v === 1 ? 'done' : v === 0 ? 'miss' : k === t ? 'pending' : 'miss';
        else st = v == null || v === 0 ? (k === t ? 'pending' : 'miss') : v >= h.target ? 'done' : 'part';
        // X razy w tygodniu: niezrobiony dzień jest „dowolny”, chyba że inaczej nie da się już zmieścić limitu w tygodniu
        if (h.freq && (st === 'miss' || st === 'pending')) {
          if (weekDone(h, d, false) >= h.freq) return 'free';
          const need = h.freq - weekDone(h, d, true), left = 7 - dow(d);
          if (need < left) return 'free';
        }
        return st;
      }
      const nf = v => v.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
      const fmt = (h, v) => v == null ? '' : h.type === 'bool' ? (v >= 1 ? '✓' : '✕') : v >= 1000 ? (v / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + 'k' : nf(v);
      const dayLabel = k => { const d = fromKey(k); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
      const addMonths = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); if (x.getDate() !== d.getDate()) x.setDate(0); return x; };
      const tgt = h => { const per = h.once ? `jednorazowo, ${dayLabel(h.once)}` : h.freq ? `${h.freq}× w tygodniu` : h.days.length === 7 ? 'codziennie' : h.days.map(d => DAYS[d]).join(' '); return h.type === 'bool' ? per : `${nf(h.target)} ${h.unit} · ${per}`; };
      const weekDates = (ws = weekStart) => ALL.map(i => addDays(ws, i));

      // Jeden wzór dla wszystkich procentów: każdy zaplanowany nawyk ma równą wagę, suma postępów ÷ liczba nawyków do dziś włącznie
      // (tak/nie: 1 albo 0; liczbowy: wartość ÷ cel, najwyżej 1; bez wpisu = 0). Dni przyszłe się nie liczą.
      function periodPct(dates) {
        let n = 0, s = 0;
        dates.forEach(d => habitsActive().forEach(h => {
          const st = status(h, d); if (!['done', 'part', 'miss', 'pending'].includes(st)) return;
          n++; s += prog(h, getVal(h, key(d))); // nawyk liczbowy liczy się proporcjonalnie: 2 h z 10 h = 20% swojej części
        }));
        return n ? s / n : null;
      }
      const dayPct = d => periodPct([d]);
      // Seria: zrobione zaplanowane dni pod rząd, licząc wstecz od dziś (dziś bez wpisu i dni wolne nie przerywają).
      function streak(h) {
        let n = 0;
        const start = fromKey(h.created || state.start);
        for (let d = dayOnly(new Date()); d >= start; d = addDays(d, -1)) {
          const s = status(h, d);
          if (s === 'off' || s === 'pre' || s === 'pending' || s === 'rest' || s === 'free') continue;
          if (s === 'done') n++; else break;
        }
        return n;
      }
      // Rekord serii: najdłuższa seria w historii; prior = najlepsza z serii już zakończonych (do wykrycia nowego rekordu)
      function bestStreak(h) {
        let cur = 0, best = 0, prior = 0;
        const t = dayOnly(new Date());
        for (let d = fromKey(h.created || state.start); d <= t; d = addDays(d, 1)) {
          const s = status(h, d);
          if (s === 'done') { cur++; best = Math.max(best, cur); }
          else if (s === 'miss' || s === 'part') { prior = Math.max(prior, cur); cur = 0; }
        }
        return { best, prior };
      }
      // Najsłabszy dzień tygodnia: dzień z największym odsetkiem niezrobionych (min. 2 próby), bez dzisiaj
      function weakestDay(h) {
        const n = ALL.map(() => [0, 0]), t = dayOnly(new Date());
        for (let d = fromKey(h.created || state.start); d < t; d = addDays(d, 1)) {
          const s = status(h, d); if (!['done', 'part', 'miss'].includes(s)) continue;
          n[dow(d)][1]++; if (s !== 'done') n[dow(d)][0]++;
        }
        let best = -1, rate = 0;
        n.forEach(([f, c], i) => { if (c >= 2 && f && (f / c > rate || (f / c === rate && f > n[best][0]))) { best = i; rate = f / c; } });
        return best;
      }
      const noteOf = k => state.notes[k] || '';
      function setNote(k, text) {
        const t = text.trim();
        if (t) state.notes[k] = t; else delete state.notes[k];
        save();
      }
      // [zrobione, zaplanowane] dla danego dnia
      function dayDone(d) { const hs = habitsActive().filter(h => !['off', 'pre', 'rest', 'free'].includes(status(h, d))); return [hs.filter(h => status(h, d) === 'done').length, hs.length]; }
      const pct = p => Math.round(p * 100);
      // Wysokość wody w kółku tak, żeby zalana POWIERZCHNIA koła odpowiadała % celu (90% celu ≈ 84% wysokości, nie prawie pełne).
      const waterLevel = f => {
        if (f <= 0 || f >= 1) return f * 100;
        let lo = 0, hi = Math.PI * 2;
        for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if ((m - Math.sin(m)) / (2 * Math.PI) < f) lo = m; else hi = m; }
        return +((1 - Math.cos(lo / 2)) / 2 * 100).toFixed(1);
      };

      /* ---------- kalendarz ---------- */
      const monthOf = d => new Date(d.getFullYear(), d.getMonth(), 1);
      const monthDays = ms => { const out = []; for (let d = new Date(ms); d.getMonth() === ms.getMonth(); d = addDays(d, 1)) out.push(d); return out; };
      const monthPct = ms => periodPct(monthDays(ms));

      // Kolor dnia w kalendarzu: 0% ciemny węgiel → 100% crimson.
      const heat = p => `color-mix(in oklab, var(--crimson) ${Math.round(p * 100)}%, var(--coal-3))`;
      const navBtn = dir => `<button class="navarr" type="button" data-nav="${dir}" ${dir < 0 && !canPrev() ? 'disabled' : ''} aria-label="${dir < 0 ? 'Wstecz' : 'Dalej'}">${dir < 0 ? '‹' : '›'}</button>`;
      const slideCls = () => slideDir ? (slideDir > 0 ? ' slide-l' : ' slide-r') : animList ? ' enter' : '';
      function renderCalendar() {
        const t = todayKey(), days = monthDays(monthStart);
        let cal = `<div class="cal-nav">${navBtn(-1)}<b class="cal-m">${MONTHS_NOM[monthStart.getMonth()]} ${monthStart.getFullYear()}</b>${navBtn(1)}</div><div class="cal-h">${DAYS.map(d => `<span>${d}</span>`).join('')}</div><div class="cal${slideCls()}">`;
        for (let i = 0; i < dow(days[0]); i++) cal += `<span class="cd blank"></span>`;
        days.forEach((d, idx) => {
          const k = key(d), fut = k > t, pre = k < state.start, p = fut || pre ? null : dayPct(d);
          const note = noteOf(k);
          const cls = `cd${breakAt(k) && !pre ? ' rest' : ''}${fut ? ' fut' : ''}${pre ? ' pre' : ''}${p == null ? ' none' : ''}${p != null ? ' hi' : ''}${p === 1 ? ' full' : ''}${k === t ? ' today' : ''}${note ? ' has-note' : ''}`;
          const tip = esc(`${DAYS_FULL[dow(d)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}: ${p == null ? 'brak danych' : pct(p) + '%'}${note ? ' · ' + note : ''}`);
          cal += `<button type="button" class="${cls}" ${pre ? 'disabled' : ''} data-goto="${key(startOfWeek(d))}" data-day="${k}" style="--i:${idx}${p == null ? '' : `;--heat:${heat(p)}`}" aria-label="${tip}"><b>${d.getDate()}</b>${p == null ? '' : `<small>${pct(p)}%</small>`}</button>`;
        });
        el.cal.innerHTML = `<section class="panel">${cal}</div></section>`;
      }

      /* ---------- podsumowanie: wybór nawyku, potem tydzień albo miesiąc ---------- */
      let sumHabit = null, sumMode = 'week';
      const sumDates = () => sumMode === 'month' ? monthDays(monthStart) : weekDates();
      function renderSummary() {
        const t = todayKey(), box = el.sum;
        const h = habitsActive().find(x => x.id === sumHabit);
        if (!h) {
          sumHabit = null;
          box.innerHTML = `<div class="slist${animList ? ' enter' : ''}"><div class="grp later" style="padding-top:0">Wybierz nawyk</div>${habitsActive().map((x, i) => `<button type="button" class="sitem" data-sum-habit="${x.id}" style="--i:${i}"><b>${esc(x.name)}</b><small>${tgt(x)}</small><span aria-hidden="true">›</span></button>`).join('')}</div>`;
          return;
        }
        const dates = sumDates(), month = sumMode === 'month', first = dates[0], last = dates[dates.length - 1];
        const rng = month ? `${MONTHS_NOM[first.getMonth()]} ${first.getFullYear()}`
          : first.getMonth() === last.getMonth() ? `${first.getDate()}–${last.getDate()} ${MONTHS_GEN[last.getMonth()]}`
          : `${first.getDate()} ${MONTHS_GEN[first.getMonth()].slice(0, 3)} – ${last.getDate()} ${MONTHS_GEN[last.getMonth()].slice(0, 3)}`;
        const cls = p => p == null ? '' : p >= 0.8 ? 'good' : p >= 0.5 ? 'mid' : 'bad';
        const lbl = d => `<span class="${key(d) === t ? 't' : ''}">${month ? (d.getDate() === 1 || d.getDate() % 5 === 0 ? d.getDate() : '') : DAYS[dow(d)]}</span>`;
        const rows = dates.map(d => ({ d, s: status(h, d), v: getVal(h, key(d)) }));
        let head, chart;
        if (h.type === 'num') {
          const vals = rows.filter(r => !['off', 'pre', 'future', 'rest'].includes(r.s) && r.v != null).map(r => r.v);
          const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, p = avg == null ? null : avg / h.target;
          const scale = Math.max(h.target, ...vals, 0.0001) * 1.15;
          const bars = rows.map((r, j) => {
            if (['off', 'pre', 'rest'].includes(r.s)) return '<div class="sb none"><i></i></div>';
            if (r.s === 'future' || r.v == null) return `<div class="sb empty"><span>${r.s === 'future' ? '' : '–'}</span><i></i></div>`;
            return `<div class="sb ${r.v >= h.target ? 'hit' : 'low'}" style="--j:${j}"><span>${nf(r.v)}</span><i style="height:${Math.max(2, r.v / scale * 100)}%;background:${heat(Math.min(1, r.v / h.target))}"></i></div>`;
          }).join('');
          head = [avg == null ? 'brak wpisów' : `średnia <b>${nf(+avg.toFixed(2))} ${esc(h.unit)}</b>`, p];
          chart = `<div class="sbars${month ? ' m' : ''}" style="--n:${dates.length}">${bars}<em class="starget" style="bottom:${h.target / scale * 100}%"><span>cel ${nf(h.target)}</span></em></div><div class="sdays${month ? ' m' : ''}" style="--n:${dates.length}">${dates.map(lbl).join('')}</div>`;
        } else {
          const counted = rows.filter(r => ['done', 'miss', 'pending'].includes(r.s)), done = counted.filter(r => r.s === 'done').length;
          head = [counted.length ? `<b>${done} z ${counted.length}</b> ${counted.length === 1 ? 'dnia' : 'dni'}` : 'jeszcze nie zaczęte', counted.length ? done / counted.length : null];
          // tylko dni, w które nawyk obowiązuje (np. Pn, Śr, Pt); bez wyróżniania dzisiejszego dnia
          const cols = [...h.days].sort((x, y) => x - y), n = cols.length;
          let ci = 0;
          const cell = r => `<div class="sc ${r.s}" style="--j:${ci++}">${month ? `<b>${r.d.getDate()}</b>` : r.s === 'done' ? CHECK : r.s === 'miss' ? XMARK : ''}</div>`;
          const names = `<div class="sdays" style="--n:${n}">${cols.map(d => `<span>${DAYS[d]}</span>`).join('')}</div>`;
          if (month) {
            let cells = '';
            for (let ws = startOfWeek(first); ws <= last; ws = addDays(ws, 7)) cols.forEach(d => {
              const day = addDays(ws, d), r = day.getMonth() === first.getMonth() ? rows[day.getDate() - 1] : null;
              cells += r ? cell(r) : '<div class="sc blank"></div>';
            });
            chart = `${names}<div class="scells m" style="--n:${n}">${cells}</div>`;
          } else {
            chart = `<div class="scells" style="--n:${n}">${rows.filter(r => cols.includes(dow(r.d))).map(cell).join('')}</div>${names}`;
          }
        }
        // rekord serii i najsłabszy dzień tygodnia
        const bs = bestStreak(h).best, wd = weakestDay(h);
        const chips = bs || wd >= 0 ? `<div class="schips">${bs ? `<span class="schip rec">${FLAME}rekord ${bs}</span>` : ''}${wd >= 0 ? `<span class="schip weak">najsłabszy: ${DAYS_FULL[wd].toLowerCase()}</span>` : ''}</div>` : '';
        const enter = slideDir ? (slideDir > 0 ? ' enter slide-l' : ' enter slide-r') : animList ? ' enter' : '';
        box.innerHTML = `<div class="sbar"><button type="button" class="spick" data-sum-pick aria-label="Zmień nawyk"><b>${esc(h.name)}</b><span aria-hidden="true">▾</span></button>
            <div class="seg smode" role="group" aria-label="Okres" style="--n:2;--i:${month ? 1 : 0}"><button type="button" class="seg-b" data-sum-mode="week" aria-selected="${!month}">Tydzień</button><button type="button" class="seg-b" data-sum-mode="month" aria-selected="${month}">Miesiąc</button></div></div>
          <div class="snav">${navBtn(-1)}<b>${rng}</b>${navBtn(1)}</div>
          <article class="scard${enter}"><header><div><h3>${esc(h.name)}</h3><small>${head[0]}</small></div><strong class="${cls(head[1])}">${head[1] == null ? '—' : pct(head[1]) + '%'}</strong></header>${chart}${chips}</article>`;
      }

      /* ---------- render ---------- */
      // Płynne przeliczanie dużego procentu (zamiast skoku liczby).
      let shownPct = null, pctRaf = 0, pctEnd = 0;
      function showPct(v) {
        const e = el.pct; cancelAnimationFrame(pctRaf); clearTimeout(pctEnd);
        el.meter.style.width = (v == null ? 0 : v) + '%';
        el.meter.classList.toggle('full', v === 100);
        if (v == null) { e.textContent = '—'; shownPct = null; return; }
        const from = shownPct ?? v, t0 = performance.now(), dur = 600;
        shownPct = v;
        if (document.hidden || from === v || calm()) { e.textContent = v + '%'; return; }
        const tick = now => {
          const k = Math.min(1, (now - t0) / dur), ez = 1 - Math.pow(1 - k, 3);
          e.textContent = Math.round(from + (v - from) * ez) + '%';
          if (k < 1) pctRaf = requestAnimationFrame(tick);
        };
        tick(t0);
        pctEnd = setTimeout(() => { cancelAnimationFrame(pctRaf); e.textContent = v + '%'; }, dur + 50); // zapas, gdy karta w tle wstrzyma klatki
      }
      let lastView = view;
      function render() {
        const mobile = isMobile();
        if (mobile) weekStart = startOfWeek(selDay);
        const dates = weekDates(), t = todayKey(), end = dates[6];
        const shown = mobile ? [selDay] : dates;
        const sameMonth = dates[0].getMonth() === end.getMonth();
        const range = sameMonth
          ? `${dates[0].getDate()}–${end.getDate()} ${MONTHS_GEN[end.getMonth()]} ${end.getFullYear()}`
          : `${dates[0].getDate()} ${MONTHS_GEN[dates[0].getMonth()]} – ${end.getDate()} ${MONTHS_GEN[end.getMonth()]} ${end.getFullYear()}`;
        // „Dziś” tylko wtedy, gdy oglądasz coś innego niż teraz: inny tydzień (komputer), inny dzień (telefon), inny miesiąc (kalendarz).
        const now = new Date();
        const atNow = view === 'calendar' ? key(monthStart) === key(monthOf(now))
          : view === 'summary' ? (sumMode === 'month' ? key(monthStart) === key(monthOf(now)) : key(weekStart) === key(startOfWeek(now)))
          : mobile ? key(selDay) === key(now) : key(weekStart) === key(startOfWeek(now));
        el.now.hidden = atNow;
        const vi = VIEWS.indexOf(view);
        el.views.style.setProperty('--i', vi);
        el.views.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view));
        el.week.hidden = view !== 'week';
        el.cal.hidden = view !== 'calendar';
        el.sum.hidden = view !== 'summary';
        el.add.hidden = view !== 'week'; // nawyki dodaje się tylko w widoku tygodnia
        if (view === 'calendar') {
          const m = monthPct(monthStart);
          el.range.textContent = `${MONTHS_NOM[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
          el.range.hidden = false;
          showPct(m == null ? null : pct(m));
          el.today.textContent = 'miesiąc';
        } else if (view === 'summary') {
          const w = periodPct(sumDates().filter(d => key(d) <= t));
          el.range.textContent = sumMode === 'month' ? MONTHS_NOM[monthStart.getMonth()] + ' ' + monthStart.getFullYear() : range;
          el.range.hidden = false;
          showPct(w == null ? null : pct(w));
          el.today.textContent = sumMode === 'month' ? 'miesiąc' : 'tydzień';
        } else {
          el.range.textContent = range;
          el.range.hidden = mobile; // na telefonie bez zakresu tygodnia u góry
          // Duży procent liczy jeden dzień: na telefonie oglądany, na komputerze dzisiejszy.
          const day = mobile ? selDay : dayOnly(new Date());
          const dp = dayPct(day), [a, b] = dayDone(day);
          showPct(dp == null ? (key(day) > t || breakAt(key(day)) ? null : 0) : pct(dp)); // przerwa: bez procentu
          const hv = dp == null ? null : pct(dp);
          if (userAct && hero.k === key(day) && hero.v != null && hero.v < 100 && hv === 100) party = true;
          if (hv !== 100) partyLater = false;
          hero = { k: key(day), v: hv };
          el.today.innerHTML = `<em>${a}/${b}</em> ${key(day) === t ? 'dziś' : 'tego dnia'}`;
        }

        el.days.classList.toggle('single', mobile);
        el.days.innerHTML = mobile
          ? `${navBtn(-1)}<div class="dayname${key(selDay) === t ? ' t' : ''}">${DAYS_FULL[dow(selDay)]}<em>, ${selDay.getDate()} ${MONTHS_GEN[selDay.getMonth()]}</em></div>${navBtn(1)}`
          : `<span class="lbl">${navBtn(-1)}</span><div class="o-track">${dates.map(d => { const k = key(d), n = noteOf(k); return `<span class="${k === t ? 't' : ''}"><button type="button" class="dh${n ? ' has-note' : ''}" data-note="${k}" aria-label="Notatka: ${DAYS_FULL[dow(d)]} ${d.getDate()}">${DAYS[dow(d)]}<em>${d.getDate()}</em></button></span>`; }).join('')}</div><span class="sp">${navBtn(1)}</span>`;

        const hs = habitsActive();
        el.empty.hidden = hs.length > 0;
        el.days.hidden = hs.length === 0;
        el.views.hidden = hs.length === 0;
        const noteBox = el.note;
        noteBox.hidden = !mobile || !hs.length;
        if (!noteBox.hidden && !document.activeElement?.classList.contains('hb-note-in')) {
          noteBox.innerHTML = `<input class="hb-note-in" type="text" maxlength="140" placeholder="Notatka do dnia" autocomplete="off" aria-label="Notatka do dnia" value="${esc(noteOf(key(selDay)))}" data-k="${key(selDay)}">`;
        }
        if (!hs.length) {
          el.empty.innerHTML = `<span class="hb-empty-ic" aria-hidden="true">${PLUS}</span>Nie masz jeszcze nawyków.<br>Kliknij „Dodaj”, żeby dodać pierwszy.`;
          el.add.hidden = false;
          list.innerHTML = '';
          el.cal.innerHTML = '';
          el.sum.innerHTML = '';
          el.sum.hidden = true; el.cal.hidden = true;
          el.week.hidden = false;
          renderTimerCard();
          animList = false; slideDir = 0; justCell = null;
          return;
        }
        if (view === 'calendar') renderCalendar();
        if (view === 'summary') renderSummary();
        // Najpierw nawyki zaplanowane na dzień odniesienia, potem pozostałe (kolejność w grupach bez zmian).
        // Telefon: wybrany dzień. Komputer: dziś, jeśli oglądany tydzień go zawiera; w innych tygodniach bez sortowania.
        // Nawyki „nie dziś” zawsze na końcu, za linią. Pora dnia to tylko etykieta na kafelku.
        // Nawyki dodane po oglądanym tygodniu (telefon: po wybranym dniu) trafiają na sam dół do sekcji „Dodane później”.
        const ref = mobile ? selDay : (key(dates[0]) <= t && t <= key(end) ? fromKey(t) : null);
        // Jednorazowe pokazują się tylko w okresie, w którym wypadają. Nawyki, które zaczynają się w przyszłości (i jednorazowe na później),
        // czekają w sekcji „Zaplanowane” — widocznej w bieżącym i przyszłych okresach, posortowanej po dacie.
        const r0 = key(mobile ? selDay : dates[0]), r1 = key(mobile ? selDay : end);
        const isPlanned = h => h.created > r1 && h.created > t && r1 >= t;
        const listed = hs.filter(h => !h.once || (h.once >= r0 && h.once <= r1) || isPlanned(h));
        const isLater = h => h.created > r1;
        const isOff = h => ref && status(h, ref) === 'off';
        const cur = listed.filter(h => !isLater(h));
        const planned = listed.filter(isPlanned).sort((a, b) => a.created < b.created ? -1 : a.created > b.created ? 1 : 0);
        const later = listed.filter(h => isLater(h) && !isPlanned(h));
        const onList = cur.filter(h => !isOff(h)), offList = cur.filter(isOff);
        // Zaległe z wczoraj: tylko nawyki tak/nie, które nie są codzienne, niezrobione i nieodpuszczone. Telefon: osobna sekcja na górze
        // dzisiejszego dnia; komputer: plakietka przy nazwie. Sięgają dwa dni wstecz: wczorajsze pomarańczowe, przedwczorajsze crimson.
        const showOverdue = mobile ? key(selDay) === t : key(dates[0]) <= t && t <= key(end);
        // nawyk ma już kolejny termin między tamtym dniem a dziś (np. siłownia pn i wt) — wtedy zaległość traci sens
        const nextDue = (h, age) => { for (let i = age - 1; i >= 0; i--) if (h.days.includes(dow(addDays(dayOnly(new Date()), -i)))) return true; return false; };
        const overdue = [], skipped = []; // skipped: odpuszczone krzyżykiem, do przywrócenia z dołu listy
        if (showOverdue) for (const age of [2, 1]) {
          const d = addDays(dayOnly(new Date()), -age), k = key(d);
          hs.forEach(h => { if (h.type !== 'num' && !h.freq && h.days.length < 7 && !nextDue(h, age) && ['miss', 'part'].includes(status(h, d))) (state.skips[h.id + '|' + k] ? skipped : overdue).push({ h, d, k, age }); });
        }
        let rowIdx = 0;
        const brk = breakAt(key(mobile ? selDay : dayOnly(new Date())));
        let html = mobile && overdue.length ? `<div class="grp later od-h" data-fk="g:od">Zaległe</div>` + overdue.map(odRowHtml).join('') + `<div class="grp sep" data-fk="g:od-sep"></div>` : '';
        if (brk) html = `<div class="break-card" data-fk="g:break" style="--i:0"><div class="bk-sea" aria-hidden="true">${SEA_SVG}<i class="bk-boat">${BOAT}</i></div><div class="bk-txt"><b>Przerwa</b><small>do ${fromKey(brk.to).getDate()} ${MONTHS_GEN[fromKey(brk.to).getMonth()]}</small></div><button type="button" class="bk-end" data-break-open>Zmień</button></div>` + html;
        html += onList.map(rowHtml).join('');
        if (offList.length) html += (onList.length ? `<div class="grp sep" data-fk="g:off-sep"></div>` : '') + offList.map(rowHtml).join('');
        if (later.length) html += `<div class="grp later" data-fk="g:later">Dodane później</div>` + later.map(rowHtml).join('');
        if (planned.length) html += `<div class="grp later" data-fk="g:planned">Zaplanowane</div>` + planned.map(rowHtml).join('');
        if (mobile && skipped.length) html += `<div class="grp later" data-fk="g:sk">Odpuszczone</div>` + skipped.map(skRowHtml).join('');
        const vw = el.week;
        // „Dzień dobry”: przy pierwszym otwarciu danego dnia kafelki wjeżdżają z odbiciem, zaległe migają swoim kolorem
        let hello = false;
        if (view === 'week' && ctx.active && ctx.cloud.user) { try { hello = localStorage.getItem(HELLO_KEY) !== t; if (hello) localStorage.setItem(HELLO_KEY, t); } catch (_) { } }
        vw.classList.remove('slide-l', 'slide-r'); list.classList.remove('enter', 'hello');
        if (slideDir || animList || hello) void vw.offsetWidth; // wymusza restart animacji
        if (hello) list.classList.add('hello'); else if (slideDir) vw.classList.add(slideDir > 0 ? 'slide-l' : 'slide-r'); else if (animList) list.classList.add('enter');
        list.innerHTML = html;
        afterList(list);
        // zmiana widoku (Tydzień / Kalendarz / Podsumowanie): nowy widok wsuwa się z kierunku przełącznika
        if (viewDir && !calm()) {
          const v = view === 'week' ? el.week : view === 'calendar' ? el.cal : el.sum;
          v.animate([{ opacity: 0, transform: `translateX(${viewDir * 36}px)`, filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
        animList = false; slideDir = 0; justCell = null; viewDir = 0; lastView = view;
        renderTimerCard();

        function odRowHtml({ h, d, k, age }) {
          const idx = rowIdx++, s = status(h, d), v = getVal(h, k), yKey = k, when = age === 2 ? 'przedwczoraj' : 'wczoraj';
          const sub = h.type === 'num' ? `${v == null ? 0 : nf(v)} / ${nf(h.target)} ${esc(h.unit)}` : 'nie zrobione';
          return `<div class="o-row od${age === 2 ? ' old' : ''}" data-fk="od:${h.id}|${k}" style="--i:${idx}"><div class="name"><div class="nt"><b><span class="nm">${esc(h.name)}</span><span class="odtag">z ${when}</span></b><small>${sub}</small></div></div><div class="o-track"><button type="button" class="ob ${s}" data-h="${h.id}" data-k="${yKey}" data-od aria-label="Nadrób: ${esc(h.name)}, ${when}"><span class="c ${s}"${h.type === 'num' ? ` data-lv="${h.id}|${k}"` : ''} style="--p:${pct(prog(h, v))};--lv:${waterLevel(prog(h, v))}">${s === 'part' ? WATER : ''}</span></button></div><div class="rmenu"><button type="button" class="dots odx" data-skip="${h.id}|${yKey}" aria-label="Odpuść: ${esc(h.name)}">${XMARK}</button></div></div>`;
        }
        function skRowHtml({ h, k, age }) {
          const idx = rowIdx++, when = age === 2 ? 'przedwczoraj' : 'wczoraj';
          return `<div class="o-row od sk${age === 2 ? ' old' : ''}" data-fk="od:${h.id}|${k}" style="--i:${idx}"><div class="name"><div class="nt"><b><span class="nm">${esc(h.name)}</span><span class="odtag">z ${when}</span></b></div></div><div class="o-track"></div><div class="rmenu"><button type="button" class="dots odr" data-unskip="${h.id}|${k}" aria-label="Przywróć: ${esc(h.name)}, ${when}">${UNDO}</button></div></div>`;
        }
        function rowHtml(h) {
          const idx = rowIdx++;
          const cells = shown.map((d, i) => {
            const s = status(h, d), v = getVal(h, key(d));
            // łańcuch: zrobiony dzień połączony linią z zrobionym następnym; nowe ogniwo dorysowuje się od strony świeżo odhaczonego dnia
            const nd = !mobile && s === 'done' && shown[i + 1] && status(h, shown[i + 1]) === 'done' ? shown[i + 1] : null;
            const lnc = !nd ? '' : ' ln' + (justCell?.h === h.id ? justCell.k === key(d) ? ' ln-r' : justCell.k === key(nd) ? ' ln-l' : '' : '');
            const dis = s === 'future' || s === 'off' || s === 'pre' || s === 'rest';
            const lbl = `${h.name}, ${DAYS_FULL[dow(d)]} ${d.getDate()}: ${s === 'rest' ? 'przerwa' : s === 'off' ? 'poza planem' : s === 'pre' ? 'przed dodaniem' : s === 'future' ? 'przyszłość' : v == null ? 'brak wpisu' : fmt(h, v) + ' ' + (h.unit || '')}`;
            const just = justCell && justCell.h === h.id && justCell.k === key(d) ? ' just' : '';
            // nawyk-timer: zamiast kółka sam zegar (pierścień = postęp, kręcące się wskazówki = odlicza)
            if (h.clock) return `<button type="button" class="ob ck ${s} ${key(d) === t ? 'today' : ''}${lnc}" data-h="${h.id}" data-k="${key(d)}" data-clock ${dis ? 'disabled' : ''} aria-label="${esc(lbl)}"><span class="c ck ${s}${just}${timer && timer.hid === h.id && timer.k === key(d) ? ' run' : ''}" style="--p:${pct(prog(h, v))}">${CLOCK}</span></button>`;
            return `<button type="button" class="ob ${s} ${key(d) === t ? 'today' : ''}${lnc}" data-h="${h.id}" data-k="${key(d)}" ${dis ? 'disabled' : ''} aria-label="${esc(lbl)}"><span class="c ${s}${just}"${h.type === 'num' ? ` data-lv="${h.id}|${key(d)}"` : ''} style="--p:${pct(prog(h, v))};--lv:${waterLevel(prog(h, v))}">${s === 'done' ? CHECK : s === 'part' ? WATER : ''}</span></button>`;
          }).join('');
          const open = rowMenu === h.id;
          const acts = open
            ? `<div class="racts"><button type="button" class="ra edit" data-edit="${h.id}" aria-label="Edytuj ${esc(h.name)}">${PENCIL}</button><button type="button" class="ra del" data-del="${h.id}" aria-label="Usuń ${esc(h.name)}">${XMARK}</button></div>`
            : `<button type="button" class="dots" data-more="${h.id}" aria-label="Opcje: ${esc(h.name)}" aria-expanded="false">${DOTS}</button>`;
          // telefon: pod nazwą wpisana wartość dnia zamiast opisu celu; nawyk bez planu na ten dzień jest przygaszony
          let sub = tgt(h), off = false;
          if (mobile) {
            const s = status(h, selDay), v = getVal(h, key(selDay));
            off = s === 'off' || s === 'pre' || s === 'rest';
            if (s === 'off') sub = 'nie dziś';
            else if (s === 'rest') sub = 'przerwa';
            else if (h.freq) sub = `${weekDone(h, selDay, false)} / ${h.freq} w tym tygodniu`;
            else if (h.type === 'num') sub = `${v == null ? 0 : nf(v)} / ${nf(h.target)} ${esc(h.unit)}`;
          }
          // licznik czasu: dla nawyków w minutach, na dziś, dopóki cel nie jest zrobiony
          const tk = todayKey(), canTime = timeUnit(h) && (mobile ? key(selDay) === tk : true) && !['done', 'off', 'rest'].includes(status(h, fromKey(tk)));
          const running = timer && timer.hid === h.id;
          const odTag = mobile ? '' : overdue.filter(o => o.h === h).map(o => `<span class="odtag${o.age === 2 ? ' old' : ''}">${o.age === 2 ? 'przedwczoraj' : 'wczoraj'}</span>`).join('');
          if (isPlanned(h)) sub = h.once ? `${dayLabel(h.once)} · jednorazowo` : `od ${dayLabel(h.created)} · ${tgt(h)}`;
          if (running) sub = `<span data-timer-left>${fmtLeft(timerLeft())}</span> pozostało`;
          else if (canTime && h.type === 'bool' && spentOf(h, tk) > 0) sub = `${fmtLeft(timerNeed(h, tk))} pozostało`;
          const sk = streak(h);
          const tl = TIMES.find(([v]) => v === h.time)?.[1];
          const tod = tl ? `<span class="tod">${tl}</span>` : '';
          // płomień rośnie na progach 7 / 14 / 30 dni; w dniu przekroczenia progu rozbłyska
          const tier = sk >= 30 ? 3 : sk >= 14 ? 2 : sk >= 7 ? 1 : 0;
          const fresh = justCell && justCell.h === h.id && status(h, fromKey(justCell.k)) === 'done';
          const rec = fresh && sk >= 3 && sk > bestStreak(h).prior;
          if (rec) recordToast = `Nowy rekord serii: ${sk}`;
          const flare = fresh && ([7, 14, 30].includes(sk) || rec);
          const fire = sk >= 2 ? `<span class="streak${tier ? ' t' + tier : ''}${flare ? ' flare' : ''}" aria-label="Seria: ${sk}">${FLAME}${sk}</span>` : '';
          // telefon: zrobione dziś = kafelek podświetlony crimson
          const doneNow = mobile && status(h, selDay) === 'done';
          return `<div class="o-row${open ? ' menu-open' : ''}${off ? ' is-off' : ''}${doneNow ? ' is-done' : ''}" data-id="${h.id}" data-fk="h:${h.id}" style="--i:${idx}"><div class="name"><button type="button" class="grip" aria-label="Przenieś ${esc(h.name)}">${GRIP}</button><div class="nt"><b><span class="nm">${esc(h.name)}</span>${odTag}${tod}${fire}</b><small>${sub}</small></div></div><div class="o-track">${cells}</div><div class="rmenu">${acts}</div></div>`;
        }
      }

      // Zmiana dnia: podświetlenie i widok przechodzą same na nowy dzień (także o północy przy otwartej aplikacji).
      let lastToday = todayKey();
      function checkDayChange() {
        const now = todayKey();
        if (now === lastToday) return false;
        const prev = fromKey(lastToday);
        if (key(weekStart) === key(startOfWeek(prev))) weekStart = startOfWeek(new Date());
        if (key(selDay) === lastToday) selDay = dayOnly(new Date());
        if (key(monthStart) === key(monthOf(prev))) monthStart = monthOf(new Date());
        lastToday = now;
        render();
        return true;
      }
      function scheduleMidnight() {
        const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
        setTimeout(() => { checkDayChange(); scheduleMidnight(); }, next - now);
      }

      /* ---------- okienka (arkusz od dołu w warstwie sekcji) ---------- */
      let noteOpen = false;
      const curSheet = () => L('.sheet-ov:not(.out)');
      function openSheet(html) {
        const prev = curSheet();
        layer.querySelectorAll('.sheet-ov').forEach(x => x.remove());
        const tmp = document.createElement('div'); tmp.innerHTML = html;
        const ov = tmp.firstElementChild;
        if (prev) ov.classList.add('swap'); // podmiana okienka: bez ponownego przyciemniania tła
        layer.appendChild(ov);
        return ov;
      }
      function closeSheet(instant) {
        const ov = curSheet();
        edit = null;
        if (ov) {
          if (instant || calm()) ov.remove();
          else { ov.classList.add('out'); setTimeout(() => ov.remove(), 320); }
        }
        if (partyLater) { partyLater = false; setTimeout(celebrate, 160); }
        if (noteOpen) { noteOpen = false; render(); }
      }
      const close = () => closeSheet(false);
      const sheet = (title, sub, body, label) => `<div class="sheet-ov hb-ov" data-close><div class="sheet hb-sheet" role="dialog" aria-modal="true" aria-label="${esc(label || title)}"><div class="sheet-h"><div><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ''}</div><button type="button" class="icon-btn x" data-close aria-label="Zamknij">${XMARK}</button></div><div class="sheet-b">${body}</div></div></div>`;
      const dateLabel = k => { const d = fromKey(k); return `${DAYS_FULL[dow(d)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };

      function openEditor(hid, k) { edit = { hid, k }; drawEditor(); }
      function openNote(k) {
        noteOpen = true;
        openSheet(sheet(dateLabel(k), '', `<div class="field"><textarea id="hb-note-text" maxlength="140" rows="3" placeholder="Notatka" aria-label="Notatka">${esc(noteOf(k))}</textarea></div><button type="button" class="btn btn-primary btn-block" data-close>Gotowe</button>`, 'Notatka'));
        const ta = L('#hb-note-text');
        ta.addEventListener('input', () => setNote(k, ta.value));
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      }
      function drawEditor() {
        const h = state.habits.find(x => x.id === edit.hid), k = edit.k, v = getVal(h, k);
        let body;
        if (h.type === 'num') {
          const p = prog(h, v);
          const w = v => Math.max(1, String(v ?? '').length); // szerokość pola = liczba znaków, żeby jednostka stała tuż za liczbą
          body = `<div class="ed-val"><button type="button" data-ed="-" aria-label="Mniej">−</button><label class="ed-num" for="hb-ed-input"><input id="hb-ed-input" type="number" inputmode="decimal" step="${h.step}" min="0" value="${v || ''}" placeholder="0" aria-label="Wartość" style="width:${w(v || '')}ch">${h.unit ? `<span class="ed-u">${esc(h.unit)}</span>` : ''}</label><button type="button" data-ed="+" aria-label="Więcej">+</button></div><div class="prog"><i class="${p >= 1 ? 'full' : ''}" style="width:${p * 100}%"></i></div><div class="chips"><button type="button" class="chip" data-ed="target">Cel: ${nf(h.target)}${h.unit ? ' ' + esc(h.unit) : ''}</button></div>`;
        } else {
          body = `<div class="yn"><button type="button" data-ed="yes" class="${v === 1 ? 'sel-done' : ''}">Zrobione</button><button type="button" data-ed="no" class="${v === 0 ? 'sel-miss' : ''}">Nie zrobione</button></div><div class="chips"><button type="button" class="chip" data-ed="clear">Wyczyść wpis</button></div>`;
        }
        const ex = curSheet();
        const html = sheet(esc(h.name), dateLabel(k), body + `<button type="button" class="btn btn-primary btn-block" data-close>Gotowe</button>`, 'Edycja wpisu');
        // ponowne rysowanie otwartego edytora: tylko treść, bez animacji wejścia
        if (ex && ex.dataset.ed === edit.hid + '|' + k) { const tmp = document.createElement('div'); tmp.innerHTML = html; ex.querySelector('.sheet-b').replaceWith(tmp.querySelector('.sheet-b')); }
        else openSheet(html).dataset.ed = edit.hid + '|' + k;
        const inp = L('#hb-ed-input');
        if (inp) {
          inp.addEventListener('input', () => {
            // bez zer na początku: „07” → „7”; samo zero zostaje, ale na szaro
            const clean = inp.value.replace(/^0+(?=\d)/, '');
            if (clean !== inp.value) inp.value = clean;
            inp.classList.toggle('zero', !(parseFloat(inp.value.replace(',', '.')) > 0));
            inp.style.width = Math.max(1, inp.value.length) + 'ch';
            const n = parseFloat(inp.value.replace(',', '.'));
            setVal(h, k, isNaN(n) ? null : Math.max(0, n)); render();
            syncEditor(h, k, false);
          });
        }
      }
      // Odświeża otwarty edytor w miejscu (liczba, szerokość pola, pasek), bez przebudowy okienka.
      function syncEditor(h, k, setInput = true) {
        const v = getVal(h, k), inp = L('#hb-ed-input'), bar = L('.prog i');
        if (inp && setInput) {
          inp.value = v || ''; inp.style.width = Math.max(1, String(v || '').length) + 'ch'; inp.classList.remove('zero');
          if (!calm()) inp.animate({ transform: ['scale(1.12)', 'scale(1)'] }, { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        }
        if (bar) { const p = prog(h, v); bar.style.width = p * 100 + '%'; bar.classList.toggle('full', p >= 1); }
      }
      layer.addEventListener('click', e => {
        if (e.target.hasAttribute('data-close') || e.target.closest('.x[data-close], .btn[data-close]')) { close(); return; }
        const b = e.target.closest('[data-ed]'); if (!b || !edit) return;
        const h = state.habits.find(x => x.id === edit.hid), k = edit.k, a = b.dataset.ed, v = getVal(h, k) || 0;
        const map = { '+': +(v + h.step).toFixed(2), '-': Math.max(0, +(v - h.step).toFixed(2)), clear: null, target: h.target, yes: 1, no: 0 };
        setVal(h, k, map[a]);
        if (h.type === 'bool') { justCell = { h: h.id, k }; render(); if (a !== 'clear') close(); else drawEditor(); return; }
        render();
        syncEditor(h, k);
      });

      // Przełącznik z pigułką (radio): pigułka jedzie pod zaznaczoną opcję.
      const segSync = f => f.querySelectorAll('.hb-rseg').forEach(s => { const ls = [...s.querySelectorAll('label')]; s.style.setProperty('--i', Math.max(0, ls.findIndex(l => l.querySelector('input:checked')))); });
      const rseg = (name, opts, cur) => `<div class="seg hb-rseg" style="--n:${opts.length}">${opts.map(([v, l, id]) => `<label><input type="radio" name="${name}" ${id ? `id="${id}"` : ''} value="${v}" ${cur === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
      function openHabitForm(hid) {
        const h = hid ? state.habits.find(x => x.id === hid) : null;
        const days = h ? h.days : [];
        const today = todayKey(), onceMax = key(addMonths(dayOnly(new Date()), 6));
        const kind = !h ? 'bool' : h.clock ? 'timer' : h.type;
        const plan = h?.once ? 'once' : h?.freq ? 'freq' : 'days';
        const body = `<form class="hb-form" novalidate>
          <div class="field"><label for="hb-f-name">Nazwa</label><input id="hb-f-name" type="text" required maxlength="30" autocomplete="off" value="${h ? esc(h.name) : ''}"></div>
          <div class="field"><span class="lab">Rodzaj</span>${rseg('f-type', [['bool', 'Tak / nie'], ['num', 'Liczbowy'], ['timer', 'Timer']], kind)}</div>
          <div class="row3 hb-fx" data-f="num"><div class="field"><label for="hb-f-target">Cel dzienny</label><input id="hb-f-target" type="number" min="0.01" step="any" inputmode="decimal" value="${h && !h.clock ? h.target ?? '' : ''}"></div><div class="field"><label for="hb-f-unit">Jednostka</label><input id="hb-f-unit" type="text" value="${h && !h.clock ? esc(h.unit) : ''}" maxlength="10"></div><div class="field"><label for="hb-f-step">Krok +/−</label><input id="hb-f-step" type="number" min="0.01" step="any" inputmode="decimal" value="${h && !h.clock ? h.step ?? 1 : 1}"></div></div>
          <div class="field hb-fx" data-f="timer"><label for="hb-f-min">Minut dziennie</label><input id="hb-f-min" type="number" min="1" step="1" inputmode="numeric" value="${h?.clock ? h.target : ''}"></div>
          <div class="field"><span class="lab">Plan</span>${rseg('f-plan', [['days', 'Wybrane dni'], ['freq', 'X× w tyg.'], ['once', 'Jednorazowo']], plan)}</div>
          <div class="field hb-fx" data-f="freq">${rseg('f-freq', [1, 2, 3, 4, 5, 6].map(n => [String(n), n + '×']), String(h?.freq || 3))}</div>
          <div class="field hb-fx" data-f="days"><div class="daypick" role="group" aria-label="Dni nawyku">${DAYS.map((d, i) => `<label><input type="checkbox" value="${i}" ${days.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div><button type="button" class="chip allweek" data-all>Cały tydzień</button></div>
          <div class="field hb-fx" data-f="start"><label for="hb-f-start">Od kiedy</label><input id="hb-f-start" type="date" value="${h && !h.once ? h.created : today}" ${h ? '' : `min="${today}"`}></div>
          <div class="field hb-fx" data-f="once"><label for="hb-f-once">Dzień (do 6 miesięcy naprzód)</label><input id="hb-f-once" type="date" value="${h?.once || ''}" min="${today}" max="${onceMax}"></div>
          <div class="field"><span class="lab">Pora</span>${rseg('f-time', [['', '—'], ...TIMES], h?.time || '')}</div>
          <button class="btn btn-primary btn-block" type="submit">${h ? 'Zapisz' : 'Dodaj'}</button>
          ${h ? `<button class="btn btn-danger btn-block" type="button" data-f-delete>Usuń nawyk</button>` : ''}
        </form>`;
        openSheet(sheet(h ? 'Edytuj nawyk' : 'Nowy nawyk', '', body));
        const f = L('.hb-form'), q = s => f.querySelector(s);
        const show = (name, on) => {
          const x = q(`[data-f="${name}"]`); if (!x || x.hidden === !on) return;
          x.hidden = !on;
          if (on && !calm()) x.animate({ opacity: [0, 1], transform: ['translateY(-6px)', 'none'] }, { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
        };
        const sync = () => {
          const tp = q('input[name="f-type"]:checked').value;
          show('num', tp === 'num'); show('timer', tp === 'timer');
          const pl = q('input[name="f-plan"]:checked').value;
          show('freq', pl === 'freq'); show('days', pl === 'days');
          show('start', pl !== 'once'); show('once', pl === 'once');
          segSync(f);
        };
        f.querySelectorAll('.hb-fx').forEach(x => { x.hidden = true; });
        f.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener('change', sync));
        // pierwsze ustawienie bez animacji
        const tp0 = q('input[name="f-type"]:checked').value, pl0 = q('input[name="f-plan"]:checked').value;
        q('[data-f="num"]').hidden = tp0 !== 'num'; q('[data-f="timer"]').hidden = tp0 !== 'timer';
        q('[data-f="freq"]').hidden = pl0 !== 'freq'; q('[data-f="days"]').hidden = pl0 !== 'days';
        q('[data-f="start"]').hidden = pl0 === 'once'; q('[data-f="once"]').hidden = pl0 !== 'once';
        segSync(f);
        q('[data-all]').addEventListener('click', () => f.querySelectorAll('.daypick input').forEach(x => { x.checked = true; }));
        f.addEventListener('submit', e => {
          e.preventDefault();
          const name = q('#hb-f-name').value.trim(); if (!name) { toast('Podaj nazwę'); q('#hb-f-name').focus(); return; }
          const kind = q('input[name="f-type"]:checked').value, isTimer = kind === 'timer', type = isTimer ? 'num' : kind;
          const mins = parseFloat(q('#hb-f-min').value);
          if (isTimer && !(mins > 0)) { toast('Podaj minuty'); q('#hb-f-min').focus(); return; }
          const plan = q('input[name="f-plan"]:checked').value, freqOn = plan === 'freq';
          const freq = freqOn ? +q('input[name="f-freq"]:checked').value : 0;
          // jednorazowy: jeden dzień, od dziś do 6 miesięcy naprzód; pozostałe plany: data startu (może być w przyszłości)
          const once = plan === 'once' ? q('#hb-f-once').value : '';
          if (plan === 'once' && once !== h?.once && !(once >= today && once <= onceMax)) { toast(once ? 'Wybierz dzień od dziś do 6 miesięcy naprzód' : 'Wybierz dzień'); q('#hb-f-once').focus(); return; }
          const start = q('#hb-f-start').value || (h && !h.once ? h.created : today);
          if (plan !== 'once' && !h && start < today) { toast('Start nie może być w przeszłości'); q('#hb-f-start').focus(); return; }
          const sel = once ? [dow(fromKey(once))] : freqOn ? [...ALL] : [...f.querySelectorAll('.daypick input:checked')].map(x => +x.value);
          if (!sel.length) { toast('Wybierz przynajmniej jeden dzień'); return; }
          const rawTarget = parseFloat(q('#hb-f-target').value);
          if (kind === 'num' && !(rawTarget > 0)) { toast('Podaj cel dzienny'); q('#hb-f-target').focus(); return; }
          const target = Math.max(0.01, rawTarget || 1);
          const step = Math.max(0.01, parseFloat(q('#hb-f-step').value) || 1);
          const unit = q('#hb-f-unit').value.trim();
          const time = q('input[name="f-time"]:checked')?.value || '';
          // nawyk obowiązuje od daty startu (domyślnie dziś); jednorazowy — tylko w swoim dniu
          const target_ = h || { id: 'h' + Date.now().toString(36) };
          target_.created = once || start;
          if (once) target_.once = once; else delete target_.once;
          Object.assign(target_, isTimer ? { name, type, target: Math.round(mins), step: 5, unit: 'min', days: sel, timer: 'min', clock: true } : { name, type, target, step, unit, days: sel, timer: '' });
          if (!isTimer) delete target_.clock;
          delete target_.dur;
          if (freq) target_.freq = freq; else delete target_.freq;
          if (time) target_.time = time; else delete target_.time;
          if (!h) state.habits.push(target_);
          save(); close(); if (h) render(); else renderSmooth();
          toast(h ? 'Zapisano' : target_.created > today ? `Zaplanowano „${name}” na ${dayLabel(target_.created)}` : `Dodano „${name}”`);
        });
        const del = q('[data-f-delete]');
        if (del) del.addEventListener('click', () => confirmDelete(h.id));
        if (!h && !isMobile()) q('#hb-f-name').focus();
      }

      function confirmDelete(hid) {
        const h = state.habits.find(x => x.id === hid); if (!h) return;
        openSheet(sheet('Usunąć nawyk?', esc(h.name), `<div class="confirm"><button type="button" class="btn btn-ghost" data-close>Anuluj</button><button type="button" class="btn btn-primary" data-confirm-del>Usuń</button></div>`));
        L('[data-confirm-del]').addEventListener('click', () => {
          const row = list.querySelector(`.o-row[data-id="${CSS.escape(h.id)}"]`);
          let gone = false;
          const go = () => { if (gone) return; gone = true; state.habits =state.habits.filter(x => x.id !== h.id); delete state.entries[h.id]; Object.keys(state.skips).forEach(k => { if (k.startsWith(h.id + '|')) delete state.skips[k]; }); save(); renderSmooth(); };
          close();
          // kafelek odjeżdża w bok i znika, reszta płynnie się zsuwa
          if (row && !calm()) { row.animate({ opacity: [1, 0], transform: ['none', 'translateX(-40px) scale(.96)'] }, { duration: 260, easing: 'ease-in', fill: 'forwards' }).onfinish = go; setTimeout(go, 340); } // zapas, gdy karta w tle wstrzyma animacje
          else go();
        });
      }

      // Przerwa (urlop, choroba): od–do. W tym czasie nawyki się nie liczą, seria się nie zrywa, nie ma zaległości.
      function openBreak() {
        const t = todayKey();
        const lbl = k => { const d = fromKey(k); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
        const upcoming = Object.entries(state.breaks).filter(([, b]) => b.to >= t).sort((a, b) => a[1].from.localeCompare(b[1].from));
        const items = upcoming.map(([id, b]) => {
          const now = b.from <= t;
          return `<div class="brk-item${now ? ' now' : ''}"><span>${lbl(b.from)} – ${lbl(b.to)}</span>${now
            ? `<button type="button" class="end" data-brk-end="${id}">Zakończ</button>`
            : `<button type="button" class="dots" data-brk-del="${id}" aria-label="Usuń przerwę">${XMARK}</button>`}</div>`;
        }).join('');
        openSheet(sheet('Przerwa', 'Urlop albo choroba: nawyki się nie liczą, seria się nie zrywa', `${items ? `<div class="brk-list">${items}</div>` : ''}
          <div class="row2"><div class="field"><label for="hb-b-from">Od</label><input id="hb-b-from" type="date" value="${t}"></div><div class="field"><label for="hb-b-to">Do</label><input id="hb-b-to" type="date" value="${key(addDays(fromKey(t), 6))}"></div></div>
          <div class="bk-quick">${[[3, '3 dni'], [7, 'Tydzień'], [14, '2 tygodnie']].map(([n, l]) => `<button type="button" class="chip" data-brk-len="${n}">${l}</button>`).join('')}</div>
          <button type="button" class="btn btn-primary btn-block" data-b-save>Zacznij przerwę</button>`, 'Przerwa'));
        const done = () => { save(); close(); animList = true; render(); };
        layer.querySelectorAll('[data-brk-len]').forEach(b => b.addEventListener('click', () => {
          const from = L('#hb-b-from').value || t;
          L('#hb-b-to').value = key(addDays(fromKey(from), +b.dataset.brkLen - 1));
        }));
        layer.querySelectorAll('[data-brk-del]').forEach(b => b.addEventListener('click', () => { delete state.breaks[b.dataset.brkDel]; done(); }));
        // zakończenie trwającej przerwy: minione dni zostają wolne, od dziś nawyki znów się liczą
        layer.querySelectorAll('[data-brk-end]').forEach(b => b.addEventListener('click', () => {
          const br = state.breaks[b.dataset.brkEnd], y = key(addDays(fromKey(t), -1));
          if (br.from > y) delete state.breaks[b.dataset.brkEnd]; else state.breaks[b.dataset.brkEnd] = { ...br, to: y };
          done();
        }));
        L('[data-b-save]').addEventListener('click', () => {
          const from = L('#hb-b-from').value, to = L('#hb-b-to').value;
          if (!from || !to || to < from) { toast('Sprawdź daty'); return; }
          state.breaks['b' + Date.now().toString(36)] = { from, to };
          done();
        });
      }

      /* ---------- licznik czasu (działa po wyjściu z aplikacji: liczy od zapisanej godziny startu) ---------- */
      const readTimer = () => { try { return JSON.parse(localStorage.getItem(TIMER_KEY)); } catch (_) { return null; } };
      let timer = readTimer(), timerInt = null;
      const timerOf = h => h.clock ? 'min' : '';
      const timeUnit = h => { const t = timerOf(h); return t === 'min' ? 60 : t === 'h' ? 3600 : 0; };
      const timerGoal = h => h.target;
      const timerLeft = () => timer ? Math.max(0, timer.seconds - (Date.now() - timer.startedAt) / 1000) : 0;
      const fmtLeft = sec => { const s = Math.ceil(sec), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return (hh ? hh + ':' + pad(mm) : mm) + ':' + pad(ss); };
      const spentOf = (h, k) => state.spent[h.id + '|' + k] || 0;
      const timerNeed = (h, k) => Math.round((timerGoal(h) - (h.type === 'bool' ? 0 : getVal(h, k) || 0)) * timeUnit(h) - spentOf(h, k));
      let timerCard = null; // id nawyku, którego zatrzymany timer wciąż widać w okienku
      let cardRun = null;    // poprzedni stan okienka (odliczanie / pauza) — do animacji przełączenia
      const timerFull = h => timerGoal(h) * timeUnit(h);
      function startTimer(h) {
        if (timer) stopTimer(false, false);
        timerCard = null;
        const k = todayKey(), unit = timeUnit(h), base = h.type === 'bool' ? 0 : getVal(h, k) || 0, need = timerNeed(h, k);
        if (!unit || need <= 0) return;
        timer = { hid: h.id, k, startedAt: Date.now(), seconds: need, base, unit };
        try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch (_) { }
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { });
        render(); tickTimer(true);
      }
      // finish=true: cel osiągnięty; false: stop wcześniej — dopisuje przeliczony czas
      // keep: po zatrzymaniu okienko zostaje z zapamiętanym czasem (zamyka je tylko ×)
      function stopTimer(finish, keep = true) {
        if (!timer) return;
        const t = timer; timer = null; clearInterval(timerInt); timerInt = null;
        try { localStorage.removeItem(TIMER_KEY); } catch (_) { }
        const h = state.habits.find(x => x.id === t.hid); if (!h) { render(); return; }
        if (finish) {
          delete state.spent[h.id + '|' + t.k];
          setVal(h, t.k, h.type === 'bool' ? 1 : h.target); justCell = { h: h.id, k: t.k }; timerDone = h.id;
          ctx.vibrate([80, 60, 80]);
          toast(`${h.name}: zrobione`);
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) { try { new Notification('Grochu life', { body: `${h.name}: czas minął — zrobione ✓`, icon: 'icons/icon-192.png' }); } catch (_) { } }
        } else {
          // Stop = pauza: kolejny start liczy od miejsca zatrzymania. Liczbowy: pełne minuty (godziny: co 0,01 h) dopisują się do wartości.
          const sk = h.id + '|' + t.k, total = Math.min(t.seconds, (Date.now() - t.startedAt) / 1000) + (state.spent[sk] || 0);
          const q = h.type === 'bool' ? 0 : t.unit === 60 ? 60 : 36, units = q ? Math.floor(total / q + 1e-9) : 0, rest = Math.round(total - units * q);
          if (units > 0) { setVal(h, t.k, Math.min(h.target, +(t.base + units * (q === 60 ? 1 : .01)).toFixed(2))); justCell = { h: h.id, k: t.k }; }
          if (rest > 0) state.spent[sk] = rest; else delete state.spent[sk];
          save();
        }
        timerCard = !finish && keep ? t.hid : null;
        render();
      }
      function closeTimerCard() {
        if (timer) stopTimer(false, false);
        timerCard = null;
        const card = el.timer;
        if (card.hidden || calm()) { render(); return; }
        const a = card.animate({ opacity: [1, 0], transform: ['none', 'translateY(-10px) scale(.97)'] }, { duration: 220, easing: 'ease-in', fill: 'forwards' });
        let done = false;
        const end = () => { if (done) return; done = true; render(); a.cancel(); };
        a.onfinish = end; setTimeout(end, 300); // zapas, gdy karta w tle wstrzyma animacje
      }
      function tickTimer(start) {
        if (!timer) { if (!timerCard) el.timer.hidden = true; return; }
        if (timer.k !== todayKey()) { stopTimer(false, false); return; } // licznik z poprzedniego dnia: zapisz, co było
        const left = timerLeft();
        if (left <= 0) { stopTimer(true); return; }
        root.querySelectorAll('[data-timer-left]').forEach(x => { x.textContent = fmtLeft(left); });
        const bar = el.timer.querySelector('.tbar i'), th = state.habits.find(x => x.id === timer.hid); if (bar && th) bar.style.width = (100 - left / timerFull(th) * 100) + '%';
        if (start && !timerInt) timerInt = setInterval(() => tickTimer(false), 1000);
      }
      function renderTimerCard() {
        const card = el.timer;
        const tk = todayKey(), hid = timer ? timer.hid : timerCard, h = hid && state.habits.find(x => x.id === hid);
        const run = !!timer, left = !h ? 0 : run ? timerLeft() : timerNeed(h, tk);
        if (!h || (!run && (left <= 0 || !timeUnit(h) || status(h, fromKey(tk)) === 'done'))) { if (!run) timerCard = null; card.hidden = true; cardRun = null; return; }
        if (view !== 'week') { card.hidden = true; return; }
        const swap = cardRun !== null && cardRun !== run && !card.hidden; cardRun = run;
        card.hidden = false;
        card.classList.toggle('paused', !run);
        const act = run ? `<button type="button" class="tstop" data-timer-stop>${STOP} Stop</button>` : `<button type="button" class="tstop go" data-timer="${h.id}">${PLAY} Start</button>`;
        card.innerHTML = `<div class="tinfo"><b>${esc(h.name)}</b><small>cel ${nf(h.target)} ${esc(h.unit)}</small></div><div class="ttime"${run ? ' data-timer-left' : ''}>${fmtLeft(left)}</div><div class="tact${swap ? ' swap' : ''}">${act}<button type="button" class="tclose" data-timer-close aria-label="Zamknij">${XMARK}</button></div><div class="tbar"><i style="width:${100 - left / timerFull(h) * 100}%"></i></div>`;
      }

      /* ---------- zdarzenia ---------- */
      root.addEventListener('click', e => {
        const c = e.target.closest('.ob'); if (c && !c.disabled) {
          if (e.clientX || e.clientY) ripple(e.clientX, e.clientY, .8);
          const h = state.habits.find(x => x.id === c.dataset.h);
          if (timer && timer.hid === h.id) { stopTimer(false); return; } // kółko przy działającym timerze = pauza
          // zegar: dziś startuje odliczanie, w inne dni (albo po osiągnięciu celu) otwiera edycję minut
          if (c.hasAttribute('data-clock')) { if (c.dataset.k === todayKey() && timerNeed(h, c.dataset.k) > 0) startTimer(h); else openEditor(h.id, c.dataset.k); return; }
          // tak/nie: klik przełącza tylko zrobione ↔ puste
          if (h.type === 'bool') {
            const od = c.hasAttribute('data-od'), on = getVal(h, c.dataset.k) !== 1;
            setVal(h, c.dataset.k, on ? 1 : null); justCell = { h: h.id, k: c.dataset.k };
            if (on) ctx.vibrate(10);
            if (od) renderSmooth(); else render();
            if (od) toast(`Nadrobione: ${h.name}`);
          }
          else openEditor(h.id, c.dataset.k);
          return;
        }
        const vt = e.target.closest('[data-view]');
        if (vt) {
          if (vt.dataset.view === 'calendar' && view !== 'calendar') {
            // z bieżącego tygodnia (lub dnia na telefonie) → bieżący miesiąc; z innego tygodnia → miesiąc, w którym leży jego większość
            const now = new Date();
            monthStart = isMobile() ? monthOf(selDay)
              : key(weekStart) === key(startOfWeek(now)) ? monthOf(now) : monthOf(addDays(weekStart, 3));
          }
          setView(vt.dataset.view); return;
        }
        const sh = e.target.closest('[data-sum-habit]'); if (sh) { sumHabit = sh.dataset.sumHabit; animList = true; viewDir = 1; render(); toTop(); return; }
        if (e.target.closest('[data-sum-pick]')) { sumHabit = null; animList = true; viewDir = -1; render(); return; }
        const sm = e.target.closest('[data-sum-mode]');
        if (sm) { if (sumMode === sm.dataset.sumMode) return; sumMode = sm.dataset.sumMode; if (sumMode === 'month') monthStart = monthOf(isMobile() ? selDay : addDays(weekStart, 3)); animList = true; render(); return; }
        const nt = e.target.closest('[data-note]'); if (nt) { openNote(nt.dataset.note); return; }
        const us = e.target.closest('[data-unskip]'); if (us) { delete state.skips[us.dataset.unskip]; save(); renderSmooth(); return; }
        const sk = e.target.closest('[data-skip]'); if (sk) { state.skips[sk.dataset.skip] = 1; save(); renderSmooth(); return; }
        const ts = e.target.closest('[data-timer]'); if (ts) { const h = state.habits.find(x => x.id === ts.dataset.timer); if (h) startTimer(h); return; }
        if (e.target.closest('[data-timer-stop]')) { stopTimer(false); return; }
        if (e.target.closest('[data-timer-close]')) { closeTimerCard(); return; }
        if (e.target.closest('[data-break-open]')) { openBreak(); return; }
        const more = e.target.closest('[data-more]');
        if (more) { rowMenu = more.dataset.more; render(); root.querySelector(`[data-edit="${CSS.escape(rowMenu)}"]`)?.focus(); return; }
        const ed = e.target.closest('[data-edit]'); if (ed) { rowMenu = null; render(); openHabitForm(ed.dataset.edit); return; }
        const dl = e.target.closest('[data-del]'); if (dl) { rowMenu = null; render(); confirmDelete(dl.dataset.del); return; }
        if (rowMenu && !e.target.closest('.racts')) { rowMenu = null; render(); }
        const go = e.target.closest('[data-goto]');
        if (go && !go.disabled) { const g = fromKey(go.dataset.goto); weekStart = g < fromKey(state.start) ? fromKey(state.start) : g; if (go.dataset.day) selDay = fromKey(go.dataset.day); setView('week'); toTop(); return; }
        if (e.target.closest('.hb-add')) { openHabitForm(null); return; }
        const nav = e.target.closest('[data-nav]'); if (nav) { if (!nav.disabled) step(+nav.dataset.nav); return; }
        if (e.target.closest('.hb-now')) {
          const was = view === 'week' && isMobile() ? key(selDay) : view === 'week' ? key(weekStart) : key(monthStart), nowD = new Date();
          slideDir = (view === 'week' && isMobile() ? key(dayOnly(nowD)) : view === 'week' ? key(startOfWeek(nowD)) : key(monthOf(nowD))) > was ? 1 : -1;
          if (view === 'summary') { slideDir = 0; animList = true; }
          selDay = dayOnly(nowD); weekStart = startOfWeek(nowD); monthStart = monthOf(nowD); render();
        }
      });
      const toTop = () => scroller.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
      // Nie da się cofnąć przed pierwszy tydzień aplikacji (state.start) ani przed jego miesiąc.
      function canPrev() {
        const start = fromKey(state.start);
        if (view === 'calendar') return monthStart > monthOf(start);
        if (view === 'summary') return sumMode === 'month' ? monthStart > monthOf(start) : weekStart > start;
        return isMobile() ? selDay > start : weekStart > start;
      }
      function step(dir) {
        if (dir < 0 && !canPrev()) return;
        if (view === 'calendar') { monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + dir, 1); slideDir = dir; }
        else if (view === 'summary' && sumMode === 'month') { monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + dir, 1); slideDir = dir; }
        else if (view === 'summary') { weekStart = addDays(weekStart, 7 * dir); selDay = addDays(selDay, 7 * dir); if (selDay < fromKey(state.start)) selDay = fromKey(state.start); slideDir = dir; }
        else if (isMobile()) { selDay = addDays(selDay, dir); weekStart = startOfWeek(selDay); slideDir = dir; }
        else { weekStart = addDays(weekStart, 7 * dir); slideDir = dir; }
        ctx.vibrate(5);
        render();
      }
      // Płynne przejście zamiast przebudowy: elementy listy jadą ze starego miejsca na nowe (FLIP), nowe się wyłaniają.
      function renderSmooth() {
        const old = new Map([...list.children].filter(x => x.dataset.fk).map(x => [x.dataset.fk, x.getBoundingClientRect().top]));
        render();
        if (calm()) return;
        [...list.children].forEach(x => {
          const was = old.get(x.dataset.fk);
          if (was == null) { x.animate({ opacity: [0, getComputedStyle(x).opacity], transform: ['scale(.96)', 'none'] }, { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' }); return; }
          const d = was - x.getBoundingClientRect().top;
          if (d) x.animate({ transform: [`translateY(${d}px)`, 'none'] }, { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
        });
      }
      function setView(v) {
        if (v === 'summary' && view !== 'summary') sumHabit = null;
        viewDir = Math.sign(VIEWS.indexOf(v) - VIEWS.indexOf(view));
        view = v; rowMenu = null; animList = true;
        try { localStorage.setItem(VIEW_KEY, view); } catch (_) { }
        render();
      }
      document.addEventListener('keydown', e => {
        if (!ctx.active) return;
        if (e.key === 'Escape' && curSheet()) { close(); return; }
        else if (e.key === 'Escape' && rowMenu) { const id = rowMenu; rowMenu = null; render(); root.querySelector(`[data-more="${CSS.escape(id)}"]`)?.focus(); return; }
        if (curSheet() || e.target.matches('input, textarea, select')) return;
        if (e.target.closest?.('.wheel')) return; // strzałki na kole przełączają sekcje
        if (e.key === 'ArrowLeft') step(-1);
        if (e.key === 'ArrowRight') step(1);
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (!checkDayChange()) render(); tickTimer(true); } });
      window.addEventListener('focus', checkDayChange);
      mq.addEventListener('change', () => {
        // przy przejściu na telefon pokaż dziś, jeśli jest w oglądanym tygodniu, inaczej poniedziałek
        const t = dayOnly(new Date());
        selDay = key(startOfWeek(t)) === key(weekStart) ? t : new Date(weekStart);
        rowMenu = null; render();
      });
      setInterval(checkDayChange, 60000); // zapas, gdy komputer usnął i timer się spóźnił

      /* ---------- notatka dnia (telefon) ---------- */
      root.addEventListener('input', e => { if (e.target.classList.contains('hb-note-in')) setNote(e.target.dataset.k, e.target.value); });
      root.addEventListener('keydown', e => { if (e.target.classList.contains('hb-note-in') && e.key === 'Enter') e.target.blur(); });

      /* ---------- telefon: przesunięcie palcem po nagłówku dnia = poprzedni / następny dzień ---------- */
      let daySw = null;
      el.week.addEventListener('pointerdown', e => {
        if (!isMobile() || !e.target.closest('.hb-days') || e.button > 0) return;
        daySw = { x: e.clientX, y: e.clientY, id: e.pointerId };
      });
      el.week.addEventListener('pointerup', e => {
        if (!daySw || e.pointerId !== daySw.id) return;
        const dx = e.clientX - daySw.x, dy = e.clientY - daySw.y; daySw = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 60); step(dx < 0 ? 1 : -1); }
      });
      el.week.addEventListener('pointercancel', () => { daySw = null; });

      /* ---------- przeciąganie za uchwyt ⋮⋮ = kolejność ---------- */
      let drag = null, dragRaf = 0;
      const isRow = x => x.classList.contains('o-row');
      const nextRow = (x, dir) => { let n = dir > 0 ? x.nextElementSibling : x.previousElementSibling; while (n && !isRow(n)) n = dir > 0 ? n.nextElementSibling : n.previousElementSibling; return n; };
      function placeDrag(y) {
        const { row } = drag;
        // gdzie wstawić: przed pierwszym elementem, którego środek jest poniżej kursora
        let before = null;
        for (const x of list.children) {
          if (x === row) continue;
          const b = x.getBoundingClientRect();
          if (y < b.top + b.height / 2) { before = x; break; }
        }
        const need = before ? row.nextElementSibling !== before : list.lastElementChild !== row;
        if (need) {
          // FLIP: pozostałe elementy płynnie przesuwają się na nowe miejsca
          const others = [...list.children].filter(x => x !== row);
          const first = new Map(others.map(x => [x, x.getBoundingClientRect().top]));
          if (before) list.insertBefore(row, before); else list.appendChild(row);
          others.forEach(x => {
            const d = first.get(x) - x.getBoundingClientRect().top;
            if (!d) return;
            x.style.transition = 'none'; x.style.transform = `translateY(${d}px)`;
            requestAnimationFrame(() => { x.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)'; x.style.transform = ''; });
          });
          drag.moved = true;
          ctx.vibrate(4);
        }
        // przeciągany wiersz jedzie za kursorem/palcem
        row.style.transform = 'none';
        const top = row.getBoundingClientRect().top;
        row.style.transform = `translateY(${y - drag.grab - top}px) scale(1.02)`;
      }
      // przewijanie przy krawędziach (góra przewijanej sekcji, dół nad dolnym kołem)
      function dragScroll() {
        if (!drag) return;
        const r = scroller.getBoundingClientRect(), nav = parseFloat(getComputedStyle(root).paddingBottom) || 120;
        const y = drag.y, top = r.top + 70, bot = r.bottom - Math.min(nav, r.height / 3) - 20;
        const v = y < top ? -Math.min(14, (top - y) / 4 + 3) : y > bot ? Math.min(14, (y - bot) / 4 + 3) : 0;
        if (v) { scroller.scrollBy(0, v); placeDrag(y); }
        dragRaf = requestAnimationFrame(dragScroll);
      }
      list.addEventListener('pointerdown', e => {
        const grip = e.target.closest('.grip');
        if (!grip || e.button > 0) return;
        e.preventDefault();
        const row = grip.closest('.o-row'), r = row.getBoundingClientRect();
        rowMenu = null;
        drag = { row, id: row.dataset.id, grab: e.clientY - r.top, pid: e.pointerId, moved: false, y: e.clientY };
        try { grip.setPointerCapture(e.pointerId); } catch (_) { }
        row.classList.add('dragging');
        ctx.section.classList.add('hb-dragging');
        ctx.vibrate(8);
        dragRaf = requestAnimationFrame(dragScroll);
      });
      list.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.pid) return;
        drag.y = e.clientY;
        placeDrag(e.clientY);
      });
      const endDrag = e => {
        if (!drag || e.pointerId !== drag.pid) return;
        const g = drag; drag = null; cancelAnimationFrame(dragRaf);
        ctx.section.classList.remove('hb-dragging');
        g.row.classList.remove('dragging');
        // wiersz miękko ląduje na swoim miejscu
        const cur = g.row.style.transform; g.row.style.transform = '';
        if (cur && !calm()) g.row.animate({ transform: [cur, 'none'] }, { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
        const h = state.habits.find(x => x.id === g.id); if (!h) return render();
        const arr = state.habits.filter(x => x !== h);
        const nx = nextRow(g.row, 1), pv = nextRow(g.row, -1);
        let idx = nx ? arr.findIndex(x => x.id === nx.dataset.id) : -1;
        if (idx < 0) idx = pv ? arr.findIndex(x => x.id === pv.dataset.id) + 1 : 0;
        arr.splice(idx, 0, h);
        const changed = arr.some((x, i) => x !== state.habits[i]);
        state.habits = arr;
        if (changed) save();
        setTimeout(render, calm() ? 0 : 250);
      };
      list.addEventListener('pointerup', endDrag);
      list.addEventListener('pointercancel', endDrag);

      /* ---------- telefon: przesuń wiersz w prawo = zrobione, w lewo = wyczyść ---------- */
      let swipe = null, suppressClick = false;
      const canSwipe = id => { const h = state.habits.find(x => x.id === id); const s = h && status(h, selDay); return !!h && isMobile() && view === 'week' && !['off', 'pre', 'future', 'rest'].includes(s); };
      list.addEventListener('pointerdown', e => {
        const row = e.target.closest('.o-row');
        if (!row || drag || e.target.closest('.grip, .rmenu') || !canSwipe(row.dataset.id)) return;
        swipe = { row, id: row.dataset.id, x0: e.clientX, y0: e.clientY, dx: 0, on: false, pid: e.pointerId };
      });
      list.addEventListener('pointermove', e => {
        if (!swipe || e.pointerId !== swipe.pid) return;
        const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
        if (!swipe.on) {
          if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipe.on = true; swipe.row.classList.add('swiping'); }
          else if (Math.abs(dy) > 10) { swipe = null; return; }
          else return;
        }
        swipe.dx = dx;
        const x = Math.max(-140, Math.min(140, dx));
        swipe.row.style.transform = `translateX(${x}px)`;
        swipe.row.style.setProperty('--sw', Math.min(1, Math.abs(x) / 80).toFixed(3));
        const was = swipe.row.classList.contains('sw-done') || swipe.row.classList.contains('sw-clear');
        swipe.row.classList.toggle('sw-done', x > 80);
        swipe.row.classList.toggle('sw-clear', x < -80);
        if (!was && Math.abs(x) > 80) ctx.vibrate(6);
      });
      const endSwipe = (e, cancelled) => {
        if (!swipe || e.pointerId !== swipe.pid) return;
        const s = swipe; swipe = null;
        if (!s.on) return;
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
        s.row.classList.remove('swiping', 'sw-done', 'sw-clear');
        const from = s.row.style.transform; s.row.style.transform = '';
        // wiersz wraca sprężyście na miejsce
        if (from && !calm()) s.row.animate({ transform: [from, 'none'] }, { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        if (cancelled || Math.abs(s.dx) < 80) return;
        const h = state.habits.find(x => x.id === s.id); if (!h) return;
        setVal(h, key(selDay), s.dx > 0 ? (h.type === 'bool' ? 1 : h.target) : null); justCell = { h: h.id, k: key(selDay) };
        if (s.dx > 0) ctx.vibrate(12);
        render();
      };
      list.addEventListener('pointerup', e => endSwipe(e, false));
      list.addEventListener('pointercancel', e => endSwipe(e, true));
      root.addEventListener('click', e => { if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); } }, true);

      /* ---------- efekty: dotknięcie kafelka, kręgi, domknięcie dnia, woda w kółku ---------- */
      // Klik w kafelek (poza przyciskami): leciutko rośnie i od razu wraca.
      list.addEventListener('click', e => {
        const row = e.target.closest('.o-row');
        if (!row || e.target.closest('button, input, a, label') || calm()) return;
        row.animate({ transform: ['scale(1)', 'scale(1.02)', 'scale(1)'] }, { duration: 320, easing: 'cubic-bezier(.3,.7,.4,1)' });
        ripple(e.clientX, e.clientY, 1);
      });
      // Krąg w miejscu dotknięcia (w warstwie sekcji, nie łapie kliknięć).
      function ripple(x, y, k = 1) {
        if (calm()) return;
        const r = document.createElement('i');
        r.className = 'hb-ripple';
        Object.assign(r.style, { left: x + 'px', top: y + 'px' });
        layer.appendChild(r);
        r.animate({ transform: ['translate(-50%,-50%) scale(.1)', `translate(-50%,-50%) scale(${k})`], opacity: [.6, 0] },
          { duration: 600, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).onfinish = () => r.remove();
        setTimeout(() => r.remove(), 900);
      }
      // Domknięcie dnia: crimsonowa fala przechodzi po kafelkach nawyków (tylko w kafelkach) i procent podskakuje.
      function celebrate() {
        ctx.vibrate([15, 60, 25]);
        if (calm()) return;
        el.pct.animate({ transform: ['scale(1)', 'scale(1.14)', 'scale(.98)', 'scale(1)'], color: ['#F3EFEA', '#ededed', '#ededed', '#F3EFEA'] }, { duration: 900, easing: 'ease-out' });
        const off = 'inset 0 0 0 1px rgba(235, 235, 235, 0), 0 0 0 0 rgba(255, 255, 255, 0.0)';
        [...list.querySelectorAll('.o-row[data-id]:not(.is-off)')].forEach((r, i) => {
          r.animate({ boxShadow: [off, 'inset 0 0 0 1px rgba(235, 235, 235, .85), 0 0 28px 0 rgba(255, 255, 255, 0.171)', off], transform: ['none', 'scale(1.015)', 'none'] },
            { duration: 700, delay: 120 + i * 80, easing: 'ease-out' });
          const w = document.createElement('i'); w.className = 'hb-wave'; r.appendChild(w);
          w.animate({ transform: ['translateX(-100%)', 'translateX(100%)'], opacity: [0, 1, 0] }, { duration: 900, delay: 120 + i * 80, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }).onfinish = () => w.remove();
          setTimeout(() => w.remove(), 2200 + i * 80);
        });
      }
      // Po przebudowie listy: woda przelewa się ze starego poziomu, ewentualne świętowanie.
      const waterTop = l => `${(9 + (100 - l) * .88).toFixed(2)}%`; // jak w CSS: w środku obwódki, z zapasem na falę
      // Kółko liczbowe osiąga cel: woda dolewa się do pełna, dopiero potem pojawia się ptaszek.
      function fillUp(c, was) {
        c.classList.add('filling'); c.insertAdjacentHTML('afterbegin', WATER);
        const ws = [...c.querySelectorAll('.wv')];
        const a = ws.map(w => w.animate({ top: [waterTop(was), '-30%'] }, { duration: 560, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }));
        let done = false;
        const end = () => { if (done) return; done = true; ws.forEach(w => w.remove()); c.classList.remove('filling', 'just'); void c.offsetWidth; c.classList.add('just'); };
        a[0].onfinish = end; setTimeout(end, 900); // zapas, gdy karta w tle wstrzyma animacje
      }
      function afterList(box) {
        box.querySelectorAll('.c[data-lv]').forEach(c => {
          const p = +c.style.getPropertyValue('--lv'), was = levels.get(c.dataset.lv);
          levels.set(c.dataset.lv, p);
          if (was == null || was === p || calm()) return;
          if (c.classList.contains('done')) { if (!document.hidden) fillUp(c, was); return; }
          c.querySelectorAll('.wv').forEach(w => w.animate({ top: [waterTop(was), waterTop(p)] }, { duration: 650, easing: 'cubic-bezier(.3,.7,.3,1)' }));
        });
        if (recordToast) { const m = recordToast; recordToast = null; setTimeout(() => toast(m), 500); }
        // koniec timera: jedno spokojne, crimsonowe pulsowanie kafelka
        if (timerDone) {
          const r = box.querySelector(`.o-row[data-id="${CSS.escape(timerDone)}"]`); timerDone = null;
          const off = '0 0 0 0 rgba(255, 255, 255, 0.0), inset 0 0 0 1px rgba(235, 235, 235, 0)';
          if (r && !calm()) r.animate({ boxShadow: [off, '0 0 36px 4px rgba(255, 255, 255, 0.158), inset 0 0 0 1px rgba(235, 235, 235, .75)', off] }, { duration: 1600, easing: 'ease-in-out' });
        }
        // przy otwartym edytorze świętowanie czeka na jego zamknięcie
        if (party) { party = false; if (curSheet()) partyLater = true; else if (ctx.active) celebrate(); }
        userAct = false;
      }

      render();
      tickTimer(true); // licznik z poprzedniego uruchomienia: dokończ albo wznów
      scheduleMidnight();

      return {
        getState: () => state,
        applyState,
        reset,
        show() { if (!checkDayChange()) { animList = true; render(); } },
        hide() { closeSheet(true); if (rowMenu) { rowMenu = null; render(); } },
      };
    },
  });
})();
