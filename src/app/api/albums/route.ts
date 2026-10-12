import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FEATURED_SOUNDTRACKS = [
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterHiRes = searchParams.get('hires') === 'true';

    let dbAlbums: any[] = [];
    try {
      dbAlbums = await prisma.album.findMany({
        where: filterHiRes ? { isHiRes: true } : undefined,
        include: {
          artist: true,
          _count: { select: { tracks: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    } catch (e) {
      console.warn('Could not query DB albums, falling back to featured:', e);
    }

    const formattedDb = dbAlbums.map((al) => ({
      id: al.id,
      title: al.title,
      coverImage: al.coverImage,
      releaseYear: al.releaseYear,
      genre: al.genre,
      totalTracks: al._count?.tracks || 0,
      isHiRes: al.isHiRes,
      isLossless: al.isLossless,
      artist: {
        id: al.artist?.id || 'unknown',
        name: al.artist?.name || 'Various Artists',
      },
    }));

    // Include featured soundtracks alongside DB albums
    const combined = [...formattedDb, ...FEATURED_SOUNDTRACKS];

    return NextResponse.json({ albums: combined });
  } catch (error) {
    console.error('Error fetching albums:', error);
    return NextResponse.json({ albums: FEATURED_SOUNDTRACKS });
  }
}
