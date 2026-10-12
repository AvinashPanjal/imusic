import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { trackId: string } }
) {
  try {
    const { trackId } = params;

    const user = await prisma.user.findFirst();
    if (!user) {
      return NextResponse.json({ success: true });
    }

    await prisma.favorite.deleteMany({
      where: {
        userId: user.id,
        trackId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing favorite:', error);
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
  }
}
