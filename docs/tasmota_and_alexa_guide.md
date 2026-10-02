# Tasmota & Alexa Integration Guide

This guide explains how to connect your Tasmota devices (Light, Fan, Bulb) to your Azure MQTT broker and enable direct Alexa voice control without requiring complex cloud skills.

---

## 1. Configure Tasmota MQTT to Point to Azure

1. Open your Tasmota device's IP in your browser (e.g. `http://192.168.1.50`).
2. Go to **Configuration** -> **Configure MQTT**.
3. Set the following fields:
   - **Host (`%s`)**: Your Azure server's Public IP or domain name (e.g., `20.xxx.xxx.xxx`).
   - **Port (`%d`)**: `1883`
   - **Client (`%s`)**: Leave default or set to `DOCK_LIGHT_1` (must be unique per device).
   - **User (`%s`)**: Your MQTT username (if authentication enabled, otherwise blank).
   - **Password (`%s`)**: Your MQTT password (if authentication enabled, otherwise blank).
   - **Topic (`%s`)**: Device topic matching `web/config.js` (e.g. `room_light`, `desk_bulb`, `ceiling_fan`).
   - **Full Topic (`%s`)**: `%prefix%/%topic%/` (default standard).
4. Click **Save**. The device will restart and connect to your Azure Mosquitto broker.

---

## 2. Alexa Voice Integration (Zero-Cloud Local Discovery)

Tasmota includes built-in emulation that allows Amazon Echo devices on your local Wi-Fi to control Tasmota switches directly via local UDP/UPnP.

### Steps to Enable:
1. In the Tasmota web UI, go to **Configuration** -> **Configure Other**.
2. Under **Emulation**, choose:
   - **Hue Bridge (multi device)**: Best if your device has multiple relays, dimming, or color control (like smart bulbs).
   - **Belkin WeMo (single device)**: Ideal for simple on/off lights or smart plugs.
3. Set the **Friendly Name 1** to what you want to call it with Alexa (e.g., "Room Light", "Ceiling Fan", "Desk Lamp").
4. Click **Save**.
5. Say to your Amazon Echo:
   > *"Alexa, discover my devices"*
6. Alexa will discover the device within 20 seconds. You can now say:
   > *"Alexa, turn on Room Light"*  
   > *"Alexa, turn off Ceiling Fan"*

---

## 3. Wake-on-LAN (WoL) from Tasmota to Your PC

Because your Azure broker is in the cloud, it cannot broadcast a Layer 2 UDP WoL packet into your home subnet (192.168.x.x). 

However, any Tasmota device on your home network can broadcast this packet for you!

### How it works:
1. When you tap **⚡ Wake** on the iPad Dock, the dock publishes:
   - **Topic**: `cmnd/<tasmota_device_topic>/WakeOnLan`
   - **Payload**: `<PC_MAC_ADDRESS>` (e.g. `00:11:22:33:44:55`)
2. The Tasmota device receives this command and immediately transmits the magic packet across your home LAN.

### Testing in Tasmota Console:
1. Open your Tasmota Web UI -> **Console**.
2. Type:
   ```text
   WakeOnLan 00:11:22:33:44:55
   ```
   *(replace with your PC's actual MAC address)*.
3. If your PC has Wake-on-LAN enabled in BIOS, it will immediately boot up!
