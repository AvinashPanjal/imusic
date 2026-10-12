const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding iMusic Demonstration Data ---');

  // 1. Upsert Demo Audiophile User
  const user = await prisma.user.upsert({
    where: { email: 'audiophile@imusic.local' },
    update: {},
    create: {
      email: 'audiophile@imusic.local',
      name: 'Audiophile Master',
      role: 'admin',
      settings: {
        create: {
          streamingQuality: 'hires',
          wifiStreamingQuality: 'hires',
          cellularStreamingQuality: 'high',
          downloadQuality: 'hires',
          autoCacheFavorites: true,
        },
      },
    },
  });
  console.log(`User created: ${user.email} (${user.id})`);

  // 2. Providers
  const privateProvider = await prisma.musicProvider.upsert({
    where: { code: 'private_library' },
    update: {},
    create: {
      code: 'private_library',
      name: 'Authorized Private Vault',
      description: 'Locally ingested lossless and Hi-Res personal audio files',
      supportsFullPlayback: true,
      supportsPreviews: false,
      supportsSearch: true,
      supportsLyrics: true,
      supportsDownloads: true,
      supportsHiRes: true,
      termsNotice: 'Content authorized and owned by the private user for personal streaming.',
    },
  });

  const openProvider = await prisma.musicProvider.upsert({
    where: { code: 'open_licensed' },
    update: {},
    create: {
      code: 'open_licensed',
      name: 'Creative Commons / Open Vault',
      description: 'Legally authorized open-licensed lossless audio catalogue',
      supportsFullPlayback: true,
      supportsPreviews: true,
      supportsSearch: true,
      supportsLyrics: true,
      supportsDownloads: true,
      supportsHiRes: true,
      termsNotice: 'Content licensed under Creative Commons and open cultural licenses.',
    },
  });

  const handoffProvider = await prisma.musicProvider.upsert({
    where: { code: 'commercial_handoff' },
    update: {},
    create: {
      code: 'commercial_handoff',
      name: 'Apple Music / Spotify Handoff',
      description: 'Mainstream metadata discovery with official application handoffs',
      supportsFullPlayback: false, // Explicitly declared: DRM music is not pirated
      supportsPreviews: false,
      supportsSearch: true,
      supportsLyrics: false,
      supportsDownloads: false,
      supportsHiRes: true,
      termsNotice: 'Commercial music is protected by copyright. Tap to open in authorized official apps.',
    },
  });
  console.log('Configured catalogue providers.');

  // 3. Artists
  const artist1 = await prisma.artist.create({
    data: {
      name: 'Aura Soundscapes',
      bio: 'Electronic and acoustic soundscapes mastered in 24-bit/96kHz high resolution.',
      verified: true,
    },
  });

  const artist2 = await prisma.artist.create({
    data: {
      name: 'Nocturne Symphony',
      bio: 'Neo-classical instrumental ensemble performing studio-recorded lossless pieces.',
      verified: true,
    },
  });

  const artist3 = await prisma.artist.create({
    data: {
      name: 'Velvet Resonance',
      bio: 'Warm organic jazz rhythms recorded direct to 2-track master tape.',
      verified: true,
    },
  });

  // 4. Albums
  const album1 = await prisma.album.create({
    data: {
      title: 'Ethereal Harmonics (Hi-Res Master)',
      artistId: artist1.id,
      releaseYear: 2024,
      genre: 'Ambient / Neo-Classical',
      isHiRes: true,
      isLossless: true,
      recordLabel: 'Pristine Audio Labs',
      coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
    },
  });

  const album2 = await prisma.album.create({
    data: {
      title: 'Midnight Reverie (Studio Master)',
      artistId: artist2.id,
      releaseYear: 2023,
      genre: 'Modern Classical',
      isHiRes: false,
      isLossless: true,
      recordLabel: 'Vault Recordings',
      coverImage: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
    },
  });

  // 5. Tracks & Audio Assets
  // Track 1: Hi-Res 24-bit/96kHz Track
  const track1 = await prisma.track.create({
    data: {
      title: 'Resonance of Light (24-bit/96kHz Master)',
      albumId: album1.id,
      duration: 180,
      trackNumber: 1,
      genre: 'Ambient',
      hasLyrics: true,
      lyricsSynced: `[00:00.00] (Pristine 24-bit overture begins)
[00:10.00] Harmonics rising in the quiet night
[00:24.00] Vibrations traveling through time
[00:40.00] Pure sound with limitless headroom
[01:00.00] Clear as morning light
[01:25.00] Echoes in twenty-four bits
[01:50.00] Fading into gentle silence`,
      lyricsPlain: 'Harmonics rising in the quiet night\nVibrations traveling through time\nPure sound with limitless headroom\nClear as morning light\nEchoes in twenty-four bits\nFading into gentle silence',
      artists: {
        create: { artistId: artist1.id, role: 'primary' },
      },
      assets: {
        create: {
          format: 'wav',
          codec: 'FLAC',
          bitDepth: 24,
          sampleRate: 96000,
          bitrate: 4608,
          isLossless: true,
          isHiRes: true,
          storageType: 'local',
          storageKey: 'sample-hires-96k-24b.wav',
          duration: 180,
        },
      },
    },
  });

  // Track 2: Lossless 16-bit/44.1kHz Track
  const track2 = await prisma.track.create({
    data: {
      title: 'Nocturne in C Minor (Lossless Studio)',
      albumId: album2.id,
      duration: 210,
      trackNumber: 1,
      genre: 'Neo-Classical',
      hasLyrics: true,
      lyricsSynced: `[00:00.00] (Violin & Piano introduction)
[00:15.00] Shadows stretching along the corridor
[00:32.00] An ancient melody finds its voice
[00:55.00] Crescendo in pure acoustic depth
[01:20.00] Subtle piano hammer strikes
[01:45.00] Resolution in the final chord`,
      artists: {
        create: { artistId: artist2.id, role: 'primary' },
      },
      assets: {
        create: {
          format: 'wav',
          codec: 'FLAC',
          bitDepth: 16,
          sampleRate: 44100,
          bitrate: 1411,
          isLossless: true,
          isHiRes: false,
          storageType: 'local',
          storageKey: 'sample-lossless-44k-16b.wav',
          duration: 210,
        },
      },
    },
  });

  // Track 3: High Bitrate Electronic Stream
  const track3 = await prisma.track.create({
    data: {
      title: 'Neon Odyssey (Studio Master)',
      albumId: album1.id,
      duration: 245,
      trackNumber: 2,
      genre: 'Electronic',
      artists: {
        create: { artistId: artist3.id, role: 'primary' },
      },
      assets: {
        create: {
          format: 'flac',
          codec: 'FLAC',
          bitDepth: 24,
          sampleRate: 48000,
          bitrate: 1650,
          isLossless: true,
          isHiRes: true,
          storageType: 'remote_stream',
          storageKey: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/menu.ogg',
          duration: 245,
        },
      },
    },
  });

  // 6. Playlists
  const playlist1 = await prisma.playlist.create({
    data: {
      title: 'Audiophile Reference Vault',
      description: 'Hand-picked 24-bit Hi-Res masters for critical listening and DAC evaluation.',
      userId: user.id,
      tracks: {
        create: [
          { trackId: track1.id, position: 0 },
          { trackId: track2.id, position: 1 },
          { trackId: track3.id, position: 2 },
        ],
      },
    },
  });

  // 7. Favorite
  await prisma.favorite.create({
    data: {
      userId: user.id,
      trackId: track1.id,
    },
  });

  console.log('Created playlist and favorites.');
  console.log('--- Demonstration Database Seed Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
