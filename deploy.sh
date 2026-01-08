#!/bin/bash

# Deployment script for transit_driver service on EC2
# Usage: ./deploy.sh [--skip-schema] [--skip-install] [branch-name]

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
BRANCH="main"
SKIP_SCHEMA=false
SKIP_INSTALL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-schema)
            SKIP_SCHEMA=true
            shift
            ;;
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        *)
            BRANCH="$1"
            shift
            ;;
    esac
done

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}🚀 Transit Driver Deployment${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "Branch: ${YELLOW}$BRANCH${NC}"
echo -e "Skip Schema: ${YELLOW}$SKIP_SCHEMA${NC}"
echo -e "Skip Install: ${YELLOW}$SKIP_INSTALL${NC}"
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${CYAN}Step 1: Pulling latest code...${NC}"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"
echo -e "${GREEN}✅ Code updated${NC}"
echo ""

if [ "$SKIP_INSTALL" = false ]; then
    echo -e "${CYAN}Step 2: Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
    echo ""
fi

echo -e "${CYAN}Step 3: Generating Prisma client...${NC}"
npx prisma generate
echo -e "${GREEN}✅ Prisma client generated${NC}"
echo ""

if [ "$SKIP_SCHEMA" = false ]; then
    echo -e "${CYAN}Step 4: Pushing database schema...${NC}"
    if [ -f "./push-schema-ec2.sh" ]; then
        chmod +x ./push-schema-ec2.sh
        ./push-schema-ec2.sh
        echo -e "${GREEN}✅ Schema pushed${NC}"
    else
        echo -e "${YELLOW}⚠️  Schema script not found, skipping schema push${NC}"
    fi
    echo ""
fi

echo -e "${CYAN}Step 5: Building TypeScript...${NC}"
npm run build
echo -e "${GREEN}✅ Build complete${NC}"
echo ""

echo -e "${CYAN}Step 6: Restarting PM2 service...${NC}"
pm2 restart transit-driver
pm2 save
echo -e "${GREEN}✅ Service restarted${NC}"
echo ""

echo -e "${CYAN}Step 7: Checking service status...${NC}"
pm2 status
echo ""

echo -e "${CYAN}Recent logs:${NC}"
pm2 logs transit-driver --lines 20 --nostream
echo ""

echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "To monitor logs: ${YELLOW}pm2 logs transit-driver${NC}"
echo -e "To check status: ${YELLOW}pm2 status${NC}"
echo -e "To test health: ${YELLOW}curl http://localhost:3000/health${NC}"
echo ""

