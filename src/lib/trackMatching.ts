/**
 * Universal Track Matching & Normalization Utilities
 * Provides high-accuracy matching between playlist metadata and streaming providers (JioSaavn, YouTube, etc.)
 */

export function normalizeWord(w: string): string {
  if (!w) return '';
  return w
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1+/g, '$1') // Collapses repeated letters e.g. "ee" -> "e", "oo" -> "o", "nn" -> "n"
    .replace(/ai$/g, 'a')     // Normalizes South Indian transliteration e.g. "unnai" -> "unna"
    .replace(/y$/g, 'i');     // Normalizes transliterated "y" -> "i" e.g. "thaniye" -> "thanie"
}

export function wordsMatch(w1: string, w2: string): boolean {
  if (!w1 || !w2) return false;
  if (w1 === w2) return true;
  const n1 = normalizeWord(w1);
  const n2 = normalizeWord(w2);
  if (n1 === n2) return true;
  if (n1.length >= 4 && n2.length >= 4) {
    if (n1.startsWith(n2) || n2.startsWith(n1)) {
      if (Math.abs(n1.length - n2.length) <= 1) return true;
    }
  }
  return false;
}

export function cleanSongTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s*\(From\s+[^)]+\)/gi, '')
    .replace(/\s*\[From\s+[^\]]+\]/gi, '')
    .replace(/\s*-\s*From\s+.*$/gi, '')
    .replace(/\s*\(Remastered[^)]*\)/gi, '')
    .replace(/\s*\[Remastered[^\]]*\]/gi, '')
    .replace(/\s*\(Original[^)]*\)/gi, '')
    .replace(/\s*\(Duet[^)]*\)/gi, '')
    .replace(/\s*\(feat\.[^)]*\)/gi, '')
    .replace(/\s*\[feat\.[^\]]*\]/gi, '')
    .replace(/\s*[\(\[][^()\[\]]*(from|soundtrack|version|feat|theme|ost|original|score)[^()\[\]]*[\)\]]/gi, '')
    .trim();
}

export function isAccurateTitleMatch(reqTitle: string, candTitle: string): boolean {
  if (!reqTitle || !candTitle) return false;
  const reqClean = cleanSongTitle(reqTitle).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const candClean = cleanSongTitle(candTitle).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

  const reqWords = reqClean.split(/\s+/).filter((w) => w.length >= 2);
  const candWords = candClean.split(/\s+/).filter((w) => w.length >= 2);

  if (reqWords.length === 0 || candWords.length === 0) return false;

  const genericWords = new Set(['the', 'and', 'from', 'song', 'audio', 'video', 'life', 'full', 'version', 'part']);
  const reqDistinctive = reqWords.filter((w) => !genericWords.has(w));

  let matchCount = 0;
  for (const rw of reqWords) {
    if (candWords.some((cw) => wordsMatch(rw, cw))) {
      matchCount++;
    }
  }

  // If there's only 1 distinctive word (like "Kadhali", "Husn", "Thaniye", "Ninakkai"),
  // it must match one of the candidate's first two words to avoid matching long compound titles
  // like "Kadhalikathey" or "Kadhaliye Varuga"
  if (reqDistinctive.length === 1) {
    const firstTwoCand = candWords.slice(0, 2);
    return firstTwoCand.some((cw) => wordsMatch(reqDistinctive[0], cw));
  }

  return matchCount >= Math.min(2, reqWords.length);
}

export function isArtistCompatible(reqArtist?: string, candArtist?: string): boolean {
  if (!reqArtist || !candArtist) return true;
  const candNorm = candArtist.toLowerCase().replace(/[^a-z0-9]/g, '');
  const reqNorm = reqArtist.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (candNorm.includes(reqNorm) || reqNorm.includes(candNorm)) return true;

  // Check individual artist tokens (separated by comma, slash, ampersand, or feat/ft)
  const reqTokens = reqArtist
    .split(/[,&/]|\\bfeat\\b|\\bft\\b/i)
    .map((a) => a.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((a) => a.length >= 3);

  if (reqTokens.some((t) => candNorm.includes(t))) return true;

  // Check individual significant words (e.g. 'Jayachandran' in 'P. Jayachandran')
  const stopwords = new Set(['the', 'and', 'feat', 'music', 'official', 'records', 'band', 'singers']);
  const reqWords = reqArtist
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !stopwords.has(w));

  return reqWords.some((w) => candNorm.includes(w));
}

export function selectBestYouTubeCandidate(
  requestedTitle: string,
  requestedArtist: string | undefined,
  candidates: any[]
): any | null {
  if (!candidates || candidates.length === 0) return null;
  const cleanReq = cleanSongTitle(requestedTitle);
  const NON_MUSIC_REGEX = /\b(interview|review|reaction|behind the scenes|making of|trailer|teaser|scene|comedy|short film|spoiler|podcast|vlog|status)\b/i;

  const valid = candidates.filter((v) => !NON_MUSIC_REGEX.test(v.title || ''));

  // 1. Check title match + artist match (highest confidence)
  for (const v of valid) {
    if (isAccurateTitleMatch(cleanReq, v.title)) {
      if (
        (requestedArtist && isArtistCompatible(requestedArtist, v.channel)) ||
        (requestedArtist && isArtistCompatible(requestedArtist, v.title))
      ) {
        return v;
      }
    }
  }

  // 2. High confidence title match from music videos / official channels
  const MUSIC_KEYWORDS = /\b(official|audio|video|lyric|original|soundtrack|song)\b/i;
  for (const v of valid) {
    if (isAccurateTitleMatch(cleanReq, v.title) && MUSIC_KEYWORDS.test(v.title)) {
      return v;
    }
  }

  // 3. Any accurate title match (that wasn't disqualified by NON_MUSIC_REGEX)
  for (const v of valid) {
    if (isAccurateTitleMatch(cleanReq, v.title)) {
      return v;
    }
  }

  return null;
}

export function parseTrackDuration(raw?: string | number): number {
  if (!raw) return 180;
  if (typeof raw === 'number') {
    if (raw > 1000) return Math.round(raw / 1000);
    return raw > 0 ? raw : 180;
  }
  const str = raw.trim();
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    if (num > 1000) return Math.round(num / 1000);
    return num > 0 ? num : 180;
  }
  if (str.includes(':')) {
    const parts = str.split(':').map((p) => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  return 180;
}
