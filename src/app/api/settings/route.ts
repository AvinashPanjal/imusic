import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const SettingsSchema = z.object({
  streamingQuality: z.enum(['auto', 'standard', 'high', 'lossless', 'hires']).optional(),
  wifiStreamingQuality: z.enum(['auto', 'standard', 'high', 'lossless', 'hires']).optional(),
  cellularStreamingQuality: z.enum(['auto', 'standard', 'high', 'lossless', 'hires']).optional(),
  downloadQuality: z.enum(['standard', 'high', 'lossless', 'hires']).optional(),
  theme: z.string().optional(),
  autoCacheFavorites: z.boolean().optional(),
  offlineMode: z.boolean().optional(),
});

export async function GET() {
  try {
    let user = await prisma.user.findFirst({
      include: { settings: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'listener@imusic.local',
          name: 'Audiophile',
          settings: {
            create: {
              streamingQuality: 'auto',
              wifiStreamingQuality: 'hires',
              cellularStreamingQuality: 'high',
              downloadQuality: 'lossless',
            },
          },
        },
        include: { settings: true },
      });
    }

    if (!user.settings) {
      const settings = await prisma.userSettings.create({
        data: {
          userId: user.id,
          streamingQuality: 'auto',
        },
      });
      return NextResponse.json({ settings });
    }

    return NextResponse.json({ settings: user.settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.issues }, { status: 400 });
    }

    const user = await prisma.user.findFirst();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updated = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...parsed.data,
      },
      update: parsed.data,
    });

    return NextResponse.json({ settings: updated });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
