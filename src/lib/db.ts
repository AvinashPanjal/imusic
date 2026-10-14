import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Guarantee a valid SQLite file: URL on all environments (Vercel, AWS Lambda, Localhost)
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const bundledDbPath = path.join(process.cwd(), 'prisma', 'dev.db');
const serverlessDbPath = path.join('/tmp', 'dev.db');

let effectiveDbPath = bundledDbPath;

if (isServerless) {
  // On Vercel / AWS Lambda, the root filesystem is read-only. Copy bundled db to /tmp if not yet present
  try {
    if (!fs.existsSync(serverlessDbPath) && fs.existsSync(bundledDbPath)) {
      fs.copyFileSync(bundledDbPath, serverlessDbPath);
    }
  } catch (err) {
    console.warn('Failed to copy SQLite database to /tmp:', err);
  }
  effectiveDbPath = serverlessDbPath;
}

const fileUrl = `file:${effectiveDbPath}`;

// Even if Vercel has a DATABASE_URL set to postgres, Neon, or empty string, FORCE file: protocol for SQLite provider
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
  process.env.DATABASE_URL = fileUrl;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: fileUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
