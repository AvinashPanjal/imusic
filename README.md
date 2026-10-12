# iMusic: iPhone-First Ad-Free Hi-Res Music Streaming PWA

> A production-minded, mobile-first music streaming Progressive Web Application inspired by Apple Music, Spotify, and YouTube Music. Built specifically for iPhone users using Safari and the iOS **Add to Home Screen** feature.

---

## 1. Architectural Highlights

- **iPhone-First PWA Design**: Tailored for modern iPhones (iPhone 15 and comparable models) using portrait-first layouts, `100dvh`, `viewport-fit=cover`, Apple SF system typography, 44×44px touch targets, and full safe-area insets (`env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`).
- **Persistent Single Audio Engine**: Audio playback runs through a single persistent native `<audio>` element mounted in the root layout shell. Navigation between Home, Search, Library, and Player screens **never unmounts or restarts playback**.
- **Lock Screen & Control Center Integration**: Complete **Media Session API** implementation publishing multi-resolution artwork, track titles, artist credits, playback state, and responsive media actions (`play`, `pause`, `previoustrack`, `nexttrack`, `seekto`, `seekforward`, `seekbackward`).
- **Lossless & Hi-Res Output Pipeline**: Native HTTP 206 Byte-Range streaming for instant seeking in large FLAC, ALAC, AAC, and MP3 files without buffering entire files into memory. Includes verified bit-depth (16-bit, 24-bit), sample rate (44.1kHz, 48kHz, 96kHz, 192kHz), and bitrate display.
- **Legal Multi-Provider Adapter Architecture**:
  - **Authorized Private Vault**: Ingests, analyzes tags with `music-metadata`, stores in private local/S3 storage, and streams lossless audio with range requests.
  - **Open-Licensed / Creative Commons Vault**: Legal CC-BY / CC-SA audio tracks with high-resolution masters and synchronized lyrics.
  - **Commercial Catalogue Handoff**: Clean metadata and album artwork for mainstream tracks with official handoff links to Apple Music and Spotify, without pirating, ad-stripping, or circumvention.
- **PWA & Offline Vault**: PWA manifest and service worker precaching the application shell; dedicated client-side **IndexedDB storage manager** for downloading permitted tracks for offline listening without internet.
- **Synchronized Lyrics**: Timed LRC parser with automatic scrolling and active-line highlighting, with plain-lyrics fallback.
- **Strict & Clean Codebase**: Next.js 14 App Router, TypeScript in strict mode, Zustand for persistent player/queue state, clean custom CSS design tokens & CSS Modules (no Tailwind CSS).

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router), React |
| Language | TypeScript (Strict Mode) |
| Styling | Custom CSS Design Tokens & CSS Modules (`src/styles/tokens.css`, `globals.css`) |
| State Management | Zustand with localStorage / IndexedDB persistence |
| Data Layer | Prisma ORM (PostgreSQL production target + SQLite local dev) |
| Media Engine | Native HTMLAudioElement + Web Media Session API + HTTP 206 Byte-Range |
| Audio Metadata | `music-metadata` (ID3, Vorbis, FLAC tags, bit depth, sample rate, bitrate) |
| Offline Storage | IndexedDB via `idb` |
| Icons | Lucide React |
| Validation | Zod |
| Testing | Vitest |

---

## 3. Directory Structure

```
imusic/
├── prisma/
│   ├── schema.prisma          # PostgreSQL production Prisma schema
│   ├── schema.sqlite.prisma   # SQLite development Prisma schema
│   └── seed.js                # Database demonstration seed script
├── public/
│   ├── icons/                 # PWA icons (192x192, 512x512, apple-touch-icon)
│   ├── manifest.json          # Web App Manifest for iOS Standalone mode
│   └── sw.js                  # PWA service worker with app shell caching
├── scripts/
│   ├── create-sample-audio.js # Generates 24-bit/96kHz & 16-bit/44.1kHz test audio
│   ├── db-setup.js            # Automated database initialization & seed runner
│   └── generate-icons.js      # Generates PWA icon assets
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── albums/        # GET /api/albums, GET /api/albums/[id]
│   │   │   ├── artists/       # GET /api/artists, GET /api/artists/[id]
│   │   │   ├── import/        # POST /api/import (Audio metadata ingestion)
│   │   │   ├── library/       # GET/POST /api/library/favorites, recently-played
│   │   │   ├── playback/      # POST /api/playback/resolve
│   │   │   ├── playlists/     # CRUD /api/playlists
│   │   │   ├── providers/     # GET /api/providers
│   │   │   ├── search/        # GET /api/search (Multi-provider aggregator)
│   │   │   ├── settings/      # GET/PATCH /api/settings
│   │   │   └── stream/[assetId]/ # HTTP 206 Byte-Range audio streaming
│   │   ├── albums/[id]/       # Album detail page
│   │   ├── import/            # Ingestion & audio analysis interface
│   │   ├── library/           # Library tabs (Playlists, Favorites, Offline)
│   │   ├── playlists/[id]/    # Playlist detail page
│   │   ├── search/            # Debounced multi-provider search page
│   │   ├── settings/          # Quality selector & hardware guide
│   │   ├── layout.tsx         # Root layout with iOS viewport-fit=cover
│   │   └── page.tsx           # Home discovery page
│   ├── components/
│   │   ├── layout/AppShell    # Root shell hosting audio engine & nav
│   │   ├── music/             # TrackListItem, AlbumCard
│   │   ├── navigation/        # BottomNavigation (iPhone), DesktopSidebar
│   │   └── player/            # AudioEngine, MiniPlayer, FullScreenPlayer, AudioQualityBadge
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── lyrics.ts          # Synchronized LRC lyrics parser & time formatter
│   │   ├── storage.ts         # StorageService with path traversal security
│   │   ├── offline/           # OfflineDownloadManager (IndexedDB)
│   │   └── providers/         # CatalogueProvider adapters
│   ├── store/
│   │   └── playerStore.ts     # Persistent Zustand player and queue store
│   ├── styles/
│   │   ├── globals.css        # Base resets, typography, range slider styles
│   │   └── tokens.css         # Dark luxury color palette, safe areas, radii
│   └── types/
│       └── music.ts           # Core TypeScript interfaces
└── tests/                     # Unit and integration test suites
```

---

## 4. Getting Started (Local Development)

### Prerequisites
- Node.js v18.0.0 or higher
- npm v9+

### 1. Installation
Clone or navigate to the project directory and install dependencies:
```bash
cd imusic
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default `.env` configuration uses SQLite for instant local zero-configuration execution:
```env
DATABASE_URL="file:./dev.db"
STORAGE_DRIVER="local"
STORAGE_LOCAL_DIR="./storage/audio"
NEXT_PUBLIC_APP_NAME="iMusic"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_ENV="development"
AUTH_SECRET="imusic-secure-secret-key-development"
```

To use **PostgreSQL**, simply update `DATABASE_URL`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/imusic?schema=public"
```

### 3. Initialize Database & Seed Demonstration Data
Run the automated database setup script:
```bash
npm run db:setup
```
This automatically pushes the schema, generates the Prisma client, and seeds the demonstration catalogue with:
- Audiophile administrator account
- 24-bit/96kHz Hi-Res and 16-bit Lossless test audio masters
- Synchronized timed lyrics
- Albums, artists, playlists, and favorites

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. iPhone Safari & PWA Installation Guide

To install and run **iMusic** on an iPhone with the native app experience:

1. **Deploy over HTTPS** (e.g. Vercel, Render, or a local tunnel like Cloudflare Tunnel / Tailscale).
2. Open **Safari** on your iPhone and navigate to your deployed URL.
3. Tap the **Share** button in the bottom Safari toolbar (the square icon with an upward arrow).
4. Scroll down in the share sheet and tap **Add to Home Screen**.
5. Confirm the name (**iMusic**) and tap **Add**.
6. Find the **iMusic** icon on your iPhone Home Screen and tap to launch.
7. The app launches in **standalone mode**:
   - Safari URL and navigation bars are hidden.
   - The top safe area surrounds the Dynamic Island / notch.
   - The bottom navigation bar accounts for the home indicator safe area.
   - Audio continues playing when you switch between tabs or navigate within the app.

---

## 6. Technical Limitations & Honest Disclosures

### 1. Dynamic Island & iOS Media Presentation
- **How it works**: When media playback begins, iOS automatically displays the playback controls in the **Lock Screen, Control Center, and Dynamic Island** using the Web Media Session API.
- **Limitation**: Modern web PWAs running in Safari **cannot create custom native iOS Live Activities** or draw arbitrary UI onto the Dynamic Island. Any website claiming to create custom Dynamic Island widgets without a native Swift app is simulating an in-page graphic. iMusic maximizes iOS system media presentation using standard Media Session metadata.

### 2. Lossless & Hi-Res Audio Hardware Output
- **Playback**: iOS Safari streams and decodes full 24-bit/96kHz and 24-bit/192kHz FLAC audio natively via HTTP 206 byte-range requests.
- **Hardware Limitation**: All Bluetooth headphones (including AirPods Pro and AirPods Max) are bandwidth-constrained and transmit audio using AAC compression or max 24-bit/48kHz.
- **Bit-Perfect Hi-Res**: To hear authentic 24-bit/96kHz or 24-bit/192kHz output, connect a compatible **Lightning or USB-C external DAC** (Digital-to-Analog Converter) paired with wired audiophile headphones.

### 3. Mainstream Commercial Catalogues & Copyright
- **No Piracy / No Stream Ripping**: iMusic does not scrape protected DRM streams, bypass subscriptions, or remove third-party advertisements.
- **Provider Architecture**: Commercial catalogue tracks are presented with authorized metadata and official handoff buttons (e.g. *Listen on Apple Music* / *Listen on Spotify*). Full ad-free playback is provided for user-owned private files and open-licensed Creative Commons master recordings.

### 4. iOS Storage Reclamation
- **IndexedDB Offline Storage**: Downloaded tracks are stored in IndexedDB. Under extreme device storage pressure, iOS may reclaim browser storage. iMusic provides storage estimation tools (`navigator.storage.estimate()`) in Settings.

---

## 7. iPhone Verification Checklist

Use this checklist to verify production behavior on physical iOS hardware:

| Check | Expected Behavior | Tested |
|---|---|---|
| **Safe Area Insets** | Status bar / Dynamic Island and home indicator do not collide with UI buttons. | [x] |
| **Touch Targets** | All interactive controls (play, pause, next, volume, menu) are at least 44×44px. | [x] |
| **Continuous Playback** | Navigating between Home, Search, Library, and Player screens never interrupts audio. | [x] |
| **Lock Screen Controls** | Lock the iPhone screen: artwork, track title, artist, scrubber, and play/pause appear. | [x] |
| **Control Center** | Swipe down Control Center: media tile shows current track and responds to controls. | [x] |
| **Headphone Interrupt** | Unplugging headphones or disconnecting Bluetooth pauses playback immediately. | [x] |
| **Range Request Seeking** | Scrubbing the progress bar jumps immediately to target time via HTTP 206. | [x] |
| **Offline Playback** | Enable Airplane Mode with downloaded tracks: playback functions smoothly. | [x] |
| **Autoplay Policy** | App does not attempt illegal autoplay upon initial reload without user interaction. | [x] |

---

## 8. Running Automated Tests

Run the test suite with Vitest:
```bash
npm run test
```

The test suites verify:
- Zustand audio player engine, queue ordering, and repeat/shuffle logic.
- Synchronized LRC lyrics parser and MM:SS formatting.
- Catalogue provider adapter architecture and copyright capability declarations.
- Storage service path traversal protection.

---

## 9. Production Deployment

### Option A: Vercel / Next.js Managed Hosting
1. Push this repository to GitHub or GitLab.
2. Import the project into Vercel.
3. Configure Environment Variables (`DATABASE_URL`, `STORAGE_DRIVER`, `S3_*`).
4. Set Build Command: `npx prisma generate && next build`.
5. Deploy.

### Option B: Docker / Node Server
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:setup
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 10. Summary of Completed Phases

- [x] **Phase 1: Foundation**: Strict Next.js App Router, CSS token system, responsive iPhone shell, Prisma database schema (PostgreSQL & SQLite).
- [x] **Phase 2: Music Player Engine**: Decoupled persistent HTMLAudioElement, Zustand state, MiniPlayer, FullScreenPlayer, Media Session API.
- [x] **Phase 3: Music Library**: Tracks, albums, artists, playlists, favorites, history, multi-provider debounced search.
- [x] **Phase 4: Audio Quality**: FLAC/ALAC/AAC/MP3 metadata extraction (`music-metadata`), HTTP 206 Range seeking, Hi-Res quality badge, DAC popover.
- [x] **Phase 5: PWA & iOS**: Web App Manifest, Service Worker shell caching, IndexedDB offline downloads, safe-area compliance.
- [x] **Phase 6: Catalogue Integrations**: Provider adapter system (`private_library`, `open_licensed`, `commercial_handoff`).
- [x] **Phase 7: Production Readiness**: Vitest test suite, production build validation, deployment guide, iOS hardware checklist.
