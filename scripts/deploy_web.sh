#!/usr/bin/env bash
# Deploys web dashboard to Azure, increments version, and triggers iPad auto-reload
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP=$(date +%s)
UTC_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[*] Updating version.json (v${TIMESTAMP})..."
cat <<EOF > "$DIR/web/version.json"
{
  "version": ${TIMESTAMP},
  "updatedAt": "${UTC_DATE}"
}
EOF

echo "[*] Updating cache busting queries in index.html..."
sed -i -E "s/style\.css(\?v=[0-9]+)?/style.css?v=${TIMESTAMP}/g" "$DIR/web/index.html"
sed -i -E "s/src=\"app\.js(\?v=[0-9]+)?\"/src=\"app.js?v=${TIMESTAMP}\"/g" "$DIR/web/index.html"

echo "[*] Syncing web files to Azure VPS (azure-server)..."
scp "$DIR"/web/* azure-server:/home/rishal/IPadDock/web/

echo "[*] Broadcasting remote reload command via MQTT..."
"$DIR/agents/.venv/bin/python3" -c "
import paho.mqtt.client as mqtt
c = mqtt.Client()
c.connect('20.244.45.142', 1883, 10)
c.publish('cmnd/ipaddock/reload', '1')
c.disconnect()
"

echo "[✓] Deployment complete! iPad Dock will auto-refresh immediately."
