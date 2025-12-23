#!/bin/bash

# Script to push Prisma schema to database on EC2
# Usage: ./push-schema-ec2.sh

echo "🚀 Pushing Prisma schema to database..."

# Make sure we're in the transit_driver directory
cd "$(dirname "$0")"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with DATABASE_URL and DIRECT_URL"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env file"
    exit 1
fi

echo "✅ Environment variables loaded"
echo "📊 Database URL: ${DATABASE_URL:0:50}..."

# Generate Prisma client (if needed)
echo "📦 Generating Prisma client..."
npx prisma generate

# Push schema to database
echo "🔄 Pushing schema to database..."
npx prisma db push --accept-data-loss

if [ $? -eq 0 ]; then
    echo "✅ Schema pushed successfully!"
else
    echo "❌ Schema push failed!"
    exit 1
fi

echo "✅ Done!"


