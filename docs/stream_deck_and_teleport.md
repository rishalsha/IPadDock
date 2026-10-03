# Stream Deck, Quick Apps & Cross-Device Teleport

The Stream Deck page (**Page 4**) provides quick app focus/launching, desktop workstation macros, and a multi-machine cross-device clipboard bridge.

---

## 🚀 Quick Apps & Window Focus-or-Open

Tapping any of the 8 quick app tiles triggers a native Hyprland IPC query via `hyprctl clients -j`:

```
iPad Dock Tap (e.g. WhatsApp)
       │
       ▼ MQTT: cmnd/desktop_pc/action -> "open_or_focus:whatsapp:https://web.whatsapp.com"
       │
┌──────┴──────────────────────────────────────────────────────┐
│ pc_agent.py (Workstation Daemon)                            │
│ 1. Queries `hyprctl clients -j`                             │
│ 2. Scans open window titles and classes for "whatsapp"      │
│ 3. IF WINDOW FOUND:                                         │
│    `hyprctl dispatch focuswindow address:<window_address>`  │
│ 4. ELSE:                                                    │
│    Launches browser with URL in new tab / window            │
└─────────────────────────────────────────────────────────────┘
```

### Supported Apps:
- 💬 **WhatsApp**: `https://web.whatsapp.com`
- ✨ **Gemini**: `https://gemini.google.com`
- 🧠 **Claude**: `https://claude.ai`
- 🎬 **YouTube**: `https://youtube.com`
- 🐙 **GitHub**: `https://github.com`
- 🤖 **ChatGPT**: `https://chatgpt.com`
- ✉️ **Gmail**: `https://mail.google.com`
- 🎵 **Spotify**: `https://open.spotify.com`

---

## 🎛️ System Controls Macros (1×6 Row)

- 🎙️ **Microphone**: Checks live mute state and toggles audio capture source via `wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle` (with fallback to `pactl`).
- 💻 **Terminal**: Launches user's configured terminal emulator (`ghostty`, `alacritty`, `foot`, or `kitty`).
- 🌐 **Browser**: Launches default web browser (`google-chrome-stable`, `firefox`, or `xdg-open`).
- 📸 **Screenshot**: Triggers screenshot capture (`omarchy screenshot` or `grim`).
- 📁 **Files**: Instantly opens Nautilus file manager in a new window (`nautilus --new-window ~`).
- 🔕 **Silence DND**: Toggles desktop notification Do-Not-Disturb state (`omarchy-toggle-notification-silencing` or `makoctl mode -t do-not-disturb`).

---

## 📋 Cross-Device Teleport (Clipboard Bridge)

Teleport allows instantaneous text, link, and code clipboard synchronization between **Desktop PC**, **Work Laptop**, and the **iPad**:

```
                       ┌────────────────┐
                       │   iPad Dock    │
                       │  Teleport Box  │
                       └───────┬────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
 ┌──────────────────────┐             ┌──────────────────────┐
 │      Desktop PC      │             │     Work Laptop      │
 │  📥 Copy  /  📤 Paste │   🔄 Sync   │  📥 Copy  /  📤 Paste │
 │      (wl-copy)       │◄───────────►│      (wl-copy)       │
 └──────────────────────┘             └──────────────────────┘
```

### Clipboard Actions:
- **📥 Copy from PC / Laptop**:
  - Sends `cmnd/<machine>/action: get_clipboard`.
  - The workstation executes `wl-paste` (or `xclip`) and replies on `stat/<machine>/action_reply` with the clipboard content.
  - The iPad dashboard automatically populates the Teleport textarea.
- **📤 Paste to PC / Laptop**:
  - Sends `cmnd/<machine>/action: clipboard:<text>`.
  - The workstation daemon feeds the payload directly into `wl-copy` standard input.
  - Text is instantly ready to `Ctrl+V` on that computer.
- **🔄 1-Tap Direct Sync (`PC ➔ Laptop` / `Laptop ➔ PC`)**:
  - Automatically fetches clipboard from the source workstation and transmits it directly to the target workstation in a single tap!
- **🌐 Open URL**:
  - Parses the current text in the Teleport box and opens it directly in the workstation's default browser.
