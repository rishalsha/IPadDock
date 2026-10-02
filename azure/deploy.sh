#!/bin/bash
# Azure Deployment Script for iPad Dock Relay
set -e

echo "=== iPad Dock: Azure Server Setup ==="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[!] Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "[+] Docker installed successfully."
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "[!] Installing Docker Compose plugin..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

echo "[*] Ensuring required Azure ports are mentioned:"
echo "    - Port 1883 TCP (MQTT)"
echo "    - Port 9001 TCP (WebSocket MQTT for iPad)"
echo "    - Port 8080 TCP (Web Dashboard)"
echo "Make sure to open these ports in your Azure Network Security Group (NSG) Inbound rules!"

echo "[*] Starting Mosquitto broker and Nginx web server..."
if docker compose version &> /dev/null; then
    docker compose up -d
else
    docker-compose up -d
fi

echo "[+] Deployment complete! Container status:"
docker ps --filter "name=ipaddock"
