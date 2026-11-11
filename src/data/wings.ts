/*
  wings.ts: the 7 wings of the library, in order around the room.
  Each wing gets a labelled bookcase; a plain bookcase sits between every two wings (14 in total).
  Text is in both site languages (en, id). `href` = the wing's page, once it exists.
*/
export interface Wing {
  slug: string;
  title: { en: string; id: string };
  blurb: { en: string; id: string };
  href?: string;
}

export const wings: Wing[] = [
  {
    slug: 'quran',
    title: { en: 'Quran & Islamic Studies', id: "Al-Qur'an & Studi Islam" },
    blurb: {
      en: 'Start with the Quran. Pick it up, open it, and read word by word.',
      id: "Mulailah dengan Al-Qur'an. Ambil, buka, dan baca kata demi kata.",
    },
    href: '/quran',
  },
  {
    slug: 'aerospace',
    title: { en: 'Aerospace', id: 'Kedirgantaraan' },
    blurb: {
      en: 'How planes fly, from lift and wings to jet engines.',
      id: 'Bagaimana pesawat terbang, dari gaya angkat dan sayap sampai mesin jet.',
    },
  },
  {
    slug: 'computer-science',
    title: { en: 'Computer Science', id: 'Ilmu Komputer' },
    blurb: {
      en: 'How computers think: code, logic and algorithms.',
      id: 'Bagaimana komputer berpikir: kode, logika, dan algoritma.',
    },
  },
  {
    slug: 'quantum-computing',
    title: { en: 'Quantum Computing', id: 'Komputasi Kuantum' },
    blurb: {
      en: 'Qubits, superposition and the strange rules of the very small.',
      id: 'Qubit, superposisi, dan aturan aneh dunia yang sangat kecil.',
    },
  },
  {
    slug: 'physics',
    title: { en: 'Physics', id: 'Fisika' },
    blurb: {
      en: 'Forces, energy and the laws that move everything.',
      id: 'Gaya, energi, dan hukum yang menggerakkan segalanya.',
    },
  },
  {
    slug: 'astro-dimensions',
    title: { en: 'Astro & Dimensions', id: 'Astro & Dimensi' },
    blurb: {
      en: 'Stars, galaxies, and the shape of space and time.',
      id: 'Bintang, galaksi, serta bentuk ruang dan waktu.',
    },
  },
  {
    slug: 'space',
    title: { en: 'Space', id: 'Luar Angkasa' },
    blurb: {
      en: 'Rockets, planets and exploring beyond Earth.',
      id: 'Roket, planet, dan menjelajah di luar Bumi.',
    },
  },
];
