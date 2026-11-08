# Grochu life

Jedna aplikacja zamiast trzech: **Siłownia** (dawny Traincker), **Nawyki** (Habbitcker) i **Dieta** (Foodcker), do tego **Przepisy**, **Wersety** i **Konto**.
Czysty HTML/CSS/JS, bez budowania. Konto i dane z tego samego projektu Supabase co dotychczasowe aplikacje — logujesz się tym samym e-mailem i hasłem, a nawyki, posiłki i treningi wczytują się z chmury.

Motyw: ciepła czerń i jeden akcent, szampańskie złoto `#D4B483` (`--pop`, `--crimson`); ciemny tekst na złocie `--on-gold`.

## Nawigacja

W lewym dolnym rogu jest przycisk z ikoną i nazwą bieżącej sekcji. Dotknięcie (albo przesunięcie palcem w lewo od prawej krawędzi ekranu) wysuwa z prawej menu z listą sekcji: ikona i nazwa, bieżąca oznaczona złotą kropką. Przesunięcie w prawo je chowa. Aplikacja pamięta ostatnio otwartą sekcję.

## Uruchomienie lokalnie

```bash
node .claude/serve.js 5180
```

i otwórz http://localhost:5180. Adres `http://localhost:5180/?local` pomija logowanie (dane tylko na urządzeniu) — do podglądu i testów.

## Dane i synchronizacja

- Nowe sekcje (Przepisy, Wersety i kolejne) trzymają dane we wspólnej tabeli `life_data` (wiersz na użytkownika i sekcję, `cloud: { table: 'life_data', key: '<sekcja>' }`). Tabelę tworzy jednorazowo `supabase/setup.sql` (Supabase → SQL Editor → Run).

- Jedna sesja (`glife.auth`), jedno połączenie Realtime, osobna tabela na sekcję: `user_data` (nawyki), `makro_data` (dieta), `gym_data` (siłownia) — te same co w starych aplikacjach, ten sam format, więc stare i nowa aplikacja mogą działać równolegle.
- Każdy element ma znacznik czasu zmiany; przy łączeniu wygrywa nowszy, usunięcia też się przenoszą (`js/core.js`).
- Lokalnie: `glife.<sekcja>.v1` (stan) i `glife.<sekcja>.sync` (znaczniki synchronizacji).
- Skan posiłku przez AI: funkcja Supabase `meal-scan` (konfiguracja w repozytorium Foodcker).

## Nowa sekcja

Dodaj `js/sec-<id>.js` i `css/sec-<id>.css` (style pod `.s-<id>`), dopisz je w `index.html` i w `SHELL` w `sw.js`:

```js
GL.register({
  id: 'sen', label: 'Sen', order: 40, icon: '<svg …>',
  cloud: { table: 'sen_data', flatten, unflatten },   // opcjonalnie
  init(ctx) {            // ctx.root, ctx.scroller, ctx.layer, ctx.changed(), ctx.toast(), ctx.fullscreen(), …
    return { getState, applyState, reset, show, hide };
  },
});
```

Po zmianach w plikach podbij wersję: `VERSION` w `sw.js` oraz `?v=` w `index.html` i w `SHELL` w `sw.js`.

## Struktura

- `index.html` — szkielet, ekran logowania
- `css/base.css` — motyw i wspólne elementy; `css/shell.css` — tło, scena, koło, logowanie
- `js/core.js` — konto, synchronizacja, rejestr sekcji, koło nawigacji
- `js/sec-*.js`, `css/sec-*.css` — sekcje
- `js/gym-exercises*.js`, `data/gym-instructions.json` — baza ćwiczeń (free-exercise-db, domena publiczna)
- `manifest.webmanifest`, `sw.js`, `icons/` — PWA
