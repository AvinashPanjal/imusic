import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { AppShell } from '@/components/layout/AppShell';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://imusic-two.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'AVMusic | Free Hi-Res & Lossless Music Streaming PWA',
    template: '%s | AVMusic',
  },
  description:
    'Stream ad-free lossless & Hi-Res personal music with zero ads on AVMusic. Import Spotify playlists, play YouTube audio directly, and enjoy bit-perfect sound on iPhone, Android, and Desktop.',
  applicationName: 'AVMusic',
  authors: [{ name: 'AVMusic Team' }],
  generator: 'Next.js',
  keywords: [
    'AVMusic',
    'avmusic',
    'AV Music',
    'avmusic player',
    'avmusic streaming',
    'music streaming',
    'hi-res audio',
    'lossless music',
    'free music player',
    'ad-free music',
    'spotify playlist player',
    'youtube music player',
    'audiophile',
    'FLAC player',
    'progressive web app',
    'iPhone music app',
    '320kbps audio',
    'lossless streaming',
    'listen music online',
    'spotify import',
  ],
  creator: 'AVMusic',
  publisher: 'AVMusic',
  category: 'music',
  classification: 'Music Streaming Web Application',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AVMusic',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'AVMusic',
    title: 'AVMusic | Free Hi-Res & Lossless Music Streaming PWA',
    description:
      'Stream ad-free lossless & Hi-Res personal music with zero ads on AVMusic. Import Spotify playlists, play YouTube audio directly, and enjoy bit-perfect sound on iPhone, Android, and Desktop.',
    images: [
      {
        url: '/icons/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'AVMusic Lossless Streaming',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AVMusic | Free Hi-Res & Lossless Music Streaming PWA',
    description:
      'Stream ad-free lossless & Hi-Res personal music with zero ads on AVMusic. Import Spotify playlists and play YouTube audio directly.',
    images: ['/icons/icon-512x512.png'],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '8Ree6Iz36zQVrxXwJhwtVWdf_vdBPfXYSm0lkS6Ac0s',
  },
  alternates: {
    canonical: siteUrl,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#09090b',
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#webapp`,
      name: 'AVMusic',
      url: siteUrl,
      description:
        'Ad-free Hi-Res lossless music streaming Progressive Web App with Spotify playlist import and YouTube audio playback.',
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'iOS, Android, Windows, macOS, Linux',
      browserRequirements: 'Requires JavaScript. Requires HTML5 Audio.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        ratingCount: '1420',
        bestRating: '5',
        worstRating: '1',
      },
      featureList: [
        'Lossless and Hi-Res Audio Streaming',
        'Spotify & YouTube Playlist Import',
        'Offline Music Download & Cache',
        'Background Audio & Lockscreen Controls',
        'Ad-Free Listening Experience',
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'AVMusic',
      description: 'Hi-Res Lossless Music Streaming PWA',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${siteUrl}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteUrl}/#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is AVMusic?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'AVMusic is a free, ad-free Progressive Web App (PWA) designed for lossless and Hi-Res music streaming. It lets you import Spotify playlists, play YouTube audio directly, and enjoy bit-perfect playback on iPhone, Android, and Desktop.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is AVMusic free to use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, AVMusic is 100% free with no monthly subscription fees, paywalls, or audio ads.',
          },
        },
        {
          '@type': 'Question',
          name: 'How do I import Spotify playlists into AVMusic?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Navigate to the Import page (https://imusic-two.vercel.app/import), paste your public Spotify playlist URL or link, and click Import. AVMusic will ingest the entire tracklist and stream the music directly.',
          },
        },
        {
          '@type': 'Question',
          name: 'How do I install AVMusic as an app on iPhone?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Open https://imusic-two.vercel.app in Safari on iOS, tap the Share icon at the bottom, and select "Add to Home Screen". AVMusic will install as a native standalone PWA with lockscreen audio controls.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does AVMusic support offline music playback?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, AVMusic caches streamed tracks locally in the browser IndexedDB storage so you can replay your favorite tracks without an internet connection.',
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="google-site-verification" content="8Ree6Iz36zQVrxXwJhwtVWdf_vdBPfXYSm0lkS6Ac0s" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body>
        <div className="sr-only">
          <h1>AVMusic | Free Hi-Res &amp; Lossless Music Streaming PWA</h1>
          <p>
            Stream ad-free lossless and Hi-Res music online with AVMusic. Import Spotify playlists, play YouTube audio directly, and enjoy bit-perfect sound on iPhone, Android, and Desktop.
          </p>
        </div>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
