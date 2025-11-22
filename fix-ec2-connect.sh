#!/bin/bash
# Quick fix script for EC2 Instance Connect issues
# Run this via Systems Manager Session Manager or direct SSH

set -e

echo "🔧 Fixing EC2 Instance Connect setup..."

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ Cannot detect OS"
    exit 1
fi

echo "📦 Detected OS: $OS"

# Install Instance Connect agent based on OS
if [[ "$OS" == "amzn" ]] || [[ "$OS" == "rhel" ]] || [[ "$OS" == "centos" ]]; then
    echo "📥 Installing ec2-instance-connect for Amazon Linux/RHEL/CentOS..."
    sudo yum update -y
    sudo yum install -y ec2-instance-connect
    sudo systemctl enable ec2-instance-connect
    sudo systemctl start ec2-instance-connect
    sudo systemctl status ec2-instance-connect --no-pager
    
elif [[ "$OS" == "ubuntu" ]] || [[ "$OS" == "debian" ]]; then
    echo "📥 Installing ec2-instance-connect for Ubuntu/Debian..."
    sudo apt-get update
    sudo apt-get install -y ec2-instance-connect
    sudo systemctl enable ec2-instance-connect
    sudo systemctl start ec2-instance-connect
    sudo systemctl status ec2-instance-connect --no-pager
    
else
    echo "⚠️  Unsupported OS: $OS"
    echo "Please install ec2-instance-connect manually"
    exit 1
fi

# Verify SSH service
echo "🔍 Checking SSH service..."
if sudo systemctl is-active --quiet sshd || sudo systemctl is-active --quiet ssh; then
    echo "✅ SSH service is running"
else
    echo "⚠️  SSH service might not be running"
    sudo systemctl status sshd || sudo systemctl status ssh
fi

# Check firewall
echo "🔍 Checking firewall rules..."
if command -v firewall-cmd &> /dev/null; then
    echo "Firewalld detected"
    sudo firewall-cmd --list-all
elif command -v ufw &> /dev/null; then
    echo "UFW detected"
    sudo ufw status
fi

# Verify Instance Connect agent
echo "🔍 Verifying Instance Connect agent..."
if sudo systemctl is-active --quiet ec2-instance-connect; then
    echo "✅ EC2 Instance Connect agent is running"
else
    echo "❌ EC2 Instance Connect agent is not running"
    exit 1
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Verify Security Group allows SSH (port 22)"
echo "2. Check IAM permissions for EC2 Instance Connect"
echo "3. Try connecting again via EC2 Instance Connect"
echo ""
echo "If still not working, check:"
echo "- Security Group inbound rules"
echo "- Network ACLs"
echo "- IAM permissions (ec2-instance-connect:SendSSHPublicKey)"

