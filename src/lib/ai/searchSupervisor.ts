/**
 * AI Search Supervisor (powered by Google Gemini)
 *
 * Provides intelligent query correction, intent classification (movie soundtrack vs.
 * specific song vs. artist), Indian language / transliteration understanding (Malayalam,
 * Tamil, Hindi, Telugu, etc.), and multi-query variant generation for 100% accurate search.
 */

import { FEATURED_SOUNDTRACKS } from '@/lib/constants/soundtracks';

export interface AISearchAnalysis {
  originalQuery: string;
  correctedQuery: string;
  intent: 'movie' | 'song' | 'artist' | 'genre' | 'general';
  movieOrAlbum: string | null;
  songName: string | null;
  primaryArtists: string[];
  language: string | null;
  searchVariants: string[];
  isAiEnhanced: boolean;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 1200;
const TIMEOUT_MS = 20000; // 20 seconds timeout for Gemini API call

interface CacheEntry {
  data: AISearchAnalysis;
  timestamp: number;
}

const supervisorCache = new Map<string, CacheEntry>();

const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
];

const SYSTEM_PROMPT = `You are the AI Music Search Supervisor for iMusic, an audio streaming app specializing in Indian (Malayalam, Tamil, Hindi, Telugu, Kannada) and Global music.

Analyze the user's music search query. Users frequently make typos, use casual transliteration (Manglish, Tanglish, Hinglish), or search by movie title instead of song title.

Rules:
1. Identify any typos or phonetic misspellings (e.g. "manjumel" -> "Manjummel Boys", "aveshm" -> "Aavesham", "bethleham kudba" -> "Bethlehem Kudumba Unit", "aniruth" -> "Anirudh", "illay illa" -> "Illey Illa", "chalya" -> "Chaleya").
2. User Intent Classification (CRITICAL):
   - "movie": When user searches for a movie title, film name, or movie soundtrack (e.g. "Manjummel Boys", "Aavesham", "Jailer", "Premalu", "Leo", "Devara", "Kalki", "Pushpa 2", "manjumel songs", "avesham movie", "drishyam", "premam"). In this case:
     * intent MUST be "movie"
     * "movieOrAlbum" is the canonical film title (e.g. "Manjummel Boys", "Aavesham")
     * "songName" must be null (unless a single specific song was also explicitly named)
     * The app will display the complete Movie Soundtrack Playlist at the very top.
   - "song": When user searches for a specific individual song track (e.g. "Illuminati", "Kuthanthram", "Chaleya", "Jaada", "Illey Illa", "Hukum", "Mini Maharani", "Tum Hi Ho", "Arabic Kuthu"). In this case:
     * intent MUST be "song"
     * "songName" is the specific song name
     * "movieOrAlbum" can be the parent movie if known, but intent remains "song"
     * The app will prioritize this specific song track at the very top.
   - "artist": When user searches for a music composer, singer, or director (e.g. "Anirudh", "Sushin Shyam", "A.R. Rahman", "Sid Sriram", "Shreya Ghoshal", "K.J. Yesudas").
   - "genre" or "general": For generic moods, languages, or decades.
3. Extract "movieOrAlbum" without filler words like "movie", "songs", "padam", "pattu", "soundtrack".
4. Extract "songName" if and only if a specific song was requested.
5. Extract "primaryArtists" (composers, singers).
6. Specify "language" (Malayalam, Tamil, Hindi, Telugu, English, etc.).
7. Generate 2-4 clean "searchVariants" optimized for JioSaavn and audio catalog search.
8. "correctedQuery": Clean, human-readable corrected title.

Return ONLY JSON:
{
  "correctedQuery": string,
  "intent": "movie" | "song" | "artist" | "genre" | "general",
  "movieOrAlbum": string | null,
  "songName": string | null,
  "primaryArtists": string[],
  "language": string | null,
  "searchVariants": string[]
}`;

/**
 * Supervise a user search query using Gemini AI with in-memory caching and safe fallback.
 */
export async function superviseSearchQuery(rawQuery: string): Promise<AISearchAnalysis> {
  const query = (rawQuery || '').trim();
  if (!query) {
    return createEmptyAnalysis(query);
  }

  const cacheKey = query.toLowerCase();
  const cached = supervisorCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // Check local curated Indian soundtracks for 0ms instant identification
  // ONLY for high-confidence exact matches of soundtrack titles or specific songs
  const qNorm = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanQ = query
    .toLowerCase()
    .replace(/\b(songs?|movie|soundtrack|film|full|audio|video|mp3|lyrics|track|bgm|padam|pattu)\b/gi, '')
    .trim();
  const cleanQNorm = cleanQ.replace(/[^a-z0-9]/g, '');

  // 1. Exact match on featured track titles (e.g. "illuminati", "illuminati song", "hukum")
  let exactTrackSoundtrack: { st: (typeof FEATURED_SOUNDTRACKS)[0]; track: string } | null = null;
  for (const st of FEATURED_SOUNDTRACKS) {
    const matchedT = st.trackTitles?.find((t) => {
      const tNorm = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      return qNorm === tNorm || (cleanQNorm.length >= 3 && cleanQNorm === tNorm);
    });
    if (matchedT) {
      exactTrackSoundtrack = { st, track: matchedT };
      break;
    }
  }

  if (exactTrackSoundtrack) {
    const { st, track } = exactTrackSoundtrack;
    const songAnalysis: AISearchAnalysis = {
      originalQuery: query,
      correctedQuery: track,
      intent: 'song',
      movieOrAlbum: st.title,
      songName: track,
      primaryArtists: st.artistName ? [st.artistName] : [],
      language: st.genre?.split('/')[0]?.trim() || null,
      searchVariants: [track, `${track} ${st.title}`, st.title],
      isAiEnhanced: true,
    };
    supervisorCache.set(cacheKey, { data: songAnalysis, timestamp: Date.now() });
    return songAnalysis;
  }

  // 2. Exact match on featured movie/album titles (e.g. "aavesham", "aavesham songs", "jailer", "leo")
  const exactSoundtrack = FEATURED_SOUNDTRACKS.find((st) => {
    const stNorm = st.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    return qNorm === stNorm || (cleanQNorm.length >= 3 && cleanQNorm === stNorm);
  });

  if (exactSoundtrack) {
    const st = exactSoundtrack;
    const movieAnalysis: AISearchAnalysis = {
      originalQuery: query,
      correctedQuery: st.title,
      intent: 'movie',
      movieOrAlbum: st.title,
      songName: null,
      primaryArtists: st.artistName ? [st.artistName] : [],
      language: st.genre?.split('/')[0]?.trim() || null,
      searchVariants: [st.title, `${st.title} songs`, `${st.title} soundtrack`],
      isAiEnhanced: true,
    };
    supervisorCache.set(cacheKey, { data: movieAnalysis, timestamp: Date.now() });
    return movieAnalysis;
  }

  const apiKey = process.env.GEMINI_API_KEY || '';

  if (!apiKey) {
    return createFallbackAnalysis(query);
  }

  // Attempt each model with a timeout
  for (const model of CANDIDATE_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${SYSTEM_PROMPT}\n\nSearch Query: "${query}"` }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        continue; // Try next candidate model
      }

      const json = await response.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      const cleanJson = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      const analysis: AISearchAnalysis = {
        originalQuery: query,
        correctedQuery: parsed.correctedQuery || query,
        intent: parsed.intent || 'general',
        movieOrAlbum: parsed.movieOrAlbum || null,
        songName: parsed.songName || null,
        primaryArtists: Array.isArray(parsed.primaryArtists) ? parsed.primaryArtists : [],
        language: parsed.language || null,
        searchVariants: Array.isArray(parsed.searchVariants) && parsed.searchVariants.length > 0
          ? parsed.searchVariants
          : [parsed.correctedQuery || query],
        isAiEnhanced: true,
      };

      // Add to cache
      if (supervisorCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = supervisorCache.keys().next().value;
        if (oldestKey) supervisorCache.delete(oldestKey);
      }
      supervisorCache.set(cacheKey, { data: analysis, timestamp: Date.now() });

      return analysis;
    } catch {
      // If aborted or network issue on this model, proceed to next or fallback
      continue;
    }
  }

  // If all Gemini calls failed or timed out, use heuristic fallback
  const fallback = createFallbackAnalysis(query);
  return fallback;
}

function createEmptyAnalysis(raw: string): AISearchAnalysis {
  return {
    originalQuery: raw,
    correctedQuery: raw,
    intent: 'general',
    movieOrAlbum: null,
    songName: null,
    primaryArtists: [],
    language: null,
    searchVariants: [],
    isAiEnhanced: false,
  };
}

function createFallbackAnalysis(query: string): AISearchAnalysis {
  // Simple heuristic cleanup for fallback
  const cleaned = query
    .replace(/\b(songs?|movie|soundtrack|film|full|audio|video|mp3|lyrics|track|bgm)\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ');

  const variants = [query];
  if (cleaned && cleaned.toLowerCase() !== query.toLowerCase()) {
    variants.push(cleaned);
  }

  return {
    originalQuery: query,
    correctedQuery: cleaned || query,
    intent: 'general',
    movieOrAlbum: null,
    songName: null,
    primaryArtists: [],
    language: null,
    searchVariants: variants,
    isAiEnhanced: false,
  };
}
