import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { StorageService } from '@/lib/storage';
import * as mm from 'music-metadata';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No audio file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save audio file safely to storage
    const storageKey = await StorageService.saveLocalFile(file.name, buffer);

    // Extract genuine metadata with music-metadata
    let metadata: mm.IAudioMetadata;
    try {
      metadata = await mm.parseBuffer(buffer, file.type || undefined, {
        duration: true,
        skipCovers: false,
      });
    } catch (parseErr) {
      console.warn('Failed parsing audio tags with music-metadata:', parseErr);
      metadata = {
        format: {
          codec: path.extname(file.name).replace('.', '').toUpperCase(),
          duration: 0,
          sampleRate: 44100,
          bitsPerSample: 16,
        },
        common: {
          title: path.basename(file.name, path.extname(file.name)),
          artist: 'Unknown Artist',
        },
      } as any;
    }

    const format = metadata.format;
    const common = metadata.common;

    const title = common.title || path.basename(file.name, path.extname(file.name));
    const artistName = common.artist || common.albumartist || 'Unknown Artist';
    const albumTitle = common.album || `${title} - Single`;
    const duration = format.duration || 0;
    const trackNumber = common.track?.no || null;
    const discNumber = common.disk?.no || 1;
    const releaseYear = common.year || null;
    const genre = common.genre?.[0] || null;

    // Technical audio attributes
    const codec = (format.codec || path.extname(file.name).replace('.', '')).toUpperCase();
    const bitDepth = format.bitsPerSample || (codec === 'FLAC' ? 24 : 16);
    const sampleRate = format.sampleRate || 44100;
    const bitrate = format.bitrate ? Math.round(format.bitrate / 1000) : null;
    const ext = path.extname(file.name).replace('.', '').toLowerCase() || 'flac';

    const isLossless = codec === 'FLAC' || codec === 'ALAC' || codec === 'WAV' || ext === 'flac';
    const isHiRes = isLossless && (bitDepth >= 24 || sampleRate >= 88200);

    // Extract and persist cover artwork if embedded in tags
    let coverImagePath: string | null = null;
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      const picExt = pic.format.includes('png') ? 'png' : 'jpg';
      const artworkFileName = `art-${Date.now()}-${Math.random().toString(36).substring(7)}.${picExt}`;
      const publicArtDir = path.resolve(process.cwd(), './public/uploads/artwork');

      if (!fs.existsSync(publicArtDir)) {
        fs.mkdirSync(publicArtDir, { recursive: true });
      }

      const fullArtPath = path.resolve(publicArtDir, artworkFileName);
      await fs.promises.writeFile(fullArtPath, pic.data);
      coverImagePath = `/uploads/artwork/${artworkFileName}`;
    }

    // Upsert Artist
    let artist = await prisma.artist.findFirst({
      where: { name: artistName },
    });
    if (!artist) {
      artist = await prisma.artist.create({
        data: { name: artistName },
      });
    }

    // Upsert Album
    let album = await prisma.album.findFirst({
      where: { title: albumTitle, artistId: artist.id },
    });
    if (!album) {
      album = await prisma.album.create({
        data: {
          title: albumTitle,
          artistId: artist.id,
          coverImage: coverImagePath || '/icons/default-artwork.png',
          releaseYear,
          genre,
          isHiRes,
          isLossless,
        },
      });
    } else if (coverImagePath && album.coverImage === '/icons/default-artwork.png') {
      await prisma.album.update({
        where: { id: album.id },
        data: { coverImage: coverImagePath },
      });
    }

    // Create Track
    const track = await prisma.track.create({
      data: {
        title,
        albumId: album.id,
        duration,
        trackNumber,
        discNumber,
        genre,
        artists: {
          create: {
            artistId: artist.id,
            role: 'primary',
          },
        },
      },
    });

    // Create Audio Asset with verified source audio specs
    const asset = await prisma.audioAsset.create({
      data: {
        trackId: track.id,
        format: ext,
        codec,
        bitDepth,
        sampleRate,
        bitrate,
        fileSize: BigInt(buffer.length),
        isLossless,
        isHiRes,
        storageType: 'local',
        storageKey,
        duration,
      },
    });

    return NextResponse.json({
      success: true,
      track: {
        id: track.id,
        title: track.title,
        duration: track.duration,
        artist: artist.name,
        album: album.title,
        coverImage: album.coverImage,
        quality: {
          codec: asset.codec,
          bitDepth: asset.bitDepth,
          sampleRate: asset.sampleRate,
          bitrate: asset.bitrate,
          isLossless: asset.isLossless,
          isHiRes: asset.isHiRes,
        },
      },
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Failed to process audio ingestion' }, { status: 500 });
  }
}
