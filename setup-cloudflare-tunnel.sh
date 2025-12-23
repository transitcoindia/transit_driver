#!/bin/bash

# Cloudflare Tunnel Setup Script for Transit Driver Service
# Run this script on your EC2 instance

set -e  # Exit on error

echo "=========================================="
echo "Cloudflare Tunnel Setup for Transit Driver"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "Please don't run as root. Run as ec2-user."
   exit 1
fi

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check if cloudflared is installed
echo -e "${YELLOW}Step 1: Checking cloudflared installation...${NC}"
if ! command -v cloudflared &> /dev/null; then
    echo "cloudflared not found. Installing..."
    
    # Detect OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        echo -e "${RED}Unable to detect OS${NC}"
        exit 1
    fi
    
    # Install based on OS
    if [ "$OS" == "amzn" ] || [ "$OS" == "rhel" ] || [ "$OS" == "fedora" ]; then
        echo "Installing cloudflared for Amazon Linux/RHEL..."
        cd /tmp
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm
        sudo yum install -y ./cloudflared-linux-x86_64.rpm
        rm -f ./cloudflared-linux-x86_64.rpm
    elif [ "$OS" == "ubuntu" ] || [ "$OS" == "debian" ]; then
        echo "Installing cloudflared for Ubuntu/Debian..."
        cd /tmp
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i ./cloudflared-linux-amd64.deb || sudo apt-get install -f -y
        rm -f ./cloudflared-linux-amd64.deb
    else
        echo -e "${RED}Unsupported OS: $OS${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}cloudflared is already installed${NC}"
fi

cloudflared --version
echo ""

# Step 2: Check if already authenticated
echo -e "${YELLOW}Step 2: Checking authentication...${NC}"
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
    echo -e "${YELLOW}Not authenticated. You need to authenticate manually:${NC}"
    echo "Run: cloudflared tunnel login"
    echo "This will open a browser or give you a URL to visit."
    echo ""
    read -p "Press Enter after you've authenticated..."
else
    echo -e "${GREEN}Already authenticated${NC}"
fi
echo ""

# Step 3: Check if tunnel exists
echo -e "${YELLOW}Step 3: Checking for existing tunnel...${NC}"
TUNNEL_NAME="transit-driver"
TUNNEL_ID=$(cloudflared tunnel list --output json 2>/dev/null | grep -o "\"$TUNNEL_NAME\"[^}]*\"id\":\"[^\"]*" | grep -o '[a-f0-9-]\{36\}' | head -1)

if [ -z "$TUNNEL_ID" ]; then
    echo "Creating new tunnel: $TUNNEL_NAME"
    TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME")
    TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -o '[a-f0-9-]\{36\}' | head -1)
    echo -e "${GREEN}Tunnel created with ID: $TUNNEL_ID${NC}"
else
    echo -e "${GREEN}Tunnel already exists: $TUNNEL_NAME ($TUNNEL_ID)${NC}"
fi
echo ""

# Step 4: Create configuration directory
echo -e "${YELLOW}Step 4: Creating configuration...${NC}"
mkdir -p "$HOME/.cloudflared"

# Create config file
CONFIG_FILE="$HOME/.cloudflared/config.yml"
cat > "$CONFIG_FILE" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json

ingress:
  # Route api.transitco.in to localhost:3000
  - hostname: api.transitco.in
    service: http://localhost:3000
  
  # Catch-all rule (must be last)
  - service: http_status:404
EOF

echo -e "${GREEN}Configuration file created: $CONFIG_FILE${NC}"
echo ""

# Validate configuration
echo -e "${YELLOW}Validating configuration...${NC}"
cloudflared tunnel --config "$CONFIG_FILE" ingress validate
echo ""

# Step 5: Set up DNS route
echo -e "${YELLOW}Step 5: Setting up DNS route...${NC}"
echo "This will create a CNAME record for api.transitco.in"
read -p "Do you want to create the DNS route automatically? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cloudflared tunnel route dns "$TUNNEL_NAME" api.transitco.in
    echo -e "${GREEN}DNS route created${NC}"
else
    echo -e "${YELLOW}Please create the DNS route manually:${NC}"
    echo "  Type: CNAME"
    echo "  Name: api"
    echo "  Target: $TUNNEL_ID.cfargotunnel.com"
    echo "  Proxy: Proxied (orange cloud)"
fi
echo ""

# Step 6: Test the tunnel
echo -e "${YELLOW}Step 6: Testing tunnel (will run in foreground)...${NC}"
echo "Testing tunnel. Press Ctrl+C to stop after verifying it works."
echo ""
read -p "Press Enter to start the tunnel test..."
cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME" &
TUNNEL_PID=$!
sleep 5

# Test the endpoint
echo "Testing https://api.transitco.in/health..."
if curl -s -f "https://api.transitco.in/health" > /dev/null; then
    echo -e "${GREEN}Tunnel is working!${NC}"
else
    echo -e "${YELLOW}Tunnel test inconclusive (DNS might not be propagated yet)${NC}"
fi

kill $TUNNEL_PID 2>/dev/null || true
wait $TUNNEL_PID 2>/dev/null || true
echo ""

# Step 7: Install as systemd service
echo -e "${YELLOW}Step 7: Installing as systemd service...${NC}"
read -p "Do you want to install cloudflared as a systemd service? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Create systemd service file
    sudo tee /etc/systemd/system/cloudflared.service > /dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel for Transit Driver Service
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/local/bin/cloudflared tunnel --config $CONFIG_FILE run $TUNNEL_NAME
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable cloudflared
    sudo systemctl start cloudflared
    
    sleep 2
    if sudo systemctl is-active --quiet cloudflared; then
        echo -e "${GREEN}cloudflared service is running!${NC}"
        echo ""
        echo "Service status:"
        sudo systemctl status cloudflared --no-pager -l
    else
        echo -e "${RED}Service failed to start. Check logs with: sudo journalctl -u cloudflared${NC}"
    fi
else
    echo -e "${YELLOW}Skipping systemd service installation${NC}"
fi
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Tunnel ID: $TUNNEL_ID"
echo "Config file: $CONFIG_FILE"
echo ""
echo "Useful commands:"
echo "  Check tunnel status: sudo systemctl status cloudflared"
echo "  View logs: sudo journalctl -u cloudflared -f"
echo "  Restart tunnel: sudo systemctl restart cloudflared"
echo "  Test endpoint: curl https://api.transitco.in/health"
echo ""
echo "Your service should now be accessible at:"
echo "  https://api.transitco.in"
echo ""


