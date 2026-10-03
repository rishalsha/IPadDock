# Battle Station Telemetry & Mission Control HUD

The Battle Station Telemetry page (**Page 2**) transforms the iPad into a live cockpit dashboard for monitoring hardware health, temperatures, loads, and system parameters across Linux workstations.

---

## 🛰️ Architecture & Data Pipeline

```
  ┌────────────────────────┐           ┌────────────────────────┐
  │   Desktop PC Daemon    │           │   Work Laptop Daemon   │
  │  (agents/pc_agent.py)  │           │  (agents/pc_agent.py)  │
  └───────────┬────────────┘           └───────────┬────────────┘
              │ MQTT Publish                       │ MQTT Publish
              │ (stat/desktop_pc/telemetry)        │ (stat/work_laptop/telemetry)
              ▼                                    ▼
       ┌──────────────────────────────────────────────────┐
       │             Azure Mosquitto Broker               │
       │     Port 1883 (TCP) & Port 80 (/mqtt WebSockets) │
       └────────────────────────┬─────────────────────────┘
                                │ WebSockets
                                ▼
       ┌──────────────────────────────────────────────────┐
       │             iPad Gen 4 Web Dashboard             │
       │   • 5 Circular SVG Progress Rings                │
       │   • 6 Detailed Hardware Breakdown Cards          │
       │   • Target Workstation Selector                  │
       └──────────────────────────────────────────────────┘
```

---

## 📊 Telemetry Parameters Collected

Every 3 seconds, `agents/pc_agent.py` queries lightweight Linux kernel interfaces with near-zero CPU overhead (< 15ms per cycle):

### 1. CPU & Architecture
- **Model Name**: Read from `/proc/cpuinfo` (e.g. `AMD Ryzen 5 5600G with Radeon Graphics`).
- **Core / Thread Count**: Physical cores and logical threads via `lscpu` and `os.cpu_count()`.
- **Instruction Architecture**: Host architecture (`x86_64`).
- **Scaling Governor**: Live governor policy from `/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor`.
- **Live Frequency**: Current clock frequency in MHz from `/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq`.
- **L3 Cache**: Cache size and instance count from `lscpu`.
- **Live Utilization**: Calculated from `/proc/stat` delta times.

### 2. Memory (RAM & Swap)
- **RAM Total & Available**: Parsed from `/proc/meminfo` (`MemTotal`, `MemAvailable`).
- **Used Memory**: `MemTotal - MemAvailable`.
- **Cached & Buffers**: `Cached + Buffers` from `/proc/meminfo`.
- **Swap Usage**: `SwapTotal - SwapFree` from `/proc/meminfo`.

### 3. GPU & Display Output
- **Dedicated NVIDIA GPU**: Queried via `nvidia-smi` in CSV mode:
  - GPU Model Name
  - Driver Version (e.g. `610.43.03`)
  - Total and Used VRAM in MB with percentage
  - GPU Core Load %
  - GPU Temperature in °C
- **Integrated GPU (Intel / AMD)**: Automatically detected via `lspci` fallback.
- **Display Monitors**: Queried via Wayland Hyprland IPC (`hyprctl monitors -j`):
  - Resolution & Refresh Rate (e.g. `1920x1080@60Hz`)
  - Output Port (`HDMI-A-2`, `eDP-1`)
  - Monitor Description & Model Name

### 4. Storage & Filesystem
- **Root Partition (`/`)**: Queried using standard Python `os.statvfs('/')`:
  - Total Disk Capacity (GB)
  - Used Space (GB)
  - Available Free Space (GB)
  - Utilization Percentage

### 5. Motherboard & Firmware
- **Board Name & Product**: Read from `/sys/class/dmi/id/board_name` or `product_name`.
- **Board Vendor**: Read from `/sys/class/dmi/id/board_vendor` (e.g. `Micro-Star International Co., Ltd.`).
- **BIOS / UEFI Version**: Read from `/sys/class/dmi/id/bios_version`.
- **Kernel Release**: System kernel version via `platform.release()`.

### 6. Thermals & Power
- **CPU Package Temperature**: Read from `/sys/class/hwmon/` or `/sys/class/thermal/thermal_zone0/temp`.
- **GPU Core Temperature**: Monitored via GPU driver sensors.
- **Battery Status**: Automatically detected from `/sys/class/power_supply/BAT0/`:
  - Battery charge level percentage
  - Power state (`Full`, `Charging`, `Discharging`, `AC`)

### 7. Network Hardware
- **Active Adapter**: Interface name (`enp42s0`, `wlan0`) from `ip -j addr`.
- **Local IP Address**: Primary IPv4 network address on the local subnet.
- **Connection Type**: Automatically classified as `Ethernet` or `WiFi`.

---

## 🎨 Frontend SVG Circular Gauges

The circular gauges are rendered using native SVG with zero third-party chart libraries:

```xml
<svg class="hud-ring-svg" viewBox="0 0 78 78">
  <!-- Gray background track -->
  <circle class="hud-ring-bg" cx="39" cy="39" r="31"></circle>
  <!-- Active progress stroke -->
  <circle class="hud-ring-fill ring-cpu"
          cx="39" cy="39" r="31"
          stroke-dasharray="194.78"
          stroke-dashoffset="148.03"></circle>
</svg>
```

### Circumference & Offset Mathematics:
- Radius $r = 31\text{px}$
- Perimeter $C = 2 \times \pi \times 31 \approx 194.78\text{px}$
- Stroke Dash Offset formula:
  $$\text{offset} = 194.78 \times \left(1 - \frac{\text{percentage}}{100}\right)$$
- `-webkit-transform: rotate(-90deg)` rotates the coordinate system so progress fills clockwise starting from the 12 o'clock position.
- Smooth transitions are animated via CSS `transition: stroke-dashoffset 0.6s ease`.

---

## 📡 MQTT Message Format (`stat/<machine>/telemetry`)

```json
{
  "cpu_pct": 18.5,
  "ram_pct": 18.4,
  "ram_used_gb": 5.1,
  "ram_total_gb": 27.3,
  "temp_c": 51.0,
  "uptime": "1d 3h",
  "timestamp": 1791031200,
  "cpu": {
    "model": "AMD Ryzen 5 5600G with Radeon Graphics",
    "cores": 6,
    "threads": 12,
    "arch": "x86_64",
    "governor": "powersave",
    "freq_mhz": 3549,
    "cache_l3": "16 MiB (1 instance)"
  },
  "mem": {
    "total_mb": 27948,
    "used_mb": 5148,
    "free_mb": 22800,
    "cached_mb": 8254,
    "ram_pct": 18.4,
    "swap_total_mb": 41926,
    "swap_used_mb": 0,
    "swap_pct": 0.0
  },
  "gpu": {
    "name": "NVIDIA GeForce RTX 3060",
    "driver": "610.43.03",
    "vram_total_mb": 12288,
    "vram_used_mb": 731,
    "vram_pct": 5.9,
    "gpu_pct": 27,
    "temp_c": 51
  },
  "storage": {
    "mount": "/",
    "used_gb": 201.8,
    "total_gb": 474.9,
    "free_gb": 273.1,
    "pct": 42.5
  },
  "displays": [
    "1920x1080@60Hz (BenQ GW2790)"
  ],
  "motherboard": {
    "board": "MPG B550 GAMING PLUS (MS-7C56)",
    "vendor": "Micro-Star International Co., Ltd.",
    "bios": "1.K0",
    "kernel": "7.1.3-arch1-3"
  },
  "power": {
    "has_battery": false,
    "pct": 100,
    "status": "AC"
  },
  "network": {
    "ip": "192.168.1.108",
    "iface": "enp42s0",
    "type": "Ethernet"
  }
}
```
