/* Grochu life — sekcja Konto: e-mail, ustawienia sekcji (GL.settings), stan synchronizacji, wylogowanie. */
(() => {
  'use strict';
  const VERSION = 14;
  const NAMES = { gym: 'Siłownia', habits: 'Nawyki', diet: 'Dieta', recipes: 'Przepisy', verses: 'Wersety' };
  const STATUS = { idle: 'czeka', syncing: 'wysyłam…', ok: 'zsynchronizowane', offline: 'offline', error: 'błąd' };

  GL.register({
    id: 'account', label: 'Konto', order: 90,
    icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.5" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    init(ctx) {
      const { root, cloud, esc } = ctx;
      // ustawienia innych sekcji: każda dodaje { id, title, html(), onClick(t), onChange(t), segAnim? } do GL.settings;
      // opakowanie ma klasę sekcji (.s-gym itd.), więc wiersze wyglądają jak w samej sekcji
      const settings = () => GL.settings || [];
      function setHtml() {
        return settings().map((p, i) => `<div class="acc-set rise" style="--d:${i + 1}"><span class="eyebrow">${esc(p.title)}</span><div class="s-${p.id}" data-set-of="${p.id}">${p.html()}</div></div>`).join('');
      }
      function refreshSettings() {
        settings().forEach(p => { const box = root.querySelector(`[data-set-of="${p.id}"]`); if (box) { box.innerHTML = p.html(); p.segAnim?.(box); } });
      }
      function syncHtml() {
        const st = cloud.stores;
        return `<div class="acc-row-h"><span class="eyebrow">Synchronizacja</span><button class="chip" id="acc-sync">Synchronizuj</button></div>
          ${st.map(s => `<div class="acc-row"><span class="acc-dot" data-s="${s.status}"></span><span>${esc(NAMES[s.id] || s.id)}</span><small>${cloud.local ? 'tylko na urządzeniu' : s.status === 'error' && /life_data|relation|schema cache/i.test(s.error) ? 'brak tabeli w Supabase — dane zostają na telefonie' : esc(STATUS[s.status] || s.status)}${s.dirty && s.status !== 'syncing' ? ' · zmiany czekają' : ''}</small></div>`).join('')}
          ${cloud.lastSync ? `<p class="acc-last">Ostatnio: ${cloud.lastSync.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</p>` : ''}`;
      }
      function render() {
        const mail = cloud.user?.email || '', n = settings().length;
        root.innerHTML = `
          <header class="sec-head"><h1 class="sec-title">Konto</h1></header>
          <div class="acc">
            <div class="acc-hero card rise">
              <div class="acc-av">${esc((mail[0] || '?').toUpperCase())}</div>
              <div class="acc-who"><span class="eyebrow">Zalogowany</span><b>${esc(mail)}</b></div>
            </div>
            ${setHtml()}
            <div class="acc-sync card rise" style="--d:${n + 1}">${syncHtml()}</div>
            <button class="btn btn-danger btn-block rise" style="--d:${n + 2}" id="acc-out"${cloud.local ? ' disabled' : ''}>Wyloguj się</button>
            <p class="acc-ver rise" style="--d:${n + 3}">Grochu life<em>.</em> · wersja ${VERSION}</p>
          </div>`;
        settings().forEach(p => p.segAnim?.(root.querySelector(`[data-set-of="${p.id}"]`)));
      }
      root.addEventListener('click', async e => {
        const box = e.target.closest('[data-set-of]');
        if (box) { const p = settings().find(x => x.id === box.dataset.setOf); if (p?.onClick(e.target)) refreshSettings(); return; }
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
