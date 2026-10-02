# PC & Laptop Setup Guide: Power, Sleep & Wake Automation

This guide covers setting up your Windows/Linux desktop and laptop to respond to sleep, shutdown, and wake commands sent from the iPad Dock.

---

## 1. Setting Up Wake-On-LAN (WoL)

To wake your desktop PC or laptop over the network:

### BIOS / UEFI Configuration:
1. Boot into BIOS (press `Del` or `F2` during boot).
2. Locate the Power Management section (often called **APM Configuration**, **ACPI Settings**, or **Power Management Setup**).
3. Enable:
   - **Wake on LAN (WoL)** / **Power On by PCI-E/PCI Device**.
   - (For Desktop PC Cold Boot alternative): Set **Restore AC Power Loss** to **"Power On"** if using a Tasmota smart plug.
4. Save and exit BIOS (`F10`).

### Windows Device Manager Configuration:
1. Press `Win + X` -> select **Device Manager**.
2. Expand **Network adapters** -> Right-click your Ethernet adapter -> **Properties**.
3. Go to the **Power Management** tab:
   - Check **"Allow this device to wake the computer"**.
   - Check **"Only allow a magic packet to wake the computer"**.
4. Go to the **Advanced** tab:
   - Ensure **"Wake on Magic Packet"** is set to **Enabled**.
5. Find your PC MAC Address:
   - Open Command Prompt and run `ipconfig /all`.
   - Look for **Physical Address** under your Ethernet adapter (e.g. `00-11-22-33-44-55`).
   - Add this MAC address to `web/config.js`.

---

## 2. Running the PC Background Agent

The background agent listens for MQTT commands and immediately suspends or shuts down the machine when triggered from the iPad dock.

### Quick Start (Windows):
1. Copy the `agents/` folder to your PC (e.g. `C:\IPadDock\`).
2. Run `install_windows_service.bat` as Administrator.
3. Or manually start the script:
   ```cmd
   python pc_agent.py --host YOUR_AZURE_IP --topic desktop_pc
   ```

### Quick Start (Linux):
1. Install Python dependencies:
   ```bash
   pip3 install paho-mqtt
   ```
2. Test manually:
   ```bash
   python3 agents/pc_agent.py --host YOUR_AZURE_IP --topic desktop_pc
   ```
3. To run automatically on boot, copy `agents/ipad-dock-agent.service` to `/etc/systemd/system/`, update your Azure IP, and enable:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now ipad-dock-agent.service
   ```

---

## 3. MQTT Command Reference

| Action | MQTT Topic | Payload | Handled By |
| :--- | :--- | :--- | :--- |
| **Wake PC** | `cmnd/<tasmota_topic>/WakeOnLan` | `<MAC_ADDRESS>` | Local Tasmota device (broadcasts WoL packet) |
| **Sleep PC** | `cmnd/<pc_topic>/power` | `sleep` | PC Agent (triggers OS suspend) |
| **Shut Down** | `cmnd/<pc_topic>/power` | `shutdown` | PC Agent (triggers OS shutdown) |
| **Restart** | `cmnd/<pc_topic>/power` | `restart` | PC Agent (triggers OS reboot) |
| **Ping / Check** | `cmnd/<pc_topic>/ping` | `1` | PC Agent (replies `stat/<pc_topic>/status` = `online`) |
| **Live Status** | `stat/<pc_topic>/status` | `online`/`sleep`/`offline` | iPad Dock Web Dashboard |
