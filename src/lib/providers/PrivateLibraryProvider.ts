import { CatalogueProvider, ProviderCapabilities, ProviderSearchResult } from './types';
import { prisma } from '@/lib/db';
import { TrackData } from '@/types/music';

export class PrivateLibraryProvider implements CatalogueProvider {
  public readonly code = 'private_library';
  public readonly name = 'Authorized Private Vault';
  public readonly description = 'Locally ingested Lossless & Hi-Res audio collection';

  public readonly capabilities: ProviderCapabilities = {
    canSearchMetadata: true,
    canFetchArtwork: true,
    canFetchMetadata: true,
    canPlayFullTracks: true,
    canPlayPreviews: false,
    canFetchLyrics: true,
    canDownloadCache: true,
    hasAudioQualityMetadata: true,
  };

  public getTermsNotice(): string {
    return 'Content strictly owned, purchased, or authorized by the private user for personal playback.';
  }

  public async search(query: string): Promise<ProviderSearchResult> {
    const q = query.trim();
    if (!q) {
      return {
        providerCode: this.code,
        providerName: this.name,
        tracks: [],
        albums: [],
        artists: [],
      };
    }

    const [tracks, albums, artists] = await Promise.all([
      prisma.track.findMany({
        where: {
          title: { contains: q },
        },
        include: {
          album: true,
          artists: { include: { artist: true } },
          assets: true,
        },
        take: 20,
      }),
      prisma.album.findMany({
        where: {
          title: { contains: q },
        },
        include: {
          artist: true,
        },
        take: 10,
      }),
      prisma.artist.findMany({
        where: {
          name: { contains: q },
        },
        take: 10,
      }),
    ]);

    const formattedTracks: TrackData[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      duration: t.duration,
      trackNumber: t.trackNumber,
      genre: t.genre,
      hasLyrics: t.hasLyrics,
      lyricsPlain: t.lyricsPlain,
      lyricsSynced: t.lyricsSynced,
      album: t.album
        ? {
            id: t.album.id,
            title: t.album.title,
            coverImage: t.album.coverImage,
            releaseYear: t.album.releaseYear,
            isHiRes: t.album.isHiRes,
            isLossless: t.album.isLossless,
          }
        : null,
      artists: t.artists.map((a) => ({
        id: a.artist.id,
        name: a.artist.name,
        image: a.artist.image,
      })),
      assets: t.assets.map((ast) => ({
        id: ast.id,
        trackId: ast.trackId,
        format: ast.format,
        codec: ast.codec as any,
        bitDepth: ast.bitDepth,
        sampleRate: ast.sampleRate,
        bitrate: ast.bitrate,
        fileSize: ast.fileSize ? Number(ast.fileSize) : null,
        isLossless: ast.isLossless,
        isHiRes: ast.isHiRes,
        storageType: ast.storageType as any,
        storageKey: ast.storageKey,
      })),
      providerCode: this.code,
    }));

    return {
      providerCode: this.code,
      providerName: this.name,
      tracks: formattedTracks,
      albums: albums.map((al) => ({
        id: al.id,
        title: al.title,
        coverImage: al.coverImage,
        releaseYear: al.releaseYear,
        artistName: al.artist.name,
        isHiRes: al.isHiRes,
        isLossless: al.isLossless,
      })),
      artists: artists.map((ar) => ({
        id: ar.id,
        name: ar.name,
        image: ar.image,
      })),
    };
  }

  public async getTrack(id: string): Promise<TrackData | null> {
    const t = await prisma.track.findUnique({
      where: { id },
      include: {
        album: true,
        artists: { include: { artist: true } },
        assets: true,
      },
    });

    if (!t) return null;

    return {
      id: t.id,
      title: t.title,
      duration: t.duration,
      trackNumber: t.trackNumber,
      genre: t.genre,
      hasLyrics: t.hasLyrics,
      lyricsPlain: t.lyricsPlain,
      lyricsSynced: t.lyricsSynced,
      album: t.album
        ? {
            id: t.album.id,
            title: t.album.title,
            coverImage: t.album.coverImage,
            releaseYear: t.album.releaseYear,
            isHiRes: t.album.isHiRes,
            isLossless: t.album.isLossless,
          }
        : null,
      artists: t.artists.map((a) => ({
        id: a.artist.id,
        name: a.artist.name,
        image: a.artist.image,
      })),
      assets: t.assets.map((ast) => ({
        id: ast.id,
        trackId: ast.trackId,
        format: ast.format,
        codec: ast.codec as any,
        bitDepth: ast.bitDepth,
        sampleRate: ast.sampleRate,
        bitrate: ast.bitrate,
        isLossless: ast.isLossless,
        isHiRes: ast.isHiRes,
        storageType: ast.storageType as any,
        storageKey: ast.storageKey,
      })),
      providerCode: this.code,
    };
  }

  public async getStreamUrl(id: string): Promise<string | null> {
    const asset = await prisma.audioAsset.findFirst({
      where: { trackId: id },
    });
    if (!asset) return null;
    return `/api/stream/${asset.id}`;
  }
}
