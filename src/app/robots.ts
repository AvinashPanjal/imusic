import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://imusic-two.vercel.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/stream/', '/api/playback/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/api/stream/', '/api/playback/'],
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: ['/api/stream/', '/api/playback/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
