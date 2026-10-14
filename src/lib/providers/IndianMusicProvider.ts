import { CatalogueProvider, ProviderCapabilities, ProviderSearchResult } from './types';
import { TrackData, AlbumSummary } from '@/types/music';
import { findMatchingFeaturedSoundtracks, cleanSongTitle, fuzzyMatch } from '@/lib/constants/soundtracks';
import CryptoJS from 'crypto-js';

const SAAVN_API_BASE = 'https://www.jiosaavn.com/api.php';
const DES_KEY = '38346591';

export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

export function normalizeSearchText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/zh/g, 'l')
    .replace(/sh/g, 's')
    .replace(/th/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

export function cleanQuery(q: string): string {
  if (!q) return '';
  return q
    .replace(/\b(songs?|movie|soundtrack|film|full|audio|video|mp3|lyrics|track|bgm)\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getQueryVariants(q: string): string[] {
  const trimmed = q.trim();
  const cleaned = cleanQuery(trimmed);
  const variants = new Set<string>([trimmed]);
  if (cleaned && cleaned.length >= 2 && cleaned.toLowerCase() !== trimmed.toLowerCase()) {
    variants.add(cleaned);
  }

  const bases = Array.from(variants);
  for (const b of bases) {
    const lower = b.toLowerCase();

    // Universal bidirectional 'the' prefix handling
    if (/^the\s+/i.test(b)) {
      variants.add(b.replace(/^the\s+/i, '').trim());
    } else {
      variants.add(`the ${b}`.trim());
    }

    // Specific canonicalization for Life of Prince / Prince And Family
    if (lower.includes('life of prince')) {
      variants.add('the life of prince');
      variants.add('prince and family');
      variants.add('the life of prince maayunnallo');
    }
    if (lower.includes('prince and family')) {
      variants.add('the life of prince');
    }

    // Specific canonicalization for Bethlehem Kudumba Unit
    if (lower.includes('bethleham')) {
      variants.add(b.replace(/bethleham/gi, 'bethlehem'));
    }
    if (lower.includes('kudba')) {
      variants.add(b.replace(/kudba/gi, 'kudumba'));
    }
    if (lower.includes('bethlehem') && !lower.includes('kudumba')) {
      variants.add('bethlehem kudumba unit');
    }
    if (lower.includes('kudumba') && !lower.includes('bethlehem')) {
      variants.add('bethlehem kudumba unit');
    }

    // Song title variants: Illey Illa / Ille Illa
    if (lower.includes('illey illa') || lower.includes('ille illa') || lower.includes('illeyilla')) {
      variants.add('illey illa');
      variants.add('ille illa');
      variants.add('bethlehem kudumba unit');
    }

    // Song title variants: Maanthrikam / Manthrikam
    if (lower.includes('maanthrikam')) {
      variants.add(b.replace(/maanthrikam/gi, 'manthrikam'));
    } else if (lower.includes('manthrikam')) {
      variants.add(b.replace(/manthrikam/gi, 'maanthrikam'));
    }

    // Known Indian regional transliteration differences
    if (lower.includes('indrajalam')) {
      variants.add(b.replace(/indrajalam/gi, 'indrajaalam'));
      variants.add('indra jaalam');
    }
    if (lower.includes('indrajaalam')) {
      variants.add(b.replace(/indrajaalam/gi, 'indrajalam'));
      variants.add('indra jaalam');
    }
    if (lower.includes('indra jaalam')) {
      variants.add(b.replace(/indra jaalam/gi, 'indrajaalam'));
    }
    if (lower.includes('avesham')) {
      variants.add(b.replace(/avesham/gi, 'aavesham'));
    }
    if (lower.includes('aavesham')) {
      variants.add(b.replace(/aavesham/gi, 'avesham'));
    }
    if (lower.includes('kudumbam')) {
      variants.add(b.replace(/kudumbam/gi, 'kudumba'));
    }

    // Broad double 'a' phonetic expansion (e.g., indrajalam <-> indrajaalam)
    if (lower.includes('aa')) {
      variants.add(b.replace(/aa/gi, 'a'));
    } else if (/a[b-z]a/i.test(b)) {
      variants.add(b.replace(/a/i, 'aa'));
    }
  }

  return Array.from(variants).slice(0, 6);
}

export function decryptMediaUrl(encryptedUrl: string | undefined | null): string | null {
  if (!encryptedUrl) return null;
  try {
    const key = CryptoJS.enc.Utf8.parse(DES_KEY);
    const decrypted = CryptoJS.DES.decrypt(encryptedUrl, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const rawUrl = decrypted.toString(CryptoJS.enc.Utf8);
    if (!rawUrl || !rawUrl.startsWith('http')) return null;

    // Prefer high-fidelity 320kbps stream
    return rawUrl.replace(/_96\.mp4/, '_320.mp4');
  } catch (err) {
    console.warn('Failed decrypting Saavn media URL:', err);
    return null;
  }
}

export class IndianMusicProvider implements CatalogueProvider {
  public readonly code = 'indian_music_vault';
  public readonly name = 'Global & Indian Music Vault (Tamil, Malayalam, Hindi, English)';
  public readonly description = 'Over 50 million latest Indian and Global tracks with 320kbps in-app streaming';

  public readonly capabilities: ProviderCapabilities = {
    canSearchMetadata: true,
    canFetchArtwork: true,
    canFetchMetadata: true,
    canPlayFullTracks: true,
    canPlayPreviews: false,
    canFetchLyrics: false,
    canDownloadCache: true,
    hasAudioQualityMetadata: true,
  };

  public getTermsNotice(): string {
    return 'Direct 320kbps high-quality audio streams for personal ad-free playback.';
  }

  public async search(query: string): Promise<ProviderSearchResult> {
    const q = query.trim();

    try {
      const queriesToRun = q
        ? getQueryVariants(q)
        : [
            'Bethlehem Kudumba Unit',
            'Indrajaalam',
            'Latest Malayalam Hits',
            'Tamil Trending Hits',
            'Latest Hindi Hits',
            'The Weeknd Trending',
          ];

      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      };

      // Fetch songs, albums, and autocomplete across query variants in parallel
      const searchPromises = queriesToRun.map(async (searchQuery) => {
        const songUrl = `${SAAVN_API_BASE}?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=35&q=${encodeURIComponent(
          searchQuery
        )}`;

        const albumUrl = `${SAAVN_API_BASE}?__call=search.getAlbumResults&_format=json&_marker=0&cc=in&p=1&n=20&q=${encodeURIComponent(
          searchQuery
        )}`;

        const autoUrl = `${SAAVN_API_BASE}?__call=autocomplete.get&_format=json&_marker=0&cc=in&query=${encodeURIComponent(
          searchQuery
        )}`;

        const [songRes, albumRes, autoRes] = await Promise.all([
          fetch(songUrl, { headers }).catch(() => null),
          fetch(albumUrl, { headers }).catch(() => null),
          fetch(autoUrl, { headers }).catch(() => null),
        ]);

        let rawSongs: any[] = [];
        let rawAlbums: any[] = [];
        let autoJson: any = null;

        if (songRes && songRes.ok) {
          const json = await songRes.json().catch(() => ({}));
          rawSongs = json.results || [];
        }

        if (albumRes && albumRes.ok) {
          const json = await albumRes.json().catch(() => ({}));
          rawAlbums = json.results || [];
        }

        if (autoRes && autoRes.ok) {
          autoJson = await autoRes.json().catch(() => null);
        }

        return { rawSongs, rawAlbums, autoJson };
      });

      const batchResults = await Promise.all(searchPromises);
      let rawResults = batchResults.flatMap((b) => b.rawSongs);
      let rawAlbumResults = batchResults.flatMap((b) => b.rawAlbums);

      // Prepend any featured/blockbuster soundtracks matching query with fuzzy matching
      const matchingFeatured = findMatchingFeaturedSoundtracks(q);
      for (const st of matchingFeatured) {
        rawAlbumResults.unshift({
          albumid: st.id.replace('saavn-album-', ''),
          title: st.title,
          image: st.coverImage,
          music: st.artistName,
          year: String(st.releaseYear || 2026),
        });
      }

      // Extract complete tracklists from top matching albums (both featured and dynamic movie album search results)
      const albumsToFetch = [
        ...matchingFeatured.map((st) => st.id.replace('saavn-album-', '')),
        ...rawAlbumResults.map((al) => al.albumid).filter(Boolean),
      ].slice(0, 3);

      if (albumsToFetch.length > 0) {
        const albumFetchPromises = albumsToFetch.map(async (albumId) => {
          const albumUrl = `${SAAVN_API_BASE}?__call=content.getAlbumDetails&_format=json&_marker=0&cc=in&albumid=${encodeURIComponent(
            albumId
          )}`;
          try {
            const res = await fetch(albumUrl, { headers }).then((r) => r.json());
            return (res.songs || []) as any[];
          } catch {
            return [];
          }
        });

        const albumSongBatches = await Promise.all(albumFetchPromises);
        for (const songs of albumSongBatches) {
          rawResults.unshift(...songs);
        }
      }

      // Process autocomplete results from all query variants
      const topSongIdsToFetch = new Set<string>();
      for (const b of batchResults) {
        if (!b.autoJson) continue;

        // Process topquery (highest confidence entity from JioSaavn)
        const topQuery = (b.autoJson.topquery?.data || []) as any[];
        for (const tq of topQuery) {
          if (tq.type === 'song' && tq.id) {
            topSongIdsToFetch.add(tq.id);
          } else if (tq.type === 'album' && tq.id) {
            rawAlbumResults.unshift({
              albumid: tq.id,
              title: tq.title,
              image: tq.image,
              music: tq.music || tq.description,
              year: tq.more_info?.year || '2024',
            });
          }
        }

        // Process autocomplete albums
        const autoAlbums = (b.autoJson.albums?.data || []) as any[];
        if (autoAlbums.length > 0) {
          const formattedAutoAlbums = autoAlbums.map((al) => ({
            albumid: al.id,
            title: al.title,
            image: al.image,
            music: al.music,
            year: al.more_info?.year || '2024',
          }));
          rawAlbumResults = [...formattedAutoAlbums, ...rawAlbumResults];
        }

        // Collect autocomplete song IDs
        const autoSongs = (b.autoJson.songs?.data || []) as any[];
        for (const s of autoSongs) {
          if (s.id) topSongIdsToFetch.add(s.id);
        }
      }

      // Batch fetch full details for any top autocomplete song IDs not already fully populated
      const existingSongIds = new Set(rawResults.map((s) => s.id));
      const missingSongIds = Array.from(topSongIdsToFetch).filter(
        (id) => !existingSongIds.has(id)
      );

      if (missingSongIds.length > 0) {
        try {
          const pidsUrl = `${SAAVN_API_BASE}?__call=song.getDetails&_format=json&_marker=0&cc=in&pids=${encodeURIComponent(
            missingSongIds.join(',')
          )}`;
          const pidsRes = await fetch(pidsUrl, { headers })
            .then((r) => r.json())
            .catch(() => ({}));

          for (const id of missingSongIds) {
            if (pidsRes[id]) {
              rawResults.unshift(pidsRes[id]);
            }
          }
        } catch {
          // Ignore
        }
      }

      // Process and deduplicate songs
      const seenIds = new Set<string>();
      const tracks: TrackData[] = [];

      for (const item of rawResults) {
        if (!item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        const streamUrl = decryptMediaUrl(item.encrypted_media_url);
        if (!streamUrl) continue;

        const title = decodeHtmlEntities(item.song || item.title || 'Unknown Track');
        const albumName = decodeHtmlEntities(item.album || title);
        const artistNames = decodeHtmlEntities(
          item.primary_artists || item.singers || item.music || 'Various Artists'
        );

        const rawCover = item.image || '';
        const highResArtwork = rawCover
          ? rawCover.replace(/150x150\.jpg$/, '500x500.jpg').replace(/50x50\.jpg$/, '500x500.jpg')
          : '/icons/default-artwork.png';

        const year = parseInt(item.year, 10) || new Date().getFullYear();
        const duration = parseInt(item.duration, 10) || 210;
        const playCount = parseInt(item.play_count, 10) || 0;

        tracks.push({
          id: `saavn-${item.id}`,
          title,
          duration,
          genre: `${item.language ? item.language.toUpperCase() : 'GLOBAL'} / Soundtrack`,
          playCount,
          album: {
            id: `saavn-album-${item.albumid || item.id}`,
            title: albumName,
            coverImage: highResArtwork,
            artistName: artistNames,
            releaseYear: year,
            isHiRes: false,
            isLossless: true,
          },
          artists: artistNames.split(',').map((name, i) => ({
            id: `saavn-art-${item.id}-${i}`,
            name: name.trim(),
          })),
          assets: [
            {
              id: `saavn-asset-${item.id}`,
              trackId: `saavn-${item.id}`,
              format: 'mp4',
              codec: 'AAC',
              bitDepth: 16,
              sampleRate: 44100,
              bitrate: 320,
              isLossless: true,
              isHiRes: false,
              storageType: 'remote_stream',
              storageKey: streamUrl,
            },
          ],
          streamUrl,
          providerCode: this.code,
        });
      }

      // Score and rank tracks with Spotify-grade relevance
      const stripLeadingArticles = (s: string) => s.toLowerCase().replace(/^(the|a|an)\s+/i, '').trim();
      const qNoArticle = stripLeadingArticles(q);
      const normQ = normalizeSearchText(q);
      const normQNoArticle = normalizeSearchText(qNoArticle);
      const cleanNormQ = normalizeSearchText(cleanQuery(qNoArticle || q));

      if (normQ) {
        const scoredTracks = tracks.map((track) => {
          const rawCleanTitle = cleanSongTitle(track.title);
          const cleanNoArticle = stripLeadingArticles(rawCleanTitle);
          const baseTitleNoArticle = cleanNoArticle.split('-')[0].trim();

          const normBaseNoArticle = normalizeSearchText(baseTitleNoArticle);
          const normCleanNoArticle = normalizeSearchText(cleanNoArticle);
          const normCleanTitle = normalizeSearchText(rawCleanTitle);
          const normFullTitle = normalizeSearchText(track.title);
          const normAlbum = normalizeSearchText(track.album?.title || '');
          let score = 0;

          // 1. Exact base or clean title match without leading articles
          if (normBaseNoArticle === normQNoArticle || (cleanNormQ && normBaseNoArticle === cleanNormQ)) {
            score += 500;
          } else if (normCleanNoArticle === normQNoArticle || (cleanNormQ && normCleanNoArticle === cleanNormQ)) {
            score += 450;
          } else if (normCleanTitle === normQ || (cleanNormQ && normCleanTitle === cleanNormQ)) {
            score += 350;
          } else if (normBaseNoArticle.startsWith(normQNoArticle) || normCleanNoArticle.startsWith(normQNoArticle)) {
            score += 260;
          } else if (normCleanTitle.startsWith(normQ) || (cleanNormQ && normCleanTitle.startsWith(cleanNormQ))) {
            score += 200;
          } else if (normCleanNoArticle.includes(normQNoArticle)) {
            score += 150;
          } else if (normCleanTitle.includes(normQ) || (cleanNormQ && normCleanTitle.includes(cleanNormQ))) {
            score += 120;
          } else if (normFullTitle === normQ || (cleanNormQ && normFullTitle === cleanNormQ)) {
            score += 250;
          } else if (normFullTitle.startsWith(normQ) || (cleanNormQ && normFullTitle.startsWith(cleanNormQ))) {
            score += 150;
          } else if (normFullTitle.includes(normQ) || (cleanNormQ && normFullTitle.includes(cleanNormQ))) {
            score += 70;
          } else if (fuzzyMatch(rawCleanTitle, q)) {
            score += 160;
          } else if (fuzzyMatch(track.title, q)) {
            score += 100;
          }

          // Penalize instrumentals / karaoke / covers unless user searched for them
          const qLower = q.toLowerCase();
          if (!qLower.includes('instrumental') && track.title.toLowerCase().includes('instrumental')) {
            score -= 250;
          }
          if (!qLower.includes('karaoke') && track.title.toLowerCase().includes('karaoke')) {
            score -= 250;
          }
          if (!qLower.includes('cover') && track.title.toLowerCase().includes('cover')) {
            score -= 100;
          }

          // 2. Album match bonus
          if (normAlbum === normQ || (cleanNormQ && normAlbum === cleanNormQ)) {
            score += 70;
          } else if (normAlbum.startsWith(normQ) || (cleanNormQ && normAlbum.startsWith(cleanNormQ))) {
            score += 45;
          } else if (normAlbum.includes(normQ) || (cleanNormQ && normAlbum.includes(cleanNormQ))) {
            score += 25;
          } else if (fuzzyMatch(track.album?.title || '', q)) {
            score += 40;
          }

          // 3. Artist match bonus
          const artistMatch = track.artists?.some((a) => {
            const normA = normalizeSearchText(a.name);
            return normA.includes(normQ) || normQ.includes(normA) || fuzzyMatch(a.name, q);
          });
          if (artistMatch) {
            score += 35;
          }

          // 4. Popularity / stream count weighting (log scale)
          const plays = track.playCount || 0;
          if (plays > 0) {
            score += Math.log10(plays + 1) * 12;
          }

          // 5. Recency bonus for latest releases (e.g. 2026/2024 hits)
          if (track.album?.releaseYear) {
            if (track.album.releaseYear >= 2026) {
              score += 30;
            } else if (track.album.releaseYear >= 2024) {
              score += 18;
            } else {
              score += Math.max(0, (track.album.releaseYear - 1980) * 0.1);
            }
          }

          return { track, score };
        });

        scoredTracks.sort((a, b) => b.score - a.score);
        tracks.length = 0;
        tracks.push(...scoredTracks.map((st) => st.track));
      }

      // Process and deduplicate movie albums
      const seenAlbumIds = new Set<string>();
      const albums: AlbumSummary[] = [];

      for (const al of rawAlbumResults) {
        if (!al.albumid || seenAlbumIds.has(al.albumid)) continue;
        seenAlbumIds.add(al.albumid);

        const rawCover = al.image || '';
        const highResCover = rawCover
          ? rawCover.replace(/150x150\.jpg$/, '500x500.jpg')
          : '/icons/default-artwork.png';

        albums.push({
          id: `saavn-album-${al.albumid}`,
          title: decodeHtmlEntities(al.title),
          coverImage: highResCover,
          artistName: decodeHtmlEntities(al.music || al.primary_artists || 'Soundtrack'),
          releaseYear: parseInt(al.year, 10) || 2024,
          isLossless: true,
          isHiRes: false,
        });
      }

      // Score and rank albums with Spotify-grade relevance
      if (normQ) {
        const scoredAlbums = albums.map((album) => {
          const normTitle = normalizeSearchText(album.title);
          let score = 0;

          if (normTitle === normQ || (cleanNormQ && normTitle === cleanNormQ)) {
            score += 120;
          } else if (normTitle.startsWith(normQ) || (cleanNormQ && normTitle.startsWith(cleanNormQ))) {
            score += 70;
          } else if (normTitle.includes(normQ) || (cleanNormQ && normTitle.includes(cleanNormQ))) {
            score += 40;
          }

          if (album.releaseYear) {
            if (album.releaseYear >= 2026) score += 20;
            else if (album.releaseYear >= 2024) score += 10;
          }

          return { album, score };
        });

        scoredAlbums.sort((a, b) => b.score - a.score);
        albums.length = 0;
        albums.push(...scoredAlbums.map((sa) => sa.album));
      }

      const artists = tracks.flatMap((t) => t.artists);

      return {
        providerCode: this.code,
        providerName: this.name,
        tracks,
        albums,
        artists,
      };
    } catch (err) {
      console.error('Music search error:', err);
      return {
        providerCode: this.code,
        providerName: this.name,
        tracks: [],
        albums: [],
        artists: [],
      };
    }
  }

  public async getTrack(id: string): Promise<TrackData | null> {
    const rawId = id.replace(/^saavn-/, '');
    try {
      const url = `${SAAVN_API_BASE}?__call=song.getDetails&pids=${encodeURIComponent(
        rawId
      )}&_format=json&_marker=0&cc=in`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const item = json[rawId];
      if (!item) return null;

      const streamUrl = decryptMediaUrl(item.encrypted_media_url);
      if (!streamUrl) return null;

      const title = decodeHtmlEntities(item.song || item.title || 'Unknown Track');
      const albumName = decodeHtmlEntities(item.album || title);
      const artistNames = decodeHtmlEntities(
        item.primary_artists || item.singers || item.music || 'Various Artists'
      );
      const highResArtwork = (item.image || '').replace(/150x150\.jpg$/, '500x500.jpg');

      return {
        id: `saavn-${item.id}`,
        title,
        duration: parseInt(item.duration, 10) || 210,
        genre: `${item.language ? item.language.toUpperCase() : 'GLOBAL'}`,
        album: {
          id: `saavn-album-${item.albumid}`,
          title: albumName,
          coverImage: highResArtwork,
          artistName: artistNames,
          releaseYear: parseInt(item.year, 10) || 2024,
        },
        artists: artistNames.split(',').map((name, i) => ({
          id: `saavn-art-${item.id}-${i}`,
          name: name.trim(),
        })),
        assets: [
          {
            id: `saavn-asset-${item.id}`,
            trackId: `saavn-${item.id}`,
            format: 'mp4',
            codec: 'AAC',
            bitrate: 320,
            isLossless: true,
            isHiRes: false,
            storageType: 'remote_stream',
            storageKey: streamUrl,
          },
        ],
        streamUrl,
        providerCode: this.code,
      };
    } catch {
      return null;
    }
  }

  public async getStreamUrl(id: string): Promise<string | null> {
    const track = await this.getTrack(id);
    return track?.streamUrl || null;
  }
}
