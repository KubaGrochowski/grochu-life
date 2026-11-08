/* Grochu life — sekcja Wersety: ulubione wersety biblijne (treść + gdzie to jest), werset dnia, wyszukiwarka.
   Dane w localStorage i w Supabase (wspólna tabela life_data, sekcja „verses”). */
(() => {
  'use strict';
  const STORAGE_KEY = 'glife.verses.v1';
  const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M1.5 7h11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const X = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  const SEARCH = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.7"/><path d="M10.5 10.5l3.2 3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const BOOK = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5C10.2 5 7.6 4.5 4.5 4.8v13.4c3.1-.3 5.7.2 7.5 1.7 1.8-1.5 4.4-2 7.5-1.7V4.8C16.4 4.5 13.8 5 12 6.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.5v13.4" stroke="currentColor" stroke-width="1.6"/></svg>';
  // odnośnik na końcu wklejonego tekstu, np. „(J 3,16)”, „— 1 Kor 13:4-7”, „Ps 23, 1”
  const REF_RE = /[\s—–-]*[(\[]?\s*((?:[1-3]\s?)?[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{0,14}\.?\s?\d{1,3}\s?[,:]\s?\d{1,3}(?:\s?[-–]\s?\d{1,3})?(?:\s?[a-z])?)\s*[)\]]?\s*$/;

  GL.register({
    id: 'verses', label: 'Wersety', order: 40,
    icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5C10.2 5 7.6 4.5 4.5 4.8v13.4c3.1-.3 5.7.2 7.5 1.7 1.8-1.5 4.4-2 7.5-1.7V4.8C16.4 4.5 13.8 5 12 6.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6.5v13.4M8.2 8.6v3.6M6.6 10.1h3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    cloud: {
      table: 'life_data', key: 'verses',
      flatten: s => { const items = {}; Object.values(s.verses || {}).forEach(v => { items['v:' + v.id] = v; }); return items; },
      unflatten: items => { const verses = {}; Object.keys(items).forEach(k => { if (k.startsWith('v:')) verses[k.slice(2)] = items[k]; }); return { verses }; },
    },
    init(ctx) {
      const { root, esc, calm } = ctx;
      const load = () => { try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (s?.verses) return s; } catch (_) { } return { verses: {} }; };
      let state = load(), query = '', fresh = null;
      const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { } ctx.changed(); };
      const list = () => Object.values(state.verses).sort((a, b) => b.at - a.at);
      const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

      // werset dnia: ten sam przez cały dzień, kolejny następnego dnia
      function daily() {
        const all = list().sort((a, b) => a.at - b.at); if (!all.length) return null;
        const d = new Date(), n = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 864e5) + d.getFullYear() * 7;
        return all[n % all.length];
      }

      const NCHEV = '<svg class="vs-nch" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const opened = new Set();   // karty z rozwiniętą notatką (zostają rozwinięte po odświeżeniu listy)
      const noteHtml = v => v.note ? `<button type="button" class="vs-nt" data-note="${v.id}" aria-expanded="${opened.has(v.id)}"><span>Czego mnie uczy</span>${NCHEV}</button>
        <div class="vs-nw"><div class="vs-ni"><p class="vs-note">${esc(v.note)}</p></div></div>` : '';
      const card = (v, cls, extra = '') => `<article class="${cls}${opened.has(v.id) ? ' open' : ''}" ${extra} data-open="${v.id}" role="button" tabindex="0">`;
      function render(anim = true) {
        const all = list(), q = norm(query.trim());
        const shown = q ? all.filter(v => norm(v.text).includes(q) || norm(v.ref).includes(q) || norm(v.note).includes(q)) : all;
        const day = daily();
        root.innerHTML = `
          <header class="sec-head"><h1 class="sec-title">Wersety</h1><button class="btn btn-primary vs-add" data-add>${PLUS}Dodaj</button></header>
          <div class="vs">
            ${day && !q ? `${card(day, 'vs-day' + (anim ? ' rise' : ''))}<span class="eyebrow">Werset dnia</span><blockquote>${esc(day.text)}</blockquote><cite>${esc(day.ref)}</cite>${noteHtml(day)}</article>` : ''}
            ${all.length > 4 ? `<label class="vs-search${anim ? ' rise' : ''}" style="--d:1">${SEARCH}<input type="search" placeholder="Szukaj w wersetach" value="${esc(query)}" autocomplete="off"></label>` : ''}
            ${all.length ? `<div class="vs-count${anim ? ' rise' : ''}" style="--d:1"><span>${shown.length} ${plural(shown.length)}</span></div>` : ''}
            <div class="vs-list">${shown.map((v, i) => `${card(v, 'vs-card' + (anim ? ' rise' : '') + (v.id === fresh ? ' fresh' : ''), `style="--d:${Math.min(i + 2, 12)}"`)}<p>${esc(v.text)}</p><cite>${esc(v.ref)}</cite>${noteHtml(v)}</article>`).join('')}</div>
            ${!all.length ? `<div class="vs-empty rise"><div class="vs-empty-ic">${BOOK}</div><p>Dodaj swój pierwszy werset</p></div>` : ''}
            ${q && !shown.length ? '<p class="empty">Nic nie pasuje do wyszukiwania</p>' : ''}
          </div>`;
        fresh = null;
      }
      const plural = n => n === 1 ? 'werset' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'wersety' : 'wersetów';

      // formularz: wklejony tekst z odnośnikiem na końcu sam się rozdziela na treść i „gdzie”
      function openForm(v, focusNote) {
        const sh = ctx.sheet(`
          <div class="vs-sh-h"><h2>${v ? 'Edytuj werset' : 'Nowy werset'}</h2><button class="icon-btn" data-close aria-label="Zamknij">${X}</button></div>
          <div class="field"><label for="vs-text">Werset</label><textarea id="vs-text" rows="5" placeholder="Wklej treść wersetu">${esc(v?.text || '')}</textarea></div>
          <div class="field"><label for="vs-ref">Gdzie to jest</label><input id="vs-ref" type="text" placeholder="np. J 3,16 albo Flp 4,13" value="${esc(v?.ref || '')}" autocomplete="off" autocapitalize="words"></div>
          <p class="vs-hint" id="vs-hint" hidden></p>
          <div class="field"><label for="vs-note">Czego mnie uczy <small>(opcjonalnie)</small></label><textarea id="vs-note" rows="4" placeholder="Twoje przemyślenia o tym wersecie">${esc(v?.note || '')}</textarea></div>
          <button class="btn btn-primary btn-block" id="vs-save">Zapisz</button>`, { cls: 's-verses vs-sheet' });
        const t = sh.el.querySelector('#vs-text'), r = sh.el.querySelector('#vs-ref'), hint = sh.el.querySelector('#vs-hint');
        const split = () => {
          if (r.value.trim()) return;
          const m = t.value.trim().match(REF_RE); if (!m || m.index < 8) return;
          r.value = m[1].replace(/\s+/g, ' ').trim(); t.value = t.value.trim().slice(0, m.index).replace(/[\s„"”]+$/, '').replace(/^[„"]/, '');
          hint.textContent = `Odnośnik „${r.value}” przeniesiony do pola niżej`; hint.hidden = false;
          if (!calm()) r.animate([{ boxShadow: '0 0 0 4px rgba(226, 201, 157, .45)' }, { boxShadow: '0 0 0 0 rgba(226, 201, 157, 0)' }], { duration: 900, easing: 'ease-out' });
        };
        t.addEventListener('paste', () => setTimeout(split, 0));
        t.addEventListener('blur', split);
        if (!v) setTimeout(() => t.focus(), 350);
        else if (focusNote) setTimeout(() => sh.el.querySelector('#vs-note').focus(), 380);
        sh.el.querySelector('#vs-save').addEventListener('click', () => {
          split();
          const text = t.value.trim(), ref = r.value.trim();
          if (!text) { ctx.toast('Wpisz treść wersetu'); t.focus(); return; }
          if (!ref) { ctx.toast('Wpisz, gdzie jest ten werset'); r.focus(); return; }
          const id = v?.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const note = sh.el.querySelector('#vs-note').value.trim();
          state.verses[id] = { id, text, ref, ...(note ? { note } : {}), at: v?.at || Date.now() };
          if (note && !v?.note) opened.add(id);   // świeża notatka od razu widoczna pod wersetem
          save(); fresh = id; sh.close(); render(); ctx.toast(v ? 'Zapisano zmiany' : 'Dodano werset');
        });
      }

      // podgląd wersetu: duży tekst, kopiowanie, edycja, usunięcie
      function openVerse(id) {
        const v = state.verses[id]; if (!v) return;
        const sh = ctx.sheet(`
          <div class="vs-sh-h"><span class="eyebrow">Werset</span><button class="icon-btn" data-close aria-label="Zamknij">${X}</button></div>
          <blockquote class="vs-big">${esc(v.text)}</blockquote><cite class="vs-big-ref">${esc(v.ref)}</cite>
          ${v.note ? `<section class="vs-big-note"><span class="eyebrow">Czego mnie uczy</span><p>${esc(v.note)}</p></section>` : '<button class="vs-addnote" data-addnote>+ Dopisz, czego mnie uczy</button>'}
          <div class="vs-acts"><button class="btn" data-copy>Kopiuj</button><button class="btn" data-edit>Edytuj</button><button class="btn btn-danger" data-del>Usuń</button></div>`, { cls: 's-verses vs-sheet' });
        sh.el.querySelector('[data-copy]').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(`${v.text}\n— ${v.ref}${v.note ? `\n\n${v.note}` : ''}`); ctx.toast('Skopiowano'); } catch (_) { ctx.toast('Nie udało się skopiować'); }
        });
        sh.el.querySelector('[data-edit]').addEventListener('click', () => { sh.close(); setTimeout(() => openForm(v), 120); });
        sh.el.querySelector('[data-addnote]')?.addEventListener('click', () => { sh.close(); setTimeout(() => openForm(v, true), 120); });
        const del = sh.el.querySelector('[data-del]');
        del.addEventListener('click', () => {
          if (!del.classList.contains('sure')) { del.classList.add('sure'); del.textContent = 'Na pewno?'; return; }
          sh.close();
          const card = root.querySelector(`.vs-card[data-open="${id}"]`);
          const done = () => { delete state.verses[id]; save(); render(false); ctx.toast('Usunięto werset'); };
          if (card && !calm()) card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-40px) scale(.96)' }], { duration: 280, easing: 'ease-in' }).onfinish = done; else done();
        });
      }

      root.addEventListener('click', e => {
        if (e.target.closest('[data-add]')) { openForm(null); return; }
        const nt = e.target.closest('[data-note]');
        if (nt) {
          const c = nt.closest('[data-open]'), id = nt.dataset.note, on = !opened.has(id);
          on ? opened.add(id) : opened.delete(id);
          c.classList.toggle('open', on); nt.setAttribute('aria-expanded', on); ctx.vibrate(6);
          return;
        }
        const o = e.target.closest('[data-open]'); if (o) openVerse(o.dataset.open);
      });
      root.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('article[data-open]')) { e.preventDefault(); openVerse(e.target.dataset.open); }
      });
      root.addEventListener('input', e => {
        if (e.target.type !== 'search') return;
        query = e.target.value;
        const pos = e.target.selectionStart; render(false);
        const inp = root.querySelector('.vs-search input'); if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (_) { } }
      });
      render();

      return {
        getState: () => state,
        applyState(s) { state = { verses: s.verses || {} }; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { } render(false); },
        reset() { state = { verses: {} }; query = ''; try { localStorage.removeItem(STORAGE_KEY); } catch (_) { } render(false); },
        show: () => render(),
      };
    },
  });
})();
