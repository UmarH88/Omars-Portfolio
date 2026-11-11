/*
  Quiz questions, generated from the real Quran data when the site is built.
  Nothing is hand-written: every answer and every wrong option is a word, meaning,
  verse or translation from the API data in src/data/surahs.

  The quiz should test real knowledge, so the wrong options are chosen to be CLOSE:
    - words that look and sound like the right word (same letters, e.g. يَلِدْ / يُولَدْ),
      so their meanings are close too ("He begets" / "He is begotten")
    - verses and translations from the SAME surah, of a similar length
    - no hints that give the answer away (the gap question has no translation)
    - small common words ("in", "and", "from") are skipped when there are better ones

  Six kinds of question:
    meaning    - Arabic word            -> pick its meaning
    word       - a meaning              -> pick the Arabic word
    missing    - verse with a gap       -> pick the missing word (no translation shown)
    next       - a verse                -> pick the verse that comes right after it
    translate  - an Arabic verse        -> pick what it means
    verse      - a translation          -> pick the Arabic verse
  A seeded random generator picks them, so a surah always gets the same quiz
  (the page's script shuffles the order on "Try again").
*/
import type { Lang, StudyRow, Word } from './quran';

export type Text = Record<Lang, string>;

export interface QuizOption {
  ar?: string; // Arabic option (word or verse)
  text?: Text; // meaning or translation option, in both languages
  note?: Text; // shown under the option after answering: what this option means / where it's from
}

export interface QuizQuestion {
  kind: 'meaning' | 'word' | 'missing' | 'next' | 'translate' | 'verse';
  prompt: Text; // the question
  quote?: Text; // a translation shown with the question
  arabic?: string; // Arabic shown with the question (a word, a verse, or a verse with a gap)
  options: QuizOption[];
  answer: number; // index of the right option
  explain: Text; // shown after answering: why the right answer is right
  breakdown?: { ar: string; meaning: Text }[]; // the verse word by word (verse questions)
}

/** A verse as the quiz sees it: its shown number ("5" or "6–7") and its words. */
interface QuizVerse {
  label: string; // "5", or "Al-Kawthar 2" for a verse borrowed from another surah
  words: Word[];
  translations: Text;
}

const OPTIONS = 4;
const MAX_VERSE_WORDS = 18; // longer verses make unreadable answer buttons

// mulberry32: tiny seeded random generator (same seed -> same quiz)
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------- Comparing answers ----------

// "the Lord" and "The Lord," count as the same answer
const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();

/** Two meanings are too close to both be offered if one is the same as, or contains, the other. */
function clash(a: string, b: string) {
  const x = plain(a);
  const y = plain(b);
  return x === y || (x.length > 2 && y.includes(x)) || (y.length > 2 && x.includes(y));
}

const meaningsClash = (a: Word, b: Word) => clash(a.meanings.en, b.meanings.en) || clash(a.meanings.id, b.meanings.id);

/**
 * The bare letters of an Arabic word: vowel marks removed and letter variants merged
 * (ٱ أ إ آ -> ا, ى -> ي, ة -> ه), so words from the same letters can be compared.
 */
export function skeleton(arabic: string) {
  return arabic
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي]/g, '');
}

/** How alike two words look (0 to 1): shared pairs of letters (Dice coefficient). */
function likeness(a: string, b: string) {
  const pairs = (s: string) => {
    const list: string[] = [];
    for (let i = 0; i < s.length - 1; i++) list.push(s.slice(i, i + 2));
    return list.length ? list : [s];
  };
  const pa = pairs(a);
  const pb = pairs(b);
  let shared = 0;
  const rest = [...pb];
  for (const p of pa) {
    const i = rest.indexOf(p);
    if (i >= 0) {
      shared++;
      rest.splice(i, 1);
    }
  }
  return (2 * shared) / (pa.length + pb.length);
}

/**
 * Pick the `count` CLOSEST items to the right answer: score every candidate, keep the
 * best few (with a little randomness so it isn't always the same three), skip clashes.
 */
function closest<T>(
  pool: T[],
  count: number,
  score: (item: T) => number,
  allowed: (item: T, chosen: T[]) => boolean,
  random: () => number,
) {
  const ranked = pool
    .map((item) => ({ item, score: score(item) + random() * 0.15 }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
  const chosen: T[] = [];
  for (const item of ranked) {
    if (chosen.length === count) break;
    if (allowed(item, chosen)) chosen.push(item);
  }
  return chosen;
}

/** Put the right answer among the wrong ones at a random place. */
function withAnswer(right: QuizOption, wrong: QuizOption[], random: () => number) {
  const answer = Math.floor(random() * (wrong.length + 1));
  const options = [...wrong];
  options.splice(answer, 0, right);
  return { options, answer };
}

const verseText = (verse: QuizVerse) => verse.words.map((w) => w.text).join(' ');
// Explanations name a word by its Arabic (the page shows it in the Quran font, right to left)
const say = (word: Word) => word.text;

// ---------- Notes: what each option means, shown after answering ----------
// Arabic word option -> its meaning (the Arabic is already the option itself)
const wordNote = (w: Word): Text => ({ en: `"${w.meanings.en}"`, id: `"${w.meanings.id}"` });
// Meaning option -> the Arabic word it belongs to
const meaningNote = (w: Word): Text => ({ en: say(w), id: say(w) });
// Arabic verse option -> its number and translation
const verseNote = (v: QuizVerse): Text => ({
  en: `Verse ${v.label}: "${v.translations.en}"`,
  id: `Ayat ${v.label}: "${v.translations.id}"`,
});
// Translation option -> its verse number
const labelNote = (v: QuizVerse): Text => ({ en: `Verse ${v.label}`, id: `Ayat ${v.label}` });
// Every word of a verse with its meaning
const breakdown = (v: QuizVerse) => v.words.map((w) => ({ ar: w.text, meaning: w.meanings }));
// Similar length scores close to 1, very different lengths close to 0
const lengthLikeness = (a: number, b: number) => Math.min(a, b) / Math.max(a, b);

function toQuizVerses(rows: StudyRow[], surahName?: string): QuizVerse[] {
  return rows
    .filter((row) => row.label !== null) // the Bismillah row isn't a numbered verse
    .map((row) => ({ label: surahName ? `${surahName} ${row.label}` : row.label!, words: row.segments.flatMap((s) => s.words), translations: row.translations }));
}

/**
 * Build the quiz for a surah.
 * @param rows   the surah's study rows (same numbering as the page; Al-Fatihah without the Bismillah)
 * @param extra  words and verses from nearby surahs, only used as wrong options when the surah is too short
 */
export function buildQuiz(surahId: number, rows: StudyRow[], extra: { words: Word[]; verses: QuizVerse[] }): QuizQuestion[] {
  const random = seeded(surahId * 7919);
  const verses = toQuizVerses(rows);

  // Each different word once, with the verse it comes from; skip words with no usable meaning
  const seen = new Set<string>();
  const allWords: { word: Word; verse: QuizVerse }[] = [];
  for (const verse of verses) {
    for (const word of verse.words) {
      const key = skeleton(word.text);
      if (seen.has(key) || !word.meanings.en?.trim() || !word.meanings.id?.trim()) continue;
      seen.add(key);
      allWords.push({ word, verse });
    }
  }

  // Skip tiny words (2 letters or fewer, like فِى "in", مِن "from") if there are enough real ones
  const solid = allWords.filter((w) => skeleton(w.word.text).length >= 3);
  const words = solid.length >= 6 ? solid : allWords;

  // 8 questions for the shortest surahs, up to 12 when there's enough to ask about
  const total = allWords.length >= 24 ? 12 : allWords.length >= 16 ? 10 : 8;

  // This surah first; nearby surahs only when this one is too short to give 3 close wrong options
  const ownWords = allWords.map((w) => w.word);
  const wordPool = ownWords.length >= 12 ? ownWords : [...ownWords, ...extra.words];
  const shortVerses = verses.filter((v) => v.words.length <= MAX_VERSE_WORDS);

  const questions: QuizQuestion[] = [];
  const count = (kind: QuizQuestion['kind']) => questions.filter((q) => q.kind === kind).length;
  const usedWords = new Set<string>();
  const usedVerses = new Set<string>(); // each verse is the subject of one verse question at most

  // Wrong Arabic words: the ones that LOOK most like the right word, but mean something else
  const lookAlikes = (right: Word) =>
    closest(
      wordPool,
      OPTIONS - 1,
      (w) => likeness(skeleton(w.text), skeleton(right.text)),
      (w, chosen) =>
        skeleton(w.text) !== skeleton(right.text) &&
        !meaningsClash(w, right) &&
        chosen.every((c) => skeleton(c.text) !== skeleton(w.text)),
      random,
    );

  // Wrong meanings: meanings of look-alike words (often the same root, so close in meaning)
  const closeMeanings = (right: Word) =>
    closest(
      wordPool,
      OPTIONS - 1,
      (w) => likeness(skeleton(w.text), skeleton(right.text)) + 0.3 * lengthLikeness(w.meanings.en.length, right.meanings.en.length),
      (w, chosen) => !meaningsClash(w, right) && chosen.every((c) => !meaningsClash(c, w)),
      random,
    );

  // Wrong verses: same surah first, similar length (so length doesn't give it away)
  const versePool = (right: QuizVerse) => (verses.length >= OPTIONS ? verses : [...verses, ...extra.verses]).filter((v) => v.words.length <= MAX_VERSE_WORDS && verseText(v) !== verseText(right));
  const similarVerses = (right: QuizVerse, pool: QuizVerse[]) =>
    closest(
      pool,
      OPTIONS - 1,
      (v) => lengthLikeness(v.words.length, right.words.length) + (verses.includes(v) ? 1 : 0),
      (v, chosen) =>
        verseText(v) !== verseText(right) &&
        !clash(v.translations.en, right.translations.en) &&
        chosen.every((c) => verseText(c) !== verseText(v)),
      random,
    );

  // ---- Which verse comes next? (2) Tests that you know the surah in order ----
  if (verses.length >= OPTIONS) {
    for (let tries = 0; tries < 10 && count('next') < 2; tries++) {
      const i = Math.floor(random() * (verses.length - 1));
      const verse = verses[i];
      const following = verses[i + 1];
      if (usedVerses.has(verse.label) || following.words.length > MAX_VERSE_WORDS) continue;
      // Wrong options: other verses of this surah, the nearest ones first (hardest to tell apart)
      const wrong = closest(
        verses.filter((v, j) => j !== i + 1 && j !== i && v.words.length <= MAX_VERSE_WORDS),
        OPTIONS - 1,
        (v) => 1 / (1 + Math.abs(verses.indexOf(v) - (i + 1))) + 0.5 * lengthLikeness(v.words.length, following.words.length),
        (v, chosen) => verseText(v) !== verseText(following) && chosen.every((c) => verseText(c) !== verseText(v)),
        random,
      );
      if (wrong.length < OPTIONS - 1) continue;
      usedVerses.add(verse.label);
      const { options, answer } = withAnswer(
        { ar: verseText(following), note: verseNote(following) },
        wrong.map((v) => ({ ar: verseText(v), note: verseNote(v) })),
        random,
      );
      questions.push({
        kind: 'next',
        prompt: { en: `Which verse comes right after verse ${verse.label}?`, id: `Ayat mana yang datang tepat setelah ayat ${verse.label}?` },
        arabic: verseText(verse),
        options,
        answer,
        explain: {
          en: `Verse ${verse.label} means: "${verse.translations.en}" It is followed by verse ${following.label}: "${following.translations.en}" Word by word:`,
          id: `Ayat ${verse.label} artinya: "${verse.translations.id}" Setelahnya ayat ${following.label}: "${following.translations.id}" Kata demi kata:`,
        },
        breakdown: breakdown(following),
      });
    }
  }

  // ---- What does this verse mean? (2) Arabic -> translation, from the same surah ----
  for (const verse of shuffle(shortVerses, random)) {
    if (count('translate') === 2) break;
    if (usedVerses.has(verse.label)) continue;
    const wrong = similarVerses(verse, versePool(verse));
    if (wrong.length < OPTIONS - 1) continue;
    usedVerses.add(verse.label);
    const { options, answer } = withAnswer(
      { text: verse.translations, note: labelNote(verse) },
      wrong.map((v) => ({ text: v.translations, note: labelNote(v) })),
      random,
    );
    questions.push({
      kind: 'translate',
      prompt: { en: 'What does this verse mean?', id: 'Apa arti ayat ini?' },
      arabic: verseText(verse),
      options,
      answer,
      explain: { en: `This is verse ${verse.label}. Word by word:`, id: `Ini ayat ${verse.label}. Kata demi kata:` },
      breakdown: breakdown(verse),
    });
  }

  // ---- Which verse has this meaning? (1) translation -> Arabic ----
  for (const verse of shuffle(shortVerses, random)) {
    if (count('verse') === 1) break;
    if (usedVerses.has(verse.label)) continue;
    const wrong = similarVerses(verse, versePool(verse));
    if (wrong.length < OPTIONS - 1) continue;
    usedVerses.add(verse.label);
    const { options, answer } = withAnswer(
      { ar: verseText(verse), note: verseNote(verse) },
      wrong.map((v) => ({ ar: verseText(v), note: verseNote(v) })),
      random,
    );
    questions.push({
      kind: 'verse',
      prompt: { en: 'Which verse has this meaning?', id: 'Ayat mana yang artinya seperti ini?' },
      quote: verse.translations,
      options,
      answer,
      explain: { en: `This is verse ${verse.label}. Word by word:`, id: `Ini ayat ${verse.label}. Kata demi kata:` },
      breakdown: breakdown(verse),
    });
  }

  // ---- Fill in the missing word (3): no translation shown, look-alike options ----
  const gapVerses = new Set<QuizVerse>();
  for (const { word, verse } of shuffle(words, random)) {
    if (count('missing') === 3) break;
    if (gapVerses.has(verse) || verse.words.length < 3 || verse.words.length > MAX_VERSE_WORDS) continue;
    const wrong = lookAlikes(word);
    if (wrong.length < OPTIONS - 1) continue;
    gapVerses.add(verse);
    usedWords.add(word.text);
    const gapped = verse.words.map((w) => (w === word ? '[ . . . ]' : w.text)).join(' ');
    const { options, answer } = withAnswer(
      { ar: word.text, note: wordNote(word) },
      wrong.map((w) => ({ ar: w.text, note: wordNote(w) })),
      random,
    );
    questions.push({
      kind: 'missing',
      prompt: { en: `Which word is missing from verse ${verse.label}?`, id: `Kata apa yang hilang dari ayat ${verse.label}?` },
      arabic: gapped,
      options,
      answer,
      explain: {
        en: `The missing word is ${say(word)}, "${word.meanings.en}". Verse ${verse.label} means: "${verse.translations.en}" Word by word:`,
        id: `Kata yang hilang adalah ${say(word)}, "${word.meanings.id}". Ayat ${verse.label} artinya: "${verse.translations.id}" Kata demi kata:`,
      },
      breakdown: breakdown(verse),
    });
  }

  // ---- Word questions fill the rest: Arabic -> meaning, and 2 the other way round ----
  // (the longer words first; the small ones only if the surah needs them to reach its total)
  for (const { word, verse } of [...shuffle(words, random), ...shuffle(allWords, random)]) {
    if (questions.length >= total) break;
    if (usedWords.has(word.text)) continue;
    // Where the word is, with the whole verse's meaning, so it's learned in context
    const where = {
      en: `It is in verse ${verse.label}: "${verse.translations.en}"`,
      id: `Kata ini ada di ayat ${verse.label}: "${verse.translations.id}"`,
    };

    if (count('word') < 2) {
      const wrong = lookAlikes(word);
      if (wrong.length < OPTIONS - 1) continue;
      usedWords.add(word.text);
      const { options, answer } = withAnswer(
      { ar: word.text, note: wordNote(word) },
      wrong.map((w) => ({ ar: w.text, note: wordNote(w) })),
      random,
    );
      questions.push({
        kind: 'word',
        prompt: { en: `Which word means "${word.meanings.en}"?`, id: `Kata mana yang artinya "${word.meanings.id}"?` },
        options,
        answer,
        explain: {
          en: `${say(word)} means "${word.meanings.en}". ${where.en}`,
          id: `${say(word)} artinya "${word.meanings.id}". ${where.id}`,
        },
      });
    } else {
      const wrong = closeMeanings(word);
      if (wrong.length < OPTIONS - 1) continue;
      usedWords.add(word.text);
      const { options, answer } = withAnswer(
        { text: word.meanings, note: meaningNote(word) },
        wrong.map((w) => ({ text: w.meanings, note: meaningNote(w) })),
        random,
      );
      questions.push({
        kind: 'meaning',
        prompt: { en: 'What does this word mean?', id: 'Apa arti kata ini?' },
        arabic: word.text,
        options,
        answer,
        explain: {
          en: `${say(word)} means "${word.meanings.en}". ${where.en}`,
          id: `${say(word)} artinya "${word.meanings.id}". ${where.id}`,
        },
      });
    }
  }

  // Mix the kinds so the quiz doesn't start with all the verse questions
  return shuffle(questions, random).slice(0, total);
}

/** Verses and words of other surahs (labelled "Al-Kawthar 2"), shaped for buildQuiz's `extra` (wrong options only). */
export function quizExtra(otherSurahs: { name: string; rows: StudyRow[] }[]) {
  const verses = otherSurahs.flatMap(({ name, rows }) => toQuizVerses(rows, name));
  return { verses, words: verses.flatMap((v) => v.words).filter((w) => w.meanings.en?.trim() && w.meanings.id?.trim()) };
}
