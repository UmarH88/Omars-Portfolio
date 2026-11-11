# CLAUDE.md — Omar's Library (Omars-Portfolio)

## Who you're working with
Omar is an engineering student building this site to LEARN, not just to get it done.
Act as a patient mentor pair-programming with him.

## How to work (follow every time)
- ONE small step at a time. After each step, stop and wait for Omar to say "next".
- Before each step: say in 2–3 plain sentences what we're doing, why, and which files change.
- Prefer editing existing files over rewriting them. Show exactly what is added or removed.
- Give terminal commands for Omar to run himself (Windows, Git Bash in VS Code; never PowerShell syntax), with what each does and what output to expect.
- Before deleting anything, show exactly what will be deleted and wait for his OK.
- Comment code clearly: explain the "why", keep comments short.
- Use simple, natural language. No jargon without a one-line explanation.
- End each step by suggesting a commit message. Omar commits and pushes himself.
- Never skip ahead or build several features at once.

## The project
A personal study website. Repo: UmarH88/Omars-Portfolio (private). Site: public on Cloudflare Pages.
Every push to `main` deploys automatically.

Pages, in build order:
1. **Intro** (`/`): "Hi, I'm Omar." Six interest badges (plane, Quran, atom, laptop/code, "Aa ع" languages, planet)
   orbit a realistic, gender-neutral person seen from behind (hoodie, hood up). The scene tilts with mouse or finger.
   Scrolling interests ticker. States he built this out of his own interest. Buttons: "Enter the library" + GitHub.
2. **3D library** (`/library`): a curved wall of 14 bookshelves (7 labelled wings, plain shelves between) around
   the same person. Swipe, arrows or tap a shelf to turn the room. Tapping a shelf animates the camera walking to it.
   Wings: Quran & Islamic Studies (main, first shelf), Aerospace, Computer Science, Quantum Computing, Physics,
   Astro & Dimensions, Space. Two looks: Library (walnut and gold) and Orbit (holographic cyan).
3. **Quran book**: first book on the main shelf (green, gold band, glow). It flies forward; tapping it opens the
   cover on a right-side hinge like a real mushaf, showing Al-Fatihah, then "Read it in the mushaf".
4. **Quran index** (`/quran`): list of all 114 surahs (number, English + Arabic name, meaning, place, verse count).
   Each surah links to Mushaf mode and Study mode.
5. **Mushaf mode** (`/mushaf/1` … `/mushaf/604`): the whole Quran PAGE BY PAGE, like the printed 15-line
   Madani mushaf (a page can hold several surahs; page 604 = Al-Ikhlas, Al-Falaq, An-Nas). Every word sits on
   its real line (word `page`/`line` from the API, mushaf layout 1). One page at a time with a page-turn
   animation. Arabic only, round verse markers; hover/tap a word → English meaning. No translation.
   Two reading modes with a Surah | Page switch (`MushafModeSwitch.astro`):
   - Surah mode `/quran/[surah]` (`mushafUrl()`): one surah on its own, its real lines only.
   - Page mode `/mushaf/[page]` (`mushafPageUrl()`, `surahPageUrl()`): the full printed pages.
   Study mode stays surah by surah.
6. **Study mode** (`/quran/[surah]/study`): dark navy page. Header: surah number badge, English name, meaning,
   place, verse count, Arabic name in gold. Bismillah, then ONE ayah per row: Arabic, then its translation.
   Toggles: translation language, "words under Arabic" (word-by-word meaning under each word).
   Hover/tap a word → meaning. Side panel (below on phones) with two tabs:
   - **Tafseer:** "About this surah" + pick a verse number to read its explanation. Source and attribution shown.
   - **Quiz:** 8–12 questions generated from the real data (word meaning, which verse matches a
     translation, fill in the missing word). No hand-written answers.
7. **Samples** (`/samples`): a tab per wing with a short lesson, a key fact or formula, and one quick question.
8. **Later:** upgrade the library to Three.js. Keep the library code structured so that swap is easy.

## Design notes (from Omar's screenshots)
- **Intro:** near-black navy, soft purple glow top right, cyan accents ("Tap a planet of interest"),
  glassy round badges on a tilted orbit ring, big bold white heading, pill buttons (light "Enter the library"
  with dark arrow circle, outlined round GitHub button), "O" logo circle top left.
- **Library:** dark walnut and gold, Cormorant Garamond headings, small gold uppercase labels
  ("OMAR'S LIBRARY", "THE MAIN WING"), bottom card with ‹ › arrows and gold "Walk to this shelf" button.
- **Quran book:** green cover, gold border and glowing gold circle with the title; opens to cream pages.
- **Mushaf:** like Omar's page-604 screenshot: blue/red diamond-pattern border with gold corner studs,
  cream page with red + gold frame lines, Arabic running header (سورة … | الجزء …), cream-gold surah title
  bars with red border and blue text, gold-ring verse markers with blue digits, page number in an oval
  + "PAGE 604". Full lines justified edge to edge, short lines centred (fitted by a small script).
- **Study:** dark navy, gold verse markers, light Arabic, muted blue-grey translation, cyan active tab.

Omar will attach screenshots of the designs. Match them.

## Stack
- Astro (static output). Node 22.23.4+ (even versions only).
- CSS 3D transforms + small vanilla JS for animations. No extra libraries without asking first and saying why.
- Fonts: Space Grotesk + Inter (UI), Amiri / Amiri Quran (Arabic), Cormorant Garamond (library look).

## Folder structure (target)
```
src/pages/index.astro          intro
src/pages/library.astro        3D library
src/pages/samples.astro        wing samples
src/pages/quran/index.astro            surah index
src/pages/mushaf/[page].astro          mushaf, page by page (1-604)
src/pages/quran/[surah].astro          mushaf, Surah mode (one surah, real lines)
src/pages/quran/[surah]/study.astro    study mode (tafseer + quiz tabs)
src/components/                shelf, Quran book, word tooltip, etc.
src/layouts/Base.astro         shared head, fonts, frame
src/data/surahs/               001.json … 114.json (generated)
src/styles/global.css          colours and shared styles
scripts/fetch-quran.mjs        downloads Quran data once
```

## Commands
- `npm run dev` → local site at http://localhost:4321
- `npm run build` → builds to `dist/` (Cloudflare: build command `npm run build`, output `dist`)
- `npm run preview` → serve the built site locally
- `node scripts/fetch-quran.mjs` → refresh Quran data

## Quran data: strict rules
- Source: the Quran Foundation's data, via Quran.com's open API `https://api.quran.com/api/v4`
  (no keys; Omar chose this on 2026-11-10 instead of waiting for production approval).
  Same data and format as the keyed API (api-docs.quran.foundation), which stays as a fallback.
  Verses by chapter with `words=true`, translation Saheeh International (id 20),
  tafsir Ibn Kathir (Abridged) (id 169).
- NEVER type Quran text or meanings from memory. All Arabic and meanings come from the API data.
- Fetch with the Node script (`npm run fetch:quran`) and COMMIT the JSON in `src/data`.
  Cloudflare builds from the committed JSON, so it never needs the keys. The browser never calls the API.
- `QF_ENV` in `.env` picks `public` (default, no keys), `prelive` (test keys, surahs 1–2 only)
  or `production` (keyed, after approval).
- Max 50 verses per request, so paginate (Al-Baqarah has 286).
- Handle failures: retries, clear errors, never write a half-empty file.
- Show the translation's name and attribution on the site.
- Bismillah: always on its own line, never numbered. Al-Fatihah is numbered 1–7 WITHOUT the Bismillah
  (Omar's choice): `fatihahForMushaf()` in `src/lib/quran.ts` regroups the API's own words
  (API verse 7 split after "عَلَيْهِمْ"). Data stays in the API's Hafs numbering; only display changes.
  Study mode must use the same numbering for Al-Fatihah.
- Tafseer text also comes ONLY from the API (a published tafsir, e.g. Ibn Kathir abridged), with its name
  and source shown. Never write or "summarise" tafseer or hadith from memory.
- EXCEPTION (Omar's go-ahead, 2026-11-11): an "easy" version in very simple English + Indonesian, in
  `src/data/tafsir-simple/NNN.json`. Rules: simplify ONLY the saved source texts for that surah (never add
  facts or hadith from memory), keep just the important parts (where/when revealed, what it's about, why
  it's special, what each verse means), keep each hadith's source (Al-Bukhari…), natural flowing language,
  no filler. The full original stays on the page behind "Read the full original". One surah at a time,
  Omar checks the first one (112) before the rest are written.
- `npm run fetch:tafsir` (scripts/fetch-tafsir.mjs) saves `src/data/tafsir/100.json` … (surahs 100–114 for now):
  surah introduction (revelation, history, themes) from Maududi's Tafhim al-Qur'an (`/chapters/{id}/info`)
  + Ibn Kathir (Abridged, id 169), falling back to Ma'arif al-Qur'an (id 168) where Ibn Kathir is empty
  (e.g. 105). API HTML is cleaned to simple tags with no attributes before saving.

## Secrets
- Keys live in `.env` as `QF_CLIENT_ID` and `QF_CLIENT_SECRET`, and the same names in
  Cloudflare Pages environment variables.
- `.gitignore` must include `.env`, `node_modules`, `dist`. Check `git status` before every commit.
- If a key is ever committed, stop and tell Omar to make new keys.

## Code quality
- Clean, readable, small components. Consistent names.
- Accessible: real `<button>` and `<a>`, keyboard support, aria labels on icon buttons,
  good contrast, Arabic marked `lang="ar" dir="rtl"`.
- Respect `prefers-reduced-motion`.
- Mobile-first. Must work well on a phone, then desktop.
- Run `npm run build` before saying a step is done, and fix any errors.

## Progress
- [x] Tools checked
- [x] Astro project at repo root, pushed to GitHub
- [x] Connect Cloudflare Pages
- [x] API keys + `.env` (pre-live keys: surahs 1–2 only; request production access later)
- [x] Fetch script (all 114 surahs: verses, word meanings, translation)
- [x] Base layout, fonts, colours
- [x] Intro page: `IntroScene.astro` (CSS 3D orbit, tilt) + `Person.astro` (option A "2.5D" layered SVG,
      moving rim light; Three.js can replace just this component later). Needs a visual check vs. design.
- [x] 3D library `/library`: `LibraryRoom.astro` (CSS 3D ring of 14 `Bookcase.astro`, wings in `src/data/wings.ts`),
      turn by arrows/keys/swipe/tap, "Walk to this shelf". Needs a visual check. "Orbit" (cyan) look still to do.
- [ ] Quran book animation
- [x] Quran index
- [x] Mushaf mode, page by page (604 pages, real lines, printed-mushaf styling)
- [x] Mushaf: Surah | Page mode switch
- [x] Everything in Indonesian when the language switch is on: `T.astro` for UI text, easy tafseer for
      100–114 in EN + ID, Indonesian surah meanings (`translatedNames`), language applied before first paint
- [ ] Quiz: 15 questions per mushaf page (Page mode). Study-mode quiz done.
- [ ] Mushaf: page-turn animation, swipe, "go to page"
- [x] Easy tafseer: all 15 surahs (100–114) in English and Indonesian
- [x] Study mode (word-by-word, translation; translation-language toggle still to do)
- [x] Study mode: tafseer panel (surahs 100–114)
- [x] Study mode: quiz, 8–12 multiple-choice questions per surah from the data, explains answers
      (`lib/quiz.ts` + `Quiz.astro`; all 114 surahs; Tafseer | Quiz tabs). Must stay HARD (Omar): look-alike
      wrong options from the same surah, no giveaway hints, verse order + verse meaning questions, mistakes review.
- [ ] Study mode: flashcards (Arabic word → meaning, flip, "I knew it / again")
- [ ] Study mode: personal notes per surah/verse (saved in the browser)
- [ ] Samples page
- [ ] Three.js upgrade

Update this list as steps are finished.