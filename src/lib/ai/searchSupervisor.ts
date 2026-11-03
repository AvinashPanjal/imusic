/**
 * AI Search Supervisor (powered by Google Gemini)
 *
 * Provides intelligent query correction, intent classification (movie soundtrack vs.
 * specific song vs. artist), Indian language / transliteration understanding (Malayalam,
 * Tamil, Hindi, Telugu, etc.), and multi-query variant generation for 100% accurate search.
 */

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
const TIMEOUT_MS = 2200; // 2.2 seconds max timeout before fast fallback

interface CacheEntry {
  data: AISearchAnalysis;
  timestamp: number;
}

const supervisorCache = new Map<string, CacheEntry>();

const CANDIDATE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
];

const SYSTEM_PROMPT = `You are the AI Music Search Supervisor for iMusic, an audio streaming app specializing in Indian (Malayalam, Tamil, Hindi, Telugu, Kannada) and Global music.

Analyze the user's music search query. Users frequently make typos, use casual transliteration (Manglish, Tanglish, Hinglish), or search by movie title instead of song title.

Rules:
1. Identify any typos or phonetic misspellings (e.g. "manjumel" -> "Manjummel Boys", "aveshm" -> "Aavesham", "bethleham kudba" -> "Bethlehem Kudumba Unit", "aniruth" -> "Anirudh", "illay illa" -> "Illey Illa").
2. Extract the canonical "movieOrAlbum" name if the query refers to a film or soundtrack. Strip words like "songs", "movie", "padam", "pattu", "track".
3. Extract "songName" if a specific track is requested (or null if searching for a whole movie/artist).
4. Extract "primaryArtists" if singers or composers are mentioned or strongly associated (e.g., Sushin Shyam for Aavesham / Manjummel Boys).
5. Specify "language" (Malayalam, Tamil, Hindi, Telugu, English, etc.).
6. Generate 2-4 clean "searchVariants" optimized for music APIs (JioSaavn, YouTube, Spotify catalog searches).
7. "correctedQuery": Clean, human-readable corrected title.

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

      const parsed = JSON.parse(text);

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
