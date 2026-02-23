#!/bin/sh
set -e

echo "🔧 Setting up database..."
cd /app/apps/api

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Push schema to database (creates tables if they don't exist)
echo "📦 Pushing database schema..."
npx prisma db push --accept-data-loss --skip-generate

echo "✅ Database ready"

cd /app

# Execute the CMD
exec "$@"
