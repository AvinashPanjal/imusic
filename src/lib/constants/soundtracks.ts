import { AlbumSummary } from '@/types/music';

export interface FeaturedSoundtrack extends AlbumSummary {
  totalTracks?: number;
  artist?: { id: string; name: string };
}

export const FEATURED_SOUNDTRACKS: FeaturedSoundtrack[] = [
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
  },
  {
    id: 'saavn-album-52210422',
    title: 'Aavesham',
    artistName: 'Sushin Shyam',
    coverImage: 'https://c.saavncdn.com/202/Aavesham-Original-Motion-Picture-Soundtrack-Malayalam-2024-20240411130634-500x500.jpg',
    releaseYear: 2024,
    genre: 'Malayalam / Soundtrack',
    totalTracks: 9,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-sushin', name: 'Sushin Shyam' },
  },
  {
    id: 'saavn-album-47094777',
    title: 'Jailer',
    artistName: 'Anirudh Ravichander',
    coverImage: 'https://c.saavncdn.com/777/Jailer-Tamil-2023-20230728183015-500x500.jpg',
    releaseYear: 2023,
    genre: 'Tamil / Soundtrack',
    totalTracks: 8,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-anirudh', name: 'Anirudh Ravichander' },
  },
  {
    id: 'saavn-album-51419924',
    title: 'Manjummel Boys',
    artistName: 'Sushin Shyam',
    coverImage: 'https://c.saavncdn.com/924/Manjummel-Boys-Original-Motion-Picture-Soundtrack-Malayalam-2024-20240222041203-500x500.jpg',
    releaseYear: 2024,
    genre: 'Malayalam / Soundtrack',
    totalTracks: 5,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-sushin', name: 'Sushin Shyam' },
  },
  {
    id: 'saavn-album-49986024',
    title: 'ANIMAL',
    artistName: 'Pritam, Harshavardhan Rameshwar',
    coverImage: 'https://c.saavncdn.com/024/ANIMAL-Hindi-2023-20231124191427-500x500.jpg',
    releaseYear: 2023,
    genre: 'Hindi / Soundtrack',
    totalTracks: 8,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-pritam', name: 'Pritam' },
  },
  {
    id: 'saavn-album-35003732',
    title: 'Vikram',
    artistName: 'Anirudh Ravichander',
    coverImage: 'https://c.saavncdn.com/732/Vikram-Tamil-2022-20220515182605-500x500.jpg',
    releaseYear: 2022,
    genre: 'Tamil / Soundtrack',
    totalTracks: 6,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-anirudh', name: 'Anirudh Ravichander' },
  },
  {
    id: 'saavn-album-52424905',
    title: 'Premalu',
    artistName: 'Vishnu Vijay',
    coverImage: 'https://c.saavncdn.com/905/Premalu-Malayalam-2024-20240209121204-500x500.jpg',
    releaseYear: 2024,
    genre: 'Malayalam / Soundtrack',
    totalTracks: 6,
    isHiRes: false,
    isLossless: true,
    artist: { id: 'saavn-artist-vishnu', name: 'Vishnu Vijay' },
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
  },
];

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
  const s = source.toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = target.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s || !t) return false;
  if (s === t || s.includes(t) || t.includes(s)) return true;

  if (Math.abs(s.length - t.length) <= 4 && levenshteinDistance(s, t) <= 3) {
    return true;
  }

  const sWords = source.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const tWords = target.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let matched = 0;
  for (const tw of tWords) {
    if (
      sWords.some(
        (sw) =>
          sw.includes(tw) ||
          tw.includes(sw) ||
          levenshteinDistance(sw, tw) <= 2
      )
    ) {
      matched++;
    }
  }
  return matched > 0 && matched >= Math.ceil(tWords.length * 0.5);
}

export function findMatchingFeaturedSoundtracks(query: string): FeaturedSoundtrack[] {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();
  return FEATURED_SOUNDTRACKS.filter((st) => {
    return (
      fuzzyMatch(st.title, q) ||
      fuzzyMatch(st.artistName || '', q) ||
      (st.genre && fuzzyMatch(st.genre, q))
    );
  });
}
