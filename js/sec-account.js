/* Grochu life — sekcja Konto: e-mail, ustawienia sekcji (wybór sekcji → jej ustawienia), stan synchronizacji, wylogowanie. */
(() => {
  'use strict';
  const VERSION = 15;
  const NAMES = { gym: 'Siłownia', habits: 'Nawyki', diet: 'Dieta', recipes: 'Przepisy', verses: 'Wersety' };
  const STATUS = { idle: 'czeka', syncing: 'wysyłam…', ok: 'zsynchronizowane', offline: 'offline', error: 'błąd' };
  const SET_KEY = 'glife.account.set';

  GL.register({
    id: 'account', label: 'Konto', order: 90,
    icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.5" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    init(ctx) {
      const { root, cloud, esc, calm } = ctx;
      // Ustawienia sekcji: każda dodaje { id, title, html(), mount?(box), onClick(t), onChange(t), segAnim? } do GL.settings.
      // Na górze wybór sekcji, pod nim jej ustawienia. Opakowanie ma klasę sekcji (.s-gym, .s-diet), więc wygląda jak w samej sekcji.
      const settings = () => GL.settings || [];
      let pick = (() => { try { return localStorage.getItem(SET_KEY); } catch (_) { return null; } })();
      const current = () => settings().find(p => p.id === pick) || settings()[0];

      function setPanel(anim) {
        const p = current(), box = root.querySelector('[data-set-box]'); if (!p || !box) return;
        box.className = `acc-set-box s-${p.id}`; box.dataset.setOf = p.id;
        box.innerHTML = p.html();
        p.mount?.(box); p.segAnim?.(box);
        if (anim && !calm()) box.animate([{ opacity: 0, transform: `translateX(${anim * 24}px)`, filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      function setHtml() {
        const all = settings(), p = current(); if (!p) return '';
        const i = all.indexOf(p);
        return `<div class="acc-set rise" style="--d:1">
          <span class="eyebrow">Ustawienia</span>
          <div class="seg acc-pick" style="--n:${all.length};--i:${i}">${all.map(x => `<button class="seg-b" type="button" data-pick="${x.id}" aria-selected="${x === p}">${esc(x.title)}</button>`).join('')}</div>
          <div data-set-box></div>
        </div>`;
      }
      function syncHtml() {
        const st = cloud.stores;
        return `<div class="acc-row-h"><span class="eyebrow">Synchronizacja</span><button class="chip" id="acc-sync">Synchronizuj</button></div>
          ${st.map(s => `<div class="acc-row"><span class="acc-dot" data-s="${s.status}"></span><span>${esc(NAMES[s.id] || s.id)}</span><small>${cloud.local ? 'tylko na urządzeniu' : s.status === 'error' && /life_data|relation|schema cache/i.test(s.error) ? 'brak tabeli w Supabase — dane zostają na telefonie' : esc(STATUS[s.status] || s.status)}${s.dirty && s.status !== 'syncing' ? ' · zmiany czekają' : ''}</small></div>`).join('')}
          ${cloud.lastSync ? `<p class="acc-last">Ostatnio: ${cloud.lastSync.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</p>` : ''}`;
      }
      function render() {
        const mail = cloud.user?.email || '';
        root.innerHTML = `
          <header class="sec-head"><h1 class="sec-title">Konto</h1></header>
          <div class="acc">
            <div class="acc-hero card rise">
              <div class="acc-av">${esc((mail[0] || '?').toUpperCase())}</div>
              <div class="acc-who"><span class="eyebrow">Zalogowany</span><b>${esc(mail)}</b></div>
            </div>
            ${setHtml()}
            <div class="acc-sync card rise" style="--d:2">${syncHtml()}</div>
            <button class="btn btn-danger btn-block rise" style="--d:3" id="acc-out"${cloud.local ? ' disabled' : ''}>Wyloguj się</button>
            <p class="acc-ver rise" style="--d:4">Grochu life<em>.</em> · wersja ${VERSION}</p>
          </div>`;
        setPanel(0);
      }
      root.addEventListener('click', async e => {
        const pk = e.target.closest('[data-pick]');
        if (pk) {
          const all = settings(), from = all.indexOf(current());
          pick = pk.dataset.pick; try { localStorage.setItem(SET_KEY, pick); } catch (_) { }
          const to = all.indexOf(current());
          if (from === to) return;
          const seg = root.querySelector('.acc-pick'); seg.style.setProperty('--i', to);
          seg.querySelectorAll('[data-pick]').forEach(b => b.setAttribute('aria-selected', b.dataset.pick === pick));
          setPanel(Math.sign(to - from)); return;
        }
        const box = e.target.closest('[data-set-of]');
        if (box) { const p = settings().find(x => x.id === box.dataset.setOf); if (p?.onClick(e.target)) setPanel(0); return; }
        if (e.target.closest('#acc-sync')) { e.target.closest('#acc-sync').classList.add('spin'); cloud.syncNow(); return; }
        const out = e.target.closest('#acc-out');
        if (out) { out.classList.add('busy'); try { await cloud.signOut(); } catch (ex) { ctx.toast(ex.message); } finally { out.classList.remove('busy'); } }
      });
      root.addEventListener('change', e => {
        const box = e.target.closest('[data-set-of]');
        if (box) settings().find(x => x.id === box.dataset.setOf)?.onChange(e.target);
      });
      // zmiana stanu synchronizacji odświeża tylko kartę synchronizacji
      cloud.onChange(() => { const c = root.querySelector('.acc-sync'); if (ctx.active && c) c.innerHTML = syncHtml(); });
      return { show: render };
    },
  });
})();
