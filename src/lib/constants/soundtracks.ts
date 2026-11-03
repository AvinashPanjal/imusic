import { AlbumSummary } from '@/types/music';

export interface FeaturedSoundtrack extends AlbumSummary {
  totalTracks?: number;
  artist?: { id: string; name: string };
  trackTitles?: string[];
}

export const FEATURED_SOUNDTRACKS: FeaturedSoundtrack[] = [
  {
    id: 'saavn-album-79185630',
    title: 'Prince And Family',
    artistName: 'Sanal Dev',
    coverImage: 'https://c.saavncdn.com/608/Prince-And-Family-Malayalam-2025-20260812211736-500x500.jpg',
    releaseYear: 2025,
    genre: 'Malayalam / Soundtrack',
    totalTracks: 4,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-sanal-dev', name: 'Sanal Dev' },
    trackTitles: [
      'The Life Of Prince - Maayunnallo',
      'The Song Of Prince - Heartbeat Koodanu',
      'Rani Meri Rani',
      'Moonnilu Moothon Prince',
    ],
  },
  {
    id: 'saavn-album-79186470',
    title: 'The Life Of Prince - Maayunnallo (From "Prince And Family")',
    artistName: 'Sanal Dev',
    coverImage: 'https://c.saavncdn.com/916/The-Life-Of-Prince-Maayunnallo-From-Prince-And-Family-Malayalam-2025-20260812211736-500x500.jpg',
    releaseYear: 2025,
    genre: 'Malayalam / Soundtrack',
    totalTracks: 1,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-sanal-dev', name: 'Sanal Dev' },
    trackTitles: [
      'The Life Of Prince - Maayunnallo',
      'The Life Of Prince',
      'Maayunnallo',
    ],
  },
  {
    id: 'saavn-album-79759837',
    title: 'Bethlehem Kudumba Unit',
    artistName: 'Vishnu Vijay',
    coverImage: 'https://c.saavncdn.com/569/Bethlehem-Kudumba-Unit-Malayalam-2026-20260901164324-500x500.jpg',
    releaseYear: 2026,
    genre: 'Malayalam / Soundtrack',
    totalTracks: 10,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-vishnu', name: 'Vishnu Vijay' },
    trackTitles: [
      'Illey Illa',
      'Maanthrikam',
      'Indrajaalam',
      'Varnajaalam',
      'Muttayi Vandi',
      'Kanmaniye',
      'Pidithara',
      'Cha Cha Chi Chi Choo',
      'Rakthasahodaran',
      'Kochuthanuppu',
    ],
  },
  {
    id: 'saavn-album-55472703',
    title: 'Indrajaalam',
    artistName: 'S. P. Venkatesh, Mohanlal',
    coverImage: 'https://c.saavncdn.com/494/Indrajaalam-Malayalam-2024-20250403152648-500x500.jpg',
    releaseYear: 1990,
    genre: 'Malayalam / Classic Soundtrack',
    totalTracks: 5,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-536175', name: 'S. P. Venkatesh' },
    trackTitles: [
      'Kunjikiliye Koodevide',
      'Vilkkaanundo Swapnangal',
      'Paayunna Yaagaaswam',
      'Indrajaalam',
    ],
  },
  {
    id: 'saavn-album-49113982',
    title: 'Leo',
    artistName: 'Anirudh Ravichander',
    coverImage: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
    releaseYear: 2023,
    genre: 'Tamil / Soundtrack',
    totalTracks: 7,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-anirudh', name: 'Anirudh Ravichander' },
    trackTitles: [
      'Badass',
      'Naa Ready',
      'Anbenum',
      'Bloody Sweet',
      'Lokiverse 2.0',
      'Glimpse of Antony Das',
      'Glimpse of Harold Das',
    ],
  },
  {
    id: 'saavn-album-52210422',
    title: 'Aavesham',
    artistName: 'Sushin Shyam',
    coverImage: 'https://c.saavncdn.com/202/Aavesham-Original-Motion-Picture-Soundtrack-Malayalam-2024-20250910150630-500x500.jpg',
    releaseYear: 2024,
    genre: 'Malayalam / Soundtrack',
    totalTracks: 9,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-sushin', name: 'Sushin Shyam' },
    trackTitles: [
      'Illuminati',
      'Jaada',
      'Armadham',
      'Galatta',
      'Mathapithakkale',
      'Odimaga',
    ],
  },
  {
    id: 'saavn-album-47094777',
    title: 'Jailer',
    artistName: 'Anirudh Ravichander',
    coverImage: 'https://c.saavncdn.com/187/Jailer-Tamil-2023-20230728081443-500x500.jpg',
    releaseYear: 2023,
    genre: 'Tamil / Soundtrack',
    totalTracks: 8,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-anirudh', name: 'Anirudh Ravichander' },
    trackTitles: ['Hukum', 'Kaavaalaa', 'Jailer Theme', 'Alappara', 'Rathamaarey'],
  },
  {
    id: 'saavn-album-51419924',
    title: 'Manjummel Boys',
    artistName: 'Sushin Shyam',
    coverImage: 'https://c.saavncdn.com/934/Manjummel-Boys-Original-Motion-Picture-Soundtrack-Malayalam-2024-20250905071140-500x500.jpg',
    releaseYear: 2024,
    genre: 'Malayalam / Soundtrack',
    totalTracks: 5,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-sushin', name: 'Sushin Shyam' },
    trackTitles: ['Kuthanthram', 'Thaai Manam', 'Nebulakal', 'The Gunaa Song'],
  },
  {
    id: 'saavn-album-49986024',
    title: 'ANIMAL',
    artistName: 'Pritam, Harshavardhan Rameshwar',
    coverImage: 'https://c.saavncdn.com/092/ANIMAL-Hindi-2023-20260724191152-500x500.jpg',
    releaseYear: 2023,
    genre: 'Hindi / Soundtrack',
    totalTracks: 8,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-pritam', name: 'Pritam' },
    trackTitles: ['Arjan Vailly', 'Hua Main', 'Satranga', 'Papa Meri Jaan', 'Pehle Bhi Main'],
  },
  {
    id: 'saavn-album-35003732',
    title: 'Vikram',
    artistName: 'Anirudh Ravichander',
    coverImage: 'https://c.saavncdn.com/973/Vikram-Tamil-2022-20220515182605-500x500.jpg',
    releaseYear: 2022,
    genre: 'Tamil / Soundtrack',
    totalTracks: 6,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-anirudh', name: 'Anirudh Ravichander' },
    trackTitles: ['Pathala Pathala', 'Vikram Title Track', 'Wasted', 'Porkanda Singam', 'Once Upon a Time'],
  },
  {
    id: 'saavn-album-52424905',
    title: 'Premalu',
    artistName: 'Vishnu Vijay',
    coverImage: 'https://c.saavncdn.com/368/Premalu-Malayalam-2024-20260203194001-500x500.jpg',
    releaseYear: 2024,
    genre: 'Malayalam / Soundtrack',
    totalTracks: 6,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-vishnu', name: 'Vishnu Vijay' },
    trackTitles: ['Kutty Kudiye', 'Welcome to Hyderabad', 'Mini Maharani', 'Telangana Bommalu'],
  },
  {
    id: 'saavn-album-25118096',
    title: 'The Highlights',
    artistName: 'The Weeknd',
    coverImage: 'https://c.saavncdn.com/396/The-Highlights-English-2021-20240207045714-500x500.jpg',
    releaseYear: 2021,
    genre: 'Global / Pop',
    totalTracks: 18,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-weeknd', name: 'The Weeknd' },
    trackTitles: ['Blinding Lights', 'Save Your Tears', 'Starboy', 'The Hills', 'Can\'t Feel My Face'],
  },
];

export function cleanSongTitle(str: string): string {
  if (!str) return '';
  return str
    .replace(/\s*[\(\[][^()\[\]]*(from|soundtrack|version|feat|theme|ost|original|remix|score)[^()\[\]]*[\)\]]/gi, '')
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function fuzzyMatch(source: string, target: string): boolean {
  if (!source || !target) return false;
  const sRaw = source.toLowerCase().trim();
  const tRaw = target.toLowerCase().trim();
  if (sRaw === tRaw) return true;

  const s = sRaw.replace(/[^a-z0-9]/g, '');
  const t = tRaw.replace(/[^a-z0-9]/g, '');
  if (!s || !t) return false;
  if (s === t) return true;

  const minLen = Math.min(s.length, t.length);
  const maxLen = Math.max(s.length, t.length);

  // Substring match: Only if the shorter string is at least 4 chars AND covers >= 70% of the longer
  if (minLen >= 4 && minLen / maxLen >= 0.7) {
    if (s.includes(t) || t.includes(s)) return true;
  }

  // Full-string Levenshtein for slight typos:
  // - Length >= 8: allow edit distance <= 2
  // - Length >= 5: allow edit distance <= 1
  // - Never allow fuzzy typos on very short strings (< 5 chars)
  if (Math.abs(s.length - t.length) <= 2) {
    if (minLen >= 8 && levenshteinDistance(s, t) <= 2) return true;
    if (minLen >= 5 && levenshteinDistance(s, t) <= 1) return true;
  }

  // Token-based matching for multi-word phrases (e.g. "manjumel boys" vs "Manjummel Boys")
  const sWords = sRaw.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const tWords = tRaw.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (sWords.length === 0 || tWords.length === 0) return false;

  // Track matched source indices so a single source token cannot be reused
  const matchedSourceIndices = new Set<number>();
  let matchedCount = 0;

  for (const tw of tWords) {
    let bestMatchIdx = -1;
    for (let i = 0; i < sWords.length; i++) {
      if (matchedSourceIndices.has(i)) continue;
      const sw = sWords[i];

      // Exact word match
      if (sw === tw) {
        bestMatchIdx = i;
        break;
      }

      // If word is >= 6 chars, allow edit distance 1
      if (tw.length >= 6 && sw.length >= 6 && levenshteinDistance(sw, tw) <= 1) {
        bestMatchIdx = i;
        break;
      }
    }

    if (bestMatchIdx !== -1) {
      matchedSourceIndices.add(bestMatchIdx);
      matchedCount++;
    }
  }

  // Require at least 75% of target words to match, and at least 2 matches
  const targetMatchRatio = matchedCount / tWords.length;
  if (tWords.length === 1) {
    return false;
  }

  return matchedCount >= 2 && targetMatchRatio >= 0.75;
}

export function findMatchingFeaturedSoundtracks(query: string): FeaturedSoundtrack[] {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();
  const cleanQ = q
    .replace(/\b(songs?|movie|soundtrack|film|full|audio|video|mp3|lyrics|track|bgm|padam|pattu)\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
  const effectiveQ = cleanQ && cleanQ.length >= 2 ? cleanQ : q;

  const matched = FEATURED_SOUNDTRACKS.filter((st) => {
    // 1. Direct album title or artist match
    if (
      fuzzyMatch(st.title, effectiveQ) ||
      fuzzyMatch(st.artistName || '', effectiveQ)
    ) {
      return true;
    }

    // 2. Track title match within the album
    if (st.trackTitles) {
      return st.trackTitles.some((trackName) => {
        return fuzzyMatch(trackName, effectiveQ);
      });
    }

    return false;
  });

  const qNorm = effectiveQ.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Sort matched: rank exact track / album title matches at the top
  return matched.sort((a, b) => {
    const aAlbumNorm = a.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bAlbumNorm = b.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const aTrackExact = a.trackTitles?.some((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '') === qNorm);
    const bTrackExact = b.trackTitles?.some((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '') === qNorm);

    if (aTrackExact && !bTrackExact) return -1;
    if (!aTrackExact && bTrackExact) return 1;

    if (aAlbumNorm === qNorm && bAlbumNorm !== qNorm) return -1;
    if (aAlbumNorm !== qNorm && bAlbumNorm === qNorm) return 1;

    return 0;
  });
}
