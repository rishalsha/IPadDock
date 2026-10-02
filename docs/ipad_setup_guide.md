# iPad Gen 4 Kiosk Setup Guide

This guide explains how to configure your iPad Gen 4 (running iOS 10.3) into a permanent, always-on smart home dock.

---

## 1. Accessing the Web Dashboard

1. Connect your iPad to your home Wi-Fi network.
2. Open **Mobile Safari**.
3. Navigate to your Azure dashboard URL:
   ```text
   http://<YOUR_AZURE_IP>:8080
   ```
   *(Note: Using plain HTTP on local port 8080 avoids root CA expiration issues on iOS 10)*.
4. You should see the dark-themed dock with the live clock and device tiles.

---

## 2. Converting to a Fullscreen App (No Browser Bars)

1. In Safari, tap the **Share icon** (square with an arrow pointing up at the top or bottom of the screen).
2. Scroll through the bottom action row and tap **"Add to Home Screen"**.
3. Name it **"Home Dock"** and tap **Add**.
4. Go to your iPad home screen and tap the new **Home Dock** icon.
5. The dock will now launch in **standalone fullscreen mode** without URL bars, tabs, or navigation buttons!

---

## 3. Configuring Live MQTT Connection on the iPad

1. Inside the Home Dock app, tap the **⚙️ (Settings)** icon in the top right.
2. Verify or enter:
   - **Azure MQTT Broker Host / IP**: Your Azure public IP.
   - **WebSocket Port**: `9001`
   - **Username / Password**: (leave blank if anonymous mode is on).
3. Tap **Save & Reconnect**.
4. The status pill at the top right should change from yellow to a glowing green **"Live"** dot.

---

## 4. Keeping the Screen Always-On (Guided Access Kiosk Mode)

To prevent the iPad from turning off or going to the lock screen:

### Step A: Set Auto-Lock to Never
1. Open iPad **Settings** -> **Display & Brightness**.
2. Tap **Auto-Lock** -> select **Never**.

### Step B: Enable Guided Access (Locks screen to the Dock)
1. Open iPad **Settings** -> **General** -> **Accessibility** -> **Guided Access**.
2. Turn **Guided Access** ON.
3. Tap **Passcode Settings** and set a PIN code (so others cannot exit the dock).
4. Launch your **Home Dock** web app from the home screen.
5. **Triple-click the physical Home button**.
6. Tap **Start** in the upper right corner.

> [!TIP]
> To exit Guided Access in the future, simply triple-click the Home button again, enter your PIN, and tap **End**.
