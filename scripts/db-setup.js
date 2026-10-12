const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const sqliteSchemaPath = path.join(__dirname, '..', 'prisma', 'schema.sqlite.prisma');

// Read DATABASE_URL or .env
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
    if (match) dbUrl = match[1];
  }
}

console.log('Database URL configured:', dbUrl || '(none specified, defaulting to local SQLite for immediate dev)');

// If no postgres or if DATABASE_URL is SQLite, copy sqlite schema to schema.prisma
if (!dbUrl || dbUrl.startsWith('file:') || dbUrl.startsWith('sqlite')) {
  console.log('Using SQLite engine for zero-configuration local execution...');
  fs.copyFileSync(sqliteSchemaPath, schemaPath);
  process.env.DATABASE_URL = 'file:./dev.db';

  try {
    console.log('Generating Prisma Client...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('Pushing database schema...');
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });

    console.log('Seeding initial catalogue...');
    execSync('node prisma/seed.js', { stdio: 'inherit' });
    console.log('Database setup complete.');
  } catch (err) {
    console.error('Error during SQLite DB setup:', err.message);
    process.exit(1);
  }
} else {
  console.log('Using PostgreSQL database target...');
  try {
    console.log('Generating Prisma Client...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    console.log('Pushing database schema to PostgreSQL...');
    execSync('npx prisma db push', { stdio: 'inherit' });

    console.log('Seeding demonstration catalogue...');
    execSync('node prisma/seed.js', { stdio: 'inherit' });
    console.log('PostgreSQL database setup complete.');
  } catch (err) {
    console.warn('PostgreSQL connection attempt encountered:', err.message);
    console.log('Falling back to SQLite to ensure application is 100% playable out-of-the-box...');
    fs.copyFileSync(sqliteSchemaPath, schemaPath);
    process.env.DATABASE_URL = 'file:./dev.db';
    execSync('npx prisma generate', { stdio: 'inherit' });
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    execSync('node prisma/seed.js', { stdio: 'inherit' });
  }
}
