import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

const llmsContent = `# AVMusic

> Free Hi-Res & Lossless Music Streaming Progressive Web App (PWA).

AVMusic (https://avmusic.vercel.app) is an open, ad-free music streaming web application designed for audiophile bit-perfect listening on iPhone, Android, and desktop browsers. It allows users to stream high-bitrate music (up to 320kbps & lossless FLAC), import public playlists directly from Spotify and YouTube, cache tracks locally for offline playback, and control audio from their device lockscreen without subscriptions or intrusive ads.

## Core Capabilities & Features
- **Lossless & Hi-Res Audio Streaming**: Stream music with bit-perfect fidelity, up to 320 kbps AAC/MP3 and studio FLAC depth.
- **Spotify & YouTube Playlist Ingestion**: Ingest and stream any public Spotify playlist URL or YouTube music video directly without paid subscriptions or third-party downloaders.
- **Progressive Web App (PWA)**: Full standalone installation on iOS (Safari "Add to Home Screen") and Android (Chrome "Install App") with zero app store downloads.
- **100% Ad-Free Experience**: No video ads, audio pop-ups, or analytics bloatware.
- **Lockscreen & Background Audio**: Native iOS/Android MediaSession API integration offering lockscreen album art, dynamic scrubber, and play/pause controls.
- **Offline Download & Local Caching**: Cache audio tracks directly in browser IndexedDB storage for offline airplane-mode playback.
- **Custom Playlists & Favorites**: Organize music into personalized playlists and quick-access favorites.

## Key URLs & Endpoints
- Home: https://avmusic.vercel.app/
- Search: https://avmusic.vercel.app/search
- Library & Playlists: https://avmusic.vercel.app/library
- Playlist & Audio Import: https://avmusic.vercel.app/import
- Audio & Stream Settings: https://avmusic.vercel.app/settings
- XML Sitemap: https://avmusic.vercel.app/sitemap.xml
- Robots Directives: https://avmusic.vercel.app/robots.txt

## Frequently Asked Questions
- **What is AVMusic?**: AVMusic is a free web app (PWA) for streaming music in high resolution without ads, supporting Spotify playlist import and YouTube audio playback.
- **Is AVMusic free?**: Yes, AVMusic is 100% free with no monthly subscription fees.
- **How to install AVMusic on iPhone?**: Open https://avmusic.vercel.app in Safari, tap the Share button, and select "Add to Home Screen".
- **How to import Spotify playlists?**: Go to https://avmusic.vercel.app/import, paste any Spotify playlist link, and click Import to instantly stream the tracks.
`;

export async function GET() {
  return new NextResponse(llmsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
}
