/* Grochu life — sekcja Siłownia (port Traincker). Układ i działanie jak RepCount (lista treningów, karty ćwiczeń z seriami
   Kg / Powt. / Notatka, wartości docelowe z ostatniego razu jako szare podpowiedzi, timer przerwy, plany, rekordy, wykresy).
   Dane w localStorage (glife.gym.v1) + Supabase (tabela gym_data, ten sam format co w Traincker).
   Ciężary zapisywane w kg, wyświetlane w kg albo lb. Ekran treningu, szczegóły, okienka i timer leżą w ctx.layer. */
(() => {
  'use strict';

  const STORAGE_KEY = 'glife.gym.v1', REST_KEY = 'glife.gym.rest', TAB_KEY = 'glife.gym.tab';
  const DAYS_FULL = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
  const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
  const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  const MON_S = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

  /* ---------- biblioteka ćwiczeń: free-exercise-db (js/exercises.js, domena publiczna) ---------- */
  const DB = window.EXDB || { m: [], e: [], c: [], l: [], k: [], f: [], x: [] };
  // mięśnie w kolejności od góry ciała; nazwy ćwiczeń zostają po angielsku, etykiety po polsku
  const MUSCLE_PL = { chest: 'Klatka', shoulders: 'Barki', triceps: 'Triceps', biceps: 'Biceps', forearms: 'Przedramiona', lats: 'Najszersze grzbietu', 'middle back': 'Środek pleców', traps: 'Kaptury', 'lower back': 'Dolny grzbiet', abdominals: 'Brzuch', glutes: 'Pośladki', quadriceps: 'Czworogłowe ud', hamstrings: 'Dwugłowe ud', adductors: 'Przywodziciele', abductors: 'Odwodziciele', calves: 'Łydki', neck: 'Szyja' };
  const MUSCLES = Object.entries(MUSCLE_PL);
  const muscleName = m => MUSCLE_PL[m] || 'Całe ciało';
  const musList = arr => (arr || []).map(muscleName).join(', ');
  const EQUIP_PL = { barbell: 'Sztanga', dumbbell: 'Hantle', machine: 'Maszyna', cable: 'Wyciąg', 'body only': 'Masa ciała', kettlebells: 'Kettlebell', bands: 'Gumy', 'e-z curl bar': 'Gryf łamany', 'medicine ball': 'Piłka lekarska', 'exercise ball': 'Piłka gimnastyczna', 'foam roll': 'Wałek', other: 'Inne', none: 'Bez sprzętu' };
  const CAT_PL = { strength: 'Siłowe', powerlifting: 'Trójbój', 'olympic weightlifting': 'Podnoszenie ciężarów', strongman: 'Strongman', plyometrics: 'Plyometria', stretching: 'Rozciąganie', cardio: 'Cardio' };
  const LEVEL_PL = { beginner: 'Początkujący', intermediate: 'Średnio zaawansowany', expert: 'Zaawansowany' };
  const MECH_PL = { compound: 'Wielostawowe', isolation: 'Izolowane' }, FORCE_PL = { push: 'Pchanie', pull: 'Ciągnięcie', static: 'Statyczne' };
  // filtr sprzętu / typu nad listą ćwiczeń
  const EQ_FILTERS = [['all', 'Cały sprzęt'], ['barbell', 'Sztanga'], ['dumbbell', 'Hantle'], ['machine', 'Maszyna'], ['cable', 'Wyciąg'], ['body only', 'Masa ciała'], ['kettlebells', 'Kettlebell'], ['bands', 'Gumy'], ['e-z curl bar', 'Gryf łamany'], ['other', 'Inne'], ['cat:cardio', 'Cardio'], ['cat:stretching', 'Rozciąganie']];
  const KINDS = [['wr', 'Ciężar i powtórzenia'], ['bw', 'Masa ciała'], ['time', 'Na czas'], ['cardio', 'Cardio']];
  const kindName = k => (KINDS.find(x => x[0] === k) || KINDS[0])[1];
  // rodzaj zapisu serii: ciężar × powt., masa ciała, czas, cardio
  const KIND_OVR = { Plank: 'time', Side_Bridge: 'time', Farmers_Walk: 'time', 'Dips_-_Chest_Version': 'bw', 'Dips_-_Triceps_Version': 'bw', Ring_Dips: 'bw', 'Chin-Up': 'bw', Pullups: 'bw', Hanging_Leg_Raise: 'bw', Ab_Roller: 'bw' };
  const kindOf = (id, eq, cat, force) => KIND_OVR[id] || (cat === 'cardio' ? 'cardio' : cat === 'stretching' ? 'time' : force === 'static' && (eq === 'body only' || eq == null) ? 'time' : eq === 'body only' ? 'bw' : 'wr');
  const DEF_EX = {};
  DB.x.forEach(([id, name, p, sc, eq, cat, lv, me, fo, img]) => {
    const e = DB.e[eq], c = DB.c[cat], f = DB.f[fo];
    DEF_EX[id] = { id, name, nameEn: name, primary: p.map(i => DB.m[i]), secondary: sc.map(i => DB.m[i]), equipment: e ?? null, category: c, level: DB.l[lv], mechanic: DB.k[me] ?? null, force: f ?? null, img, kind: kindOf(id, e, c, f) };
  });
  // dwa ćwiczenia z poprzedniej biblioteki, których nie ma w bazie
  DEF_EX.burpee = { id: 'burpee', name: 'Burpee', nameEn: 'Burpee', primary: ['quadriceps'], secondary: ['chest', 'shoulders', 'triceps', 'abdominals', 'glutes', 'hamstrings', 'calves'], equipment: 'body only', category: 'plyometrics', level: 'beginner', mechanic: 'compound', force: 'push', img: 0, kind: 'bw' };
  DEF_EX.run = { id: 'run', name: 'Running, Outdoor', nameEn: 'Running, Outdoor', primary: ['quadriceps'], secondary: ['calves', 'glutes', 'hamstrings'], equipment: null, category: 'cardio', level: 'beginner', mechanic: null, force: null, img: 0, kind: 'cardio' };
  // stare id (polska biblioteka) → id w free-exercise-db; zapisane treningi i plany są przepisywane przy wczytaniu
  const ALIAS = { bench: 'Barbell_Bench_Press_-_Medium_Grip', incbench: 'Barbell_Incline_Bench_Press_-_Medium_Grip', declbench: 'Decline_Barbell_Bench_Press', dbbench: 'Dumbbell_Bench_Press', incdb: 'Incline_Dumbbell_Press', dbfly: 'Dumbbell_Flyes', cablefly: 'Cable_Crossover', pecdeck: 'Butterfly', chestpress: 'Machine_Bench_Press', pushup: 'Pushups', dips: 'Dips_-_Chest_Version', deadlift: 'Barbell_Deadlift', pullup: 'Pullups', chinup: 'Chin-Up', bbrow: 'Bent_Over_Barbell_Row', dbrow: 'One-Arm_Dumbbell_Row', latpull: 'Wide-Grip_Lat_Pulldown', cablerow: 'Seated_Cable_Rows', tbar: 'T-Bar_Row_with_Handle', pullover: 'Straight-Arm_Dumbbell_Pullover', hyperext: 'Hyperextensions_Back_Extensions', shrug: 'Barbell_Shrug', ohp: 'Standing_Military_Press', dbpress: 'Dumbbell_Shoulder_Press', arnold: 'Arnold_Dumbbell_Press', latraise: 'Side_Lateral_Raise', frontraise: 'Front_Dumbbell_Raise', revfly: 'Reverse_Flyes', facepull: 'Face_Pull', uprow: 'Upright_Barbell_Row', cablelat: 'Cable_Seated_Lateral_Raise', curl: 'Barbell_Curl', dbcurl: 'Dumbbell_Bicep_Curl', hammer: 'Hammer_Curls', preacher: 'Preacher_Curl', cablecurl: 'Standing_Biceps_Cable_Curl', conccurl: 'Concentration_Curls', skull: 'EZ-Bar_Skullcrusher', pushdown: 'Triceps_Pushdown', cgbench: 'Close-Grip_Barbell_Bench_Press', ohext: 'Cable_Rope_Overhead_Triceps_Extension', kickback: 'Tricep_Dumbbell_Kickback', diamond: 'Push-Ups_-_Close_Triceps_Position', squat: 'Barbell_Full_Squat', frontsquat: 'Front_Barbell_Squat', legpress: 'Leg_Press', hack: 'Hack_Squat', goblet: 'Goblet_Squat', lunge: 'Dumbbell_Lunges', bulgarian: 'Split_Squat_with_Dumbbells', legext: 'Leg_Extensions', legcurl: 'Lying_Leg_Curls', rdl: 'Romanian_Deadlift', hipthrust: 'Barbell_Hip_Thrust', bridge: 'Butt_Lift_Bridge', abduct: 'Thigh_Abductor', kickcable: 'One-Legged_Cable_Kickback', calfstand: 'Standing_Calf_Raises', calfseat: 'Seated_Calf_Raise', plank: 'Plank', sideplank: 'Side_Bridge', crunch: 'Crunches', legraise: 'Hanging_Leg_Raise', cablecrunch: 'Cable_Crunch', russian: 'Russian_Twist', abwheel: 'Ab_Roller', wristcurl: 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench', farmer: 'Farmers_Walk', clean: 'Power_Clean', kbswing: 'One-Arm_Kettlebell_Swings', thruster: 'Kettlebell_Thruster', treadmill: 'Running_Treadmill', bike: 'Bicycling_Stationary', elliptical: 'Elliptical_Trainer', rower: 'Rowing_Stationary', stairs: 'Stairmaster', rope: 'Rope_Jumping' };
  const canon = id => ALIAS[id] && DEF_EX[ALIAS[id]] ? ALIAS[id] : id;
  // własne ćwiczenia z poprzedniej wersji miały jedną „partię” → mięśnie główne
  const OLD_GROUP = { chest: ['chest'], back: ['middle back', 'lats'], shoulders: ['shoulders'], biceps: ['biceps'], triceps: ['triceps'], legs: ['quadriceps'], glutes: ['glutes'], calves: ['calves'], abs: ['abdominals'], forearms: ['forearms'], full: [], cardio: [] };
  const IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';

  /* ---------- daty ---------- */
  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dow = d => (d.getDay() + 6) % 7; // 0 = poniedziałek
  const todayKey = () => key(new Date());
  const dayOnly = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const weekStart = d => addDays(dayOnly(d), -dow(d));
  const dateLabel = ms => { const d = new Date(ms); return `${DAYS_FULL[dow(d)]}, ${d.getDate()}.${pad(d.getMonth() + 1)}${d.getFullYear() !== new Date().getFullYear() ? '.' + d.getFullYear() : ''}`; };
  const shortDate = ms => { const d = new Date(ms); return `${d.getDate()}.${pad(d.getMonth() + 1)}${d.getFullYear() !== new Date().getFullYear() ? '.' + d.getFullYear() : ''}`; };
  const hhmm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const ago = ms => { const n = Math.round((dayOnly(new Date()) - dayOnly(ms)) / 864e5); return n <= 0 ? 'dziś' : n === 1 ? 'wczoraj' : n < 14 ? `${n} dni temu` : n < 60 ? `${Math.round(n / 7)} tyg. temu` : shortDate(ms); };
  const defaultName = ms => { const h = new Date(ms).getHours(); return h < 12 ? 'Poranny trening' : h < 18 ? 'Popołudniowy trening' : 'Wieczorny trening'; };


  /* ---------- spłaszczanie stanu do synchronizacji (dokładnie jak w Traincker js/cloud.js) ---------- */
  // Elementy: 's' = ustawienia, 'a' = trwający trening, 'w:<id>' = trening, 'r:<id>' = plan,
  // 'e:<id>' = własne ćwiczenie, 'b:<dzień>' = masa ciała.
  const COLS = { w: 'workouts', r: 'routines', e: 'exercises', b: 'body' };
  function flatten(s) {
    const items = { s: s.settings };
    if (s.active) items.a = s.active;
    Object.entries(COLS).forEach(([p, c]) => Object.entries(s[c] || {}).forEach(([id, v]) => { items[p + ':' + id] = v; }));
    return items;
  }
  function unflatten(items) {
    const out = { settings: items.s, active: items.a || null };
    Object.values(COLS).forEach(c => { out[c] = {}; });
    Object.keys(items).forEach(k => { const i = k.indexOf(':'); if (i > 0 && COLS[k.slice(0, i)]) out[COLS[k.slice(0, i)]][k.slice(i + 1)] = items[k]; });
    return out;
  }

  GL.register({
    id: 'gym', label: 'Siłownia', order: 10,
    icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    cloud: { table: 'gym_data', flatten, unflatten },
    init,
  });

  function init(ctx) {
    const { root, scroller, layer, section } = ctx;
    const toast = m => ctx.toast(m);
    /* ---------- stan ---------- */
    const REST_OPTS = [60, 120, 180];
    const snapRest = v => !v ? 0 : REST_OPTS.reduce((b, o) => Math.abs(o - v) <= Math.abs(b - v) ? o : b, REST_OPTS[0]);
    const DEF_SET = { lang: 'pl', unit: 'kg', rest: 120, autoRest: true, weekGoal: 3, sound: true };
    let migrated = false;
    const withDefaults = s => {
      s = s && typeof s === 'object' ? s : {};
      s.settings = { ...DEF_SET, ...(s.settings || {}) };
      if (!REST_OPTS.includes(s.settings.rest)) s.settings.rest = snapRest(s.settings.rest) || 120;
      ['workouts', 'routines', 'exercises', 'body'].forEach(c => { if (!s[c] || typeof s[c] !== 'object') s[c] = {}; });
      // plany z poprzedniej wersji: {n, reps} → {w, n, note}
      Object.values(s.routines).forEach(r => { (r.ex || []).forEach(e => { if (e.w == null) e.w = 0; if (e.reps != null) { if (!e.note && e.reps) e.note = /s$/.test(e.reps) ? e.reps : e.reps + ' powt.'; delete e.reps; } }); if (!r.target) r.target = 'latest'; });
      if (!s.active || typeof s.active !== 'object') s.active = null;
      // trwający trening z poprzedniej wersji: nieodhaczone serie były tylko podpowiedzią
      if (s.active) s.active.ex.forEach(e => e.sets.forEach(x => { if (x.done === false) { e.tg = e.tg || []; ['kg', 'r', 's', 'km', 'kcal'].forEach(f => { x[f] = null; }); } delete x.done; delete x.ph; delete x.pr; }));
      // biblioteka free-exercise-db: stare id ćwiczeń → nowe, własne ćwiczenia dostają mięśnie główne i pomocnicze
      const fix = e => { if (e && e.eid) { const c = canon(e.eid); if (c !== e.eid) { e.eid = c; delete e.n; migrated = true; } } };
      Object.values(s.workouts).forEach(w => (w.ex || []).forEach(fix));
      Object.values(s.workouts).forEach(w => (w.prs || []).forEach(fix));
      Object.values(s.routines).forEach(r => (r.ex || []).forEach(fix));
      if (s.active) s.active.ex.forEach(fix);
      Object.values(s.exercises).forEach(x => { if (!x.primary) { migrated = true; x.primary = OLD_GROUP[x.muscle] || []; x.secondary = []; if (x.muscle === 'cardio') x.category = 'cardio'; delete x.muscle; } x.secondary = x.secondary || []; });
      return s;
    };
    function load() {
      try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return withDefaults(JSON.parse(raw)); } catch (_) { }
      return withDefaults({});
    }
    let state = load();
    // nazwy ćwiczeń z bazy po polsku albo po angielsku (Ustawienia → flaga)
    function applyLang() { const pl = state.settings.lang !== 'en', PL = window.EXDB_PL || {}; Object.values(DEF_EX).forEach(x => { x.name = pl && PL[x.id] ? PL[x.id] : x.nameEn; }); }
    applyLang();
    function save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch (_) { toast('Nie udało się zapisać danych w przeglądarce'); return; }
      ctx.changed();
    }
    // Stan z chmury: zapis lokalny bez oznaczania go jako zmiany z tego urządzenia.
    function applyState(s) {
      const typing = wkLayer.contains(document.activeElement) && state.active && s.active && s.active.id === state.active.id;
      state = withDefaults({ ...s }); applyLang();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { }
      if (typing || sheetOpen()) return; // nie przerywamy wpisywania ani otwartego okienka
      if (!state.active) wOpen = false;
      render();
    }

    // nawigacja jak w aplikacji na telefon: zakładki pod nagłówkiem, trening jako osobny ekran, szczegóły nakładane na wierzch
    let tab = 'log', wOpen = !!state.active, stack = [], animTab = true;
    let hQuery = '', hFind = false, hLimit = 25, pWeeks = 8, calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    try { const v = localStorage.getItem(TAB_KEY); if (['log', 'routines', 'progress'].includes(v)) tab = v; } catch (_) { }
    const calm = ctx.calm;

    /* ---------- liczby i jednostki ---------- */
    const r0 = v => Math.round(v || 0);
    const r1 = v => Math.round((v || 0) * 10) / 10;
    const nf = (v, d = 1) => (+v || 0).toLocaleString('pl-PL', { maximumFractionDigits: d });
    const LB = 2.20462;
    const U = () => state.settings.unit === 'lb' ? 'lb' : 'kg';
    const UC = () => U() === 'lb' ? 'Lb' : 'Kg';
    const uf = () => U() === 'lb' ? LB : 1;
    const dispW = kg => kg == null || kg === '' ? '' : +(kg * uf()).toFixed(U() === 'lb' ? 1 : 2);
    const fmtW = kg => nf(dispW(kg || 0), 2);
    const fmtRM = kg => nf((kg || 0) * uf(), 1);
    const fmtVol = kg => { const v = (kg || 0) * uf(); return v >= 100000 ? nf(v / 1000, 1) + ' t' : nf(Math.round(v), 0); };
    const fmtK = v => v >= 1000 ? nf(v / 1000, v >= 10000 ? 0 : 1) + 'k' : String(r0(v));
    const fmtSec = s => { s = Math.round(s || 0); return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`; };
    const fmtDur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)} min` : `${m} min`; };
    const fmtDurS = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)} h` : `${m} min`; };
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const uid = p => (p || 'w') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const norm = s => String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) && x >= 0 ? x : null; };
    const deep = o => JSON.parse(JSON.stringify(o));
    const plural = (n, a, b, c) => n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;

    /* ---------- ćwiczenia, serie, statystyki ---------- */
    const exById = id => state.exercises[id] || DEF_EX[id] || DEF_EX[canon(id)] || null;
    const exOf = e => exById(e.eid) || { id: e.eid, name: e.n || 'Ćwiczenie', primary: [], secondary: [], kind: 'wr' };
    const exSub = x => [musList(x.primary), x.equipment ? EQUIP_PL[x.equipment] : (x.category === 'cardio' ? 'Cardio' : '')].filter(Boolean).join(' · ') || kindName(x.kind);
    const exAny = eid => exById(eid) || exOf(Object.values(state.workouts).flatMap(w => w.ex).find(e => e.eid === eid) || { eid });
    const allEx = () => [...Object.values(DEF_EX), ...Object.values(state.exercises)].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    // pola serii jak w RepCount: Kg / Powt. / Notatka
    const colsOf = k => k === 'bw' ? [['kg', '+' + UC()], ['r', 'Powt.']] : k === 'time' ? [['kg', '+' + UC()], ['s', 'Sek.']] : k === 'cardio' ? [['s', 'Min'], ['km', 'Km'], ['kcal', 'Kcal']] : [['kg', UC()], ['r', 'Powt.']];
    const inVal = (s, f, k) => { const v = s?.[f]; if (v == null || v === '') return ''; const o = f === 'kg' ? dispW(v) : f === 's' && k === 'cardio' ? r1(v / 60) : v; return String(o).replace('.', ','); };
    const putVal = (s, f, v, k) => { if (v == null) { s[f] = null; return; } s[f] = f === 'kg' ? +(v / uf()).toFixed(3) : f === 's' && k === 'cardio' ? Math.round(v * 60) : v; };
    function fmtSet(s, k, long) {
      if (k === 'cardio') return [s.s ? r0(s.s / 60) + ' min' : '', s.km ? nf(s.km, 2) + ' km' : '', s.kcal ? r0(s.kcal) + ' kcal' : ''].filter(Boolean).join(' · ') || '—';
      if (k === 'time') return (s.kg ? `+${fmtW(s.kg)}${long ? ' ' + U() : ''} · ` : '') + fmtSec(s.s);
      if (k === 'bw') return s.kg ? `+${fmtW(s.kg)}${long ? ' ' + U() : ''} × ${s.r || 0}` : `${s.r || 0}${long ? ' powt.' : ''}`;
      return `${fmtW(s.kg)}${long ? ' ' + U() : ''} × ${s.r || 0}`;
    }
    const valid = (s, k) => k === 'cardio' ? !!(s.s || s.km || s.kcal) : k === 'time' ? s.s > 0 : s.r > 0 && (k !== 'wr' || s.kg != null);
    const e1rm = (kg, r) => !kg || !r ? 0 : r === 1 ? kg : kg * (1 + Math.min(r, 15) / 30);
    const work = sets => sets.filter(s => s.t !== 'w');
    const volOf = (sets, k) => k === 'wr' || k === 'bw' ? work(sets).reduce((a, s) => a + (s.kg || 0) * (s.r || 0), 0) : 0;
    const finished = () => Object.values(state.workouts).filter(w => w && w.start).sort((a, b) => b.start - a.start);
    function wStats(w, live) {
      let sets = 0, vol = 0;
      (w.ex || []).forEach(e => { const k = exOf(e).kind, ss = live ? e.sets.filter(s => valid(s, k)) : e.sets; sets += work(ss).length; vol += volOf(ss, k); });
      return { sets, vol, ms: (w.end || Date.now()) - w.start, ex: (w.ex || []).length };
    }
    // sesje ćwiczenia od najstarszej
    function sessionsOf(eid, excl) {
      const out = [];
      finished().forEach(w => { if (w.id === excl) return; w.ex.forEach(e => { if (e.eid === eid && e.sets.length) out.push({ w, e, sets: e.sets }); }); });
      return out.reverse();
    }
    function lastSets(eid, excl, rid) {
      for (const w of finished()) { if (w.id === excl || (rid && w.rid !== rid)) continue; const e = w.ex.find(x => x.eid === eid && x.sets.length); if (e) return e.sets; }
      return null;
    }
    function bests(eid, excl, before = Infinity) {
      const b = { e1rm: 0, kg: 0, r: 0, s: 0, n: 0 };
      sessionsOf(eid, excl).forEach(({ w, sets }) => {
        if (w.start >= before) return;
        b.n++;
        work(sets).forEach(s => { b.e1rm = Math.max(b.e1rm, e1rm(s.kg, s.r)); b.kg = Math.max(b.kg, s.kg || 0); b.r = Math.max(b.r, s.r || 0); b.s = Math.max(b.s, s.s || 0); });
      });
      return b;
    }
    // Rekord: tylko gdy ćwiczenie było już robione (pierwszy raz to jeszcze nie rekord)
    function prOf(s, k, b) {
      if (!b.n || s.t === 'w') return null;
      if (k === 'wr') { if (e1rm(s.kg, s.r) > b.e1rm + .01) return 'e1rm'; if ((s.kg || 0) > b.kg + .001) return 'kg'; }
      if (k === 'bw' && (s.r || 0) > b.r) return 'r';
      if (k === 'time' && (s.s || 0) > b.s) return 's';
      return null;
    }
    const PR_NAME = { e1rm: 'Szac. 1RM', kg: 'Najcięższy ciężar', r: 'Najwięcej powtórzeń', s: 'Najdłużej' };
    function computePRs(w) {
      const prs = [];
      w.ex.forEach(e => {
        const k = exOf(e).kind, b = bests(e.eid, w.id, w.start);
        e.sets.forEach(s => { delete s.pr; });
        if (!b.n) return;
        const top = {};
        work(e.sets).forEach(s => {
          const t = prOf(s, k, b); if (!t) return;
          const v = t === 'e1rm' ? e1rm(s.kg, s.r) : t === 'kg' ? s.kg : t === 'r' ? s.r : s.s;
          if (!top[t] || v > top[t].v) top[t] = { v, s };
        });
        Object.entries(top).forEach(([t, x]) => { x.s.pr = 1; prs.push({ eid: e.eid, t, v: x.v, set: { kg: x.s.kg, r: x.s.r, s: x.s.s } }); });
      });
      return prs;
    }
    const prLabel = p => p.t === 'e1rm' ? `~${fmtRM(p.v)} ${U()}` : p.t === 'kg' ? `${fmtW(p.v)} ${U()}` : p.t === 'r' ? `${p.v} powt.` : fmtSec(p.v);
    const weekWorkouts = (off = 0) => { const a = addDays(weekStart(new Date()), off * 7).getTime(), b = addDays(new Date(a), 7).getTime(); return finished().filter(w => w.start >= a && w.start < b); };
    function weekStreak() {
      const g = state.settings.weekGoal; let n = 0;
      for (let i = 0; i < 520; i++) { const c = weekWorkouts(-i).length; if (c >= g) n++; else if (i === 0) continue; else break; }
      return n;
    }
    // krótkie podsumowanie ćwiczenia w liście treningów (jak w RepCount): „4 × 95 kg”
    function exLine(e) {
      const k = exOf(e).kind, ws = work(e.sets), n = ws.length || e.sets.length;
      if (k === 'cardio') return fmtSet(e.sets.reduce((a, s) => ({ s: (a.s || 0) + (s.s || 0), km: (a.km || 0) + (s.km || 0), kcal: (a.kcal || 0) + (s.kcal || 0) }), {}), k);
      if (k === 'time') return `${n} × ${fmtSec(Math.max(...e.sets.map(s => s.s || 0)))}`;
      if (k === 'bw') { const kg = Math.max(0, ...e.sets.map(s => s.kg || 0)); return kg ? `${n} × +${fmtW(kg)} ${U()}` : `${n} × ${Math.max(...e.sets.map(s => s.r || 0))}`; }
      return `${n} × ${fmtW(Math.max(0, ...ws.map(s => s.kg || 0)))} ${U()}`;
    }

    /* ---------- ikony ---------- */
    const wavePath = (amp, len) => { let d = 'M0 20'; for (let x = 0; x < 400; x += len) d += ` Q${x + len / 4} ${20 - amp} ${x + len / 2} 20 T${x + len} 20`; return d + ' V40 H0 Z'; };
    const SEA_SVG = `<svg class="waves" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path class="w1" d="${wavePath(5, 50)}"/><path class="w2" d="${wavePath(7, 100)}" transform="translate(0 3)"/><path class="w3" d="${wavePath(3, 50)}" transform="translate(0 9)"/></svg>`;
    const BOAT = '<svg width="26" height="24" viewBox="0 0 26 24" aria-hidden="true"><path d="M12 2v14H4z" fill="currentColor" opacity=".9"/><path d="M14 5v11h7z" fill="currentColor" opacity=".55"/><path d="M2 18h22l-3 4H6z" fill="currentColor"/></svg>';
    const XMARK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
    const PLUS = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M1.5 7h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    const PLUSC = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8.2" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v8M6 10h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    const DOTS = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="3.5" cy="9" r="1.6" fill="currentColor"/><circle cx="9" cy="9" r="1.6" fill="currentColor"/><circle cx="14.5" cy="9" r="1.6" fill="currentColor"/></svg>';
    const DOTSC = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="11" r="1.3" fill="currentColor"/><circle cx="11" cy="11" r="1.3" fill="currentColor"/><circle cx="15" cy="11" r="1.3" fill="currentColor"/></svg>';
    const CHEV = '<svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true"><path d="M1.5 1.5l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const BACK = '<svg width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true"><path d="M9 2L2 9l7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const DOWN = '<svg width="18" height="11" viewBox="0 0 18 11" fill="none" aria-hidden="true"><path d="M2 2l7 7 7-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const ALARM = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="13" r="7.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 9v4.2l2.6 1.6M4 5.5L6.8 3M20 5.5L17.2 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const SEARCH = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.7"/><path d="M10.5 10.5l3.2 3.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    const NOTE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3.5" y="2.5" width="13" height="15" rx="2.2" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 7h7M6.5 10h7M6.5 13h4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    const BARS = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="9" width="4" height="8.5" rx="1.2" fill="currentColor"/><rect x="8" y="4" width="4" height="13.5" rx="1.2" fill="currentColor"/><rect x="13.5" y="6.5" width="4" height="11" rx="1.2" fill="currentColor"/></svg>';
    const STAR = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.7l-5.1 2.8L6 11.8l-4.3-4 5.8-.7z" fill="currentColor"/></svg>';
    const STARS = '<svg width="11" height="11" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.7l-5.1 2.8L6 11.8l-4.3-4 5.8-.7z" fill="currentColor"/></svg>';
    const AGAIN = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.8h-2.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const STOP = '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="5" y="5" width="12" height="12" rx="2.5" fill="currentColor"/></svg>';
    const FLAG_PL = '<svg class="flag" width="26" height="18" viewBox="0 0 26 18" aria-hidden="true"><rect width="26" height="9" fill="#fff"/><rect y="9" width="26" height="9" fill="#DC143C"/></svg>';
    const FLAG_GB = '<svg class="flag" width="26" height="18" viewBox="0 0 60 36" aria-hidden="true"><rect width="60" height="36" fill="#012169"/><path d="M0 0l60 36M60 0L0 36" stroke="#fff" stroke-width="7"/><path d="M0 0l60 36M60 0L0 36" stroke="#C8102E" stroke-width="3"/><path d="M30 0v36M0 18h60" stroke="#fff" stroke-width="11"/><path d="M30 0v36M0 18h60" stroke="#C8102E" stroke-width="6"/></svg>';
    const GRIP = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const PLAY = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8v12.4L16 10z" fill="currentColor"/></svg>';

    /* ---------- szkielet sekcji: nagłówek, zakładki, widok; w warstwie: trening, szczegóły, okienka ---------- */
    const TABS = [['log', 'Treningi'], ['routines', 'Plany'], ['progress', 'Postępy']];
    root.innerHTML = `<div class="g-main">
      <header class="sec-head g-head"><h1 class="sec-title">Siłownia</h1><button class="icon-btn g-find" data-hfind aria-label="Szukaj treningu lub ćwiczenia" aria-expanded="false">${SEARCH}</button></header>
      <div class="seg g-tabs" role="tablist" aria-label="Zakładki" style="--n:${TABS.length};--i:0">${TABS.map(([t, l]) => `<button class="seg-b" role="tab" data-tab="${t}" aria-selected="false">${l}</button>`).join('')}</div>
      <div class="g-view"></div></div>`;
    section.insertAdjacentHTML('beforeend', `<button class="g-live" hidden></button><button class="g-fab" aria-label="Nowy trening" hidden><svg width="22" height="22" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5v11M1.5 7h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`);
    layer.innerHTML = '<section class="g-layer g-wk" hidden></section><section class="g-layer g-dt" hidden></section><div class="g-ov"></div>';
    const tabView = root.querySelector('.g-view'), tabsEl = root.querySelector('.g-tabs');
    const fabEl = section.querySelector('.g-fab'), liveEl = section.querySelector('.g-live');
    const wkLayer = layer.querySelector('.g-wk'), dtLayer = layer.querySelector('.g-dt'), overlay = layer.querySelector('.g-ov');
    // id w szablonach mają przedrostek gy-, żeby nie zderzyć się z innymi sekcjami
    const $ = id => layer.querySelector('#gy-' + id) || root.querySelector('#gy-' + id);
    const qa = sel => [...section.querySelectorAll(sel), ...layer.querySelectorAll(sel)];
    const sheetOpen = () => !!overlay.querySelector('.sheet-ov:not(.out)');

    // ekrany na wierzchu: trening wjeżdża od dołu, szczegóły z prawej; zamknięcie animuje wyjazd i dopiero wtedy chowa
    const EASE = 'cubic-bezier(.2,.8,.2,1)', EASE_IN = 'cubic-bezier(.6,0,.8,.4)';
    function openLayer(el, from) {
      if (el._out) { el._out.cancel(); el._out = null; return; }
      if (!el.hidden) return;
      el.hidden = false;
      if (!calm()) el.animate([{ transform: from, opacity: .4 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: EASE });
    }
    function closeLayer(el, to) {
      if (el.hidden || el._out) return;
      const done = () => { el._out = null; el.hidden = true; el.innerHTML = ''; };
      if (calm()) { done(); return; }
      const a = el._out = el.animate([{ transform: 'none', opacity: 1 }, { transform: to, opacity: .3 }], { duration: 320, easing: EASE_IN, fill: 'forwards' });
      a.onfinish = () => { if (el._out === a) { done(); a.cancel(); } };
    }
    // przełącznik segmentowy z przesuwaną pigułką; po przerysowaniu pigułka dojeżdża z poprzedniego miejsca
    const segPrev = {};
    const segHtml = (k, attr, opts, cur, cls = '') => { const i = Math.max(0, opts.findIndex(o => String(o[0]) === String(cur))); return `<div class="seg ${cls}" data-seg="${k}" data-i="${i}" style="--n:${opts.length};--i:${i}">${opts.map(([v, l, al]) => `<button class="seg-b" ${attr}="${v}" aria-selected="${String(v) === String(cur)}"${al ? ` aria-label="${al}"` : ''}>${l}</button>`).join('')}</div>`; };
    function segAnim(box) {
      box.querySelectorAll('.seg[data-seg]').forEach(el => {
        const k = el.dataset.seg, i = +el.dataset.i;
        if (segPrev[k] != null && segPrev[k] !== i && !calm()) { el.style.setProperty('--i', segPrev[k]); void el.offsetWidth; requestAnimationFrame(() => el.style.setProperty('--i', i)); }
        segPrev[k] = i;
      });
    }
    // Wysokość wody w kole tak, żeby zalana POWIERZCHNIA odpowiadała % celu (jak w trackerze).
    const waterLevel = f => {
      if (f <= 0 || f >= 1) return Math.max(0, Math.min(1, f)) * 100;
      let lo = 0, hi = Math.PI * 2;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if ((m - Math.sin(m)) / (2 * Math.PI) < f) lo = m; else hi = m; }
      return +((1 - Math.cos(lo / 2)) / 2 * 100).toFixed(1);
    };

    /* ---------- mapa mięśni: sylwetka z przodu i z tyłu, mięśnie główne i pomocnicze ---------- */
    // kształty lewej połowy (patrząc na rysunek), druga połowa to odbicie; „c” = kształt na środku ciała (bez odbicia)
    const BODY = {
      front: {
        sil: ['M36 36 L50 32 L50 100 L35 100 C33 88 34 68 36 54 Z', 'M38 88 L50 90 L50 102 L40 98 Z', 'M42 148 L47.5 148 C47.5 162 46.5 172 45.5 180 L42 180 Z', 'M37 180 L46 180 L48 188 L35 188 Z'],
        silC: ['M41 8 C41 2 59 2 59 8 L59 20 C59 26 41 26 41 20 Z'],
        joints: [[27, 69, 3.6], [20, 96, 3.6], [42, 145, 5]],
        m: {
          traps: ['M44 30 L44 35 L34 36 C37 33 40 31 44 30 Z'],
          shoulders: ['M34 35 C27 35 22 40 22 48 C22 51 24 52 26 51 C28 47 31 43 36 40 L37 37 Z'],
          chest: ['M50 37 L50 55 C45 57 39 56 35 52 C33 48 34 43 37 39 L39 37 Z'],
          biceps: ['M27 52 C24 55 23 61 24 67 C26 69 29 68 30 65 C31 60 31 55 30 52 Z'],
          forearms: ['M24 71 C21 77 19 84 19 91 C21 92 23 92 24 91 C26 84 28 77 29 72 Z'],
          abdominals: ['M36 56 C35 64 36 74 38 84 L43 88 L43 58 Z'],
          quadriceps: ['M35 100 C34 112 35 126 38 140 L46 141 C47 128 48 114 47 101 L42 92 L39 92 Z'],
          abductors: ['M35 86 C33 90 33 96 34 101 L38 98 L39 90 Z'],
          adductors: ['M47 98 L50 100 L50 124 C48 120 47 110 47 100 Z'],
          calves: ['M35.5 150 C33.5 158 34.5 168 37.5 178 L42 178 C42.5 168 43 158 43 150 Z'],
        },
        c: {
          neck: ['M45 24 L55 24 L56 33 L44 33 Z'],
          abdominals: ['M44 57 L56 57 L56 88 C54 92 46 92 44 88 Z'],
        },
        lines: ['M50 60 L50 88', 'M44 66 L56 66', 'M44 75 L56 75'],
      },
      back: {
        sil: ['M36 36 L50 30 L50 104 L35 104 C33 90 34 70 36 54 Z', 'M41 148 L47 148 C47 160 46 170 45 178 L41 178 Z', 'M37 178 L46 178 L48 188 L35 188 Z'],
        silC: ['M41 8 C41 2 59 2 59 8 L59 20 C59 26 41 26 41 20 Z', 'M45 22 L55 22 L56 30 L44 30 Z'],
        joints: [[27, 69, 3.6], [20, 96, 3.6], [42, 146, 5]],
        m: {
          traps: ['M46 24 L50 24 L50 52 C47 48 43 43 40 39 L34 36 C38 33 43 30 46 24 Z'],
          shoulders: ['M34 35 C27 35 22 40 22 48 C22 51 24 52 26 51 C28 47 31 43 36 40 L37 37 Z'],
          'middle back': ['M40 40 C44 44 47 48 50 53 L50 63 C46 61 43 57 41 51 Z'],
          lats: ['M36 42 C34 52 35 62 39 72 L46 78 C45 70 43 62 41 53 C40 48 38 45 37 41 Z'],
          'lower back': ['M50 64 L50 88 L45 88 C44 82 44 74 46 69 C47 66 48 65 50 64 Z'],
          triceps: ['M27 51 C24 54 23 60 24 66 C26 68 29 67 30 64 C31 59 31 54 30 51 Z'],
          forearms: ['M24 71 C21 77 19 84 19 91 C21 92 23 92 24 91 C26 84 28 77 29 72 Z'],
          glutes: ['M50 90 L50 110 C45 112 39 110 36 104 C35 97 37 92 42 90 Z'],
          abductors: ['M43 86 C38 86 35 88 35 93 C36 96 37 96 38 95 C39 92 41 90 45 89 Z'],
          hamstrings: ['M36 108 C35 120 37 132 40 142 L46 142 C47 132 48 120 48 112 C44 113 40 112 36 108 Z'],
          adductors: ['M48 112 L50 112 L50 130 C49 124 48 118 48 112 Z'],
          calves: ['M37 150 C35 158 36 168 40 176 L45 176 C47 168 47 158 46 150 C43 148 40 148 37 150 Z'],
        },
        c: {},
        lines: ['M50 28 L50 88'],
      },
    };
    const MIR = 'matrix(-1 0 0 1 100 0)';
    // kolor mięśnia: ciemny → crimson → jasny crimson (0–1)
    const HEAT = [[0, [52, 34, 34]], [.55, [163, 28, 27]], [1, [232, 82, 78]]];
    function heatFill(v) {
      v = Math.max(0, Math.min(1, v));
      const j = v <= HEAT[1][0] ? 0 : 1, [a, ca] = HEAT[j], [b, cb] = HEAT[j + 1], t = (v - a) / (b - a);
      return `rgb(${ca.map((c, i) => Math.round(c + (cb[i] - c) * t)).join(',')})`;
    }
    // lvl: mięsień → 1 (główny), 0.5 (pomocniczy) albo dowolna wartość 0–1 (mapa cieplna w Postępach)
    function figure(side, lvl, x0) {
      const B = BODY[side], both = d => `<path d="${d}"/><path d="${d}" transform="${MIR}"/>`;
      const fillOf = m => { const v = lvl[m] || 0; return v ? ` style="--v:${Math.min(1, v).toFixed(2)};fill:${heatFill(v)}" class="mu on"` : ' class="mu"'; };
      let sil = B.sil.map(both).join('') + B.silC.map(d => `<path d="${d}"/>`).join('') + B.joints.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/><circle cx="${100 - cx}" cy="${cy}" r="${r}"/>`).join('');
      Object.values(B.m).flat().forEach(d => { sil += both(d); }); Object.values(B.c).flat().forEach(d => { sil += `<path d="${d}"/>`; });
      const mus = Object.entries(B.m).map(([m, ds]) => `<g${fillOf(m)} data-m="${m}">${ds.map(both).join('')}</g>`).join('') + Object.entries(B.c).map(([m, ds]) => `<g${fillOf(m)} data-m="${m}">${ds.map(d => `<path d="${d}"/>`).join('')}</g>`).join('');
      return `<g transform="translate(${x0} 0)"><g class="sil">${sil}</g>${mus}<g class="ln">${B.lines.map(d => `<path d="${d}"/>`).join('')}</g></g>`;
    }
    function bodyMap(primary = [], secondary = [], heat) {
      const lvl = {};
      if (heat) Object.assign(lvl, heat); else { secondary.forEach(m => { lvl[m] = .45; }); primary.forEach(m => { lvl[m] = 1; }); }
      return `<svg class="bmap${heat ? ' heat' : ''}" viewBox="0 0 220 196" role="img" aria-label="Mapa mięśni">${figure('front', lvl, 2)}${figure('back', lvl, 118)}<text x="52" y="195" class="bt">przód</text><text x="168" y="195" class="bt">tył</text></svg>`;
    }

    /* ================= rysowanie ================= */
    function render() {
      const ti = TABS.findIndex(t => t[0] === tab);
      tabsEl.style.setProperty('--i', ti);
      tabsEl.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
      renderTab();
      renderLive();
      if (wOpen && state.active) { openLayer(wkLayer, 'translateY(100%)'); renderWorkout(); } else { closeLayer(wkLayer, 'translateY(100%)'); wOpen = false; hideAsk(true); }
      if (stack.length) { openLayer(dtLayer, 'translateX(100%)'); renderDetail(); } else closeLayer(dtLayer, 'translateX(100%)');
      ctx.fullscreen(wOpen || !!stack.length);
      animTab = false; tabDir = 0;
    }
    let tabDir = 0;
    function renderTab() {
      tabView.dataset.tab = tab;
      const y = scroller.scrollTop;
      ({ log: renderLog, routines: renderRoutines, progress: renderProgress })[tab]();
      if (animTab) {
        scroller.scrollTop = 0;
        // zmiana zakładki: widok wjeżdża z kierunku ruchu pigułki
        if (!calm() && tabDir) tabView.animate([{ opacity: 0, transform: `translateX(${tabDir * 34}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
      } else scroller.scrollTop = y;
    }
    const emptyCard = (title, text, btn = '') => `<div class="break-card empty-day"><div class="bk-sea" aria-hidden="true">${SEA_SVG}<i class="bk-boat">${BOAT}</i></div><div class="bk-txt"><b>${title}</b><small>${text}</small></div>${btn}</div>`;
    function renderLive() {
      const a = state.active, lb = liveEl;
      fabEl.hidden = !!a || tab !== 'log';
      lb.hidden = !a || wOpen;
      if (a && !wOpen) lb.innerHTML = `<span class="lv-dot"></span><span class="lv-t"><b>${esc(a.name)}</b><small>${a.edit ? 'edycja treningu' : `trwa · <span data-el>${elapsed()}</span>`}${rest ? ` · przerwa <span data-rl>${fmtSec(restLeft())}</span>` : ''}</small></span><span class="lv-go">Wróć</span>`;
    }
    const elapsed = () => state.active ? fmtSec((Date.now() - state.active.start) / 1000) : '0:00';

    /* ----- Treningi (dziennik, jak główny ekran RepCount) ----- */
    function wCard(w, i) {
      const s = wStats(w), lines = w.ex.slice(0, 7).map(e => `<li${e.sup ? ' class="ss"' : ''}><span>${esc(exOf(e).name)}</span><b>${esc(exLine(e))}</b></li>`).join('') + (w.ex.length > 7 ? `<li class="more"><span>i ${w.ex.length - 7} więcej…</span></li>` : '');
      return `<button class="wcard" data-w="${w.id}" style="--i:${i}"><div class="wc-h"><span class="wc-d">${dateLabel(w.start)}</span><span class="wc-t"><span>Rozpoczęty ${hhmm(w.start)}</span><span>Trwał ${fmtDur(s.ms)}</span></span></div><b class="wc-n">${esc(w.name)}</b><ul>${lines}</ul>${prCount(w) ? `<div class="wc-f"><span class="pr">${STARS} ${prCount(w)} ${plural(prCount(w), 'rekord', 'rekordy', 'rekordów')}</span></div>` : ''}</button>`;
    }
    // lupka w nagłówku: wysuwa pole wyszukiwania nad listą treningów; drugie dotknięcie chowa je i czyści
    function toggleFind(force) {
      hFind = force ?? !hFind;
      root.querySelector('.g-find')?.setAttribute('aria-expanded', hFind);
      root.querySelector('.g-find')?.classList.toggle('on', hFind);
      if (tab !== 'log') { if (!hFind) return; animTab = true; tabDir = -1; tab = 'log'; try { localStorage.setItem(TAB_KEY, tab); } catch (_) { } render(); }
      const box = tabView.querySelector('.hsearch'); if (!box) return;
      const inp = box.querySelector('input');
      if (hFind) {
        box.hidden = false; inp.focus({ preventScroll: true });
        if (!calm()) box.animate([{ opacity: 0, transform: 'translateY(-10px) scaleX(.92)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 380, easing: EASE });
      } else {
        const done = () => { box.hidden = true; };
        if (hQuery) { hQuery = ''; inp.value = ''; hLimit = 25; renderLog(); }
        inp.blur();
        if (calm()) done(); else box.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scaleX(.94)' }], { duration: 220, easing: EASE_IN }).onfinish = done;
      }
    }
    function renderLog() {
      const q = norm(hQuery.trim());
      const all = finished().filter(w => !q || norm(w.name).includes(q) || w.ex.some(e => norm(exOf(e).name).includes(q)));
      let html = '', i = 0, n = 0, lastM = '';
      for (const w of all) {
        if (n >= hLimit) break;
        const d = new Date(w.start), m = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
        if (m !== lastM) { const cnt = all.filter(x => { const y = new Date(x.start); return y.getMonth() === d.getMonth() && y.getFullYear() === d.getFullYear(); }).length; html += `<div class="grp" style="--i:${i++}"><h3>${m}</h3><em>${cnt} ${plural(cnt, 'trening', 'treningi', 'treningów')}</em></div>`; lastM = m; }
        html += wCard(w, i++); n++;
      }
      if (!all.length) html = q ? '<p class="empty">Nic nie pasuje do wyszukiwania</p>' : emptyCard('Zacznij pierwszy trening', 'Naciśnij +, wybierz plan albo pusty trening i dodawaj serie. Następnym razem ciężary z ostatniego treningu podpowiedzą się same.', '<button class="primary acc" data-start>Nowy trening</button>');
      if (all.length > hLimit) html += '<button class="allweek more" data-more>Pokaż starsze</button>';
      if (!tabView.querySelector('#gy-w-list')) tabView.innerHTML = `<label class="hsearch"${hFind ? '' : ' hidden'}>${SEARCH}<input id="gy-h-q" type="search" placeholder="Szukaj treningu lub ćwiczenia" autocomplete="off" value="${esc(hQuery)}"></label><div class="wlist" id="gy-w-list"></div>`;
      const list = $('w-list'); list.className = 'wlist' + (animTab ? ' enter' : ''); list.innerHTML = html;
    }

    /* ----- Trening (ekran treningu jak w RepCount) ----- */
    const setLabel = (sets, i, pre = '') => { const s = sets[i]; if (s.t === 'w') return 'R'; return pre + work(sets.slice(0, i + 1)).length; };
    const restOf = e => e.rest != null ? snapRest(e.rest) : state.settings.rest;
    // podpowiedź (szara wartość docelowa): z ostatniego razu, a dla dodatkowych serii — z poprzedniej serii
    function target(e, si) {
      const t = e.tg?.[si]; if (t) return t;
      for (let i = si - 1; i >= 0; i--) { const p = e.sets[i]; if (p && p.t !== 'w' && valid(p, exOf(e).kind)) return p; if (e.tg?.[i] && e.sets[i].t !== 'w') return e.tg[i]; }
      return null;
    }
    function setRow(e, xi, si, label) {
      const s = e.sets[si], k = exOf(e).kind, tg = target(e, si), ok = valid(s, k);
      const pr = ok && !state.active.edit ? prOf(s, k, bests(e.eid, state.active.edit, state.active.start)) : null;
      const fields = colsOf(k).map(([f, l]) => `<label class="fld f-${f}"><small>${l}</small><input data-f="${f}" type="text" inputmode="decimal" enterkeyhint="next" value="${inVal(s, f, k)}" placeholder="${tg ? esc(String(inVal(tg, f, k))) : ''}" autocomplete="off"></label>`).join('');
      const note = k === 'cardio' ? '' : `<label class="fld f-note"><small>Notatka</small><input data-f="note" type="text" enterkeyhint="done" maxlength="60" value="${esc(s.note || '')}" placeholder="${tg?.note ? esc(tg.note) : ''}" autocomplete="off"></label>`;
      return `<div class="srow${ok ? ' ok' : ''}${s.t !== 'n' ? ' t-' + s.t : ''}${k === 'cardio' ? ' cardio' : ''}" data-x="${xi}" data-s="${si}" data-v="${ok ? 1 : 0}"><button class="sn" data-sn aria-label="Seria ${label}${tg ? ', wpisz podpowiedź' : ''}">${label}</button>${s.t === 'd' ? '<i class="tagd" title="Drop set">↓</i>' : s.t === 'f' ? '<i class="tagd f" title="Do upadku">U</i>' : ''}${fields}${note}<span class="prs" ${pr ? '' : 'hidden'} title="Rekord">${STAR}</span><button class="sm" data-smenu aria-label="Opcje serii">${DOTS}</button></div>`;
    }
    function exCard(group, idx0) {
      const a = state.active;
      const foot = () => `<div class="cfoot"><button class="adds" data-addset="${idx0}">${PLUSC}<span>Dodaj serię</span></button></div>`;
      if (group.length === 1) {
        const e = group[0], x = exOf(e);
        return `<article class="exc" data-x="${idx0}" style="--i:${idx0}"><header><button class="exn" data-exinfo="${e.eid}"><b>${esc(x.name)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</button><button class="sm acc" data-exmenu="${idx0}" aria-label="Opcje ćwiczenia">${DOTS}</button></header><div class="sets">${e.sets.map((s, si) => setRow(e, idx0, si, setLabel(e.sets, si))).join('')}</div>${foot(e)}</article>`;
      }
      // superseria: A, B, C… i serie na przemian A1, B1, A2, B2
      const L = 'ABCDEFGH', rounds = Math.max(...group.map(e => e.sets.length));
      let rows = '';
      for (let r = 0; r < rounds; r++) group.forEach((e, gi) => { if (e.sets[r]) rows += setRow(e, idx0 + gi, r, e.sets[r].t === 'w' ? 'R' : L[gi] + work(e.sets.slice(0, r + 1)).length); });
      return `<article class="exc ss" data-x="${idx0}" style="--i:${idx0}"><header class="ssh">${group.map((e, gi) => `<div class="ssn"><i>${L[gi]}</i><button class="exn" data-exinfo="${e.eid}"><b>${esc(exOf(e).name)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</button><button class="sm acc" data-exmenu="${idx0 + gi}" aria-label="Opcje ćwiczenia">${DOTS}</button></div>`).join('')}</header><div class="sets">${rows}</div>${foot(group[0])}</article>`;
    }
    const groupsOf = list => { const out = []; let i = 0; while (i < list.length) { const g = [list[i]]; if (list[i].sup) while (list[i + g.length]?.sup === list[i].sup) g.push(list[i + g.length]); out.push([i, g]); i += g.length; } return out; };
    function renderWorkout() {
      const a = state.active, sy = wkLayer.scrollTop, s = wStats(a, true), d = new Date(a.start);
      const fresh = !wkLayer.querySelector('.wk-body');
      const bar = `<div class="topbar wkbar"><button class="tb-i" data-wk-min aria-label="${a.edit ? 'Anuluj edycję' : 'Zwiń trening'}">${a.edit ? XMARK : DOWN}</button><div class="tb-mid"><button class="fin" data-finish>${a.edit ? 'Zapisz' : 'Zakończ'}</button></div><div class="tb-rt"><div class="tb-g"><button class="tb-timer${rest ? ' run' : ''}" data-timer aria-label="Timer przerwy">${ALARM}<span data-rl>${rest ? fmtSec(restLeft()) : ''}</span></button><button data-wk-menu aria-label="Opcje treningu">${DOTSC}</button></div><small class="tb-el">${a.edit ? 'edycja' : `<span data-el>${elapsed()}</span>`}</small></div></div>`;
      const body = `<div class="wk-head"><div class="eyebrow">${DAYS_FULL[dow(d)]} · ${hhmm(a.start)}</div><input class="wname" id="gy-w-name" type="text" maxlength="60" value="${esc(a.name)}" aria-label="Nazwa treningu" autocomplete="off">${a.note ? `<p class="wnote" data-wk-menu>${esc(a.note)}</p>` : ''}</div>
        <div class="exlist${fresh ? ' enter' : ''}">${groupsOf(a.ex).map(([i, g]) => exCard(g, i)).join('') || emptyCard('Pusty trening', 'Dodaj pierwsze ćwiczenie. Szare liczby w seriach to wynik z ostatniego razu — dotknij numeru serii, żeby go wpisać.')}</div>
        <button class="addex" data-addex>${PLUSC}<span>Dodaj ćwiczenie</span></button>`;
      wkLayer.innerHTML = `${bar}<div class="wk-body">${body}</div>`;
      wkLayer.scrollTop = sy;
    }
    // jedna seria zmieniła stan (wpisana / wyczyszczona): poprawka w miejscu, bez przerysowania (kursor zostaje w polu)
    function patchRow(row) {
      const a = state.active, e = a.ex[+row.dataset.x], s = e?.sets[+row.dataset.s]; if (!s) return;
      const k = exOf(e).kind, ok = valid(s, k), was = row.dataset.v === '1';
      row.classList.toggle('ok', ok); row.dataset.v = ok ? 1 : 0;
      const pr = ok && !a.edit ? prOf(s, k, bests(e.eid, a.edit, a.start)) : null;
      row.querySelector('.prs').hidden = !pr;
      if (ok && !was) logged(e, +row.dataset.x, row, pr);
    }
    // seria wpisana: rekord, przerwa (w superserii dopiero po ostatnim ćwiczeniu z grupy)
    function logged(e, xi, row, pr) {
      const a = state.active, k = exOf(e).kind;
      ctx.vibrate(12);
      if (!calm()) {
        // odhaczenie: numer serii „pyka”, wiersz krótko się podświetla, krąg rozchodzi się jak na wodzie
        row.querySelector('.sn').animate({ transform: ['scale(.6)', 'scale(1.22)', 'scale(1)'] }, { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        row.animate({ backgroundColor: ['rgba(255, 255, 255, 0.099)', 'rgba(255, 255, 255, 0.0)'] }, { duration: 900, easing: 'ease-out' });
        const r = row.querySelector('.sn').getBoundingClientRect(); ripple(r.left + r.width / 2, r.top + r.height / 2, .9);
      }
      if (pr) { toast(`Nowy rekord (${PR_NAME[pr]}): ${exOf(e).name} · ${fmtSet(e.sets[+row.dataset.s], k, true)}`); prBurst(row.querySelector('.prs')); ctx.vibrate([20, 40, 30]); }
      const next = a.ex[xi + 1], inSup = e.sup && next && next.sup === e.sup;
      if (!a.edit && state.settings.autoRest && !inSup && k !== 'cardio' && restOf(e) > 0) askRest(restOf(e));
    }
    // nowe ćwiczenie w treningu: serie z ostatniego razu jako szare podpowiedzi (jak w RepCount)
    function newEntry(eid, opt = {}) {
      const tgAll = opt.tg || lastSets(eid, state.active?.edit, opt.rid) || lastSets(eid, state.active?.edit) || [];
      const tw = tgAll.filter(s => s.t === 'w'), tn = work(tgAll);
      let types;
      if (opt.w != null || opt.n != null) types = [...Array(opt.w || 0).fill('w'), ...Array(opt.n || 0).fill('n')];
      else types = tgAll.length ? tgAll.map(s => s.t === 'w' ? 'w' : 'n') : ['n', 'n', 'n'];
      let wi = 0, ni = 0;
      const tg = types.map(t => { const src = t === 'w' ? (tw[wi++] || tw[tw.length - 1]) : (tn[ni++] || tn[tn.length - 1]); return src ? { kg: src.kg ?? null, r: src.r ?? null, s: src.s ?? null, km: src.km ?? null, kcal: src.kcal ?? null, note: src.note || '' } : null; });
      // drop sety i serie do upadku z ostatniego razu zostają oznaczone
      ni = 0; const nt = types.map(t => t === 'w' ? 'w' : (tn[ni++]?.t || 'n'));
      return { eid, note: opt.note || '', sup: opt.sup || null, rest: undefined, tg, sets: nt.map(t => ({ t, kg: null, r: null, s: null, km: null, kcal: null, note: '' })) };
    }
    function startWorkout(opts = {}) {
      if (state.active) {
        show('Trening już trwa', esc(state.active.name), `<p class="hint">Najpierw zakończ albo odrzuć obecny trening.</p><div class="confirm"><button id="gy-go-active">Wróć do treningu</button><button class="yes" id="gy-drop-active">Odrzuć i zacznij nowy</button></div>`);
        $('go-active').addEventListener('click', () => { close(); openWorkout(); });
        $('drop-active').addEventListener('click', () => { state.active = null; stopRest(); close(); startWorkout(opts); });
        return;
      }
      const now = Date.now();
      state.active = { id: uid('w'), name: opts.name || defaultName(now), rid: opts.rid || null, start: now, note: opts.note || '', ex: [] };
      (opts.ex || []).forEach(e => state.active.ex.push(newEntry(e.eid, e)));
      save(); close(); stack = []; openWorkout();
      if (!opts.ex?.length) setTimeout(() => openPicker('workout'), calm() ? 0 : 280);
    }
    function openWorkout() { wOpen = true; render(); wkLayer.scrollTop = 0; }
    function startRoutine(id) {
      const r = state.routines[id]; if (!r) return;
      startWorkout({ name: r.name, rid: r.id, note: r.note || '', ex: r.ex.map(e => ({ eid: e.eid, w: e.w || 0, n: e.n || 1, sup: e.sup, note: e.note, rid: r.target === 'routine' ? r.id : null })) });
    }
    function openStart() {
      const rs = routinesSorted();
      show('Nowy trening', '', `<button class="emptyw" id="gy-st-empty"><span class="pl">${PLUS}</span><span><b>Pusty trening</b><small>dodawaj ćwiczenia na bieżąco</small></span></button>
        ${rs.length ? `<div class="grp"><h3>Z planu</h3></div><div class="ilist">${rs.map(r => { const last = finished().find(w => w.rid === r.id); return `<button class="irow" data-st-r="${r.id}"><span class="ir-t"><b>${esc(r.name)}</b><small>${r.ex.length} ćw.${last ? ' · ostatnio ' + ago(last.start) : ''}</small></span><span class="go-pill">${PLAY}</span></button>`; }).join('')}</div>` : ''}`, 'Nowy trening');
      $('st-empty').addEventListener('click', () => startWorkout());
      overlay.querySelectorAll('[data-st-r]').forEach(b => b.addEventListener('click', () => startRoutine(b.dataset.stR)));
    }
    function setMenu(xi, si) {
      const e = state.active.ex[xi], s = e.sets[si];
      const opt = (t, l, d) => `<button class="irow${s.t === t ? ' on' : ''}" data-st="${t}"><span class="ir-t"><b>${l}</b><small>${d}</small></span>${s.t === t ? '<span class="ck">✓</span>' : ''}</button>`;
      show(`Seria ${setLabel(e.sets, si)}`, esc(exOf(e).name), `<div class="ilist">${opt('n', 'Normalna', 'liczy się do objętości i rekordów')}${opt('w', 'Rozgrzewkowa (R)', 'bez objętości i rekordów')}${opt('d', 'Drop set ↓', 'zaraz po poprzedniej, lżej')}${opt('f', 'Do upadku (U)', 'do upadku mięśniowego')}</div><div class="ilist"><button class="irow" data-sclear><span class="ir-t"><b>Wyczyść</b></span></button><button class="irow out" data-sdel><span class="ir-t"><b>Usuń serię</b></span></button></div>`, 'Seria');
      overlay.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => { s.t = b.dataset.st; save(); close(); render(); }));
      overlay.querySelector('[data-sclear]').addEventListener('click', () => { ['kg', 'r', 's', 'km', 'kcal'].forEach(f => { s[f] = null; }); s.note = ''; save(); close(); render(); });
      overlay.querySelector('[data-sdel]').addEventListener('click', () => { e.sets.splice(si, 1); e.tg?.splice(si, 1); save(); close(); render(); });
    }
    function exMenu(xi) {
      const a = state.active, e = a.ex[xi], x = exOf(e), next = a.ex[xi + 1];
      const rests = [0, ...REST_OPTS];
      show(esc(x.name), esc(exSub(x)), `
        ${x.kind !== 'cardio' ? `<div class="field"><span class="lab">Przerwa po serii</span><div class="chips rchips">${rests.map(r => `<button class="${restOf(e) === r ? 'on' : ''}" data-rest-sec="${r}">${r ? fmtSec(r) : 'brak'}</button>`).join('')}</div></div>` : ''}
        <div class="ilist">
          <button class="irow" data-m="note"><span class="ir-t"><b>Notatka</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</span>${CHEV}</button>
          <button class="irow" data-m="info"><span class="ir-t"><b>Historia, wykres i rekordy</b></span>${CHEV}</button>
          ${next ? `<button class="irow" data-m="sup"><span class="ir-t"><b>${e.sup && next.sup === e.sup ? 'Rozłącz z następnym' : 'Superseria z następnym'}</b><small>${esc(exOf(next).name)}</small></span></button>` : ''}
          ${e.sup && !(next && next.sup === e.sup) ? '<button class="irow" data-m="unsup"><span class="ir-t"><b>Wyjmij z superserii</b></span></button>' : ''}
          <button class="irow" data-m="swap"><span class="ir-t"><b>Zamień ćwiczenie</b></span>${CHEV}</button>
          ${xi > 0 ? '<button class="irow" data-m="up"><span class="ir-t"><b>Przesuń wyżej</b></span></button>' : ''}
          ${next ? '<button class="irow" data-m="down"><span class="ir-t"><b>Przesuń niżej</b></span></button>' : ''}
        </div>
        <div class="ilist"><button class="irow out" data-m="del"><span class="ir-t"><b>Usuń ćwiczenie</b></span></button></div>`, 'Opcje ćwiczenia');
      overlay.querySelectorAll('[data-rest-sec]').forEach(b => b.addEventListener('click', () => { e.rest = +b.dataset.restSec; save(); overlay.querySelectorAll('[data-rest-sec]').forEach(z => z.classList.toggle('on', z === b)); }));
      overlay.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
        const m = b.dataset.m;
        if (m === 'note') { exNote(xi); return; }
        if (m === 'info') { close(); pushDetail({ type: 'ex', eid: e.eid, tab: 'hist' }); return; }
        if (m === 'swap') { openPicker('swap', ids => { a.ex[xi] = { ...newEntry(ids[0]), sup: e.sup, rest: e.rest }; save(); close(); render(); }); return; }
        if (m === 'sup') { if (e.sup && next.sup === e.sup) { next.sup = null; tidySup(); } else { const id = e.sup || next.sup || uid('s'); e.sup = id; next.sup = id; } }
        if (m === 'unsup') { e.sup = null; tidySup(); }
        if (m === 'up' || m === 'down') { const j = m === 'up' ? xi - 1 : xi + 1;[a.ex[xi], a.ex[j]] = [a.ex[j], a.ex[xi]]; tidySup(); }
        if (m === 'del') { a.ex.splice(xi, 1); tidySup(); }
        save(); close(); render();
      }));
    }
    function exNote(xi) {
      const e = state.active.ex[xi];
      show('Notatka', esc(exOf(e).name), `<div class="field"><textarea id="gy-n-txt" rows="3" maxlength="200" placeholder="np. ustawienie siedzenia 4, chwyt szeroki">${esc(e.note || '')}</textarea></div><button class="primary acc" id="gy-n-save">Zapisz</button>`, 'Notatka');
      $('n-save').addEventListener('click', () => { e.note = $('n-txt').value.trim(); save(); close(); render(); });
    }
    // superseria musi mieć co najmniej 2 sąsiadujące ćwiczenia
    function tidySup(list = state.active.ex) { list.forEach((e, i) => { if (e.sup && list[i - 1]?.sup !== e.sup && list[i + 1]?.sup !== e.sup) e.sup = null; }); }
    function addSet(xi) {
      const a = state.active, e0 = a.ex[xi], grp = e0.sup ? a.ex.filter(x => x.sup === e0.sup) : [e0];
      grp.forEach(e => { const li = e.sets.length - 1, l = e.sets[li], src = l ? (l.kg != null ? l : target(e, li)) : null; e.sets.push({ t: l && l.t !== 'w' ? l.t : 'n', kg: exOf(e).kind !== 'cardio' && src?.kg != null ? src.kg : null, r: null, s: null, km: null, kcal: null, note: '' }); });
      save(); render();
      const row = wkLayer.querySelector(`.srow[data-x="${xi}"][data-s="${e0.sets.length - 1}"]`);
      if (row && !calm()) row.animate({ opacity: [0, 1], transform: ['translateY(-8px)', 'none'] }, { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    // dotknięcie numeru serii: wpisuje podpowiedź z ostatniego razu (szybkie „zrobione jak ostatnio”)
    function tapSet(row) {
      const a = state.active, e = a.ex[+row.dataset.x], si = +row.dataset.s, s = e.sets[si], k = exOf(e).kind;
      if (valid(s, k)) { setMenu(+row.dataset.x, si); return; }
      const tg = target(e, si);
      if (!tg) { row.querySelector('input')?.focus(); toast('Wpisz wynik tej serii'); return; }
      colsOf(k).forEach(([f]) => { if (s[f] == null && tg[f] != null) s[f] = tg[f]; });
      if (!valid(s, k)) { row.querySelector('input')?.focus(); return; }
      save();
      colsOf(k).forEach(([f]) => { const inp = row.querySelector(`[data-f="${f}"]`); if (inp) inp.value = inVal(s, f, k); });
      patchRow(row);
    }
    function workoutMenu() {
      const a = state.active;
      show(a.edit ? 'Edycja treningu' : 'Trening', esc(a.name), `
        ${a.edit ? `<div class="row3"><div class="field"><label for="gy-m-date">Dzień</label><input id="gy-m-date" type="date" value="${key(new Date(a.start))}"></div><div class="field"><label for="gy-m-time">Start</label><input id="gy-m-time" type="time" value="${hhmm(a.start)}"></div><div class="field"><label for="gy-m-dur">Minut</label><input id="gy-m-dur" type="number" inputmode="numeric" min="1" value="${Math.max(1, Math.round((a.end - a.start) / 60000))}"></div></div>` : ''}
        <div class="field"><label for="gy-m-note">Notatka do treningu</label><textarea id="gy-m-note" rows="3" maxlength="600" placeholder="np. samopoczucie, sen, ból barku">${esc(a.note || '')}</textarea></div>
        <button class="primary acc" id="gy-m-save">Zapisz</button>
        <div class="ilist">${a.edit ? '<button class="irow" id="gy-m-cancel"><span class="ir-t"><b>Anuluj edycję</b></span></button>' : '<button class="irow out" id="gy-m-drop"><span class="ir-t"><b>Odrzuć trening</b><small>serie z tego treningu nie zostaną zapisane</small></span></button>'}</div>`, 'Trening');
      $('m-save').addEventListener('click', () => {
        a.note = $('m-note').value.trim();
        if (a.edit) { const d = $('m-date').value, t = $('m-time').value, m = num($('m-dur').value); if (d && t) { const st = new Date(`${d}T${t}`).getTime(); if (isFinite(st)) a.start = st; } a.end = a.start + Math.max(1, m || 60) * 60000; }
        save(); close(); render();
      });
      $('m-cancel')?.addEventListener('click', () => { const id = a.edit; state.active = null; wOpen = false; save(); close(); pushDetail({ type: 'w', id }); });
      $('m-drop')?.addEventListener('click', () => {
        show('Odrzucić trening?', 'Serie z tego treningu nie zostaną zapisane', `<div class="confirm"><button data-close>Nie</button><button class="yes" id="gy-c-yes">Odrzuć</button></div>`);
        $('c-yes').addEventListener('click', () => { state.active = null; wOpen = false; stopRest(); save(); close(); render(); toast('Trening odrzucony'); });
      });
    }
    function finishAsk() {
      const a = state.active; if (!a) return;
      if (a.edit) { finish(); return; }
      const s = wStats(a, true);
      if (!s.sets && !a.ex.some(e => e.sets.some(x => valid(x, exOf(e).kind)))) {
        show('Brak wpisanych serii', 'Wpisz ciężar i powtórzenia albo dotknij numeru serii', `<div class="confirm"><button data-close>Wróć</button><button class="yes" id="gy-w-drop">Odrzuć trening</button></div>`);
        $('w-drop').addEventListener('click', () => { state.active = null; wOpen = false; stopRest(); save(); close(); render(); toast('Trening odrzucony'); });
        return;
      }
      const empty = a.ex.reduce((n, e) => n + e.sets.filter(x => !valid(x, exOf(e).kind)).length, 0);
      show('Zakończyć trening?', `${elapsed()} · ${s.sets} ${plural(s.sets, 'seria', 'serie', 'serii')}`, `${empty ? `<p class="hint">${empty} ${plural(empty, 'pusta seria zostanie pominięta', 'puste serie zostaną pominięte', 'pustych serii zostanie pominiętych')}.</p>` : ''}<div class="confirm"><button data-close>Wróć</button><button class="yes acc" id="gy-w-fin">Zakończ</button></div>`);
      $('w-fin').addEventListener('click', finish);
    }
    function finish() {
      const a = state.active; if (!a) return;
      const ex = a.ex.map(e => { const k = exOf(e).kind; return { eid: e.eid, n: exOf(e).name, note: (e.note || '').trim(), sup: e.sup || null, sets: e.sets.filter(s => valid(s, k)).map(s => { const o = { t: s.t || 'n' }; ['kg', 'r', 's', 'km', 'kcal'].forEach(f => { if (s[f] != null && s[f] !== '') o[f] = s[f]; }); if (s.note) o.note = s.note; return o; }) }; }).filter(e => e.sets.length);
      tidySup(ex);
      if (!ex.length) { toast('Brak serii do zapisania'); return; }
      const w = { id: a.edit || a.id, name: (a.name || '').trim() || defaultName(a.start), rid: a.rid || null, start: a.start, end: a.edit ? a.end : Date.now(), note: (a.note || '').trim(), ex };
      w.prs = computePRs(w);
      const before = weekWorkouts(0).length, wasEdit = !!a.edit;
      state.workouts[w.id] = w; state.active = null; wOpen = false; stopRest();
      if (wasEdit) finished().filter(x => x.start > w.start).reverse().forEach(x => { x.prs = computePRs(x); }); // późniejsze rekordy po edycji
      save(); close(); animTab = true;
      if (wasEdit) { stack = [{ type: 'w', id: w.id }]; render(); toast('Zapisano zmiany'); return; }
      tab = 'log'; stack = []; render(); scroller.scrollTop = 0;
      summary(w, before);
    }
    // poprzedni najlepszy wynik (przed tym treningiem) dla danego rodzaju rekordu
    function prevBest(eid, t, w) {
      let best = null;
      sessionsOf(eid, w.id).forEach(({ w: ww, sets }) => {
        if (ww.start >= w.start) return;
        work(sets).forEach(x => { const v = t === 'e1rm' ? e1rm(x.kg, x.r) : t === 'kg' ? (x.kg || 0) : t === 'r' ? (x.r || 0) : (x.s || 0); if (!best || v > best.v) best = { v, set: x, at: ww.start }; });
      });
      return best;
    }
    // rekordy: ćwiczenie i sama poprawa „poprzednio → teraz” (ciężar, powtórzenia albo czas); jeden wiersz na ćwiczenie
    const PR_PREF = ['kg', 'r', 's', 'e1rm'];
    const prCount = w => new Set((w.prs || []).map(p => p.eid)).size;
    const prVal = (set, t, k) => !set ? '—' : t === 'kg' ? `${fmtW(set.kg || 0)} ${U()}` : t === 'r' ? `${set.r || 0}` : t === 's' ? fmtSec(set.s || 0) : fmtSet(set, k, true);
    function prListHtml(w) {
      const byEx = {};
      (w.prs || []).forEach(p => { const o = byEx[p.eid]; if (!o || PR_PREF.indexOf(p.t) < PR_PREF.indexOf(o.t)) byEx[p.eid] = p; });
      const rows = Object.values(byEx).map(p => {
        const x = exAny(p.eid), k = x.kind, pb = prevBest(p.eid, p.t, w);
        return `<div class="prrow"><b class="pr-n">${esc(x.name)}</b><div class="pr-v"><span>${esc(prVal(pb?.set, p.t, k))}</span><i>→</i><span>${esc(prVal(p.set, p.t, k))}</span></div></div>`;
      });
      return `<div class="prlist2">${rows.join('')}</div>`;
    }
    function openPRs(w) {
      show('Rekordy', `${esc(w.name)} · ${shortDate(w.start)}`, prListHtml(w) + '<button class="primary acc" data-close>Zamknij</button>', 'Rekordy');
    }
    // po treningu: tylko czas i liczba rekordów; dotknięcie rekordów rozwija listę
    function summary(w, before) {
      const s = wStats(w), g = state.settings.weekGoal, after = weekWorkouts(0).length, n = prCount(w);
      show('Trening zakończony', esc(w.name), `
        <div class="sumtiles"><div class="st"><small>Czas</small><b>${fmtDurS(s.ms)}</b></div><button class="st pr${n ? ' party' : ''}" id="gy-sum-pr" ${n ? '' : 'disabled'} aria-expanded="false"><small>Rekordy</small><b>${n}</b>${n ? `<span>pokaż ${CHEV}</span>` : ''}</button></div>
        <div class="sumlist" id="gy-sum-list" hidden>${n ? prListHtml(w) : ''}</div>
        <button class="primary acc" data-close>Gotowe</button>`, 'Podsumowanie treningu', 'summary');
      $('sum-pr')?.addEventListener('click', () => { const l = $('sum-list'), b = $('sum-pr'), open = l.hidden; l.hidden = !open; b.setAttribute('aria-expanded', open); b.classList.toggle('open', open); });
      celebrate(n);
    }
    // plan, z którego był trening, można zaktualizować z menu ⋯ zakończonego treningu
    const routineDiff = (w, r) => r && (r.ex.length !== w.ex.length || r.ex.some((e, i) => e.eid !== w.ex[i].eid || +e.n !== work(w.ex[i].sets).length || +(e.w || 0) !== w.ex[i].sets.filter(x => x.t === 'w').length));

    /* ----- ekrany szczegółów (nakładane na wierzch, jak w aplikacji na telefon) ----- */
    // kolejny ekran szczegółów wjeżdża z prawej, powrót wysuwa poprzedni z lewej
    let dtDir = 0, dtSwap = 0;
    const segReset = () => Object.keys(segPrev).forEach(k => { delete segPrev[k]; });
    function pushDetail(d) { dtDir = stack.length ? 1 : 0; segReset(); stack.push(d); render(); dtLayer.scrollTop = 0; }
    function popDetail() { stack.pop(); dtDir = stack.length ? -1 : 0; segReset(); render(); }
    const dtBar = (title, right = '') => `<div class="topbar dtbar"><button class="tb-i" data-back aria-label="Wstecz">${BACK}</button><div class="tb-c">${title}</div><div class="tb-r">${right}</div></div>`;
    function renderDetail() {
      const d = stack[stack.length - 1];
      if (d.type === 'w' && !state.workouts[d.id]) { stack.pop(); return render(); }
      if (d.type === 'r' && !state.routines[d.id]) { stack.pop(); return render(); }
      const sy = dtLayer.scrollTop;
      dtLayer.innerHTML = d.type === 'w' ? workoutScreen(d) : d.type === 'r' ? routineScreen(d) : d.type === 'ex' ? exerciseScreen(d) : '';
      dtLayer.scrollTop = sy;
      // przełączenie Historia / Wykres / Rekordy / Opis: treść przesuwa się w stronę ruchu pigułki
      if (dtSwap && !calm()) dtLayer.querySelector('.xbody')?.animate([{ opacity: 0, transform: `translateX(${dtSwap * 30}px)` }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE });
      dtSwap = 0;
      if (dtDir && !calm()) dtLayer.querySelector('.dt-body')?.animate([{ opacity: 0, transform: `translateX(${dtDir * 40}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE });
      dtDir = 0;
      segAnim(dtLayer);
      if (d.type === 'ex') bindChart(d);
      if (d.fresh) { delete d.fresh; const n = dtLayer.querySelector('[data-rname]'); if (n && matchMedia('(hover: hover)').matches) { n.focus(); n.select(); } }
    }

    /* szczegóły zakończonego treningu */
    function histTable(sets, k) {
      const cols = k === 'cardio' ? [['s', 'Min'], ['km', 'Km'], ['kcal', 'Kcal']] : k === 'time' ? [['kg', '+' + UC()], ['s', 'Sek.']] : k === 'bw' ? [['kg', '+' + UC()], ['r', 'Powt.']] : [['kg', UC()], ['r', 'Powt.']];
      return `<table class="htab"><thead><tr><th>Seria</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th>Notatka</th></tr></thead><tbody>${sets.map((s, i) => `<tr class="t-${s.t || 'n'}"><td>${s.t === 'w' ? 'R' : setLabel(sets, i)}${s.t === 'd' ? ' ↓' : s.t === 'f' ? ' U' : ''}</td>${cols.map(([f]) => `<td>${f === 's' && k === 'time' ? fmtSec(s.s) : esc(inVal(s, f, k) || '—')}</td>`).join('')}<td class="nt">${esc(s.note || '')}${s.pr ? ` <span class="prs">${STARS}</span>` : ''}</td></tr>`).join('')}</tbody></table>`;
    }
    function sumStrip(sets, k) {
      const ws = work(sets);
      if (k === 'wr') return `<div class="strip mini"><div><small>Powt.</small><b>${ws.reduce((a, s) => a + (s.r || 0), 0)}</b></div><div><small>Serie</small><b>${ws.length}</b></div><div><small>1RM</small><b>${fmtRM(Math.max(0, ...ws.map(s => e1rm(s.kg, s.r))))} ${U()}</b></div><div><small>Objętość</small><b>${fmtVol(volOf(sets, k))} ${U()}</b></div></div>`;
      if (k === 'bw') return `<div class="strip mini"><div><small>Powt.</small><b>${ws.reduce((a, s) => a + (s.r || 0), 0)}</b></div><div><small>Serie</small><b>${ws.length}</b></div><div><small>Max</small><b>${Math.max(0, ...ws.map(s => s.r || 0))}</b></div></div>`;
      if (k === 'time') return `<div class="strip mini"><div><small>Serie</small><b>${ws.length}</b></div><div><small>Łącznie</small><b>${fmtSec(ws.reduce((a, s) => a + (s.s || 0), 0))}</b></div><div><small>Najdłużej</small><b>${fmtSec(Math.max(0, ...ws.map(s => s.s || 0)))}</b></div></div>`;
      return `<div class="strip mini"><div><small>Czas</small><b>${r0(ws.reduce((a, s) => a + (s.s || 0), 0) / 60)} min</b></div><div><small>Dystans</small><b>${nf(ws.reduce((a, s) => a + (s.km || 0), 0), 2)} km</b></div><div><small>Kcal</small><b>${r0(ws.reduce((a, s) => a + (s.kcal || 0), 0))}</b></div></div>`;
    }
    function workoutScreen(d) {
      const w = state.workouts[d.id], s = wStats(w);
      const body = groupsOf(w.ex).map(([, g]) => { const cards = g.map(e => { const x = exOf(e); return `<section class="hcard"><header><button class="exn" data-exinfo="${e.eid}"><b>${esc(x.name)}</b></button>${e.note ? `<small>${esc(e.note)}</small>` : ''}</header>${histTable(e.sets, x.kind)}${sumStrip(e.sets, x.kind)}</section>`; }).join(''); return g.length > 1 ? `<div class="ssg"><div class="ss-l">Superseria</div>${cards}</div>` : cards; }).join('');
      return `${dtBar(esc(w.name), `<button class="tb-i" data-wmenu="${w.id}" aria-label="Opcje">${DOTSC}</button>`)}<div class="dt-body">
        <div class="eyebrow">${dateLabel(w.start)} · ${hhmm(w.start)}–${hhmm(w.end)}</div><h1 class="big">${esc(w.name)}</h1>
        <div class="strip"><div><small>Czas</small><b>${fmtDurS(s.ms)}</b></div><div><small>Serie</small><b>${s.sets}</b></div><div><small>Objętość</small><b>${fmtVol(s.vol)} ${U()}</b></div><button class="stpr" data-wprs="${w.id}" ${w.prs?.length ? '' : 'disabled'}><small>Rekordy</small><b class="acc">${prCount(w)}</b></button></div>
        ${w.note ? `<div class="ai-note">${esc(w.note)}</div>` : ''}
        <button class="primary acc bigbtn" data-repeat="${w.id}">${AGAIN}<span>Powtórz trening</span></button>
        <div class="hlist">${body}</div></div>`;
    }
    function workoutActions(id) {
      const w = state.workouts[id]; if (!w) return;
      show(esc(w.name), dateLabel(w.start), `<div class="ilist"><button class="irow" data-a="edit"><span class="ir-t"><b>Edytuj trening</b><small>serie, dzień, godzina, czas</small></span>${CHEV}</button><button class="irow" data-a="plan"><span class="ir-t"><b>Zapisz jako plan</b></span></button>${routineDiff(w, w.rid && state.routines[w.rid]) ? `<button class="irow" data-a="upd"><span class="ir-t"><b>Zaktualizuj plan „${esc(state.routines[w.rid].name)}”</b><small>ćwiczenia i liczba serii jak w tym treningu</small></span></button>` : ''}</div><div class="ilist"><button class="irow out" data-a="del"><span class="ir-t"><b>Usuń trening</b></span></button></div>`, 'Opcje treningu');
      overlay.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
        const act = b.dataset.a;
        if (act === 'edit') {
          if (state.active) { close(); toast('Najpierw zakończ trwający trening'); return; }
          state.active = { ...deep(w), edit: w.id }; state.active.ex.forEach(e => { e.tg = []; e.sets.forEach(s => { s.note = s.note || ''; delete s.pr; }); });
          save(); close(); stack = []; openWorkout();
        }
        if (act === 'upd') { const r = state.routines[w.rid]; r.ex = w.ex.map(e => ({ eid: e.eid, w: e.sets.filter(x => x.t === 'w').length, n: work(e.sets).length || 1, note: r.ex.find(x => x.eid === e.eid)?.note || '', sup: e.sup || null })); save(); close(); toast('Plan zaktualizowany'); return; }
        if (act === 'plan') { const r = { id: uid('r'), name: w.name, created: Date.now(), note: '', target: 'latest', ex: w.ex.map(e => ({ eid: e.eid, w: e.sets.filter(x => x.t === 'w').length, n: work(e.sets).length || 1, note: '', sup: e.sup || null })) }; state.routines[r.id] = r; save(); close(); toast(`Zapisano plan „${r.name}”`); tab = 'routines'; stack = [{ type: 'r', id: r.id }]; render(); }
        if (act === 'del') {
          show('Usunąć trening?', esc(w.name), `<div class="confirm"><button data-close>Anuluj</button><button class="yes" id="gy-cd-yes">Usuń</button></div>`);
          $('cd-yes').addEventListener('click', () => { delete state.workouts[id]; finished().filter(x => x.start > w.start).reverse().forEach(x => { x.prs = computePRs(x); }); save(); close(); stack = stack.filter(z => !(z.type === 'w' && z.id === id)); render(); toast('Usunięto'); });
        }
      }));
    }

    /* ----- Plany ----- */
    const routinesSorted = () => Object.values(state.routines).sort((a, b) => (a.order ?? a.created ?? 0) - (b.order ?? b.created ?? 0));
    function renderRoutines() {
      const rs = routinesSorted();
      const rows = rs.map((r, i) => { const last = finished().find(w => w.rid === r.id), sets = r.ex.reduce((a, e) => a + (+e.n || 0), 0); return `<button class="irow" data-r="${r.id}" style="--i:${i}"><span class="ir-t"><b>${esc(r.name)}</b><small>${r.ex.length} ćw. · ${sets} serii${last ? ' · ostatnio ' + ago(last.start) : ''}</small></span><span class="rhandle" aria-label="Przesuń plan" title="Przytrzymaj i przesuń">${GRIP}</span></button>`; }).join('');
      tabView.innerHTML = rs.length ? `<div class="grp"><h3>${rs.length} ${plural(rs.length, 'plan', 'plany', 'planów')}</h3><button class="chip g-add" data-rnew>${PLUS}<span>Nowy plan</span></button></div><div class="ilist${animTab ? ' enter' : ''}">${rows}</div><p class="hint">Przytrzymaj plan, żeby go usunąć · ≡ przesuwa</p>`
        : emptyCard('Brak planów', 'Plan to lista ćwiczeń z liczbą serii. Zrób go raz i zaczynaj trening jednym dotknięciem.', '<button class="primary acc" data-rnew>Nowy plan</button>');
    }
    // przytrzymanie wiersza planu (ok. pół sekundy) pyta o usunięcie
    let lpT = null, lpStart = null, lpFired = false;
    function askDeleteRoutine(id) {
      const r = state.routines[id]; if (!r) return;
      ctx.vibrate(20);
      show('Usunąć plan?', esc(r.name), `<p class="hint">Treningi zrobione z tego planu zostaną w historii.</p><div class="confirm"><button data-close>Anuluj</button><button class="yes" id="gy-lp-yes">Usuń</button></div>`, 'Usuń plan');
      $('lp-yes').addEventListener('click', () => { delete state.routines[id]; save(); close(); render(); toast(`Usunięto plan „${r.name}”`); });
    }
    tabView.addEventListener('pointerdown', e => {
      const row = e.target.closest('[data-r]'); if (!row || e.button > 0 || e.target.closest('.rhandle')) return;
      lpFired = false; lpStart = [e.clientX, e.clientY]; clearTimeout(lpT);
      row.classList.add('pressing');
      lpT = setTimeout(() => { lpFired = true; row.classList.remove('pressing'); askDeleteRoutine(row.dataset.r); }, 550);
    });
    tabView.addEventListener('pointermove', e => { if (lpStart && Math.hypot(e.clientX - lpStart[0], e.clientY - lpStart[1]) > 10) { clearTimeout(lpT); lpStart = null; tabView.querySelector('.pressing')?.classList.remove('pressing'); } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => tabView.addEventListener(t, () => { clearTimeout(lpT); lpStart = null; tabView.querySelector('.pressing')?.classList.remove('pressing'); }));
    tabView.addEventListener('contextmenu', e => { const row = e.target.closest('[data-r]'); if (!row) return; e.preventDefault(); if (!lpFired) { clearTimeout(lpT); askDeleteRoutine(row.dataset.r); } });
    // przesuwanie planów za uchwyt ≡: wiersz jedzie za palcem, reszta robi miejsce; kolejność zapisuje się po puszczeniu
    let drag = null;
    tabView.addEventListener('pointerdown', e => {
      const h = e.target.closest('.rhandle'); if (!h || e.button > 0) return;
      const row = h.closest('[data-r]'), list = row.parentElement;
      e.preventDefault();
      const rows = [...list.querySelectorAll('[data-r]')], r0 = row.getBoundingClientRect();
      drag = { row, list, pid: e.pointerId, y0: e.clientY, h: r0.height, idx: rows.indexOf(row), cur: rows.indexOf(row), mids: rows.map(x => { const b = x.getBoundingClientRect(); return b.top + b.height / 2; }), rows };
      row.classList.add('dragging'); list.classList.add('sorting');
      try { h.setPointerCapture(e.pointerId); } catch (_) { }
      ctx.vibrate(10);
    });
    tabView.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.pid) return;
      e.preventDefault();
      const dy = e.clientY - drag.y0, y = drag.mids[drag.idx] + dy;
      drag.row.style.transform = `translateY(${dy}px)`;
      const to = drag.mids.filter((m, i) => i !== drag.idx && (i > drag.idx ? m <= y : m < y)).length; // nowe miejsce = ile innych planów jest powyżej
      if (to !== drag.cur) {
        drag.cur = to;
        drag.rows.forEach((x, i) => { if (x === drag.row) return; const shift = drag.idx < to ? (i > drag.idx && i <= to ? -drag.h : 0) : (i < drag.idx && i >= to ? drag.h : 0); x.style.transform = shift ? `translateY(${shift}px)` : ''; });
      }
    }, { passive: false });
    const dragEnd = e => {
      if (!drag || (e && e.pointerId !== drag.pid)) return;
      const { rows, idx, cur, list } = drag; drag = null;
      rows.forEach(x => { x.style.transform = ''; x.classList.remove('dragging'); }); list.classList.remove('sorting');
      lpFired = true; setTimeout(() => { lpFired = false; }, 60); // puszczenie nie otwiera planu
      if (cur === idx) return;
      const ids = rows.map(x => x.dataset.r), [m] = ids.splice(idx, 1); ids.splice(cur, 0, m);
      ids.forEach((id, i) => { if (state.routines[id]) state.routines[id].order = i; });
      save(); render();
    };
    tabView.addEventListener('pointerup', dragEnd);
    tabView.addEventListener('pointercancel', dragEnd);
    function newRoutine() { const r = { id: uid('r'), name: 'Nowy plan', note: '', target: 'latest', created: Date.now(), order: Object.keys(state.routines).length + 1e3, ex: [] }; state.routines[r.id] = r; save(); pushDetail({ type: 'r', id: r.id, fresh: true }); }
    function routineScreen(d) {
      const r = state.routines[d.id], sets = r.ex.reduce((a, e) => a + (+e.n || 0) + (+e.w || 0), 0);
      const rows = groupsOf(r.ex).map(([i0, g]) => { const inner = g.map((e, gi) => { const i = i0 + gi, x = exOf(e); return `<button class="irow" data-rex="${i}"><span class="ir-t"><b>${esc(x.name)}</b><small>${e.w ? `${e.w} ${plural(e.w, 'rozgrzewkowa', 'rozgrzewkowe', 'rozgrzewkowych')} + ` : ''}${e.n} ${plural(e.n, 'seria', 'serie', 'serii')}</small>${e.note ? `<small class="nt">${esc(e.note)}</small>` : ''}</span>${CHEV}</button>`; }).join(''); return g.length > 1 ? `<div class="ssg in"><div class="ss-l">Superseria</div>${inner}</div>` : inner; }).join('');
      return `${dtBar('', `<button class="tb-i" data-rmenu="${r.id}" aria-label="Opcje planu">${DOTSC}</button>`)}<div class="dt-body">
        <h1 class="big">${esc(r.name)}</h1>
        <button class="startbtn" data-rstart="${r.id}" ${r.ex.length ? '' : 'disabled'}><span>Start!</span>${SEA_SVG}</button>
        <div class="ilist">
          <label class="irow"><span class="ir-t"><b>Nazwa</b></span><input class="ir-in" data-rname type="text" maxlength="60" value="${esc(r.name)}" autocomplete="off"></label>
          <button class="irow" data-rtarget><span class="ir-t"><b>Ciężary i powtórzenia</b></span><span class="ir-v">${r.target === 'routine' ? 'Z tego planu' : 'Ostatnie'}</span>${CHEV}</button>
          <label class="irow"><span class="ir-t"><b>Notatka</b></span><input class="ir-in" data-rnote type="text" maxlength="200" value="${esc(r.note || '')}" placeholder="np. progresja +2,5 kg" autocomplete="off"></label>
        </div>
        <div class="grp"><h3>Ćwiczenia</h3><em>${r.ex.length} ćw. · ${sets} serii</em></div>
        <div class="ilist">${rows}<button class="irow addrow" data-radd>${PLUSC}<span class="ir-t"><b>Dodaj ćwiczenie</b></span></button></div></div>`;
    }
    function routineEx(rid, i) {
      const r = state.routines[rid], e = r.ex[i], x = exOf(e), next = r.ex[i + 1];
      let w = e.w || 0, n = e.n || 1;
      show(esc(x.name), esc(exSub(x)), `
        <div class="ilist"><div class="irow static"><span class="ir-t"><b>Serie rozgrzewkowe</b></span><span class="stp"><button data-sw="-1" aria-label="Mniej">−</button><b id="gy-re-w">${w}</b><button data-sw="1" aria-label="Więcej">+</button></span></div>
        <div class="irow static"><span class="ir-t"><b>Serie robocze</b></span><span class="stp"><button data-sn2="-1" aria-label="Mniej">−</button><b id="gy-re-n">${n}</b><button data-sn2="1" aria-label="Więcej">+</button></span></div></div>
        <div class="field"><label for="gy-re-note">Notatka</label><input id="gy-re-note" type="text" maxlength="200" value="${esc(e.note || '')}" placeholder="np. 8–12 powt., tempo 3-1-1, RPE 8" autocomplete="off"></div>
        <div class="ilist">
          ${next ? `<button class="irow" data-ra="sup"><span class="ir-t"><b>${e.sup && next.sup === e.sup ? 'Rozłącz z następnym' : 'Superseria z następnym'}</b><small>${esc(exOf(next).name)}</small></span></button>` : ''}
          ${i > 0 ? '<button class="irow" data-ra="up"><span class="ir-t"><b>Przesuń wyżej</b></span></button>' : ''}${next ? '<button class="irow" data-ra="down"><span class="ir-t"><b>Przesuń niżej</b></span></button>' : ''}
          <button class="irow" data-ra="info"><span class="ir-t"><b>Historia, wykres i rekordy</b></span>${CHEV}</button>
        </div>
        <button class="primary acc" id="gy-re-save">Gotowe</button>
        <div class="ilist"><button class="irow out" data-ra="del"><span class="ir-t"><b>Usuń z planu</b></span></button></div>`, 'Ćwiczenie w planie');
      overlay.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', () => { w = Math.max(0, Math.min(10, w + +b.dataset.sw)); $('re-w').textContent = w; }));
      overlay.querySelectorAll('[data-sn2]').forEach(b => b.addEventListener('click', () => { n = Math.max(1, Math.min(20, n + +b.dataset.sn2)); $('re-n').textContent = n; }));
      const keep = () => { e.w = w; e.n = n; e.note = $('re-note').value.trim(); };
      $('re-save').addEventListener('click', () => { keep(); save(); close(); render(); });
      overlay.querySelectorAll('[data-ra]').forEach(b => b.addEventListener('click', () => {
        const m = b.dataset.ra; keep();
        if (m === 'info') { save(); close(); pushDetail({ type: 'ex', eid: e.eid, tab: 'hist' }); return; }
        if (m === 'sup') { if (e.sup && next.sup === e.sup) { next.sup = null; tidySup(r.ex); } else { const id = e.sup || next.sup || uid('s'); e.sup = id; next.sup = id; } }
        if (m === 'up' || m === 'down') { const j = m === 'up' ? i - 1 : i + 1;[r.ex[i], r.ex[j]] = [r.ex[j], r.ex[i]]; tidySup(r.ex); }
        if (m === 'del') { r.ex.splice(i, 1); tidySup(r.ex); }
        save(); close(); render();
      }));
    }
    function routineMenu(id) {
      const r = state.routines[id];
      show(esc(r.name), '', `<div class="ilist"><button class="irow" data-rm="dup"><span class="ir-t"><b>Duplikuj plan</b></span></button></div><div class="ilist"><button class="irow out" data-rm="del"><span class="ir-t"><b>Usuń plan</b><small>treningi z tego planu zostaną w historii</small></span></button></div>`, 'Opcje planu');
      overlay.querySelector('[data-rm="dup"]').addEventListener('click', () => { const c = { ...deep(r), id: uid('r'), name: r.name + ' (kopia)', created: Date.now() }; delete c.order; state.routines[c.id] = c; save(); close(); stack[stack.length - 1] = { type: 'r', id: c.id }; render(); toast('Skopiowano plan'); });
      overlay.querySelector('[data-rm="del"]').addEventListener('click', () => {
        show('Usunąć plan?', esc(r.name), `<div class="confirm"><button data-close>Anuluj</button><button class="yes" id="gy-rd-yes">Usuń</button></div>`);
        $('rd-yes').addEventListener('click', () => { delete state.routines[id]; save(); close(); stack = stack.filter(z => !(z.type === 'r' && z.id === id)); render(); toast('Plan usunięty'); });
      });
    }
    /* ----- Ćwiczenia ----- */
    function exUse() {
      const m = new Map();
      finished().forEach(w => w.ex.forEach(e => { const x = m.get(e.eid) || { n: 0, last: 0 }; x.n++; x.last = Math.max(x.last, w.start); m.set(e.eid, x); }));
      return m;
    }
    function exRow(x, i, use, opts = {}) {
      const u = use.get(x.id);
      return `<button class="irow xrow${opts.sel ? ' on' : ''}" ${opts.pick ? `data-pex="${x.id}"` : `data-exinfo="${x.id}"`} style="--i:${i}"><span class="ir-t"><b>${esc(x.name)}${x.custom ? ' <i class="own">własne</i>' : ''}</b><small>${esc(exSub(x))}${u ? ` · ${u.n}× · ${ago(u.last)}` : ''}</small></span>${opts.pick ? '<span class="pk">✓</span>' : CHEV}</button>`;
    }
    const eqOk = (x, eq) => eq === 'all' || (eq.startsWith('cat:') ? x.category === eq.slice(4) : x.equipment === eq);
    function exFiltered(q, mus, eq = 'all') {
      const words = norm(q.trim()).split(/\s+/).filter(Boolean);
      return allEx().filter(x => (mus === 'all' || (x.primary || []).includes(mus)) && eqOk(x, eq) && (!words.length || words.every(w => norm(x.name).includes(w) || norm(x.nameEn || '').includes(w) || norm(musList(x.primary)).includes(w) || norm(EQUIP_PL[x.equipment] || '').includes(w))));
    }
    function exListHtml(list, use, opts = {}) {
      let i = 0, html = '';
      const blk = (title, xs) => `<div class="grp"><h3>${title}</h3><em>${xs.length}</em></div><div class="ilist">${xs.map(x => exRow(x, i++, use, { ...opts, sel: opts.sel?.includes(x.id) })).join('')}</div>`;
      if (opts.grouped) {
        const recent = [...use.entries()].sort((a, b) => b[1].last - a[1].last).slice(0, 6).map(([id]) => exById(id)).filter(Boolean);
        if (recent.length) html += blk('Ostatnio', recent);
        MUSCLES.forEach(([m, name]) => { const xs = list.filter(x => (x.primary || [])[0] === m); if (xs.length) html += blk(name, xs); });
        const rest = list.filter(x => !MUSCLE_PL[(x.primary || [])[0]]); if (rest.length) html += blk('Inne', rest);
      } else html = list.length ? `<div class="ilist">${list.map(x => exRow(x, i++, use, { ...opts, sel: opts.sel?.includes(x.id) })).join('')}</div>` : '';
      return html || '<p class="empty">Brak ćwiczeń — dodaj własne</p>';
    }
    const musChips = (cur, attr) => `<div class="mchips"><button class="${cur === 'all' ? 'on' : ''}" ${attr}="all">Wszystkie mięśnie</button>${MUSCLES.map(([m, n]) => `<button class="${cur === m ? 'on' : ''}" ${attr}="${m}">${n}</button>`).join('')}</div>`;
    const eqChips = (cur, attr) => `<div class="mchips eq">${EQ_FILTERS.map(([v, n]) => `<button class="${cur === v ? 'on' : ''}" ${attr}="${v}">${n}</button>`).join('')}</div>`;
    // wybór ćwiczeń: do treningu, do planu albo zamiana (przełącznik „Superseria” nad listą jak w RepCount)
    let pick = null;
    function openPicker(mode, cb) {
      pick = { mode, cb, sel: [], q: '', mus: 'all', eq: 'all', ss: false };
      if (mode === 'workout') pick.cb = (ids, ss) => addToWorkout(ids, ss);
      drawPicker();
    }
    // świeżo dodane ćwiczenia: przewinięcie do nich i krótkie podświetlenie
    function showAdded(rows, n) {
      const add = [...rows].slice(-n); if (!add.length) return;
      setTimeout(() => {
        add[0].scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center' });
        if (!calm()) add.forEach(r => r.animate({ backgroundColor: ['rgba(255, 255, 255, 0.126)', 'transparent'] }, { duration: 1600, easing: 'ease-out' }));
      }, 60);
    }
    function addToWorkout(ids, ss) {
      const a = state.active; if (!a) return;
      const sup = ss && ids.length > 1 ? uid('s') : null;
      ids.forEach(id => a.ex.push(newEntry(id, { sup })));
      save(); close(); render();
      setTimeout(() => { const c = wkLayer.querySelector(`.exc[data-x="${a.ex.length - ids.length}"]`); c?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' }); }, 60);
    }
    function drawPicker() {
      const p = pick;
      show(p.mode === 'swap' ? 'Zamień ćwiczenie' : 'Dodaj ćwiczenia', '', `
        <label class="hsearch">${SEARCH}<input id="gy-p-q" type="search" placeholder="Szukaj" value="${esc(p.q)}" autocomplete="off"></label>
        <div class="ilist"><button class="irow addrow" id="gy-p-new">${PLUSC}<span class="ir-t"><b>Nowe własne ćwiczenie</b></span></button></div>
        ${p.mode === 'swap' ? '' : `<label class="switch"><span>Superseria</span><input type="checkbox" id="gy-p-ss" ${p.ss ? 'checked' : ''}><i></i></label>`}
        <div id="gy-p-mus">${musChips(p.mus, 'data-pmus')}</div>
        <div class="plist" id="gy-p-list"></div>
        ${p.mode === 'swap' ? '' : '<div class="pfoot" id="gy-p-foot"></div>'}`, 'Wybór ćwiczeń', 'tall picker');
      drawPickList();
      $('p-q').addEventListener('input', e => { p.q = e.target.value; drawPickList(); });
      $('p-ss')?.addEventListener('change', e => { p.ss = e.target.checked; drawPickFoot(); });
      $('p-new').addEventListener('click', () => openCustomEx(null, x => { if (p.mode === 'swap') { pick = null; p.cb([x.id]); return; } const sel = [...p.sel.filter(id => id !== x.id), x.id]; pick = null; p.cb(sel, p.ss); }, () => drawPicker())); // nowe ćwiczenie od razu trafia do planu / treningu
    }
    function drawPickList() { const p = pick, list = $('p-list'); if (!list) return; list.innerHTML = exListHtml(exFiltered(p.q, p.mus, p.eq), exUse(), { pick: true, sel: p.sel, grouped: !p.q.trim() && p.mus === 'all' && p.eq === 'all' }); drawPickFoot(); }
    function drawPickFoot() {
      const p = pick, f = $('p-foot'); if (!f || !p) return;
      f.innerHTML = `<span class="pf-n">${p.sel.length ? `${p.sel.length} ${plural(p.sel.length, 'wybrane', 'wybrane', 'wybranych')}${p.ss && p.sel.length > 1 ? ' · superseria' : ''}` : 'Zaznacz ćwiczenia'}</span><button class="primary acc" id="gy-p-add" ${p.sel.length ? '' : 'disabled'}>Dodaj</button>`;
      $('p-add').addEventListener('click', () => { const s = pick; pick = null; s.cb(s.sel, s.ss); });
    }
    function openCustomEx(x, done, back) {
      const ed = !!x; x = x || { name: '', primary: [], secondary: [], equipment: 'barbell', kind: 'wr' };
      // mięśnie: dotknięcie na mapie albo na liście — główny → pomocniczy → brak
      const pr = new Set(x.primary || []), se = new Set(x.secondary || []);
      let eq = x.equipment ?? 'none';
      const EQS = Object.keys(EQUIP_PL);
      show(ed ? 'Edytuj ćwiczenie' : 'Nowe ćwiczenie', 'Własne ćwiczenie', `
        <div class="field"><label for="gy-c-name">Nazwa</label><input id="gy-c-name" type="text" maxlength="60" value="${esc(x.name)}" placeholder="np. Smith Machine Shrug" autocomplete="off"></div>
        <div class="field"><span class="lab">Mięśnie <em class="lab-h">dotknij: główny → pomocniczy → brak</em></span><div class="mm pickmap" id="gy-c-map"></div><div class="mchips wrap" id="gy-c-mus"></div></div>
        <div class="field"><span class="lab">Sprzęt</span><div class="mchips wrap" id="gy-c-eq">${EQS.map(k => `<button type="button" data-ceq="${k}" class="${eq === k ? 'on' : ''}">${EQUIP_PL[k]}</button>`).join('')}</div></div>
        <div class="field"><span class="lab">Co zapisujesz</span><div class="g-kind">${KINDS.map(([k, n]) => `<label><input type="radio" name="c-kind" value="${k}"${x.kind === k ? ' checked' : ''}>${k === 'wr' ? 'Ciężar' : n}</label>`).join('')}</div></div>
        <div class="sheet-foot"><button class="primary acc" id="gy-c-save">${ed ? 'Zapisz' : 'Dodaj ćwiczenie'}</button>${ed ? '<button class="danger" id="gy-c-del">Usuń</button>' : ''}</div>`, 'Własne ćwiczenie', 'tall');
      const drawMus = () => {
        $('c-map').innerHTML = bodyMap([...pr], [...se]);
        $('c-mus').innerHTML = MUSCLES.map(([m, n]) => `<button type="button" data-cmus="${m}" class="${pr.has(m) ? 'on' : se.has(m) ? 'half' : ''}">${n}</button>`).join('');
      };
      const cycle = m => { if (pr.has(m)) { pr.delete(m); se.add(m); } else if (se.has(m)) se.delete(m); else pr.add(m); drawMus(); };
      drawMus();
      $('c-map').addEventListener('click', ev => { const g = ev.target.closest('[data-m]'); if (g) cycle(g.dataset.m); });
      $('c-mus').addEventListener('click', ev => { const b = ev.target.closest('[data-cmus]'); if (b) cycle(b.dataset.cmus); });
      $('c-eq').addEventListener('click', ev => { const b = ev.target.closest('[data-ceq]'); if (!b) return; eq = b.dataset.ceq; $('c-eq').querySelectorAll('button').forEach(z => z.classList.toggle('on', z === b)); });
      if (back) overlay.querySelector('.sheet-h .x').addEventListener('click', ev => { ev.stopPropagation(); back(); });
      if (matchMedia('(hover: hover)').matches) $('c-name').focus();
      $('c-save').addEventListener('click', () => {
        const name = $('c-name').value.trim(); if (!name) { toast('Wpisz nazwę'); $('c-name').focus(); return; }
        const kind = overlay.querySelector('[name=c-kind]:checked')?.value || 'wr';
        const nx = { id: x.id || uid('e'), name, primary: [...pr], secondary: [...se].filter(m => !pr.has(m)), equipment: eq === 'none' ? null : eq, category: kind === 'cardio' ? 'cardio' : 'strength', kind, custom: true };
        state.exercises[nx.id] = nx; save(); toast(ed ? 'Zapisano' : `Dodano „${name}”`);
        if (done) done(nx); else { close(); render(); }
      });
      $('c-del')?.addEventListener('click', () => {
        const used = exUse().get(x.id)?.n || 0;
        show('Usunąć ćwiczenie?', esc(x.name), `${used ? `<p class="hint">Jest w ${used} treningach — tam zostanie pod tą samą nazwą.</p>` : ''}<div class="confirm"><button data-close>Anuluj</button><button class="yes" id="gy-cx-yes">Usuń</button></div>`);
        $('cx-yes').addEventListener('click', () => { finished().forEach(w => w.ex.forEach(e => { if (e.eid === x.id) e.n = x.name; })); delete state.exercises[x.id]; save(); close(); stack = stack.filter(z => !(z.type === 'ex' && z.eid === x.id)); render(); toast('Usunięto'); });
      });
    }

    /* ----- ekran ćwiczenia: historia, wykres, rekordy (jak w RepCount) ----- */
    const METRICS = {
      wr: [['e1rm', 'Szacowany 1RM', 'w'], ['top', 'Najcięższy ciężar', 'w'], ['vol', 'Objętość', 'w'], ['reps', 'Powtórzenia', ''], ['sets', 'Serie', '']],
      bw: [['maxr', 'Najwięcej powtórzeń', ''], ['reps', 'Powtórzenia', ''], ['sets', 'Serie', ''], ['top', 'Obciążenie', 'w']],
      time: [['maxs', 'Najdłużej', 's'], ['tots', 'Łączny czas', 's'], ['sets', 'Serie', '']],
      cardio: [['min', 'Czas', 'min'], ['km', 'Dystans', 'km'], ['kcal', 'Kcal', '']],
    };
    function metricVal(m, sets) {
      const ws = work(sets);
      switch (m) {
        case 'e1rm': return Math.max(0, ...ws.map(s => e1rm(s.kg, s.r)));
        case 'top': return Math.max(0, ...ws.map(s => s.kg || 0));
        case 'vol': return ws.reduce((a, s) => a + (s.kg || 0) * (s.r || 0), 0);
        case 'reps': return ws.reduce((a, s) => a + (s.r || 0), 0);
        case 'sets': return ws.length;
        case 'maxr': return Math.max(0, ...ws.map(s => s.r || 0));
        case 'maxs': return Math.max(0, ...ws.map(s => s.s || 0));
        case 'tots': return ws.reduce((a, s) => a + (s.s || 0), 0);
        case 'min': return ws.reduce((a, s) => a + (s.s || 0), 0) / 60;
        case 'km': return ws.reduce((a, s) => a + (s.km || 0), 0);
        case 'kcal': return ws.reduce((a, s) => a + (s.kcal || 0), 0);
      }
      return 0;
    }
    function exerciseScreen(d) {
      const x = exAny(d.eid), k = x.kind, ss = sessionsOf(d.eid);
      d.tab = d.tab || 'hist';
      const tabs = segHtml('xt', 'data-xt2', [['hist', 'Historia'], ['chart', 'Wykres'], ['rec', 'Rekordy'], ['info', 'Opis']], d.tab, 'xtabs');
      let body;
      if (d.tab === 'info') body = infoHtml(x);
      else if (!ss.length) body = emptyCard('Brak danych', 'Zrób to ćwiczenie na treningu — tu pojawi się historia, wykres i rekordy.');
      else if (d.tab === 'hist') body = `<div class="hlist">${ss.slice().reverse().slice(0, 80).map(s => `<section class="hcard"><header><button class="hd" data-w="${s.w.id}">${dateLabel(s.w.start)}</button><small>${esc(s.w.name)}</small></header>${s.e.note ? `<p class="exnote">${esc(s.e.note)}</p>` : ''}${histTable(s.sets, k)}${sumStrip(s.sets, k)}</section>`).join('')}</div>`;
      else if (d.tab === 'chart') {
        const ms = METRICS[k], mm = ms.find(z => z[0] === d.m) || ms[0]; d.m = mm[0];
        const from = d.range === '3m' ? Date.now() - 92 * 864e5 : d.range === '1y' ? Date.now() - 365 * 864e5 : 0;
        const pts = ss.filter(s => s.w.start >= from).map(s => ({ x: s.w.start, y: metricVal(mm[0], s.sets) * (mm[2] === 'w' ? uf() : 1), wid: s.w.id }));
        d.pts = pts; d.mm = mm;
        const sel = pts[Math.min(d.sel ?? pts.length - 1, pts.length - 1)];
        // historia rekordów: kolejne pobite maksima
        const recs = []; let best = -1; ss.forEach(s => { const v = metricVal(mm[0], s.sets) * (mm[2] === 'w' ? uf() : 1); if (v > best + 1e-9) { best = v; recs.push({ x: s.w.start, y: v, wid: s.w.id }); } });
        body = `<div class="chips mets">${ms.map(([id, l]) => `<button class="${id === mm[0] ? 'on' : ''}" data-xm="${id}">${l}</button>`).join('')}</div>
          <div class="mcard" id="gy-x-sel">${sel ? selCard(mm, sel) : ''}</div>
          <div class="chart-box" id="gy-x-chart">${chart(pts, v => fmtMv(mm, v), { sel: d.sel ?? pts.length - 1 })}</div>
          ${segHtml('xr', 'data-xr', [['3m', '3 mies.'], ['1y', 'Rok'], ['all', 'Wszystko']], d.range || 'all', 'rng')}
          ${recs.length > 1 ? `<div class="grp"><h3>Historia rekordów</h3><em>${esc(mm[1])}</em></div><div class="ilist">${recs.slice().reverse().slice(0, 30).map(r => `<button class="irow" data-w="${r.wid}"><span class="ir-t"><b>${dateLabel(r.x)}</b></span><span class="ir-v">${fmtMv(mm, r.y)}${mUnit(mm)}</span>${CHEV}</button>`).join('')}</div>` : ''}`;
      } else body = recordsHtml(d, ss, k);
      return `${dtBar(esc(x.name), x.custom ? `<button class="tb-i" data-xedit="${x.id}" aria-label="Edytuj ćwiczenie">${DOTSC}</button>` : '')}<div class="dt-body"><div class="eyebrow">${esc([x.equipment ? EQUIP_PL[x.equipment] : '', CAT_PL[x.category] || '', kindName(x.kind)].filter(Boolean).join(' · '))}</div><h1 class="big">${esc(x.name)}</h1>${musCard(x)}${tabs}<div class="xbody">${body}</div></div>`;
    }
    // karta z mapą mięśni: główne (jasny crimson) i pomocnicze (ciemniejsze)
    function musCard(x) {
      const p = x.primary || [], sc = x.secondary || [];
      const tag = (m, cls) => `<span class="mtag ${cls}" data-mus="${esc(m)}">${muscleName(m)}</span>`;
      return `<section class="muscard"><div class="mm">${bodyMap(p, sc)}</div><div class="ml"><div><small>Główne</small><p>${p.map(m => tag(m, 'p')).join('') || '<span class="mtag">—</span>'}</p></div>${sc.length ? `<div><small>Pomocnicze</small><p>${sc.map(m => tag(m, 's')).join('')}</p></div>` : ''}</div></section>`;
    }
    // opis z bazy: zdjęcia (pozycja startowa i końcowa), parametry i instrukcja (po angielsku)
    let INSTR = null, instrLoading = null;
    function loadInstr() {
      if (INSTR || instrLoading) return instrLoading;
      instrLoading = fetch('data/gym-instructions.json').then(r => r.json()).then(j => { INSTR = j; }).catch(() => { instrLoading = null; }).then(() => { if (stack[stack.length - 1]?.tab === 'info') render(); });
      return instrLoading;
    }
    function infoHtml(x) {
      const imgs = x.img ? [0, 1].slice(0, x.img).map(i => `<img src="${IMG_BASE}${encodeURIComponent(x.id)}/${i}.jpg" alt="${esc(x.name)} — ${i ? 'koniec ruchu' : 'początek ruchu'}" loading="lazy" onerror="this.remove()">`).join('') : '';
      const chips = [['Sprzęt', x.equipment ? EQUIP_PL[x.equipment] : 'Bez sprzętu'], ['Kategoria', CAT_PL[x.category]], ['Poziom', LEVEL_PL[x.level]], ['Ruch', MECH_PL[x.mechanic]], ['Siła', FORCE_PL[x.force]], ['Zapis', kindName(x.kind)]].filter(c => c[1]);
      let steps = '';
      if (x.custom) steps = '<p class="hint" style="text-align:left">Własne ćwiczenie — bez opisu z bazy.</p>';
      else if (INSTR) steps = (INSTR[x.id] || []).length ? `<ol class="steps">${INSTR[x.id].map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : '';
      else { loadInstr(); steps = '<p class="hint" style="text-align:left">Wczytuję opis…</p>'; }
      return `${imgs ? `<div class="eximg">${imgs}</div>` : ''}<div class="ilist">${chips.map(([k, v]) => `<div class="irow static"><span class="ir-t"><b>${k}</b></span><span class="ir-v body">${esc(v)}</span></div>`).join('')}</div>${steps ? `<div class="grp"><h3>Jak wykonać</h3><em>EN</em></div>${steps}` : ''}<p class="hint src">Dane: free-exercise-db (domena publiczna)</p>`;
    }
    const fmtMv = (mm, v) => mm[2] === 'w' ? nf(v, 1) : mm[2] === 's' ? fmtSec(v) : mm[2] === 'km' ? nf(v, 2) : nf(v, 1);
    const mUnit = mm => mm[2] === 'w' ? ' ' + U() : mm[2] === 'km' ? ' km' : mm[2] === 'min' ? ' min' : '';
    const selCard = (mm, p) => `<small>${esc(mm[1])}</small><b>${fmtMv(mm, p.y)}<em>${mUnit(mm)}</em></b><span>${dateLabel(p.x)}</span><button data-w="${p.wid}" aria-label="Otwórz trening">${CHEV}</button>`;
    function recordsHtml(d, ss, k) {
      const years = [...new Set(ss.map(s => new Date(s.w.start).getFullYear()))].sort((a, b) => b - a);
      const sel = ss.filter(s => !d.year || d.year === 'all' || new Date(s.w.start).getFullYear() === +d.year);
      const all = sel.flatMap(s => work(s.sets).map(st => ({ ...st, at: s.w.start, wid: s.w.id })));
      const top = fn => all.reduce((b, s) => fn(s) > (b ? fn(b) : 0) ? s : b, null);
      const yt = `<div class="ytabs">${['all', ...years].map(y => `<button data-xy="${y}" class="${String(d.year || 'all') === String(y) ? 'on' : ''}">${y === 'all' ? 'Wszystkie' : y}</button>`).join('')}</div>`;
      const tile = (label, s, v) => s ? `<button class="rtile" data-w="${s.wid}"><small>${label}</small><b>${v}</b><span>${shortDate(s.at)}</span></button>` : '';
      let rep = '', other = '';
      if (k === 'wr' || k === 'bw') {
        // rekordy powtórzeń: najcięższy ciężar dla dokładnie N powtórzeń, bez wyników „przebitych” przez więcej powtórzeń
        const byR = new Map(); all.forEach(s => { if (!s.r) return; const b = byR.get(s.r); if (!b || (s.kg || 0) > (b.kg || 0)) byR.set(s.r, s); });
        const rs = [...byR.keys()].sort((a, b) => a - b).filter(r => ![...byR.keys()].some(r2 => r2 > r && (byR.get(r2).kg || 0) >= (byR.get(r).kg || 0)));
        if (k === 'wr' && rs.length) rep = `<div class="grp"><h3>Rekordy powtórzeń</h3></div><div class="ilist">${rs.slice(0, 20).map(r => { const s = byR.get(r); return `<button class="irow" data-w="${s.wid}"><span class="ir-t"><b>${r} ${plural(r, 'powtórzenie', 'powtórzenia', 'powtórzeń')} max</b><small>${dateLabel(s.at)}</small></span><span class="ir-v">${fmtW(s.kg)} ${U()}</span></button>`; }).join('')}</div>`;
      }
      if (k === 'wr') {
        const b1 = top(s => e1rm(s.kg, s.r)), bk = top(s => s.kg || 0), br = top(s => s.r || 0);
        const bv = sel.reduce((b, s) => { const v = volOf(s.sets, 'wr'); return v > (b?.v || 0) ? { v, at: s.w.start, wid: s.w.id } : b; }, null);
        other = tile('Szacowany 1RM', b1, b1 && `${fmtRM(e1rm(b1.kg, b1.r))} ${U()}`) + tile('Najcięższy ciężar', bk, bk && `${fmtW(bk.kg)} ${U()}`) + tile('Największa objętość', bv, bv && `${fmtVol(bv.v)} ${U()}`) + tile('Najwięcej powtórzeń', br, br && `${br.r} × ${fmtW(br.kg)}`);
      } else if (k === 'bw') {
        const br = top(s => s.r || 0), bk = top(s => s.kg || 0), bs = sel.reduce((b, s) => { const v = metricVal('reps', s.sets); return v > (b?.v || 0) ? { v, at: s.w.start, wid: s.w.id } : b; }, null);
        other = tile('Najwięcej powtórzeń', br, br && br.r) + tile('Powtórzenia w treningu', bs, bs && bs.v) + (bk?.kg ? tile('Największe obciążenie', bk, `+${fmtW(bk.kg)} ${U()}`) : '');
      } else if (k === 'time') {
        const bt = top(s => s.s || 0), bk = top(s => s.kg || 0);
        other = tile('Najdłużej', bt, bt && fmtSec(bt.s)) + (bk?.kg ? tile('Największe obciążenie', bk, `+${fmtW(bk.kg)} ${U()}`) : '');
      } else {
        const bt = top(s => s.s || 0), bd = top(s => s.km || 0), bc = top(s => s.kcal || 0);
        other = tile('Najdłużej', bt, bt && `${r0(bt.s / 60)} min`) + (bd?.km ? tile('Najdalej', bd, `${nf(bd.km, 2)} km`) : '') + (bc?.kcal ? tile('Najwięcej kcal', bc, r0(bc.kcal)) : '');
      }
      return `${years.length > 1 ? yt : ''}${rep}<div class="grp"><h3>Inne</h3></div><div class="rgrid2">${other}</div>${k === 'wr' ? '<p class="hint">1RM szacowany wzorem Epleya. Rekord N powtórzeń pokazany tylko, gdy nie przebija go wynik z większą liczbą powtórzeń.</p>' : ''}`;
    }
    // wykres: cienka linia = każdy trening, gruba = trend (średnia z kilku ostatnich), woda pod linią
    let chartN = 0;
    function chart(pts, fmt, opts = {}) {
      if (!pts.length) return '<p class="empty">Brak danych w tym okresie</p>';
      const W = 340, H = opts.h || 190, pl = 4, pr = 34, pt = 12, pb = 22, id = 'cg' + (++chartN);
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys), hi = Math.max(...ys), padY = (hi - lo) * .15 || Math.abs(hi) * .1 || 1;
      const y0 = Math.max(0, lo - padY), y1 = hi + padY;
      const X = x => x1 === x0 ? (W - pr) / 2 : pl + (x - x0) / (x1 - x0) * (W - pl - pr), Y = y => pt + (1 - (y - y0) / (y1 - y0 || 1)) * (H - pt - pb);
      const path = arr => arr.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
      const n = Math.max(2, Math.min(5, Math.round(pts.length / 6))), trend = pts.map((p, i) => { const a = pts.slice(Math.max(0, i - n + 1), i + 1); return { x: p.x, y: a.reduce((s, q) => s + q.y, 0) / a.length }; });
      const line = path(pts), tl = path(trend), area = `${tl} L${X(pts[pts.length - 1].x).toFixed(1)} ${H - pb} L${X(pts[0].x).toFixed(1)} ${H - pb} Z`;
      const grid = [0, .33, .66, 1].map(f => { const v = y0 + (y1 - y0) * f, y = Y(v); return `<line x1="0" x2="${W - pr + 4}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="gl"/><text x="${W - 2}" y="${(y + 3).toFixed(1)}" class="gt" text-anchor="end">${fmt(v)}</text>`; }).join('');
      const yrs = new Set(); let xl = '';
      if (x1 - x0 > 400 * 864e5) pts.forEach(p => { const y = new Date(p.x).getFullYear(); if (!yrs.has(y)) { yrs.add(y); const jx = X(new Date(y, 0, 1).getTime()); if (jx > 20 && jx < W - pr - 10) xl += `<line x1="${jx.toFixed(1)}" x2="${jx.toFixed(1)}" y1="${pt}" y2="${H - pb}" class="gl v"/><text x="${jx.toFixed(1)}" y="${H - 6}" class="gt" text-anchor="middle">${y}</text>`; } });
      else xl = `<text x="${pl}" y="${H - 6}" class="gt">${shortDate(x0)}</text>${x1 !== x0 ? `<text x="${W - pr}" y="${H - 6}" class="gt" text-anchor="end">${shortDate(x1)}</text>` : ''}`;
      const sp = pts[Math.min(opts.sel ?? pts.length - 1, pts.length - 1)];
      return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wykres"><defs><linearGradient id="gy-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ededed" stop-opacity=".38"/><stop offset="1" stop-color="#3a3a3a" stop-opacity=".02"/></linearGradient></defs>${grid}${xl}
        <path d="${area}" fill="url(#gy-${id})" class="ar"/>${pts.length > 1 ? `<path d="${line}" class="ln thin"/><path d="${tl}" class="ln" pathLength="1"/>` : ''}
        <line class="cur" x1="${X(sp.x).toFixed(1)}" x2="${X(sp.x).toFixed(1)}" y1="${pt}" y2="${H - pb}"/><circle class="halo" cx="${X(sp.x).toFixed(1)}" cy="${Y(sp.y).toFixed(1)}" r="11"/><circle class="pt last" cx="${X(sp.x).toFixed(1)}" cy="${Y(sp.y).toFixed(1)}" r="5"/>
        <rect class="hit" x="0" y="0" width="${W - pr}" height="${H}" fill="transparent" data-geo="${X(x0)},${X(x1)},${W},${pl},${pr}"/></svg>`;
    }
    // dotknięcie / przeciągnięcie po wykresie wybiera trening (karta z wartością nad wykresem)
    function bindChart(d) {
      const box = $('x-chart'); if (!box || !d.pts?.length) return;
      const svg = box.querySelector('svg'); if (!svg) return;
      const pick = ev => {
        const r = svg.getBoundingClientRect(), W = 340, x = (ev.clientX - r.left) / r.width * W;
        const pts = d.pts, xs = pts.map(p => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs), X = v => x1 === x0 ? (W - 34) / 2 : 4 + (v - x0) / (x1 - x0) * (W - 4 - 34);
        let bi = 0, bd = 1e9; pts.forEach((p, i) => { const dd = Math.abs(X(p.x) - x); if (dd < bd) { bd = dd; bi = i; } });
        if (bi === d.sel) return; d.sel = bi;
        box.innerHTML = chart(pts, v => fmtMv(d.mm, v), { sel: bi }); box.querySelector('svg')?.classList.add('still');
        $('x-sel').innerHTML = selCard(d.mm, pts[bi]); bindChart(d);
      };
      let down = false;
      svg.addEventListener('pointerdown', ev => { down = true; pick(ev); });
      svg.addEventListener('pointermove', ev => { if (down || ev.pointerType === 'mouse') pick(ev); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => svg.addEventListener(t, () => { down = false; }));
    }

    /* ----- Postępy ----- */
    const spanStart = () => addDays(weekStart(new Date()), -(pWeeks - 1) * 7).getTime();
    const spanWorkouts = () => { const a = spanStart(); return finished().filter(w => w.start >= a); };
    let prevRing = null;
    function renderProgress() {
      const g = state.settings.weekGoal, ws0 = weekStart(new Date()), t = todayKey();
      const span = spanWorkouts(), wk = weekWorkouts(0).length, p = g ? wk / g : 0, lv = waterLevel(Math.min(1, p));
      // mapa mięśni z ostatnich 8 tygodni: główny mięsień 1 seria, pomocniczy ½
      const mus = new Map(); span.forEach(w => w.ex.forEach(e => { const x = exOf(e); if (x.kind === 'cardio') return; const n = work(e.sets).length; (x.primary || []).forEach(m => mus.set(m, (mus.get(m) || 0) + n)); (x.secondary || []).forEach(m => mus.set(m, (mus.get(m) || 0) + n / 2)); }));
      const musL = [...mus.entries()].sort((a, b) => b[1] - a[1]), musMax = musL[0]?.[1] || 1;
      const heat = Object.fromEntries(musL.map(([m, n]) => [m, .18 + .82 * n / musMax]));
      const strip = DAYS.map((dn, i) => { const d = addDays(ws0, i), k = key(d), n = finished().filter(w => key(new Date(w.start)) === k).length; return `<span class="wd${n ? ' on' : ''}${k === t ? ' t' : ''}${k > t ? ' fut' : ''}"><i>${n ? '✓' : ''}</i><small>${dn}</small></span>`; }).join('');
      tabView.innerHTML = `<div class="sgrid">
          <section class="scard${animTab ? ' enter' : ''} wkcard" style="--i:0" data-goal role="button" tabindex="0" aria-label="Zmień cel tygodnia"><div class="ring${p >= 1 ? ' full' : ''}" style="--lv:${lv}"><i class="wv"></i><i class="wv b"></i><div class="ring-t"><small>ten tydzień</small><b>${wk}</b><small>z ${g} treningów</small></div></div><div class="wkr"><h3>Cel tygodnia</h3><small>${p >= 1 ? 'osiągnięty — tak trzymaj' : `jeszcze ${g - wk} ${plural(g - wk, 'trening', 'treningi', 'treningów')}`}</small><div class="schips"><span class="schip rec">Seria: ${weekStreak()} tyg.</span></div></div><div class="wstrip">${strip}</div></section>
          <section class="scard${animTab ? ' enter' : ''} bwcard" style="--i:1">${weightHtml()}</section>
          <section class="scard${animTab ? ' enter' : ''}" style="--i:2">${calendarHtml()}</section>
          <section class="scard${animTab ? ' enter' : ''}" style="--i:3"><header><div><h3>Mięśnie</h3><small>ostatnie 8 tygodni</small></div></header>
            ${musL.length ? `<div class="mm heatmap">${bodyMap([], [], heat)}</div>` : '<p class="empty" style="padding:16px">Brak treningów w tym okresie</p>'}</section>
        </div>`;
      const ringEl = tabView.querySelector('.ring');
      if (ringEl && !calm() && prevRing !== lv) { const top = l => `calc(4% + ${(100 - l) * .96}%)`, from = prevRing ?? 0; ringEl.querySelectorAll('.wv').forEach(w => w.animate({ top: [top(from), top(lv)] }, { duration: 1300, easing: 'cubic-bezier(.3,.7,.3,1)' })); }
      prevRing = lv;
    }
    /* ----- Waga: lista ważeń (dzień tygodnia, data, waga, strzałka względem poprzedniego) ----- */
    let bwAll = false;
    const bodyList = () => Object.entries(state.body || {}).filter(([, v]) => v).sort((a, b) => b[0].localeCompare(a[0]));
    function weightHtml() {
      const list = bodyList(), shown = bwAll ? list : list.slice(0, 8);
      const rows = shown.map(([k, v], i) => {
        const prev = list[list.indexOf(shown[i]) + 1], d = prev ? dispW(v) - dispW(prev[1]) : 0;
        const arrow = !prev ? '' : Math.abs(d) < 0.05 ? '<span class="bw-d eq">=</span>' : `<span class="bw-d ${d > 0 ? 'up' : 'down'}">${d > 0 ? '↑' : '↓'} ${nf(Math.abs(d), 1)}</span>`;
        return `<button class="bwrow" data-bw="${k}" style="--i:${i}"><span class="bw-day">${dateLabel(fromKey(k).getTime())}</span><b class="bw-v">${(+dispW(v)).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${U()}</b>${arrow}</button>`;
      }).join('');
      return `<header><div><h3>Waga</h3></div><button class="chip bw-add" data-bw="">+ Dodaj</button></header>
        ${list.length ? `<div class="bwlist">${rows}</div>${list.length > 8 ? `<button class="bw-more" data-bwall>${bwAll ? 'Pokaż mniej' : `Pokaż wszystkie (${list.length})`}</button>` : ''}` : '<p class="empty" style="padding:8px 0 4px">Dodaj pierwsze ważenie</p>'}`;
    }
    function openWeight(k) {
      const has = k && state.body?.[k], last = bodyList()[0], step = U() === 'lb' ? .2 : .1;
      const start = has ? dispW(state.body[k]) : last ? dispW(last[1]) : (U() === 'lb' ? 170 : 75);
      show(has ? 'Edytuj ważenie' : 'Nowe ważenie', has ? dateLabel(fromKey(k).getTime()) : 'najlepiej rano, na czczo', `
        <div class="ed-val"><button data-bk="-1" aria-label="Mniej">−</button><div class="ed-num"><input class="sv bw-in" id="gy-b-kg" type="text" inputmode="decimal" value="${String(start).replace('.', ',')}" aria-label="Waga w ${U()}"><small>${U()}</small></div><button data-bk="1" aria-label="Więcej">+</button></div>
        <div class="field"><label for="gy-b-day">Dzień</label><input id="gy-b-day" type="date" value="${k || todayKey()}" max="${todayKey()}"></div>
        <button class="primary acc" id="gy-b-save">Zapisz</button>
        ${has ? '<button class="primary bw-del" id="gy-b-del">Usuń ważenie</button>' : ''}`, 'Waga');
      overlay.querySelectorAll('[data-bk]').forEach(b => b.addEventListener('click', () => { const v = num($('b-kg').value) ?? start; $('b-kg').value = String(+(v + step * +b.dataset.bk).toFixed(1)).replace('.', ','); }));
      $('b-save').addEventListener('click', () => {
        const v = num($('b-kg').value); if (!v || v < 20 || v > 700) { toast('Wpisz poprawną wagę'); return; }
        const day = $('b-day').value || todayKey();
        if (!state.body) state.body = {};
        if (has && day !== k) delete state.body[k];
        state.body[day] = +(v / uf()).toFixed(2); save(); close(); render(); toast(`Zapisano ${nf(v, 1)} ${U()}`);
      });
      $('b-del')?.addEventListener('click', () => { delete state.body[k]; save(); close(); render(); toast('Usunięto ważenie'); });
    }
    function openGoal() {
      let g = state.settings.weekGoal;
      show('Cel tygodnia', 'Ile treningów w tygodniu', `<div class="ed-val"><button data-gd="-1" aria-label="Mniej">−</button><div class="ed-num"><b class="sv" id="gy-g-v">${g}</b></div><button data-gd="1" aria-label="Więcej">+</button></div><button class="primary acc" id="gy-g-save">Zapisz</button>`, 'Cel tygodnia');
      overlay.querySelectorAll('[data-gd]').forEach(b => b.addEventListener('click', () => { g = Math.max(1, Math.min(7, g + +b.dataset.gd)); $('g-v').textContent = g; }));
      $('g-save').addEventListener('click', () => { state.settings.weekGoal = g; save(); close(); prevRing = null; render(); });
    }
    function calendarHtml() {
      const y = calMonth.getFullYear(), mo = calMonth.getMonth(), first = new Date(y, mo, 1), n = new Date(y, mo + 1, 0).getDate(), t = todayKey();
      const by = new Map(); finished().forEach(w => { const k = key(new Date(w.start)); by.set(k, (by.get(k) || 0) + 1); });
      let cells = '', cnt = 0;
      for (let i = 0; i < dow(first); i++) cells += '<span class="cday blank"></span>';
      for (let d = 1; d <= n; d++) { const k = key(new Date(y, mo, d)), c = by.get(k) || 0; cnt += c; cells += `<button class="cday${c ? ' on' : ''}${k === t ? ' t' : ''}${k > t ? ' fut' : ''}" ${c ? `data-cday="${k}"` : 'disabled'} style="--i:${d}">${d}</button>`; }
      const now = new Date(), isNow = y === now.getFullYear() && mo === now.getMonth();
      return `<header><div><h3>Kalendarz</h3><small><b>${cnt}</b> ${plural(cnt, 'trening', 'treningi', 'treningów')} w miesiącu</small></div><div class="calnav"><button class="navarr" data-cal="-1" aria-label="Poprzedni miesiąc">‹</button><b>${MONTHS[mo]} ${y}</b><button class="navarr" data-cal="1" aria-label="Następny miesiąc" ${isNow ? 'disabled' : ''}>›</button></div></header>
        <div class="calg">${DAYS.map(d => `<span class="cdh">${d}</span>`).join('')}${cells}</div>`;
    }
    function openDay(k) {
      const ws = finished().filter(w => key(new Date(w.start)) === k);
      if (ws.length === 1) { pushDetail({ type: 'w', id: ws[0].id }); return; }
      show(dateLabel(fromKey(k).getTime()), `${ws.length} treningi`, `<div class="ilist">${ws.map(w => `<button class="irow" data-w="${w.id}"><span class="ir-t"><b>${esc(w.name)}</b><small>${hhmm(w.start)} · ${fmtDur(w.end - w.start)}</small></span>${CHEV}</button>`).join('')}</div>`, 'Dzień');
    }

    /* ----- Ustawienia (pod zębatką) ----- */
    function settingsRows() {
      const s = state.settings;
      const tog = (k, on) => `<label class="switch"><input type="checkbox" data-set="${k}" ${on ? 'checked' : ''}><i></i></label>`;
      // konto i wylogowanie są w sekcji Konto
      return `<div class="ilist">
          <div class="irow static"><span class="ir-t"><b>Nazwy ćwiczeń</b></span>${segHtml('lang', 'data-lang', [['pl', FLAG_PL, 'Polski'], ['en', FLAG_GB, 'English']], s.lang === 'en' ? 'en' : 'pl', 'lang')}</div>
          <div class="irow static"><span class="ir-t"><b>Jednostka</b></span>${segHtml('unit', 'data-unit', [['kg', 'kg'], ['lb', 'lb']], s.unit === 'lb' ? 'lb' : 'kg')}</div>
          <div class="irow static"><span class="ir-t"><b>Przerwa</b></span>${segHtml('rest', 'data-rest-set', REST_OPTS.map(o => [o, fmtSec(o)]), s.rest, 'mono')}</div>
          <div class="irow static"><span class="ir-t"><b>Pytaj o przerwę po serii</b></span>${tog('autoRest', s.autoRest)}</div>
        </div>`;
    }
    // sekcja Konto pokazuje te ustawienia u siebie (w opakowaniu .s-gym, więc wyglądają tak samo)
    GL.settings = GL.settings || [];
    GL.settings.push({
      id: 'gym', title: 'Siłownia',
      html: () => { const h = settingsRows(); return h; },
      onClick(t) {
        let b;
        if ((b = t.closest('[data-lang]'))) { state.settings.lang = b.dataset.lang; applyLang(); save(); render(); return true; }
        if ((b = t.closest('[data-unit]'))) { state.settings.unit = b.dataset.unit; save(); render(); return true; }
        if ((b = t.closest('[data-rest-set]'))) { state.settings.rest = +b.dataset.restSet; save(); render(); return true; }
        return false;
      },
      onChange(t) { if (t.matches('[data-set]')) { state.settings[t.dataset.set] = t.checked; save(); } },
      segAnim,
    });


    /* ----- przerwa między seriami: duży zegar w kole jak w RepCount ----- */
    let rest = (() => { try { return JSON.parse(localStorage.getItem(REST_KEY)); } catch (_) { return null; } })(), restInt = null, actx = null;
    const restLeft = () => rest ? Math.max(0, (rest.end - Date.now()) / 1000) : 0;
    function startRest(sec, auto) {
      rest = { end: Date.now() + sec * 1000, total: sec };
      try { localStorage.setItem(REST_KEY, JSON.stringify(rest)); } catch (_) { }
      unlockAudio(); clearInterval(restInt); restInt = setInterval(tickRest, 250); tickRest();
      if (!auto) openTimer();
      else qa('.tb-timer').forEach(b => { b.classList.add('run'); if (!calm()) b.animate({ transform: ['scale(1)', 'scale(1.12)', 'scale(1)'] }, { duration: 400 }); });
      renderLive();
    }
    // wysuwane od dołu pytanie „Przerwa?” — „Tak” włącza czas z ustawień; pasek pod spodem odlicza, kiedy samo zniknie
    let askT = null;
    function askRest(sec) {
      hideAsk(true);
      const el = document.createElement('div');
      el.className = 'restask'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Przerwa?');
      el.innerHTML = `<span class="ra-q">${ALARM}<b>Przerwa?</b></span><button class="ra-yes" data-rest-yes="${sec}">Tak · ${fmtSec(sec)}</button><button class="ra-no" data-rest-no aria-label="Nie">${XMARK}</button><i class="ra-t" aria-hidden="true"></i>`;
      layer.appendChild(el);
      clearTimeout(askT); askT = setTimeout(() => hideAsk(), 9000);
    }
    function hideAsk(now) {
      clearTimeout(askT);
      layer.querySelectorAll('.restask').forEach(el => {
        if (now || calm()) { el.remove(); return; }
        if (el.classList.contains('out')) return;
        el.classList.add('out'); setTimeout(() => el.remove(), 300);
      });
    }
    function stopRest() { hideAsk(true); rest = null; try { localStorage.removeItem(REST_KEY); } catch (_) { } clearInterval(restInt); restInt = null; qa('.tb-timer').forEach(b => { b.classList.remove('run'); b.querySelector('[data-rl]').textContent = ''; }); if ($('t-ring')) drawTimer(); renderLive(); }
    function tickRest() {
      if (!rest) return;
      const left = restLeft();
      if (left <= 0) { restDone(); return; }
      qa('[data-rl]').forEach(el => { el.textContent = fmtSec(Math.ceil(left)); });
      const ring = $('t-ring'); if (ring) { ring.style.setProperty('--p', (left / rest.total).toFixed(4)); $('t-left').textContent = fmtSec(Math.ceil(left)); }
    }
    function restDone() {
      const was = rest; rest = null; try { localStorage.removeItem(REST_KEY); } catch (_) { }
      clearInterval(restInt); restInt = null;
      if (!was) return;
      const buzz = [500, 200, 500, 200, 700];
      let vibrated = false; try { vibrated = !!navigator.vibrate?.(buzz); } catch (_) { }
      if (state.settings.sound) beep();
      if ((document.hidden || !vibrated) && 'Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.getRegistration().then(r => r?.showNotification('Koniec przerwy', { body: 'Czas na kolejną serię', tag: 'glife-gym-rest', renotify: true, vibrate: buzz, icon: 'icons/icon-192.png' })).catch(() => { });
      qa('[data-rl]').forEach(el => { el.textContent = ''; });
      qa('.tb-timer').forEach(b => { b.classList.remove('run'); b.classList.add('end'); setTimeout(() => b.classList.remove('end'), 2000); });
      if ($('t-ring')) { drawTimer(); $('t-ring').classList.add('end'); }
      toast('Koniec przerwy — kolejna seria');
      renderLive();
    }
    function openTimer() {
      show('Przerwa', '', '<div id="gy-t-box"></div>', 'Timer przerwy', 'timer');
      drawTimer();
    }
    function drawTimer() {
      const box = $('t-box'); if (!box) return;
      const presets = REST_OPTS, cur = rest ? rest.total : 0;
      box.innerHTML = `<div class="tring" id="gy-t-ring" style="--p:${rest ? (restLeft() / rest.total).toFixed(4) : 0}"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="bg" cx="110" cy="110" r="96"/><circle class="fg" cx="110" cy="110" r="96" pathLength="1"/></svg><b id="gy-t-left">${rest ? fmtSec(Math.ceil(restLeft())) : '0:00'}</b></div>
        <div class="chips tpre">${presets.map(p => `<button data-tgo="${p}" class="${cur === p ? 'on' : ''}">${fmtSec(p)}</button>`).join('')}</div>
        ${rest ? `<div class="tctl"><button class="tstop" data-tstop aria-label="Zatrzymaj">${STOP}</button></div>` : '<p class="hint">Wybierz czas przerwy</p>'}`;
    }
    function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (_) { } }
    function beep() {
      if (!actx) return;
      try { [0, .22, .44].forEach((t, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = i === 2 ? 1175 : 880; g.gain.setValueAtTime(.0001, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + t + .18); o.connect(g).connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + .2); }); } catch (_) { }
    }

    /* ---------- okienka: arkusz od dołu (wspólne .sheet-ov / .sheet), zamykanie z animacją ---------- */
    const sheet = (title, sub, body, label, cls = '') => `<div class="sheet-ov" data-close><div class="sheet g-sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label || title)}"><div class="sheet-h"><div><h2>${title}</h2>${sub ? `<small>${sub}</small>` : ''}</div><button class="x" data-close aria-label="Zamknij">${XMARK}</button></div>${body}</div></div>`;
    // kolejne okienko zamiast otwartego: bez ponownego przyciemnienia, tylko płynna zmiana zawartości
    function show(title, sub, body, label, cls) {
      const had = sheetOpen();
      overlay.innerHTML = sheet(title, sub, body, label, cls);
      if (had) overlay.firstElementChild.classList.add('swap');
    }
    function close() {
      pick = null;
      const ov = overlay.querySelector('.sheet-ov:not(.out)'); if (!ov) return;
      if (calm()) { ov.remove(); return; }
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 320);
    }
    overlay.addEventListener('click', e => {
      if (e.target.hasAttribute('data-close') || e.target.closest('.x[data-close]')) { close(); return; }
      const T = s => e.target.closest(s); let b;
      if ((b = T('[data-pex]')) && pick) {
        const id = b.dataset.pex;
        if (pick.mode === 'swap') { const p = pick; pick = null; p.cb([id]); return; }
        const i = pick.sel.indexOf(id); if (i >= 0) pick.sel.splice(i, 1); else pick.sel.push(id);
        overlay.querySelectorAll(`[data-pex="${CSS.escape(id)}"]`).forEach(z => z.classList.toggle('on', i < 0)); drawPickFoot(); return;
      }
      if ((b = T('[data-pmus]')) && pick) { pick.mus = b.dataset.pmus; overlay.querySelectorAll('[data-pmus]').forEach(z => z.classList.toggle('on', z === b)); drawPickList(); return; }
      if ((b = T('[data-peq]')) && pick) { pick.eq = b.dataset.peq; overlay.querySelectorAll('[data-peq]').forEach(z => z.classList.toggle('on', z === b)); drawPickList(); return; }
      if ((b = T('[data-tadj]')) && rest) { rest.end += +b.dataset.tadj * 1000; rest.total = Math.max(rest.total, restLeft()); try { localStorage.setItem(REST_KEY, JSON.stringify(rest)); } catch (_) { } tickRest(); return; }
      if (T('[data-tstop]')) { stopRest(); return; }
      if ((b = T('[data-tgo]'))) { startRest(+b.dataset.tgo, true); drawTimer(); return; }
      if ((b = T('[data-w]'))) { close(); pushDetail({ type: 'w', id: b.dataset.w }); return; }
    });

    /* ---------- zdarzenia (tylko wewnątrz sekcji i jej warstwy) ---------- */
    function setTab(t) {
      const from = TABS.findIndex(x => x[0] === tab), to = TABS.findIndex(x => x[0] === t);
      tab = t; animTab = true; tabDir = Math.sign(to - from); stack = [];
      try { localStorage.setItem(TAB_KEY, t); } catch (_) { }
      tabView.innerHTML = ''; render();
    }
    // zdarzenie z elementu, który został już podmieniony (np. okienko zamknięte w swojej obsłudze), nie jest obsługiwane drugi raz
    const mine = t => (section.contains(t) || layer.contains(t)) && !overlay.contains(t);
    function onClick(e) {
      if (!mine(e.target)) return;
      const T = s => e.target.closest(s); let b;
      // zakładki i główne przyciski
      if ((b = T('.g-tabs [data-tab]'))) { if (b.dataset.tab === tab && !stack.length) scroller.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' }); else setTab(b.dataset.tab); return; }
      if (T('.g-fab') || T('[data-start]')) { if (!calm()) ripple(e.clientX, e.clientY, 1.2); openStart(); return; }
      if ((b = T('[data-rest-yes]'))) { unlockAudio(); startRest(+b.dataset.restYes, true); hideAsk(); return; }
      if (T('[data-rest-no]')) { hideAsk(); return; }
      if (T('.g-live')) { openWorkout(); return; }
      if (T('[data-back]')) { popDetail(); return; }
      // ekran treningu
      if (T('[data-wk-min]')) { if (state.active?.edit) { workoutMenu(); return; } wOpen = false; render(); return; }
      if (T('[data-finish]')) { finishAsk(); return; }
      if (T('[data-wk-menu]')) { workoutMenu(); return; }
      if (T('[data-timer]')) { unlockAudio(); openTimer(); return; }
      if ((b = T('[data-sn]'))) { tapSet(b.closest('.srow')); return; }
      if ((b = T('[data-smenu]'))) { const r = b.closest('.srow'); setMenu(+r.dataset.x, +r.dataset.s); return; }
      if ((b = T('[data-addset]'))) { addSet(+b.dataset.addset); return; }
      if ((b = T('[data-exmenu]'))) { exMenu(+b.dataset.exmenu); return; }
      if ((b = T('[data-exnote]'))) { exNote(+b.dataset.exnote); return; }
      if ((b = T('[data-exinfo]'))) { pushDetail({ type: 'ex', eid: b.dataset.exinfo, tab: b.dataset.xt || 'hist' }); return; }
      if (T('[data-addex]')) { openPicker('workout'); return; }
      // listy i szczegóły
      if ((b = T('[data-w]'))) { if (!calm()) ripple(e.clientX, e.clientY, 1); pushDetail({ type: 'w', id: b.dataset.w }); return; }
      if ((b = T('[data-wmenu]'))) { workoutActions(b.dataset.wmenu); return; }
      if ((b = T('[data-wprs]'))) { const w = state.workouts[b.dataset.wprs]; if (w?.prs?.length) openPRs(w); return; }
      if ((b = T('[data-repeat]'))) { const w = state.workouts[b.dataset.repeat]; if (w) startWorkout({ name: w.name, rid: w.rid, ex: w.ex.map(e => ({ eid: e.eid, sup: e.sup, note: e.note, tg: e.sets })) }); return; }
      if ((b = T('[data-r]'))) { if (lpFired) { lpFired = false; return; } pushDetail({ type: 'r', id: b.dataset.r }); return; }
      if (T('[data-rnew]')) { newRoutine(); return; }
      if ((b = T('[data-rstart]'))) { if (!calm()) ripple(e.clientX, e.clientY, 1.6); startRoutine(b.dataset.rstart); return; }
      if ((b = T('[data-rmenu]'))) { routineMenu(b.dataset.rmenu); return; }
      if ((b = T('[data-rex]'))) { routineEx(stack[stack.length - 1].id, +b.dataset.rex); return; }
      if (T('[data-radd]')) { const r = state.routines[stack[stack.length - 1].id]; openPicker('routine', (ids, ss) => { const sup = ss && ids.length > 1 ? uid('s') : null; ids.forEach(id => r.ex.push({ eid: id, w: 0, n: 3, note: '', sup })); save(); close(); render(); showAdded(dtLayer.querySelectorAll('[data-rex]'), ids.length); }); return; }
      if (T('[data-rtarget]')) {
        const r = state.routines[stack[stack.length - 1].id];
        show('Ciężary i powtórzenia', 'Skąd brać szare podpowiedzi w seriach', `<div class="ilist"><button class="irow${r.target !== 'routine' ? ' on' : ''}" data-tv="latest"><span class="ir-t"><b>Ostatnie</b><small>z ostatniego razu, gdy robiłeś to ćwiczenie</small></span>${r.target !== 'routine' ? '<span class="ck">✓</span>' : ''}</button><button class="irow${r.target === 'routine' ? ' on' : ''}" data-tv="routine"><span class="ir-t"><b>Z tego planu</b><small>z ostatniego treningu z tego planu (np. dzień ciężki i lekki)</small></span>${r.target === 'routine' ? '<span class="ck">✓</span>' : ''}</button></div>`, 'Podpowiedzi');
        overlay.querySelectorAll('[data-tv]').forEach(z => z.addEventListener('click', () => { r.target = z.dataset.tv; save(); close(); render(); }));
        return;
      }
      if ((b = T('[data-xt2]'))) { const d = stack[stack.length - 1]; if (d.tab === b.dataset.xt2) return; const order = ['hist', 'chart', 'rec', 'info']; dtSwap = Math.sign(order.indexOf(b.dataset.xt2) - order.indexOf(d.tab)); d.tab = b.dataset.xt2; d.sel = null; render(); return; }
      if ((b = T('[data-xm]'))) { const d = stack[stack.length - 1]; d.m = b.dataset.xm; d.sel = null; render(); return; }
      if ((b = T('[data-xr]'))) { const d = stack[stack.length - 1]; d.range = b.dataset.xr; d.sel = null; render(); return; }
      if ((b = T('[data-xy]'))) { stack[stack.length - 1].year = b.dataset.xy; render(); return; }
      if ((b = T('[data-xedit]'))) { const x = exById(b.dataset.xedit); if (x) openCustomEx(x, () => { close(); render(); }); return; }
      if (T('[data-more]')) { hLimit += 25; renderLog(); return; }
      if (T('[data-goal]')) { if (!calm()) ripple(e.clientX, e.clientY, 1.4); openGoal(); return; }
      if ((b = T('[data-cal]'))) { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + +b.dataset.cal, 1); const c = b.closest('.scard'); c.innerHTML = calendarHtml(); c.querySelector('.calg').classList.add('enter'); return; }
      if ((b = T('[data-cday]'))) { openDay(b.dataset.cday); return; }
      if (T('[data-hfind]')) { toggleFind(); return; }
      if ((b = T('[data-bw]'))) { openWeight(b.dataset.bw); return; }
      if (T('[data-bwall]')) { bwAll = !bwAll; const c = tabView.querySelector('.bwcard'); if (c) c.innerHTML = weightHtml(); return; }
      // ustawienia
      if ((b = T('[data-lang]'))) { state.settings.lang = b.dataset.lang; applyLang(); save(); render(); return; }
      if ((b = T('[data-unit]'))) { state.settings.unit = b.dataset.unit; save(); render(); return; }
      if ((b = T('[data-rest-set]'))) { state.settings.rest = +b.dataset.restSet; save(); render(); return; }
    }
    function onChange(e) {
      const t = e.target; if (!mine(t)) return;
      if (t.matches('[data-set]')) { state.settings[t.dataset.set] = t.checked; save(); return; }
      // seria zatwierdzona (wyjście z pola): rekord i przerwa
      const row = wkLayer.contains(t) && t.closest('.srow'); if (row) patchRow(row);
    }
    function onInput(e) {
      const t = e.target; if (!mine(t)) return;
      if (t.id === 'gy-h-q') { hQuery = t.value; hLimit = 25; renderLog(); return; }
      if (t.matches('[data-rname]') || t.matches('[data-rnote]')) { const r = state.routines[stack[stack.length - 1]?.id]; if (!r) return; if (t.matches('[data-rname]')) { r.name = t.value; const h = dtLayer.querySelector('h1.big'); if (h) h.textContent = t.value || 'Plan'; } else r.note = t.value; save(); return; }
      const a = state.active; if (!a || !wkLayer.contains(t)) return;
      if (t.id === 'gy-w-name') { a.name = t.value; save(); return; }
      const row = t.closest('.srow'); if (!row || !t.dataset.f) return;
      const en = a.ex[+row.dataset.x], s = en?.sets[+row.dataset.s]; if (!s) return;
      if (t.dataset.f === 'note') s.note = t.value; else putVal(s, t.dataset.f, num(t.value), exOf(en).kind);
      if ((t.dataset.f === 'r' || t.dataset.f === 's') && t.value !== '' && s.kg == null && exOf(en).kind !== 'cardio') {
        const tg = target(en, +row.dataset.s), kgIn = row.querySelector('[data-f="kg"]');
        if (tg?.kg != null && kgIn) { s.kg = tg.kg; kgIn.value = inVal(s, 'kg', exOf(en).kind); if (!calm()) kgIn.animate({ color: ['#E8524E', '#F3EFEA'] }, { duration: 700 }); }
      }
      save();
      row.classList.toggle('ok', valid(s, exOf(en).kind));
    }
    [section, layer].forEach(el => { el.addEventListener('click', onClick); el.addEventListener('change', onChange); el.addEventListener('input', onInput); });
    document.addEventListener('keydown', e => {
      if (!ctx.active) return;
      if (e.key === 'Escape') { if (sheetOpen()) { close(); return; } if (stack.length) { popDetail(); return; } if (wOpen && !state.active?.edit) { wOpen = false; render(); } return; }
      if (e.key === 'Enter' && wkLayer.contains(e.target) && e.target.matches('.srow input')) {
        e.preventDefault();
        const all = [...wkLayer.querySelectorAll('.srow input')], i = all.indexOf(e.target);
        if (all[i + 1] && all[i + 1].closest('.srow') === e.target.closest('.srow')) all[i + 1].focus(); else e.target.blur();
      }
    });
    // nowy dzień / powrót do aplikacji
    let lastToday = todayKey();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (rest) tickRest(); if (todayKey() !== lastToday) { lastToday = todayKey(); if (!sheetOpen() && !wOpen) render(); } } });
    // zegar trwającego treningu
    setInterval(() => { if (!state.active || state.active.edit || document.hidden) return; const t = elapsed(); qa('[data-el]').forEach(x => { x.textContent = t; }); }, 1000);

    /* ---------- efekty: kręgi jak na wodzie, rekordy ---------- */
    function ripple(x, y, k = 1, cls = '') {
      if (calm() || (!x && !y)) return;
      [0, 140].forEach(delay => {
        const r = document.createElement('i');
        r.className = 'g-ripple' + (cls ? ' ' + cls : '');
        Object.assign(r.style, { left: x + 'px', top: y + 'px', pointerEvents: 'none' });
        layer.appendChild(r);
        r.animate({ transform: ['translate(-50%,-50%) scale(.1)', `translate(-50%,-50%) scale(${k})`], opacity: [.6, 0] },
          { duration: 650, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' }).onfinish = () => r.remove();
        setTimeout(() => r.remove(), 1000);
      });
    }
    // nowy rekord: gwiazdka wyskakuje sprężyście, rozchodzą się od niej iskry i krąg
    function prBurst(star) {
      if (!star || calm()) return;
      star.animate({ transform: ['scale(0) rotate(-120deg)', 'scale(1.6) rotate(12deg)', 'scale(1) rotate(0)'] }, { duration: 620, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      const b = star.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      ripple(cx, cy, 1.3, 'pr');
      for (let i = 0; i < 10; i++) {
        const s = document.createElement('i'), ang = i / 10 * Math.PI * 2, d = 26 + (i % 3) * 9;
        s.className = 'g-spark'; Object.assign(s.style, { left: cx + 'px', top: cy + 'px', pointerEvents: 'none' });
        layer.appendChild(s);
        s.animate({ transform: ['translate(-50%,-50%) scale(1)', `translate(calc(-50% + ${Math.cos(ang) * d}px), calc(-50% + ${Math.sin(ang) * d}px)) scale(.2)`], opacity: [1, 0] },
          { duration: 560 + (i % 3) * 90, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => s.remove();
        setTimeout(() => s.remove(), 1000);
      }
    }
    // Koniec treningu: wibracja, a przy rekordach kafelek „Rekordy” wybucha iskrami.
    function celebrate(n) {
      ctx.vibrate(n ? [20, 50, 20, 50, 40] : [15, 60, 25]);
      if (!n || calm()) return;
      setTimeout(() => { const t = $('sum-pr'); if (t) prBurst(t.querySelector('b')); }, 420);
    }
    // iPhone: dotknięcie pola czasem nie otwiera klawiatury, więc pole dostaje focus() w obsłudze dotyku.
    let tStart = null;
    [section, layer].forEach(el => {
      el.addEventListener('touchstart', e => { const t = e.touches[0]; tStart = t ? [t.clientX, t.clientY] : null; }, { passive: true });
      el.addEventListener('touchend', e => {
        const f = e.target.closest?.('input:not([type=file]):not([type=radio]):not([type=checkbox]), textarea');
        const t = e.changedTouches[0], moved = !tStart || !t || Math.hypot(t.clientX - tStart[0], t.clientY - tStart[1]) > 10;
        if (f && !moved && document.activeElement !== f && !f.disabled) f.focus();
      }, { passive: true });
    });

    /* ---------- start sekcji ---------- */
    if (rest) { if (rest.end > Date.now()) { restInt = setInterval(tickRest, 250); } else { rest = null; try { localStorage.removeItem(REST_KEY); } catch (_) { } } }
    render();
    if (migrated) { migrated = false; setTimeout(save, 0); } // dane po zmianie biblioteki trafiają też do chmury

    // jednorazowo: ważenia podane przez użytkownika (maj–listopad 2026). Dopisywane dopiero po pierwszej udanej synchronizacji
    // (żeby nie zgadywać, co już jest w chmurze); jeśli któryś z tych dni już jest zapisany, nic nie robi.
    const BW_SEED = { '2026-11-02': 82.8, '2026-10-26': 82.6, '2026-10-19': 82.0, '2026-10-12': 81.6, '2026-10-05': 81.3, '2026-09-28': 80.1, '2026-09-21': 79.5, '2026-09-08': 80.6, '2026-07-19': 82.3, '2026-07-07': 81.1, '2026-06-15': 83.0, '2026-06-09': 82.3, '2026-06-07': 82.3, '2026-05-29': 81.0 };
    const BW_SEED_KEY = 'glife.gym.bwseed1';
    function seedWeights() {
      try { if (localStorage.getItem(BW_SEED_KEY)) return true; } catch (_) { return true; }
      const ready = ctx.cloud.local || ctx.cloud.stores.find(x => x.id === 'gym')?.status === 'ok';
      if (!ready || !ctx.cloud.user) return false;
      if (!state.body) state.body = {};
      if (!Object.keys(BW_SEED).some(k => state.body[k])) { Object.assign(state.body, BW_SEED); save(); render(); }
      try { localStorage.setItem(BW_SEED_KEY, '1'); } catch (_) { }
      return true;
    }
    setTimeout(() => { if (!seedWeights()) { const off = ctx.cloud.onChange(() => { if (seedWeights()) off(); }); } }, 0);

    return {
      getState: () => state,
      applyState,
      // po wylogowaniu: czyste dane na urządzeniu
      reset() {
        close(); stopRest(); stack = []; wOpen = false; pick = null;
        state = withDefaults({}); applyLang();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { }
        render();
      },
      show() { if (!sheetOpen() && !wkLayer.contains(document.activeElement)) render(); },
      hide() { hideAsk(true); },
    };
  }
})();
