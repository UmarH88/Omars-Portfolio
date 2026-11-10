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
4. **Mushaf** (`/quran/[surah]`, 114 pages, one template via `getStaticPaths`): traditional framed page,
   green and gold surah header, Arabic only, round verse markers. Hover or tap a word → its English meaning in a
   tooltip above it. No translation on the page.
5. **Samples** (`/samples`): a tab per wing with a short lesson, a key fact or formula, and one quick question.
6. **Quiz** (`/quiz/[surah]`): 8–12 questions per surah, generated from the real data
   (word meaning, which verse matches a translation, fill in the missing word). No hand-written answers.
7. **Later:** upgrade the library to Three.js. Keep the library code structured so that swap is easy.

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
src/pages/quran/[surah].astro  mushaf pages
src/pages/quiz/[surah].astro   quizzes
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
- [ ] Connect Cloudflare Pages
- [ ] API keys + `.env`
- [ ] Fetch script
- [ ] Base layout, fonts, colours
- [ ] Intro page
- [ ] 3D library
- [ ] Quran book animation
- [ ] Mushaf pages
- [ ] Samples page
- [ ] Quiz pages
- [ ] Three.js upgrade

Update this list as steps are finished.