# ESP32 24/7 Wake-on-LAN Local Relay

A dedicated, ultra-low-power (~0.5W) 24/7 local network device that catches MQTT Wake-on-LAN commands from your iPad Dock and broadcasts raw UDP magic packets locally to wake your Desktop PC and Work Laptop—even when both machines are completely powered off.

---

## Hardware Specifications
- **Board**: Standard ESP32 (NodeMCU-32S, ESP32-WROOM-32, etc.)
- **Power**: 5V USB (Phone charger, router USB port, or desk power bar)
- **Power Draw**: < 0.5 Watts (~$0.50 per year)
- **Network**: 2.4 GHz Wi-Fi (connected to same LAN/router as PC and Laptop)

---

## Features
1. **MQTT Wake-on-LAN Catch**:
   - Subscribes to `cmnd/+/wake`
   - Subscribes to `cmnd/room_light/WakeOnLan`
   - Automatically catches `cmnd/desktop_pc/wake` and `cmnd/work_laptop/wake` sent by iPad Dock.
2. **Dual-Port Magic Packet Broadcast**:
   - Broadcasts the 102-byte Magic Packet to `255.255.255.255:9` and `255.255.255.255:7` for maximum motherboard and BIOS compatibility.
3. **Local HTTP Web Server (Port 80)**:
   - Built-in web dashboard at `http://<ESP32_IP>/`
   - Offline HTTP endpoints:
     - `GET http://<ESP32_IP>/wake?target=desktop_pc`
     - `GET http://<ESP32_IP>/wake?target=work_laptop`
     - `GET http://<ESP32_IP>/wake?target=all`
     - `GET http://<ESP32_IP>/wake?mac=04:7c:16:b7:5e:96`
4. **Onboard Status LED (GPIO 2)**:
   - Rapid blinks during Wi-Fi connection
   - Solid pulse on each Wake-on-LAN packet transmission

---

## Flashing Instructions

```bash
# 1. Grant serial permission
sudo chmod 666 /dev/ttyUSB0

# 2. Build and upload via PlatformIO
agents/.venv/bin/pio run -d esp32_wol -t upload

# 3. Monitor serial output
agents/.venv/bin/pio device monitor -p /dev/ttyUSB0 -b 115200
```
