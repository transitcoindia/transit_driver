#!/bin/bash

# This script runs BEFORE the app starts
# It builds TypeScript and generates Prisma client

set -e  # Exit on error

echo "🔨 Starting build process..."

# Navigate to app directory
cd /var/app/staging

# Install dev dependencies (needed for TypeScript)
echo "📦 Installing dev dependencies..."
npm install --include=dev

# Build TypeScript
echo "🔧 Building TypeScript..."
npm run build

# Generate Prisma Client
echo "🔑 Generating Prisma client..."
npx prisma generate

echo "✅ Build completed successfully!"


