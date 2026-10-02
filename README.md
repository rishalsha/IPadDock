# iPad Gen 4 Smart Home & Workstation Dock

Turn an old, retired iPad Gen 4 (iOS 10.3) into a modern, responsive, wall/desk smart home dock.

Control your **Tasmota smart devices** (lights, fans, bulbs), manage **PC & laptop power** (sleep, shutdown, wake-on-LAN), and integrate with **Amazon Alexa**.

---

## Repository Structure

```
├── README.md                          # Quick start and project overview
├── setup_plan.md                      # Detailed technical architecture plan
├── azure/                             # Cloud relay configuration
│   ├── docker-compose.yml             # Mosquitto MQTT (1883 + WS 9001) & Nginx (8080)
│   ├── mosquitto/
│   │   └── mosquitto.conf             # Mosquitto configuration
│   └── deploy.sh                      # One-click deployment script for Azure VM
├── web/                               # iOS 10 Safari compatible Web Dock UI
│   ├── index.html                     # Fullscreen kiosk web application
│   ├── style.css                      # Touch-optimized dark theme stylesheet
│   ├── app.js                         # ES5 reactive controller & MQTT client
│   ├── config.js                      # Device definitions and default settings
│   └── paho-mqtt.js                   # Embedded Paho MQTT JavaScript client
├── agents/                            # Workstation power management agents
│   ├── pc_agent.py                    # Cross-platform Python background daemon
│   ├── requirements.txt               # Dependencies (paho-mqtt)
│   ├── install_windows_service.bat    # Windows Task Scheduler autostart setup
│   └── ipad-dock-agent.service        # Linux systemd service unit
└── docs/                              # Detailed guides
    ├── ipad_setup_guide.md            # Safari kiosk mode & Guided Access tutorial
    ├── tasmota_and_alexa_guide.md     # MQTT broker pairing & Alexa Hue emulation
    └── pc_laptop_setup.md             # Wake-on-LAN and OS power commands
```

---

## Quick Start Guide

### 1. Launch Azure Cloud Relay
On your Azure Linux VM:
```bash
git clone <this-repo> IPadDock
cd IPadDock/azure
chmod +x deploy.sh
./deploy.sh
```
*Note: Ensure ports `1883` (MQTT), `9001` (WebSocket MQTT), and `8080` (Web UI) are open in your Azure Network Security Group (NSG).*

### 2. Configure Tasmota Devices
In your Tasmota Web UI (**Configuration** -> **Configure MQTT**):
- **Host**: Your Azure Public IP
- **Port**: `1883`
- **Topic**: `room_light`, `desk_bulb`, `ceiling_fan`
- *(Optional)* In **Configure Other** -> Enable **Hue Bridge emulation** so Alexa discovers the device locally!

### 3. Launch the PC/Laptop Agent
On your desktop PC / laptop:
```cmd
python agents/pc_agent.py --host YOUR_AZURE_IP --topic desktop_pc
```
*(Or run `agents/install_windows_service.bat` on Windows to run automatically in background on startup).*

### 4. Setup iPad Gen 4 Kiosk
1. Open Safari on your iPad Gen 4.
2. Go to `http://<YOUR_AZURE_IP>:8080`.
3. Tap **Share** -> **Add to Home Screen**.
4. Open the new **Home Dock** icon and lock into fullscreen using **Guided Access** (`Settings` -> `Accessibility` -> `Guided Access`).

---

## Documentation Links
- [Architecture & Design Plan](setup_plan.md)
- [iPad Setup & Kiosk Guide](docs/ipad_setup_guide.md)
- [Tasmota & Alexa Integration Guide](docs/tasmota_and_alexa_guide.md)
- [PC & Laptop Sleep/Wake Guide](docs/pc_laptop_setup.md)
