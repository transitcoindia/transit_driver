#!/bin/bash

# This script runs BEFORE the app starts
# It builds TypeScript and generates Prisma client

set -e  # Exit on error
set -x  # Print commands (for debugging)

echo "🔨 Starting build process..."

# Navigate to app directory
cd /var/app/staging

# Verify we're in the right place
pwd
ls -la

# Install ALL dependencies (including dev for TypeScript)
echo "📦 Installing all dependencies (including dev)..."
npm install

# Generate Prisma Client FIRST (before build)
echo "🔑 Generating Prisma client..."
npx prisma generate

# Build TypeScript
echo "🔧 Building TypeScript..."
npm run build

# Verify dist folder was created
if [ ! -d "dist" ]; then
  echo "❌ ERROR: dist folder not created!"
  exit 1
fi

echo "✅ Verifying dist/app.js exists..."
if [ ! -f "dist/app.js" ]; then
  echo "❌ ERROR: dist/app.js not found!"
  ls -la dist/ || echo "dist directory doesn't exist"
  exit 1
fi

echo "✅ Build completed successfully!"
echo "📁 Dist folder contents:"
ls -la dist/


