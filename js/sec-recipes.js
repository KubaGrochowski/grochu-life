/* Grochu life — sekcja Przepisy: własne przepisy (zdjęcie, kategoria, czas, porcje, składniki, kroki, notatka).
   Dane w localStorage i w Supabase (wspólna tabela life_data, sekcja „recipes”). Zdjęcie zmniejszane do ~720 px. */
(() => {
  'use strict';
  const STORAGE_KEY = 'glife.recipes.v1';
  const CATS = ['Śniadanie', 'Obiad', 'Kolacja', 'Deser', 'Przekąska', 'Inne'];
  const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M1.5 7h11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const X = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  const SEARCH = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.7"/><path d="M10.5 10.5l3.2 3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const CLOCK = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.8V8l2.2 1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const PEOPLE = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="6" cy="5.5" r="2.3" stroke="currentColor" stroke-width="1.5"/><path d="M2 13c.6-2.3 2.1-3.5 4-3.5s3.4 1.2 4 3.5M10.5 3.6a2.2 2.2 0 0 1 0 4M12 9.8c1 .5 1.7 1.6 2 3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const CAMERA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.3" stroke="currentColor" stroke-width="1.7"/></svg>';
  const POT = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10h16v6.5A3.5 3.5 0 0 1 16.5 20h-9A3.5 3.5 0 0 1 4 16.5zM2 10h2M20 10h2M9 7c0-1 .8-1.4.8-2.4M12.5 7c0-1 .8-1.4.8-2.4M7.5 10V8.5h9V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  GL.register({
    id: 'recipes', label: 'Przepisy', order: 35,
    icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17.5h10v2.2a.8.8 0 0 1-.8.8H7.8a.8.8 0 0 1-.8-.8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 17.5v-4.2A4.3 4.3 0 0 1 8.6 5a4.4 4.4 0 0 1 6.8 0A4.3 4.3 0 0 1 17 13.3v4.2" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10.5 17.5v-3M13.5 17.5v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    cloud: {
      table: 'life_data', key: 'recipes',
      flatten: s => { const items = {}; Object.values(s.recipes || {}).forEach(r => { items['r:' + r.id] = r; }); return items; },
      unflatten: items => { const recipes = {}; Object.keys(items).forEach(k => { if (k.startsWith('r:')) recipes[k.slice(2)] = items[k]; }); return { recipes }; },
    },
    init(ctx) {
      const { root, esc, calm } = ctx;
      const load = () => { try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (s?.recipes) return s; } catch (_) { } return { recipes: {} }; };
      let state = load(), query = '', cat = '', fresh = null;
      const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch (_) { ctx.toast('Brak miejsca w pamięci przeglądarki — spróbuj mniejszego zdjęcia'); return false; } finally { ctx.changed(); } };
      const list = () => Object.values(state.recipes).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
      const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
      const lines = s => String(s || '').split('\n').map(x => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
      const pl = (n, a, b, c) => n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;
      const meta = r => [r.time ? `<span>${CLOCK}${r.time} min</span>` : '', r.serv ? `<span>${PEOPLE}${r.serv} ${pl(+r.serv, 'porcja', 'porcje', 'porcji')}</span>` : ''].join('');
      const cover = (r, cls) => r.photo ? `<div class="${cls}" style="background-image:url('${r.photo}')"></div>` : `<div class="${cls} none"><span>${esc((r.name || '?')[0].toUpperCase())}</span></div>`;

      function render(anim = true) {
        const all = list(), q = norm(query.trim());
        const cats = CATS.filter(c => all.some(r => r.cat === c));
        if (cat && !cats.includes(cat)) cat = '';
        const shown = all.filter(r => (!cat || r.cat === cat) && (!q || norm(r.name).includes(q) || (r.ingr || []).some(x => norm(x).includes(q))));
        const a = anim ? ' rise' : '';
        root.innerHTML = `
          <header class="sec-head"><h1 class="sec-title">Przepisy</h1><button class="btn btn-primary rc-add" data-add>${PLUS}Dodaj</button></header>
          <div class="rc">
            ${all.length > 3 ? `<label class="rc-search${a}">${SEARCH}<input type="search" placeholder="Szukaj przepisu lub składnika" value="${esc(query)}" autocomplete="off"></label>` : ''}
            ${cats.length > 1 ? `<div class="rc-cats${a}" style="--d:1"><button class="chip${cat ? '' : ' on'}" data-cat="">Wszystkie</button>${cats.map(c => `<button class="chip${cat === c ? ' on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div>` : ''}
            <div class="rc-grid">${shown.map((r, i) => `<button class="rc-card${a}${r.id === fresh ? ' fresh' : ''}" style="--d:${Math.min(i + 2, 12)}" data-open="${r.id}">${cover(r, 'rc-ph')}<div class="rc-body"><b>${esc(r.name)}</b><div class="rc-meta">${r.cat ? `<span class="rc-cat">${esc(r.cat)}</span>` : ''}${meta(r)}</div></div></button>`).join('')}</div>
            ${!all.length ? `<div class="rc-empty rise"><div class="rc-empty-ic">${POT}</div><p>Dodaj swój pierwszy przepis — składniki, kroki i zdjęcie.</p><button class="btn btn-primary" data-add>${PLUS}Dodaj przepis</button></div>` : ''}
            ${all.length && !shown.length ? '<p class="empty">Nic nie pasuje</p>' : ''}
          </div>`;
        fresh = null;
      }

      // zdjęcie: zmniejszone do 720 px (JPEG), żeby dane szybko się synchronizowały
      function shrink(file) {
        return new Promise((res, rej) => {
          const img = new Image(), url = URL.createObjectURL(file);
          img.onload = () => {
            const k = Math.min(1, 720 / Math.max(img.width, img.height)), c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.72));
          };
          img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Nie udało się wczytać zdjęcia')); };
          img.src = url;
        });
      }

      function openForm(r) {
        let photo = r?.photo || '', pickCat = r?.cat || '';
        const sh = ctx.sheet(`
          <div class="rc-sh-h"><h2>${r ? 'Edytuj przepis' : 'Nowy przepis'}</h2><button class="icon-btn" data-close aria-label="Zamknij">${X}</button></div>
          <label class="rc-photo${photo ? ' has' : ''}" id="rc-photo" style="${photo ? `background-image:url('${photo}')` : ''}"><input type="file" accept="image/*" hidden><span>${CAMERA}<em>${photo ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}</em></span></label>
          <div class="field"><label for="rc-name">Nazwa</label><input id="rc-name" type="text" value="${esc(r?.name || '')}" placeholder="np. Owsianka z jabłkiem" autocomplete="off"></div>
          <div class="field"><label>Kategoria</label><div class="rc-pick">${CATS.map(c => `<button type="button" class="chip${pickCat === c ? ' on' : ''}" data-pick="${c}">${c}</button>`).join('')}</div></div>
          <div class="rc-two"><div class="field"><label for="rc-time">Czas (min)</label><input id="rc-time" type="number" inputmode="numeric" min="0" value="${esc(r?.time || '')}" placeholder="30"></div>
          <div class="field"><label for="rc-serv">Porcje</label><input id="rc-serv" type="number" inputmode="numeric" min="0" value="${esc(r?.serv || '')}" placeholder="2"></div></div>
          <div class="field"><label for="rc-ingr">Składniki <small>— każdy w nowej linii</small></label><textarea id="rc-ingr" rows="6" placeholder="200 g płatków owsianych&#10;1 jabłko&#10;szczypta cynamonu">${esc((r?.ingr || []).join('\n'))}</textarea></div>
          <div class="field"><label for="rc-steps">Przygotowanie <small>— każdy krok w nowej linii</small></label><textarea id="rc-steps" rows="6" placeholder="Zagotuj mleko.&#10;Dodaj płatki i gotuj 5 minut.">${esc((r?.steps || []).join('\n'))}</textarea></div>
          <div class="field"><label for="rc-note">Notatka</label><textarea id="rc-note" rows="2" placeholder="Opcjonalnie">${esc(r?.note || '')}</textarea></div>
          <button class="btn btn-primary btn-block" id="rc-save">Zapisz przepis</button>`, { cls: 's-recipes rc-sheet' });
        const el = sh.el, ph = el.querySelector('#rc-photo');
        ph.querySelector('input').addEventListener('change', async e => {
          const f = e.target.files?.[0]; if (!f) return;
          try {
            photo = await shrink(f);
            ph.style.backgroundImage = `url('${photo}')`; ph.classList.add('has'); ph.querySelector('em').textContent = 'Zmień zdjęcie';
            if (!calm()) ph.animate([{ opacity: .4, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
          } catch (ex) { ctx.toast(ex.message); }
        });
        el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
          pickCat = pickCat === b.dataset.pick ? '' : b.dataset.pick;
          el.querySelectorAll('[data-pick]').forEach(x => x.classList.toggle('on', x.dataset.pick === pickCat));
        }));
        if (!r) setTimeout(() => el.querySelector('#rc-name').focus(), 350);
        el.querySelector('#rc-save').addEventListener('click', () => {
          const name = el.querySelector('#rc-name').value.trim();
          if (!name) { ctx.toast('Wpisz nazwę przepisu'); el.querySelector('#rc-name').focus(); return; }
          const id = r?.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const num = s => { const v = parseInt(el.querySelector(s).value, 10); return v > 0 ? v : null; };
          state.recipes[id] = { id, name, cat: pickCat, time: num('#rc-time'), serv: num('#rc-serv'), ingr: lines(el.querySelector('#rc-ingr').value), steps: lines(el.querySelector('#rc-steps').value), note: el.querySelector('#rc-note').value.trim(), photo, at: r?.at || Date.now() };
          if (!save()) return;
          fresh = id; sh.close(); render(); ctx.toast(r ? 'Zapisano zmiany' : 'Dodano przepis');
        });
      }

      // przepis: zdjęcie, składniki do odhaczania przy gotowaniu, ponumerowane kroki
      function openRecipe(id) {
        const r = state.recipes[id]; if (!r) return;
        const sh = ctx.sheet(`
          ${r.photo ? `<div class="rc-hero" style="background-image:url('${r.photo}')"></div>` : ''}
          <div class="rc-sh-h"><div><span class="eyebrow">${esc(r.cat || 'Przepis')}</span><h2>${esc(r.name)}</h2></div><button class="icon-btn" data-close aria-label="Zamknij">${X}</button></div>
          ${meta(r) ? `<div class="rc-meta big">${meta(r)}</div>` : ''}
          ${r.ingr?.length ? `<section class="rc-sec"><h3>Składniki</h3><ul class="rc-ingr">${r.ingr.map((x, i) => `<li style="--d:${i}"><button type="button" data-tick><i></i><span>${esc(x)}</span></button></li>`).join('')}</ul></section>` : ''}
          ${r.steps?.length ? `<section class="rc-sec"><h3>Przygotowanie</h3><ol class="rc-steps">${r.steps.map((x, i) => `<li style="--d:${i}"><b>${i + 1}</b><p>${esc(x)}</p></li>`).join('')}</ol></section>` : ''}
          ${r.note ? `<section class="rc-sec"><h3>Notatka</h3><p class="rc-note">${esc(r.note)}</p></section>` : ''}
          <div class="rc-acts"><button class="btn" data-edit>Edytuj</button><button class="btn btn-danger" data-del>Usuń</button></div>`, { cls: 's-recipes rc-sheet rc-view' });
        sh.el.querySelectorAll('[data-tick]').forEach(b => b.addEventListener('click', () => { b.classList.toggle('on'); ctx.vibrate(6); }));
        sh.el.querySelector('[data-edit]').addEventListener('click', () => { sh.close(); setTimeout(() => openForm(r), 120); });
        const del = sh.el.querySelector('[data-del]');
        del.addEventListener('click', () => {
          if (!del.classList.contains('sure')) { del.classList.add('sure'); del.textContent = 'Na pewno usunąć?'; return; }
          sh.close();
          const card = root.querySelector(`.rc-card[data-open="${id}"]`);
          const done = () => { delete state.recipes[id]; save(); render(false); ctx.toast('Usunięto przepis'); };
          if (card && !calm()) card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9)' }], { duration: 260, easing: 'ease-in' }).onfinish = done; else done();
        });
      }

      root.addEventListener('click', e => {
        if (e.target.closest('[data-add]')) { openForm(null); return; }
        const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; render(false); root.querySelectorAll('.rc-card').forEach((x, i) => !calm() && x.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: i * 35, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' })); return; }
        const o = e.target.closest('[data-open]'); if (o) openRecipe(o.dataset.open);
      });
      root.addEventListener('input', e => {
        if (e.target.type !== 'search') return;
        query = e.target.value;
        const pos = e.target.selectionStart; render(false);
        const inp = root.querySelector('.rc-search input'); if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (_) { } }
      });
      render();

      return {
        getState: () => state,
        applyState(s) { state = { recipes: s.recipes || {} }; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { } render(false); },
        reset() { state = { recipes: {} }; query = ''; cat = ''; try { localStorage.removeItem(STORAGE_KEY); } catch (_) { } render(false); },
        show: () => render(),
      };
    },
  });
})();
