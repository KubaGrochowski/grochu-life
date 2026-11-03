/* Grochu life — sekcja Dieta (port Foodcker): dziennik posiłków z AI — zdjęcie talerza → nazwa, składniki, kalorie i makro.
   Do tego kod kreskowy (Open Food Facts), wpisanie ręczne, historia, podsumowanie i cele.
   Dane w localStorage (glife.diet.v1) + Supabase przez rdzeń (tabela makro_data, ten sam format co w Foodcker). */
(() => {
  'use strict';

  const STORAGE_KEY = 'glife.diet.v1';
  const VIEW_KEY = 'glife.diet.view';
  const DAYS_FULL = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const TYPES = [['br', 'Śniadanie'], ['lu', 'Obiad'], ['di', 'Kolacja'], ['sn', 'Przekąska']];
  const typeName = t => (TYPES.find(x => x[0] === t) || TYPES[3])[1];
  const DEF_GOALS = { kcal: 2200, p: 140, f: 70, c: 250 };
  const VIEWS = ['day', 'history', 'summary'];

  /* ---------- spłaszczanie stanu do synchronizacji — 1:1 z Foodcker (js/cloud.js), żeby dane z chmury wczytały się bez zmian ---------- */
  // Elementy: 'g' = cele (kcal i makro), 'm:<id>' = posiłek (z miniaturą zdjęcia).
  function flatten(s) {
    const items = { g: s.goals };
    Object.values(s.meals || {}).forEach(m => { items['m:' + m.id] = m; });
    return items;
  }
  function unflatten(items) {
    const meals = {};
    Object.keys(items).forEach(k => { if (k.startsWith('m:')) meals[k.slice(2)] = items[k]; });
    return { goals: items.g, meals };
  }

  /* ---------- daty ---------- */
  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dow = d => (d.getDay() + 6) % 7; // 0 = poniedziałek
  const todayKey = () => key(new Date());
  const dayOnly = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const typeByHour = h => h < 11 ? 'br' : h < 17 ? 'lu' : h < 22 ? 'di' : 'sn';
  const dateLabel = k => { const d = fromKey(k); return `${DAYS_FULL[dow(d)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; };
  const relDay = k => { const t = todayKey(); return k === t ? 'Dziś' : k === key(addDays(new Date(), -1)) ? 'Wczoraj' : k === key(addDays(new Date(), 1)) ? 'Jutro' : null; };

  /* ---------- liczenie ---------- */
  // najpierw 12 cyfr znaczących — usuwa śmieci z mnożenia ułamków (0,575 × 50 = 28,7499999…), więc 28,75 → 28,8
  const clean = v => Number((+v || 0).toPrecision(12));
  const r0 = v => Math.round(clean(v));
  const r1 = v => Math.round(clean(v) * 10) / 10;
  const nf = v => (+v || 0).toLocaleString('pl-PL', { maximumFractionDigits: 1 });
  function totals(items) {
    return (items || []).reduce((a, it) => ({ kcal: a.kcal + (+it.kcal || 0), p: a.p + (+it.p || 0), f: a.f + (+it.f || 0), c: a.c + (+it.c || 0), g: a.g + (+it.g || 0) }), { kcal: 0, p: 0, f: 0, c: 0, g: 0 });
  }
  const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // Wysokość płynu w kole tak, żeby zalana POWIERZCHNIA odpowiadała % celu.
  const waterLevel = f => {
    if (f <= 0 || f >= 1) return Math.max(0, Math.min(1, f)) * 100;
    let lo = 0, hi = Math.PI * 2;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if ((m - Math.sin(m)) / (2 * Math.PI) < f) lo = m; else hi = m; }
    return +((1 - Math.cos(lo / 2)) / 2 * 100).toFixed(1);
  };

  /* ---------- ikony ---------- */
  const ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3v7M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 10v11M17 21V3c-2.2 1-3.5 3.6-3.5 7 0 2 1 3 3.5 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const XMARK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M1.5 7h11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const CAM = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.3-2h6l1.3 2h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.4" stroke="currentColor" stroke-width="1.7"/></svg>';
  const GALLERY = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="9.5" r="1.7" fill="currentColor"/><path d="M4 17l4.5-4.5 3 3 3.5-4 5 5.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  const BARCODE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7 8v8M10 8v8M12.5 8v8M15 8v8M17 8v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const PEN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="1.7"/></svg>';
  const PLATE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.3" opacity=".6"/></svg>';
  const AGAIN = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.8h-2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SEARCH = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.7"/><path d="M10.5 10.5l3.2 3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const TARGET = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>';
  const CHEV = d => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="${d < 0 ? 'M10 3.5L5.5 8l4.5 4.5' : 'M6 3.5L10.5 8 6 12.5'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  GL.register({
    id: 'diet', label: 'Dieta', order: 30, icon: ICON,
    cloud: { table: 'makro_data', flatten, unflatten },
    init(ctx) {
      const { root, layer, scroller, toast, calm, esc } = ctx;

      /* ---------- stan ---------- */
      const withDefaults = s => {
        s = s && typeof s === 'object' ? s : {};
        s.goals = { ...DEF_GOALS, ...(s.goals || {}) };
        if (!s.meals || typeof s.meals !== 'object') s.meals = {};
        return s;
      };
      function load() {
        try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return withDefaults(JSON.parse(raw)); } catch (_) { }
        return withDefaults({});
      }
      let state = load();
      function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
        catch (_) { toast('Nie udało się zapisać danych w przeglądarce'); return; }
        ctx.changed();
      }
      // Stan z chmury: zapis lokalny bez oznaczania go jako zmiany z tego urządzenia.
      function applyState(s) {
        state = withDefaults({ goals: s?.goals, meals: s?.meals || {} });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { }
        render();
      }
      // Po wylogowaniu: czyścimy dane z urządzenia.
      function reset() {
        close(true);
        state = withDefaults({});
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) { }
        prevDayKey = null; render();
      }

      const mealsOn = k => Object.values(state.meals).filter(m => m.day === k).sort((a, b) => (a.at || '').localeCompare(b.at || ''));
      const dayTotals = k => mealsOn(k).reduce((a, m) => { const t = totals(m.items); ['kcal', 'p', 'f', 'c'].forEach(x => a[x] += t[x]); return a; }, { kcal: 0, p: 0, f: 0, c: 0 });

      let view = 'day', selDay = dayOnly(new Date()), slideDir = 0, animList = true, hello = true, userAct = false;
      let sumDays = 7, hQuery = '', hLimit = 14, freshId = null, shownView = null;
      try { const v = localStorage.getItem(VIEW_KEY); if (v === 'history' || v === 'summary') view = v; } catch (_) { }

      /* ---------- szkielet sekcji ---------- */
      root.innerHTML = `
        <header class="sec-head dt-head">
          <h1 class="sec-title">Dieta</h1>
          <div class="dt-act">
            <button class="dt-today" data-today hidden>Dziś</button>
            <button class="icon-btn dt-goals" data-goals aria-label="Cele dzienne" title="Cele dzienne">${TARGET}</button>
            <button class="btn btn-primary dt-add" data-add><span class="dt-plus">${PLUS}</span>Dodaj<span class="dt-add-l">&nbsp;posiłek</span></button>
          </div>
        </header>
        <div class="dt-bar"><nav class="seg dt-seg" role="tablist" aria-label="Widok" style="--n:3;--i:0">
          <button class="seg-b" role="tab" data-view="day">Dzień</button>
          <button class="seg-b" role="tab" data-view="history">Historia</button>
          <button class="seg-b" role="tab" data-view="summary">Podsumowanie</button>
        </nav></div>
        <div class="dt-views">
          <section class="dt-view" data-v="day"></section>
          <section class="dt-view" data-v="history" hidden></section>
          <section class="dt-view" data-v="summary" hidden></section>
        </div>`;
      const vEl = v => root.querySelector(`.dt-view[data-v="${v}"]`);
      const seg = root.querySelector('.dt-seg'), todayBtn = root.querySelector('.dt-today');

      /* ---------- płynne liczby ---------- */
      const shown = new Map();
      function countTo(el, v, dur = 450) {
        if (!el) return;
        const id = el.id || el.dataset.cnt; const from = shown.has(id) ? shown.get(id) : v; shown.set(id, v);
        if (document.hidden || from === v || calm()) { el.textContent = r0(v).toLocaleString('pl-PL'); return; }
        const t0 = performance.now();
        const tick = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = r0(from + (v - from) * e).toLocaleString('pl-PL'); if (k < 1) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        setTimeout(() => { el.textContent = r0(v).toLocaleString('pl-PL'); }, dur + 80); // zapas, gdy karta w tle wstrzyma klatki
      }
      // liczniki od zera przy wejściu widoku (podsumowanie): <x data-count="123" data-suf="%">
      function countIn(box, dur = 900) {
        box.querySelectorAll('[data-count]').forEach((el, j) => {
          const v = +el.dataset.count, suf = el.dataset.suf || '', fin = r0(v).toLocaleString('pl-PL') + suf;
          if (calm() || document.hidden || !v) { el.textContent = fin; return; }
          const t0 = performance.now() + 120 + j * 60;
          el.textContent = '0' + suf;
          const tick = now => { const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3); el.textContent = r0(v * e).toLocaleString('pl-PL') + suf; if (k < 1) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          setTimeout(() => { el.textContent = fin; }, dur + 400 + j * 60);
        });
      }

      /* ---------- rysowanie ---------- */
      let prevRing = null, prevArc = null, prevDayTot = null, prevDayKey = null;
      function render() {
        const t = todayKey(), k = key(selDay), vi = VIEWS.indexOf(view);
        seg.style.setProperty('--i', vi);
        seg.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view));
        VIEWS.forEach(v => { vEl(v).hidden = v !== view; });
        // zmiana widoku: nowy wjeżdża z boku, w stronę ruchu pigułki
        if (shownView && shownView !== view && !calm()) {
          const el = vEl(view), dir = vi > VIEWS.indexOf(shownView) ? 1 : -1;
          el.style.setProperty('--dx', dir * 40 + 'px');
          el.classList.remove('dt-vin'); void el.offsetWidth; el.classList.add('dt-vin');
        }
        shownView = view;
        todayBtn.hidden = !(view === 'day' && k !== t);
        if (view === 'day') renderDay(k);
        else if (view === 'history') renderHistory();
        else renderSummary();
        animList = false; slideDir = 0; hello = false;
      }

      function macroRow(cls, label, v, goal) {
        const p = goal ? v / goal : 0;
        return `<div class="mac ${cls}${p >= 1 ? ' hit' : ''}${p > 1.15 ? ' over' : ''}" data-mac="${cls}"><span><i></i>${label}</span><b><em data-cnt="mac-${cls}">${r0(v)}</em> / ${nf(goal)} g</b><div class="tube${p > 1.15 ? ' over' : ''}"><i style="width:${Math.min(100, p * 100)}%"></i></div></div>`;
      }
      function mealHtml(m, i, opts = {}) {
        const t = totals(m.items);
        const th = m.th ? `<img src="${esc(m.th)}" alt="" loading="lazy">` : PLATE;
        return `<button class="meal${m.id === freshId ? ' fresh' : ''}" data-meal="${esc(m.id)}" style="--i:${i}"><span class="th${m.ai ? ' ai' : ''}">${th}</span><span class="nt"><b>${esc(m.name || 'Posiłek')}</b><small>${opts.type ? `<i>${typeName(m.type)}</i> · ` : ''}${m.at ? esc(m.at) + ' · ' : ''}B ${r0(t.p)} · T ${r0(t.f)} · W ${r0(t.c)} g</small></span><span class="kc">${r0(t.kcal)}<span>kcal</span></span>${opts.again ? `<span class="again" role="button" tabindex="0" data-again="${esc(m.id)}" aria-label="Dodaj dziś jeszcze raz" title="Dodaj dziś jeszcze raz">${AGAIN}<span>Dodaj dziś</span></span>` : ''}</button>`;
      }

      function renderDay(k) {
        const el = vEl('day'), t = todayKey(), tot = dayTotals(k), g = state.goals, meals = mealsOn(k), d = fromKey(k);
        const p = g.kcal ? tot.kcal / g.kcal : 0;
        const lv = waterLevel(Math.min(1, p)), arc = +Math.min(100, p * 100).toFixed(2), over = p > 1.1;
        // historia tego dnia: najnowsze posiłki na górze
        const newest = meals.slice().sort((a, b) => (b.at || '').localeCompare(a.at || '') || (b.created || 0) - (a.created || 0));
        const list = meals.length
          ? `<div class="mgrp" style="--i:0"><h3>Posiłki<em>${meals.length} · ${r0(tot.kcal)} kcal</em></h3></div>` + newest.map((m, i) => mealHtml(m, i + 1, { type: true })).join('')
          : `<div class="dt-empty" style="--i:0"><span class="dt-empty-ic">${PLATE}</span><p>Brak posiłków tego dnia</p><button class="btn btn-ghost" data-add>${PLUS}Dodaj posiłek</button></div>`;
        const left = p > 1 ? `+${r0(tot.kcal - g.kcal).toLocaleString('pl-PL')} ponad cel` : `zostało ${r0(g.kcal - tot.kcal).toLocaleString('pl-PL')}`;
        const ring = `<div class="ring-w${over ? ' over' : ''}${arc ? '' : ' zero'}">
          <svg class="ring-arc" viewBox="0 0 220 220" aria-hidden="true"><circle class="ra-bg" cx="110" cy="110" r="104"/><circle class="ra-fg" cx="110" cy="110" r="104" pathLength="100" style="stroke-dasharray:${arc} 100"/></svg>
          <div class="ring" style="--lv:${lv}"><i class="wv"></i><i class="wv b"></i><div class="ring-t"><b data-cnt="ring-kcal">${r0(tot.kcal)}</b><small>z ${nf(g.kcal)} kcal</small><em>${left}</em></div></div></div>`;
        el.dataset.slide = slideDir > 0 ? 'l' : slideDir < 0 ? 'r' : '';
        el.innerHTML = `<div class="dnav">
            <button class="navarr" data-nav="-1" aria-label="Poprzedni dzień">${CHEV(-1)}</button>
            <button class="dayname${k === t ? ' t' : ''}" data-today title="Wróć do dziś"><b>${relDay(k) || DAYS_FULL[dow(d)]}</b><em>${relDay(k) ? DAYS_FULL[dow(d)] + ', ' : ''}${d.getDate()} ${MONTHS_GEN[d.getMonth()]}</em></button>
            <button class="navarr" data-nav="1" aria-label="Następny dzień">${CHEV(1)}</button></div>
          <div class="dgrid dslide"><div class="panel">${ring}<div class="macros">${macroRow('p', 'Białko', tot.p, g.p)}${macroRow('f', 'Tłuszcze', tot.f, g.f)}${macroRow('c', 'Węglowodany', tot.c, g.c)}</div></div>
          <div class="mlist${hello ? ' hello' : animList || slideDir ? ' enter' : ''}">${list}</div></div>`;
        // liczby i płyn płyną od poprzedniego stanu tego samego dnia
        const sameDay = prevDayKey === k && prevDayTot;
        if (sameDay) { shown.set('ring-kcal', prevDayTot.kcal); ['p', 'f', 'c'].forEach(x => shown.set('mac-' + x, prevDayTot[x])); }
        else { shown.set('ring-kcal', 0); ['p', 'f', 'c'].forEach(x => shown.set('mac-' + x, 0)); }
        countTo(el.querySelector('[data-cnt="ring-kcal"]'), tot.kcal, sameDay ? 700 : 1100);
        ['p', 'f', 'c'].forEach(x => countTo(el.querySelector(`[data-cnt="mac-${x}"]`), tot[x], sameDay ? 700 : 1000));
        const ringEl = el.querySelector('.ring'), fg = el.querySelector('.ra-fg');
        if (!calm()) {
          const ease = 'cubic-bezier(.3,.7,.3,1)', dur = sameDay ? 900 : 1300;
          const from = sameDay ? prevRing : 0, fromA = sameDay ? prevArc : 0;
          if (from !== lv) {
            const top = l => `calc(4% + ${(100 - l) * .96}%)`;
            ringEl.querySelectorAll('.wv').forEach(w => w.animate({ top: [top(from), top(lv)] }, { duration: dur, easing: ease }));
            if (sameDay && lv > from) ringEl.closest('.ring-w').classList.add('pop');
          }
          if (fromA !== arc) fg.animate({ strokeDasharray: [`${fromA} 100`, `${arc} 100`] }, { duration: dur + 150, easing: ease });
          // rurki makro: przy wejściu napełniają się od zera
          if (!sameDay) el.querySelectorAll('.tube i').forEach((bar, j) => { const w = bar.style.width; bar.style.transition = 'none'; bar.style.width = '0'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = ''; bar.style.transitionDelay = (150 + j * 120) + 'ms'; bar.style.width = w; })); });
          else el.querySelectorAll('.tube i').forEach(bar => { const mc = bar.closest('.mac').dataset.mac, w = bar.style.width, was = Math.min(100, (prevDayTot[mc] / (g[mc] || 1)) * 100); bar.style.transition = 'none'; bar.style.width = was + '%'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = ''; bar.style.width = w; })); });
        }
        // przekroczenie progu: 100% kalorii = świętowanie
        if (sameDay && userAct) {
          const was = prevDayTot;
          if (was.kcal < g.kcal && tot.kcal >= g.kcal && tot.kcal <= g.kcal * 1.1) setTimeout(() => celebrate(), 500);
        }
        freshId = null;
        prevRing = lv; prevArc = arc; prevDayTot = tot; prevDayKey = k; userAct = false;
      }

      function renderHistory() {
        const el = vEl('history'), q = hQuery.trim().toLowerCase();
        const all = Object.values(state.meals).filter(m => !q || (m.name || '').toLowerCase().includes(q) || (m.items || []).some(it => (it.n || '').toLowerCase().includes(q)));
        const byDay = new Map();
        all.sort((a, b) => (b.day + (b.at || '')).localeCompare(a.day + (a.at || ''))).forEach(m => { if (!byDay.has(m.day)) byDay.set(m.day, []); byDay.get(m.day).push(m); });
        const days = [...byDay.keys()].slice(0, hLimit), g = state.goals;
        let i = 0, html = '';
        days.forEach(k => {
          const ms = byDay.get(k).slice().reverse(), tot = ms.reduce((a, m) => a + totals(m.items).kcal, 0), rel = relDay(k);
          html += `<div class="hday" data-goday="${k}" style="--i:${i++}"><h3>${rel ? rel + ' <em>· ' + dateLabel(k) + '</em>' : dateLabel(k)}</h3><b>${r0(tot)} kcal</b><div class="tube${tot > g.kcal * 1.1 ? ' over' : ''}"><i style="width:${Math.min(100, tot / g.kcal * 100)}%"></i></div></div>`;
          html += ms.map(m => mealHtml(m, i++, { type: true, again: true })).join('');
        });
        if (!days.length) html = `<p class="empty">${q ? 'Nic nie pasuje do wyszukiwania' : 'Tu pojawią się zeskanowane posiłki'}</p>`;
        if (byDay.size > hLimit) html += `<button class="btn btn-ghost more" data-more style="--i:${i}">Pokaż starsze</button>`;
        if (!el.querySelector('[data-hq]')) el.innerHTML = `<div class="hbar"><label class="hsearch">${SEARCH}<input data-hq type="search" placeholder="Szukaj posiłku lub składnika" autocomplete="off" aria-label="Szukaj"></label></div><div class="hlist mlist"></div>`;
        const list = el.querySelector('.hlist');
        list.className = 'hlist mlist' + (animList ? ' enter' : '');
        list.innerHTML = html;
      }

      function periodStats(n) {
        const t = dayOnly(new Date()), days = [];
        for (let i = n - 1; i >= 0; i--) { const d = addDays(t, -i), k = key(d); days.push({ d, k, tot: dayTotals(k), n: mealsOn(k).length }); }
        const logged = days.filter(x => x.n);
        const avg = { kcal: 0, p: 0, f: 0, c: 0 };
        logged.forEach(x => ['kcal', 'p', 'f', 'c'].forEach(m => avg[m] += x.tot[m] / logged.length));
        const g = state.goals, inGoal = logged.filter(x => x.tot.kcal >= g.kcal * .9 && x.tot.kcal <= g.kcal * 1.1).length;
        let streak = 0; for (let i = days.length - 1; i >= 0; i--) { if (days[i].n) streak++; else if (i === days.length - 1) continue; else break; }
        return { days, logged, avg, inGoal, streak };
      }
      function renderSummary() {
        const el = vEl('summary'), g = state.goals, s = periodStats(sumDays), t = todayKey();
        const max = Math.max(g.kcal * 1.25, ...s.days.map(x => x.tot.kcal)) || 1;
        const m = sumDays > 7, en = animList ? ' enter' : '';
        const bars = s.days.map((x, j) => { const v = x.tot.kcal, cls = !x.n ? 'empty' : v > g.kcal * 1.1 ? 'over' : v < g.kcal * .8 ? 'low' : 'hit'; return `<div class="sb ${cls}" style="--j:${j}" title="${dateLabel(x.k)}: ${r0(v)} kcal"><span>${x.n ? (v >= 1000 ? (v / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 }) + 'k' : r0(v)) : ''}</span><i style="height:${x.n ? v / max * 100 : 0}%"></i></div>`; }).join('');
        const lbls = s.days.map(x => `<span class="${x.k === t ? 't' : ''}">${m ? (x.d.getDate() % 5 === 0 || x.k === t ? x.d.getDate() : '') : DAYS[dow(x.d)]}</span>`).join('');
        const arcEl = (cls, label, v, goal) => { const len = Math.min(1, goal ? v / goal : 0) * 2 * Math.PI * 30; return `<div class="${cls}"><svg viewBox="0 0 76 76"><circle class="bg" cx="38" cy="38" r="30"/><circle class="fg" cx="38" cy="38" r="30" style="--len:${len.toFixed(1)}"/></svg><b><span data-count="${r0(v)}">${r0(v)}</span><small> g</small></b><small>${label} · ${Math.round(goal ? v / goal * 100 : 0)}%</small></div>`; };
        const top = new Map();
        Object.values(state.meals).filter(x => x.day > key(addDays(new Date(), -sumDays))).forEach(x => { const n = (x.name || '').trim(); if (n) top.set(n, (top.get(n) || 0) + 1); });
        const fav = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const pc = s.logged.length ? Math.round(s.avg.kcal / g.kcal * 100) : 0;
        el.innerHTML = `<div class="sbar"><nav class="seg dt-smode" style="--n:2;--i:${sumDays === 7 ? 0 : 1}"><button class="seg-b" data-sum="7" aria-selected="${sumDays === 7}">7 dni</button><button class="seg-b" data-sum="30" aria-selected="${sumDays === 30}">30 dni</button></nav></div>
          <div class="sgrid">
            <section class="scard${en}" style="--i:0"><header><div><h3>Kalorie</h3><small>średnio <b data-count="${r0(s.avg.kcal)}">${r0(s.avg.kcal)}</b> kcal z dni z wpisami (${s.logged.length})</small></div><strong class="${s.logged.length ? (Math.abs(s.avg.kcal - g.kcal) <= g.kcal * .1 ? 'good' : s.avg.kcal > g.kcal ? 'bad' : 'mid') : ''}"${s.logged.length ? ` data-count="${pc}" data-suf="%"` : ''}>${s.logged.length ? pc + '%' : '—'}</strong></header>
              <div class="sbars${m ? ' m' : ''}" style="--n:${sumDays}">${bars}<div class="starget" style="bottom:${g.kcal / max * 100}%"><span>${nf(g.kcal)}</span></div></div><div class="sdays${m ? ' m' : ''}" style="--n:${sumDays}">${lbls}</div>
              <div class="schips"><span class="schip">W celu ±10%: ${s.inGoal}/${s.logged.length || 0}</span><span class="schip rec">Seria wpisów: ${s.streak} ${s.streak === 1 ? 'dzień' : 'dni'}</span></div></section>
            <section class="scard${en}" style="--i:1"><header><div><h3>Makro średnio</h3><small>dziennie, względem celu</small></div></header><div class="avg">${arcEl('p', 'Białko', s.avg.p, g.p)}${arcEl('f', 'Tłuszcze', s.avg.f, g.f)}${arcEl('c', 'Węgle', s.avg.c, g.c)}</div></section>
            ${fav.length ? `<section class="scard${en}" style="--i:2"><header><div><h3>Najczęściej</h3><small>posiłki w tym okresie</small></div></header><div class="schips">${fav.map(([n, c]) => `<span class="schip">${esc(n)} · ${c}×</span>`).join('')}</div></section>` : ''}
          </div>`;
        if (animList) countIn(el);
      }

      /* ---------- okienka (arkusz od dołu w warstwie sekcji) ---------- */
      let ov = null, draft = null, scanJob = 0;
      const $ = s => ov && ov.querySelector(s);
      // Otwiera arkusz; gdy jakiś już jest otwarty, płynnie podmienia jego treść (wysokość i elementy przechodzą łagodnie).
      function sheet(title, sub, body, label, cls = '') {
        const inner = `<div class="sheet-h"><div><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ''}</div><button class="x" data-close aria-label="Zamknij">${XMARK}</button></div>${body}`;
        if (ov) {
          const sh = ov.querySelector('.sheet'), h0 = sh.offsetHeight;
          sh.className = `sheet dt-sheet ${cls}`; sh.setAttribute('aria-label', label || title.replace(/<[^>]+>/g, ''));
          sh.innerHTML = inner; sh.scrollTop = 0;
          if (!calm()) {
            const h1 = sh.offsetHeight;
            if (h0 !== h1) sh.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
            [...sh.children].forEach((c, i) => c.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 40 + i * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
          }
          return ov;
        }
        ov = document.createElement('div');
        ov.className = 'sheet-ov dt-ov'; ov.setAttribute('data-close', '');
        ov.innerHTML = `<div class="sheet dt-sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label || title)}">${inner}</div>`;
        layer.appendChild(ov);
        return ov;
      }
      function close(instant) {
        stopCam(); draft = null; scanJob++;
        const o = ov; ov = null;
        if (!o) return;
        if (instant || calm()) { o.remove(); return; }
        o.classList.add('out');
        setTimeout(() => o.remove(), 340);
      }

      // 1. wybór: zdjęcie (aparat / galeria → opis dla AI → analiza), kod kreskowy albo wpisanie ręczne
      function openScan(type) {
        const k = key(selDay);
        let file = null, prev = null;
        sheet('Dodaj posiłek', view === 'day' && k !== todayKey() ? dateLabel(k) : '', `
          <div class="pick" data-pick><label><span class="bob">${CAM}</span><span>Zrób zdjęcie</span><input type="file" accept="image/*" capture="environment" data-photo></label><label>${GALLERY}<span>Z galerii</span><input type="file" accept="image/*" data-photo></label></div>
          <div class="picked" data-picked hidden>
            <div class="ph-prev"><img data-img alt=""><label class="ph-change">Zmień zdjęcie<input type="file" accept="image/*" data-photo></label></div>
            <div class="field"><label for="dt-note">Opis zdjęcia</label><input id="dt-note" type="text" maxlength="160" required placeholder="np. kanapka z szynką, 2 kromki, bez masła" autocomplete="off"></div>
            <button class="btn btn-primary btn-block" data-go disabled>Analizuj posiłek</button>
          </div>
          <button class="opt" data-barcode><span class="opt-ic">${BARCODE}</span><span><b>Skanuj kod kreskowy</b><small>z bazy Open Food Facts</small></span><span class="opt-go">${CHEV(1)}</span></button>
          <button class="opt" data-manual><span class="opt-ic">${PEN}</span><span><b>Wpisz ręcznie</b><small>nazwa, kalorie i makro</small></span><span class="opt-go">${CHEV(1)}</span></button>`, 'Dodaj posiłek');
        ov.querySelectorAll('[data-photo]').forEach(inp => inp.addEventListener('change', () => {
          const f = inp.files?.[0]; if (!f) return;
          file = f; if (prev) URL.revokeObjectURL(prev); prev = URL.createObjectURL(f);
          $('[data-img]').src = prev; $('[data-pick]').hidden = true; $('[data-picked]').hidden = false;
          setTimeout(() => $('#dt-note')?.focus(), 250);
        }));
        // opis zdjęcia jest wymagany: bez niego przycisk „Analizuj” jest nieaktywny
        const note = () => $('#dt-note').value.trim();
        $('#dt-note').addEventListener('input', () => { $('[data-go]').disabled = !note(); });
        $('#dt-note').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-go]').click(); } });
        $('[data-go]').addEventListener('click', () => { if (!note()) { toast('Opisz, co jest na zdjęciu'); $('#dt-note').focus(); return; } if (file) runScan(file, note(), type); });
        $('[data-barcode]').addEventListener('click', () => openBarcode(type));
        $('[data-manual]').addEventListener('click', () => openQuickForm(newDraft(type)));
      }

      /* ---------- kod kreskowy: aparat + Open Food Facts (darmowa baza produktów, bez klucza) ---------- */
      let camStream = null, bcLoop = 0;
      function stopCam() { clearTimeout(bcLoop); camStream?.getTracks().forEach(t => t.stop()); camStream = null; }
      // iPhone nie ma wbudowanego BarcodeDetector — wtedy ładujemy zamiennik (ZXing w WebAssembly)
      let detectorP = null;
      const getDetector = () => detectorP ??= (async () => {
        const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
        if ('BarcodeDetector' in window) { try { const ok = await window.BarcodeDetector.getSupportedFormats(); if (formats.some(f => ok.includes(f))) return new window.BarcodeDetector({ formats }); } catch (_) { } }
        const m = await import('https://cdn.jsdelivr.net/npm/barcode-detector@2.3.1/dist/es/pure.js/+esm');
        return new m.BarcodeDetector({ formats });
      })().catch(e => { detectorP = null; throw e; });
      function openBarcode(type) {
        const job = ++scanJob;
        // samo okno aparatu — komunikaty wyskakują jako powiadomienia
        sheet('Kod kreskowy', 'nakieruj aparat na kod produktu', `
          <div class="bc" data-bc><video playsinline muted autoplay></video><div class="bc-frame"><i class="corner a"></i><i class="corner b"></i><i class="corner c"></i><i class="corner d"></i><i class="bc-line"></i></div></div>
          <button class="opt" data-manual><span class="opt-ic">${PEN}</span><span><b>Wpisz ręcznie</b><small>gdy kod się nie czyta</small></span><span class="opt-go">${CHEV(1)}</span></button>`, 'Kod kreskowy');
        $('[data-manual]').addEventListener('click', () => { stopCam(); openQuickForm(newDraft(type)); });
        (async () => {
          try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-cam');
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
            if (job !== scanJob) { stream.getTracks().forEach(t => t.stop()); return; }
            camStream = stream;
            const v = $('[data-bc] video'); v.srcObject = stream; await v.play().catch(() => { });
            const det = await getDetector();
            const tick = async () => {
              if (job !== scanJob || !camStream) return;
              try {
                if (v.readyState >= 2) {
                  const found = (await det.detect(v)).find(b => /^\d{8,14}$/.test(b.rawValue));
                  if (found && job === scanJob) { ctx.vibrate(40); $('[data-bc]')?.classList.add('hit'); stopCam(); lookup(found.rawValue, type, job); return; }
                }
              } catch (_) { }
              bcLoop = setTimeout(tick, 180);
            };
            tick();
          } catch (e) {
            if (job !== scanJob) return;
            $('[data-bc]')?.classList.add('off');
            toast(e?.name === 'NotAllowedError' ? 'Brak dostępu do aparatu — zezwól w ustawieniach' : 'Aparat niedostępny');
          }
        })();
      }
      async function lookup(code, type, job) {
        let p = null;
        try {
          const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_pl,generic_name_pl,brands,nutriments,serving_quantity,image_front_small_url`);
          const j = await r.json(); if (j.status === 1) p = j.product;
        } catch (_) { if (job === scanJob) { toast('Brak połączenia z Open Food Facts'); openBarcode(type); } return; }
        if (job !== scanJob) return;
        const n = p?.nutriments || {};
        const kcal100 = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
        if (!p || kcal100 == null) {
          // brak w bazie albo bez wartości odżywczych: od razu formularz do wpisania ręcznie
          const name = p ? (p.product_name_pl || p.product_name || '') : '';
          openQuickForm(newDraft(type, { name }));
          toast(p ? 'Produkt bez wartości odżywczych — wpisz je ręcznie' : 'Nie ma tego produktu w bazie — wpisz go ręcznie');
          return;
        }
        const name = (p.product_name_pl || p.product_name || p.generic_name_pl || 'Produkt').trim();
        const brand = (p.brands || '').split(',')[0].trim();
        // porcja z bazy tylko gdy wygląda na porcję (np. puszka 330 ml); „porcja” = całe opakowanie (mleko 1000 g) → start od 100 g
        const sq = Math.round(+p.serving_quantity), g = sq > 0 && sq <= 500 ? sq : 100, k = g / 100;
        const item = { n: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name, g, kcal: r0(kcal100 * k), p: r1((+n.proteins_100g || 0) * k), f: r1((+n.fat_100g || 0) * k), c: r1((+n.carbohydrates_100g || 0) * k) };
        let th = null;
        try { if (p.image_front_small_url) th = await shrink(await (await fetch(p.image_front_small_url)).blob(), 120, .7); } catch (_) { }
        if (job !== scanJob) return;
        openMealForm(newDraft(type, { name, items: [item], th, src: 'Open Food Facts', comment: `Na 100 g: ${r0(kcal100)} kcal · B ${nf(+n.proteins_100g || 0)} · T ${nf(+n.fat_100g || 0)} · W ${nf(+n.carbohydrates_100g || 0)}. Wpisz, ile zjadłeś — reszta przeliczy się sama.` }));
      }
      const newDraft = (type, extra = {}) => { const today = key(selDay) === todayKey() || view !== 'day'; const day = view === 'day' ? key(selDay) : todayKey(); return { id: null, day, at: today ? nowTime() : '12:00', type: type || typeByHour(today ? new Date().getHours() : 12), name: '', items: [{ n: '', g: 100, kcal: 0, p: 0, f: 0, c: 0 }], th: null, ai: false, ...extra }; };

      // Zmniejszenie zdjęcia na kanwie: do AI ~1024 px, miniatura do historii ~120 px.
      function shrink(file, max, q) {
        return new Promise((res, rej) => {
          const url = URL.createObjectURL(file), img = new Image();
          img.onload = () => {
            const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
            // miniatura: kwadrat ze środka
            if (max <= 200) { const side = Math.min(img.width, img.height); c.width = c.height = max; c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, max, max); }
            else { c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); }
            URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
          };
          img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Nie udało się wczytać zdjęcia')); };
          img.src = url;
        });
      }

      // 2. skanowanie: zdjęcie z sonarem i przemiataniem, potem wynik od AI
      const MSGS = ['Przyglądam się talerzowi…', 'Rozpoznaję składniki…', 'Ważę porcje na oko…', 'Liczę białko, tłuszcze i węgle…', 'Składam wynik…'];
      async function runScan(file, note, type) {
        const job = ++scanJob;
        let big, th;
        try { [big, th] = await Promise.all([shrink(file, 1024, .82), shrink(file, 120, .62)]); }
        catch (e) { toast(e.message); return; }
        if (job !== scanJob) return;
        sheet('Analizuję posiłek', note ? esc(note) : '', `<div class="scan" data-scan><img src="${big}" alt=""><i class="corner a"></i><i class="corner b"></i><i class="corner c"></i><i class="corner d"></i><i class="sonar"></i><i class="sonar s2"></i><i class="sonar s3"></i><i class="sonar-dot"></i><div class="sweep"></div></div><div class="scan-prog"><i></i></div><p class="scan-msg" data-msg><span>${MSGS[0]}</span></p><button class="linkish" data-close>Anuluj</button>`, 'Analiza posiłku');
        let mi = 0;
        const bar = $('.scan-prog i');
        requestAnimationFrame(() => { if (bar) bar.style.width = '14%'; });
        const msgInt = setInterval(() => {
          const msg = $('[data-msg]');
          if (job !== scanJob || !msg) { clearInterval(msgInt); return; }
          mi = Math.min(MSGS.length - 1, mi + 1);
          msg.innerHTML = `<span>${MSGS[mi]}</span>`;
          if (bar) bar.style.width = (14 + mi * 17) + '%';
        }, 2200);
        try {
          const res = await ctx.cloud.fn('meal-scan', { image: big.split(',')[1], mediaType: 'image/jpeg', note });
          clearInterval(msgInt);
          if (job !== scanJob) return;
          if (!res || !Array.isArray(res.items)) throw new Error('Pusta odpowiedź AI');
          const sc = $('[data-scan]'); if (sc) sc.classList.add('done'); if (bar) bar.style.width = '100%';
          const items = res.items.map(it => ({ n: String(it.name || '').slice(0, 80), g: r0(it.grams), kcal: r0(it.kcal), p: r1(it.protein), f: r1(it.fat), c: r1(it.carbs) }));
          const d = newDraft(type, { name: res.name || '', items: items.length ? items : [{ n: '', g: 100, kcal: 0, p: 0, f: 0, c: 0 }], th, big, ai: true, comment: res.comment || '', conf: res.confidence || '' });
          setTimeout(() => { if (job === scanJob) openMealForm(d); }, calm() ? 0 : 650);
          if (!items.length) toast(res.comment || 'Nie widzę jedzenia na zdjęciu');
        } catch (err) {
          clearInterval(msgInt);
          if (job !== scanJob) return;
          const msg = scanError(err);
          sheet('Nie udało się', '', `<div class="ai-note">${esc(msg)}</div><div class="confirm"><button class="btn btn-ghost" data-retry>Spróbuj ponownie</button><button class="btn btn-primary" data-manual>Wpisz ręcznie</button></div>`, 'Błąd skanowania');
          $('[data-retry]').addEventListener('click', () => runScan(file, note, type));
          $('[data-manual]').addEventListener('click', () => openQuickForm(newDraft(type, { th })));
        }
      }
      function scanError(err) {
        const m = (err?.message || '').toLowerCase();
        if (ctx.cloud.local && err?.status === 401) return 'Podgląd lokalny bez konta — skan AI działa tylko po zalogowaniu.';
        if (err instanceof TypeError || m.includes('failed to fetch')) return 'Brak połączenia z internetem (albo funkcja AI nie jest jeszcze włączona w Supabase).';
        if (err?.status === 404 || m.includes('not found')) return 'Funkcja AI „meal-scan” nie jest jeszcze wdrożona w Supabase.';
        if (err?.status === 429 || m.includes('limit')) return 'Dzisiejszy limit skanów się skończył — wpisz posiłek ręcznie albo spróbuj jutro.';
        if (err?.status === 401) return 'Sesja wygasła — zaloguj się ponownie.';
        if (err?.status === 402) return err.message;
        return 'AI nie odpowiedziało: ' + (err?.message || 'nieznany błąd');
      }

      // 3. wynik / edycja: składniki z gramaturą, sumy na żywo
      function openMealForm(d) {
        draft = JSON.parse(JSON.stringify(d));
        const editing = !!d.id;
        const photo = d.big || (d.src ? null : d.th); // produkt z kodu: mała miniatura nie nadaje się na duże zdjęcie
        const ti = Math.max(0, TYPES.findIndex(x => x[0] === d.type));
        const body = `
          ${photo ? `<div class="ph-big"><img src="${esc(photo)}" alt="">${d.conf ? `<span class="conf">AI · pewność: ${{ high: 'wysoka', medium: 'średnia', low: 'niska' }[d.conf] || esc(d.conf)}</span>` : ''}</div>` : ''}
          ${d.comment ? `<div class="ai-note">${d.src && d.th ? `<img class="ai-th" src="${esc(d.th)}" alt="">` : ''}<b>${esc(d.src || 'AI')}:</b> ${esc(d.comment)}</div>` : ''}
          <div class="field"><label for="dt-f-name">Nazwa</label><input id="dt-f-name" type="text" maxlength="80" value="${esc(d.name)}" placeholder="np. Owsianka z bananem" autocomplete="off"></div>
          <div class="tot" data-tot></div>
          <div class="field"><span class="lab">Składniki</span><div class="items" data-items></div><button type="button" class="addit" data-additem>${PLUS}Składnik</button></div>
          <div class="field"><span class="lab">Posiłek</span><div class="seg dt-types" style="--n:4;--i:${ti}">${TYPES.map(([v, l]) => `<label class="seg-b"><input type="radio" name="dt-type" value="${v}"${d.type === v ? ' checked' : ''}>${l}</label>`).join('')}</div></div>
          <div class="row-tm"><div class="field"><label for="dt-f-day">Dzień</label><input id="dt-f-day" type="date" value="${esc(d.day)}"></div><div class="field"><label for="dt-f-at">Godzina</label><input id="dt-f-at" type="time" value="${esc(d.at || '')}"></div></div>
          <div class="sheet-foot"><button class="btn btn-primary" data-save>${editing ? 'Zapisz' : 'Dodaj do dnia'}</button>${editing ? `<button class="btn btn-danger" data-del>Usuń</button>` : ''}</div>`;
        sheet(editing ? 'Posiłek' : d.ai ? 'Wynik skanu' : d.src ? 'Produkt' : 'Nowy posiłek', editing ? dateLabel(d.day) : '', body, 'Posiłek', 'wide');
        drawItems(); drawTot(true);
        $('[data-additem]').addEventListener('click', () => { draft.items.push({ n: '', g: 100, kcal: 0, p: 0, f: 0, c: 0 }); drawItems(draft.items.length - 1); drawTot(); });
        $('[data-save]').addEventListener('click', saveDraft);
        $('[data-del]')?.addEventListener('click', () => confirmDelete(draft.id));
        if (!editing && !d.ai) setTimeout(() => $('#dt-f-name')?.focus(), 200);
      }
      function drawItems(focus = -1) {
        const box = $('[data-items]'); if (!box) return;
        box.innerHTML = draft.items.map((it, i) => `<div class="it" data-i="${i}" style="--i:${focus >= 0 ? (i === focus ? 0 : -99) : i}"><input data-k="n" type="text" value="${esc(it.n)}" placeholder="Składnik" aria-label="Składnik" autocomplete="off"><span class="gw"><input data-k="g" type="text" inputmode="decimal" autocomplete="off" value="${it.g || ''}" aria-label="Gramy"></span><button type="button" class="rm" data-rm="${i}" aria-label="Usuń składnik">${XMARK}</button>
          <div class="it-m">${[['kcal', 'kcal'], ['p', 'B'], ['f', 'T'], ['c', 'W']].map(([k, l]) => `<label class="${k}">${l}<input data-k="${k}" type="text" inputmode="decimal" autocomplete="off" value="${it[k] || it[k] === 0 ? it[k] : ''}"></label>`).join('')}</div></div>`).join('');
        if (focus >= 0) box.querySelector(`[data-i="${focus}"] input`)?.focus();
      }
      function drawTot(first) {
        const box = $('[data-tot]'); if (!box) return;
        const t = totals(draft.items);
        if (first || !box.children.length) box.innerHTML = `<div><b data-cnt="t-kcal">0</b><small>kcal</small></div><div class="p"><b data-cnt="t-p">0</b><small>białko</small></div><div class="f"><b data-cnt="t-f">0</b><small>tłuszcz</small></div><div class="c"><b data-cnt="t-c">0</b><small>węgle</small></div>`;
        ['kcal', 'p', 'f', 'c'].forEach(k => {
          const el = box.querySelector(`[data-cnt="t-${k}"]`); if (first) shown.set('t-' + k, 0);
          if (shown.get('t-' + k) !== t[k] && !first) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
          countTo(el, t[k], first ? 900 : 300);
        });
      }
      layer.addEventListener('input', e => {
        const row = e.target.closest('.it'); if (!row || !draft || !ov?.contains(row)) return;
        const it = draft.items[+row.dataset.i], k = e.target.dataset.k; if (!it) return;
        if (k === 'n') { it.n = e.target.value; return; }
        const v = Math.max(0, parseFloat(String(e.target.value).replace(',', '.')) || 0);
        // Każdy składnik pamięta wartości na 1 g (it._d). Gramy × gęstość = kcal i makro — niezależnie od tego,
        // co jest w polu po drodze (skasowane pole, pierwsza cyfra), więc 40 g to zawsze dwa razy więcej niż 20 g.
        const dens = () => { if (!it._d && +it.g > 0) it._d = { kcal: it.kcal / it.g, p: it.p / it.g, f: it.f / it.g, c: it.c / it.g }; return it._d; };
        if (k === 'g') {
          const d = dens();
          it.g = v;
          if (d) ['kcal', 'p', 'f', 'c'].forEach(x => { it[x] = x === 'kcal' ? r0(d[x] * v) : r1(d[x] * v); const inp = row.querySelector(`[data-k="${x}"]`); if (inp) inp.value = it[x]; });
        } else {
          it[k] = v;
          const d = dens(); if (d && +it.g > 0) d[k] = v / it.g; // poprawka kcal/makro ręcznie: nowa wartość na 1 g dla dalszych zmian gramów
        }
        drawTot();
      });
      // rodzaj posiłku: pigułka jedzie do zaznaczonego
      layer.addEventListener('change', e => {
        if (e.target.name !== 'dt-type') return;
        const sg = e.target.closest('.dt-types'); if (sg) sg.style.setProperty('--i', TYPES.findIndex(x => x[0] === e.target.value));
      });
      layer.addEventListener('click', e => {
        if (!ov) return;
        const c = e.target.closest('[data-close]');
        if (c && (c !== ov || e.target === ov)) { close(); return; }
        const rm = e.target.closest('[data-rm]'); if (!rm || !draft) return;
        const i = +rm.dataset.rm, row = rm.closest('.it');
        const done = () => { if (!draft) return; draft.items.splice(i, 1); if (!draft.items.length) draft.items.push({ n: '', g: 100, kcal: 0, p: 0, f: 0, c: 0 }); drawItems(); drawTot(); };
        if (calm()) done(); else { row.classList.add('gone'); setTimeout(done, 300); }
      });
      function afterSave(m, isNew) {
        close();
        userAct = true; if (isNew) freshId = m.id;
        if (view !== 'day' || key(selDay) !== m.day) { if (view === 'day' && key(selDay) !== m.day) slideDir = m.day > key(selDay) ? 1 : -1; view = 'day'; selDay = fromKey(m.day); animList = true; }
        render();
      }
      function saveDraft() {
        const d = draft; if (!d) return;
        d.name = $('#dt-f-name').value.trim() || d.items.map(it => it.n.trim()).filter(Boolean).slice(0, 3).join(', ') || 'Posiłek';
        d.type = $('input[name="dt-type"]:checked')?.value || d.type;
        d.day = $('#dt-f-day').value || d.day; d.at = $('#dt-f-at').value || '';
        d.items = d.items.filter(it => it.n.trim() || it.kcal || it.p || it.f || it.c).map(it => ({ n: it.n.trim(), g: r0(it.g), kcal: r0(it.kcal), p: r1(it.p), f: r1(it.f), c: r1(it.c) }));
        if (!d.items.length) { toast('Dodaj co najmniej jeden składnik'); return; }
        const isNew = !d.id;
        const m = { id: d.id || uid(), day: d.day, at: d.at, type: d.type, name: d.name, items: d.items, th: d.th || null, ai: !!d.ai, created: d.created || Date.now() };
        state.meals[m.id] = m; save();
        afterSave(m, isNew);
        toast(isNew ? `Dodano „${m.name}” · ${r0(totals(m.items).kcal)} kcal` : 'Zapisano');
      }
      // Wpisanie ręczne: tylko nazwa, kalorie i makro (bez składników, gramatury, pory i godziny — dzień = oglądany, godzina = teraz)
      function openQuickForm(d) {
        const editing = !!d.id, t = editing ? totals(d.items) : { kcal: '', p: '', f: '', c: '' };
        const v = x => (x === '' || x == null) ? '' : r1(x);
        sheet(editing ? 'Posiłek' : 'Wpisz ręcznie', editing ? dateLabel(d.day) : '', `
          <div class="field"><label for="dt-q-name">Nazwa</label><input id="dt-q-name" type="text" maxlength="80" value="${esc(d.name || '')}" placeholder="np. Kanapka z serem" autocomplete="off"></div>
          <label class="qk"><input id="dt-q-kcal" type="text" inputmode="decimal" autocomplete="off" value="${v(t.kcal)}" placeholder="0" aria-label="Kalorie"><span>kcal</span></label>
          <div class="qm">${[['p', 'Białko'], ['f', 'Tłuszcze'], ['c', 'Węgle']].map(([m, l]) => `<div class="qm-f ${m}"><span class="gm-n"><i></i>${l}</span><label class="gm-i"><input id="dt-q-${m}" type="text" inputmode="decimal" autocomplete="off" value="${v(t[m])}" placeholder="0" aria-label="${l} w gramach"><em>g</em></label></div>`).join('')}</div>
          <div class="sheet-foot"><button class="btn btn-primary" data-qsave>${editing ? 'Zapisz' : 'Dodaj do dnia'}</button>${editing ? `<button class="btn btn-danger" data-qdel>Usuń</button>` : ''}</div>`, 'Wpisz ręcznie');
        const num = id => Math.max(0, parseFloat(String($('#' + id).value).replace(',', '.')) || 0);
        $('[data-qsave]').addEventListener('click', () => {
          const name = $('#dt-q-name').value.trim(), kcal = num('dt-q-kcal');
          if (!name) { toast('Wpisz nazwę'); $('#dt-q-name').focus(); return; }
          if (!kcal && !num('dt-q-p') && !num('dt-q-f') && !num('dt-q-c')) { toast('Wpisz kalorie'); $('#dt-q-kcal').focus(); return; }
          const isNew = !editing;
          const m = { ...(editing ? d : {}), id: d.id || uid(), day: d.day, at: d.at, type: d.type, name, items: [{ n: name, g: 0, kcal: r0(kcal), p: r1(num('dt-q-p')), f: r1(num('dt-q-f')), c: r1(num('dt-q-c')) }], th: d.th || null, ai: false, quick: true, created: d.created || Date.now() };
          delete m.big;
          state.meals[m.id] = m; save();
          afterSave(m, isNew);
          toast(isNew ? `Dodano „${m.name}” · ${r0(kcal)} kcal` : 'Zapisano');
        });
        $('[data-qdel]')?.addEventListener('click', () => confirmDelete(d.id));
        const inputs = [...ov.querySelectorAll('#dt-q-name, .qk input, .qm input')];
        inputs.forEach((i, n) => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (inputs[n + 1]) inputs[n + 1].focus(); else $('[data-qsave]').click(); } }));
        if (!editing) setTimeout(() => $('#dt-q-name')?.focus(), 200);
      }
      function confirmDelete(id) {
        const m = state.meals[id]; if (!m) return;
        sheet('Usunąć posiłek?', esc(m.name), `<div class="confirm"><button class="btn btn-ghost" data-close>Anuluj</button><button class="btn btn-primary" data-yes>Usuń</button></div>`);
        $('[data-yes]').addEventListener('click', () => {
          close();
          const tile = root.querySelector(`[data-meal="${CSS.escape(id)}"]`);
          const go = () => { delete state.meals[id]; save(); userAct = true; render(); toast('Usunięto'); };
          if (!tile || calm()) { go(); return; }
          tile.animate({ opacity: [1, 0], transform: ['none', 'translateX(40px) scale(.96)'], filter: ['none', 'blur(3px)'] }, { duration: 380, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).onfinish = go;
        });
      }
      // Ponowne dodanie posiłku z historii na dziś
      function logAgain(id) {
        const src = state.meals[id]; if (!src) return;
        const m = { ...JSON.parse(JSON.stringify(src)), id: uid(), day: todayKey(), at: nowTime(), type: typeByHour(new Date().getHours()), created: Date.now() };
        state.meals[m.id] = m; save();
        freshId = m.id; userAct = true; view = 'day'; selDay = dayOnly(new Date()); animList = true;
        try { localStorage.setItem(VIEW_KEY, view); } catch (_) { }
        render(); scroller.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
        toast(`Dodano na dziś: ${m.name}`);
      }

      // Cele (jak w Fitatu): wpisujesz kalorie, a makro ustawiasz jako % energii dnia albo w gramach — pola pilnują się nawzajem.
      // Białko i węgle mają 4 kcal/g, tłuszcz 9 kcal/g. Zmiana kalorii przelicza gramy przy tych samych %. Suma % musi dać 100.
      const KCAL_G = { p: 4, f: 9, c: 4 };
      function openGoals() {
        const g = state.goals, M = [['p', 'Białko'], ['f', 'Tłuszcze'], ['c', 'Węglowodany']];
        let kcal = g.kcal;
        const pct = {};
        M.forEach(([m]) => { pct[m] = g.pct?.[m] ?? Math.round((g[m] * KCAL_G[m]) / g.kcal * 100); });
        if (!g.pct) pct.c += 100 - (pct.p + pct.f + pct.c); // stare cele w gramach: zaokrąglona reszta do węgli, żeby było równe 100%
        const grams = m => Math.round(kcal * pct[m] / 100 / KCAL_G[m]);
        sheet('Cele dzienne', '', `
          <div class="goal-k"><button data-gk="-50" aria-label="Mniej">−</button><input id="dt-g-kcal" type="number" inputmode="numeric" min="800" max="8000" step="50" value="${kcal}" aria-label="Kalorie"><button data-gk="50" aria-label="Więcej">+</button></div>
          <p class="hint">kcal dziennie</p>
          <div class="gbar" data-gbar>${M.map(([m]) => `<i class="${m}"></i>`).join('')}</div>
          <div class="gmac">${M.map(([m, l]) => `<div class="gm ${m}"><span class="gm-n"><i></i>${l}</span><label class="gm-i"><input data-pct="${m}" type="number" inputmode="numeric" min="0" max="100" aria-label="${l} w procentach"><em>%</em></label><label class="gm-i"><input data-g="${m}" type="number" inputmode="numeric" min="0" aria-label="${l} w gramach"><em>g</em></label></div>`).join('')}</div>
          <p class="split-sum" data-gsum></p>
          <button class="btn btn-primary btn-block" data-gsave>Zapisz cele</button>`, 'Cele');
        const total = () => M.reduce((a, [m]) => a + pct[m], 0);
        // odświeża pola; skip = pole, które użytkownik właśnie wpisuje (żeby nie skakał mu kursor)
        const sync = skip => {
          M.forEach(([m]) => {
            const pi = $(`[data-pct="${m}"]`), gi = $(`[data-g="${m}"]`);
            if (pi !== skip) pi.value = Math.round(pct[m]);
            if (gi !== skip) gi.value = grams(m);
            $('[data-gbar]').querySelector('.' + m).style.width = Math.min(100, pct[m]) + '%';
          });
          const s = Math.round(total()), ok = s === 100, el = $('[data-gsum]');
          el.textContent = ok ? 'Razem 100% ✓' : `Razem ${s}% — ${s < 100 ? 'brakuje ' + (100 - s) : 'za dużo o ' + (s - 100)}%`;
          el.classList.toggle('bad', !ok); el.classList.toggle('good', ok);
          $('[data-gsave]').disabled = !ok;
        };
        const setKcal = v => { kcal = Math.max(0, Math.round(v) || 0); sync($('#dt-g-kcal')); };
        $('#dt-g-kcal').addEventListener('input', e => setKcal(+e.target.value));
        ov.querySelectorAll('[data-gk]').forEach(b => b.addEventListener('click', () => { kcal = Math.max(800, kcal + +b.dataset.gk); $('#dt-g-kcal').value = kcal; sync(); }));
        ov.querySelectorAll('[data-pct]').forEach(i => i.addEventListener('input', () => { pct[i.dataset.pct] = Math.max(0, Math.min(100, +i.value || 0)); sync(i); }));
        ov.querySelectorAll('[data-g]').forEach(i => i.addEventListener('input', () => { const m = i.dataset.g; pct[m] = kcal ? Math.max(0, (+i.value || 0) * KCAL_G[m] / kcal * 100) : 0; sync(i); }));
        ov.querySelectorAll('.gm input').forEach(i => i.addEventListener('blur', () => sync())); // po wyjściu z pola: równe liczby w obu
        // pasek podziału rośnie od zera przy otwarciu
        const gbar = $('[data-gbar]');
        if (!calm()) { gbar.querySelectorAll('i').forEach(i => { i.style.width = '0'; }); requestAnimationFrame(() => requestAnimationFrame(() => sync())); }
        else sync();
        if (!calm()) $('[data-gsum]').textContent = '';
        $('[data-gsave]').addEventListener('click', () => {
          if (Math.round(total()) !== 100 || kcal < 800) { toast(kcal < 800 ? 'Za mało kalorii (min. 800)' : 'Makro musi dać razem 100%'); return; }
          const rp = { p: Math.round(pct.p), f: Math.round(pct.f) }; rp.c = 100 - rp.p - rp.f;
          state.goals = { kcal, p: grams('p'), f: grams('f'), c: grams('c'), pct: rp };
          save(); close(); prevDayKey = null; render(); toast('Cele zapisane');
        });
      }

      /* ---------- zdarzenia ---------- */
      function setView(v) { if (v === view) return; view = v; animList = true; try { localStorage.setItem(VIEW_KEY, view); } catch (_) { } render(); }
      function step(dir) { if (view !== 'day') return; selDay = addDays(selDay, dir); slideDir = dir; ctx.vibrate(6); render(); }
      function goToday() { if (key(selDay) === todayKey()) return; slideDir = selDay > new Date() ? -1 : 1; selDay = dayOnly(new Date()); render(); }
      root.addEventListener('click', e => {
        const ag = e.target.closest('[data-again]'); if (ag) { e.stopPropagation(); logAgain(ag.dataset.again); return; }
        const ml = e.target.closest('[data-meal]');
        if (ml) {
          const m = state.meals[ml.dataset.meal]; if (!m) return;
          if (!calm()) { ml.animate({ transform: ['scale(1)', 'scale(1.025)', 'scale(1)'] }, { duration: 320, easing: 'cubic-bezier(.3,.7,.4,1)' }); ripple(e.clientX, e.clientY, 1); }
          setTimeout(() => (m.quick ? openQuickForm : openMealForm)(m), calm() ? 0 : 140); return;
        }
        if (e.target.closest('[data-add]')) { if (e.clientX || e.clientY) ripple(e.clientX, e.clientY, .8); openScan(); return; }
        if (e.target.closest('[data-goals]')) { openGoals(); return; }
        const vt = e.target.closest('[data-view]'); if (vt) { if (e.clientX || e.clientY) ripple(e.clientX, e.clientY, .7); setView(vt.dataset.view); return; }
        const nav = e.target.closest('[data-nav]'); if (nav) { step(+nav.dataset.nav); return; }
        if (e.target.closest('[data-today]')) { goToday(); return; }
        const sm = e.target.closest('[data-sum]'); if (sm) { if (+sm.dataset.sum === sumDays) return; sumDays = +sm.dataset.sum; animList = true; render(); return; }
        if (e.target.closest('[data-more]')) { hLimit += 14; render(); return; }
        const gd = e.target.closest('[data-goday]'); if (gd) { selDay = fromKey(gd.dataset.goday); prevDayKey = null; setView('day'); scroller.scrollTo({ top: 0 }); return; }
        if (e.target.closest('.ring') && !calm()) ripple(e.clientX, e.clientY, 1.4);
      });
      root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-again]')) { e.preventDefault(); e.stopPropagation(); logAgain(e.target.dataset.again); } });
      root.addEventListener('input', e => { if (e.target.matches('[data-hq]')) { hQuery = e.target.value; hLimit = 14; animList = false; renderHistory(); } });
      document.addEventListener('keydown', e => {
        if (!ctx.active) return;
        if (e.key === 'Escape' && ov) { close(); return; }
        if (e.key === 'Enter' && ov && e.target.matches('.it input')) { e.preventDefault(); e.target.blur(); return; }
        if (ov || e.target.matches('input, textarea, select') || e.target.closest('.wheel')) return;
        if (e.key === 'ArrowLeft') step(-1);
        if (e.key === 'ArrowRight') step(1);
      });
      // telefon: przesunięcie palcem w bok zmienia dzień
      let sw = null;
      const dayEl = vEl('day');
      dayEl.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') sw = { x: e.clientX, y: e.clientY, pid: e.pointerId }; });
      dayEl.addEventListener('pointerup', e => {
        if (!sw || e.pointerId !== sw.pid) return;
        const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
      });
      dayEl.addEventListener('pointercancel', () => { sw = null; });
      // nowy dzień: po północy „dziś” przeskakuje samo
      let lastToday = todayKey();
      function checkDayChange() { const t = todayKey(); if (t === lastToday) return false; const wasToday = key(selDay) === lastToday; lastToday = t; if (wasToday) selDay = dayOnly(new Date()); render(); return true; }
      document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx.active) checkDayChange(); });
      setInterval(checkDayChange, 60000);

      /* ---------- efekty: kręgi po dotknięciu, świętowanie celu ---------- */
      function ripple(x, y, k = 1) {
        if (calm() || (!x && !y)) return;
        [0, 140].forEach(delay => {
          const r = document.createElement('i');
          r.className = 'dt-ripple';
          Object.assign(r.style, { left: x + 'px', top: y + 'px' });
          layer.appendChild(r);
          r.animate({ transform: ['translate(-50%,-50%) scale(.1)', `translate(-50%,-50%) scale(${k})`], opacity: [.55, 0] },
            { duration: 650, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' }).onfinish = () => r.remove();
          setTimeout(() => r.remove(), 1000);
        });
      }
      // Cel kalorii na dziś osiągnięty: rozbłysk wokół koła i podskok liczby.
      function celebrate() {
        ctx.vibrate([15, 60, 25]);
        toast('Cel kalorii na dziś osiągnięty');
        if (calm()) return;
        const w = vEl('day').querySelector('.ring-w'); if (!w) return;
        w.animate({ transform: ['scale(1)', 'scale(1.08)', 'scale(.98)', 'scale(1)'] }, { duration: 900, easing: 'ease-out' });
        w.classList.remove('glow'); void w.offsetWidth; w.classList.add('glow');
      }

      render();

      return {
        getState: () => state,
        applyState,
        reset,
        // wejście do sekcji: posiłki wpływają kaskadą, koło napełnia się od zera
        show() { checkDayChange(); hello = true; prevDayKey = null; render(); },
        hide() { close(true); },
      };
    },
  });
})();
