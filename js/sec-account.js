/* Grochu life — sekcja Konto: e-mail, stan synchronizacji każdej sekcji, wylogowanie. */
(() => {
  'use strict';
  const VERSION = 1;
  const NAMES = { gym: 'Siłownia', habits: 'Nawyki', diet: 'Dieta' };
  const STATUS = { idle: 'czeka', syncing: 'wysyłam…', ok: 'zsynchronizowane', offline: 'offline', error: 'błąd' };

  GL.register({
    id: 'account', label: 'Konto', order: 90,
    icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.5" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    init(ctx) {
      const { root, cloud, esc } = ctx;
      function render() {
        const u = cloud.user, mail = u?.email || '';
        const st = cloud.stores;
        root.innerHTML = `
          <header class="sec-head"><h1 class="sec-title">Konto</h1></header>
          <div class="acc">
            <div class="acc-hero card rise">
              <div class="acc-av">${esc((mail[0] || '?').toUpperCase())}</div>
              <div class="acc-who"><span class="eyebrow">Zalogowany</span><b>${esc(mail)}</b></div>
            </div>
            <div class="acc-sync card rise" style="--d:1">
              <div class="acc-row-h"><span class="eyebrow">Synchronizacja</span><button class="chip" id="acc-sync">Synchronizuj</button></div>
              ${st.map((s, i) => `<div class="acc-row rise" style="--d:${i + 2}"><span class="acc-dot" data-s="${s.status}"></span><span>${esc(NAMES[s.id] || s.id)}</span><small>${cloud.local ? 'tylko na urządzeniu' : esc(STATUS[s.status] || s.status)}${s.dirty && s.status !== 'syncing' ? ' · zmiany czekają' : ''}</small></div>`).join('')}
              ${cloud.lastSync ? `<p class="acc-last">Ostatnio: ${cloud.lastSync.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</p>` : ''}
            </div>
            <button class="btn btn-danger btn-block rise" style="--d:5" id="acc-out"${cloud.local ? ' disabled' : ''}>Wyloguj się</button>
            <p class="acc-ver rise" style="--d:6">Grochu <em>life</em> · wersja ${VERSION}</p>
          </div>`;
        root.querySelector('#acc-sync').onclick = e => { e.currentTarget.classList.add('spin'); cloud.syncNow(); };
        root.querySelector('#acc-out').onclick = async e => {
          const b = e.currentTarget; b.classList.add('busy');
          try { await cloud.signOut(); } catch (ex) { ctx.toast(ex.message); } finally { b.classList.remove('busy'); }
        };
      }
      // odśwież tylko kropki statusu (bez ponownego wejścia animacji)
      cloud.onChange(() => { if (ctx.active) render(); });
      return { show: render };
    },
  });
})();
