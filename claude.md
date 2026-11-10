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
5. **Mushaf mode** (`/quran/[surah]`, one template via `getStaticPaths`): traditional framed cream page,
   green and gold surah header, Arabic only, round verse markers. Hover or tap a word → its English meaning in a
   tooltip above it. No translation on the page.
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
- **Mushaf:** cream paper, green double frame, gold lines, green pill surah header, page number at bottom.
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
src/pages/quran/[surah].astro          mushaf mode
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
- Source: Quran Foundation API (api-docs.quran.foundation), verses by chapter with `words=true`
  plus an English translation.
- NEVER type Quran text or meanings from memory. All Arabic and meanings come from the API data.
- Fetch once at build time with the Node script and save JSON in `src/data/surahs`.
  The browser never calls the API.
- Max 50 verses per request, so paginate (Al-Baqarah has 286).
- Handle failures: retries, clear errors, never write a half-empty file.
- Show the translation's name and attribution on the site.
- Tafseer text also comes ONLY from the API (a published tafsir, e.g. Ibn Kathir abridged), with its name
  and source shown. Never write or "summarise" tafseer or hadith from memory.

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
- [ ] Fetch script
- [ ] Base layout, fonts, colours
- [ ] Intro page
- [ ] 3D library
- [ ] Quran book animation
- [ ] Quran index
- [ ] Mushaf mode
- [ ] Study mode (word-by-word, translation)
- [ ] Study mode: tafseer tab
- [ ] Study mode: quiz tab
- [ ] Samples page
- [ ] Three.js upgrade

Update this list as steps are finished.