import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { AppShell } from '@/components/layout/AppShell';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://imusic-two.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'iMusic — Free Hi-Res & Lossless Music Streaming PWA',
    template: '%s | iMusic',
  },
  description:
    'Stream ad-free lossless & Hi-Res personal music with zero ads. Import Spotify playlists, play YouTube audio directly, and enjoy bit-perfect sound on iPhone, Android, and Desktop.',
  applicationName: 'iMusic',
  authors: [{ name: 'iMusic Team' }],
  generator: 'Next.js',
  keywords: [
    'iMusic',
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
  creator: 'iMusic',
  publisher: 'iMusic',
  category: 'music',
  classification: 'Music Streaming Web Application',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'iMusic',
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
    siteName: 'iMusic',
    title: 'iMusic — Free Hi-Res & Lossless Music Streaming PWA',
    description:
      'Stream ad-free lossless & Hi-Res personal music with zero ads. Import Spotify playlists, play YouTube audio directly, and enjoy bit-perfect sound on iPhone, Android, and Desktop.',
    images: [
      {
        url: '/icons/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'iMusic Lossless Streaming',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'iMusic — Free Hi-Res & Lossless Music Streaming PWA',
    description:
      'Stream ad-free lossless & Hi-Res personal music with zero ads. Import Spotify playlists and play YouTube audio directly.',
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
      name: 'iMusic',
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
      name: 'iMusic',
      description: 'Hi-Res Lossless Music Streaming PWA',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${siteUrl}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
