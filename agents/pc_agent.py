#!/usr/bin/env python3
"""
Cross-Platform PC & Laptop Background Agent for iPad Dock
Supports Windows & Linux.
Features:
- Power commands: sleep, shutdown, restart
- Wake-on-LAN relay (cross-machine packet broadcast)
- Live Telemetry: CPU %, RAM %, Temps, Uptime
- Media & Audio Control: Play/Pause, Next/Prev, Volume +/-, Mute, Now Playing track info
"""

import sys
import os
import time
import json
import re
import platform
import argparse
import subprocess
import socket
import threading
import paho.mqtt.client as mqtt

IS_WINDOWS = platform.system().lower() == "windows"
IS_LINUX = platform.system().lower() == "linux"
IS_MAC = platform.system().lower() == "darwin"


def send_wol_packet(mac: str):
    """Broadcasts a Wake-on-LAN magic packet over the local network."""
    try:
        clean_mac = bytes.fromhex(mac.replace(":", "").replace("-", ""))
        packet = b"\xff" * 6 + clean_mac * 16
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        destinations = [
            ("192.168.1.255", 9),
            ("192.168.1.255", 7),
            ("255.255.255.255", 9),
            ("255.255.255.255", 7),
        ]
        for _ in range(4):
            for addr, port in destinations:
                sock.sendto(packet, (addr, port))
            time.sleep(0.08)
        sock.close()
        print(f"[+] Broadcasted WoL Magic Packet for {mac}")
    except Exception as e:
        print(f"[-] Failed to broadcast WoL packet: {e}")


def execute_power_action(action: str):
    """Executes OS-level sleep, shutdown, or restart."""
    action = action.lower().strip()
    print(f"[*] Received power action: {action}")

    if action == "sleep":
        if IS_WINDOWS:
            import ctypes
            print("[*] Suspending Windows...")
            ctypes.windll.PowrProf.SetSuspendState(0, 1, 0)
        elif IS_LINUX:
            print("[*] Suspending Linux...")
            subprocess.run(["systemctl", "suspend"], check=False)
        elif IS_MAC:
            print("[*] Suspending macOS...")
            subprocess.run(["pmset", "sleepnow"], check=False)
        else:
            print(f"[!] Unsupported OS for sleep: {platform.system()}")

    elif action in ("shutdown", "poweroff"):
        if IS_WINDOWS:
            print("[*] Shutting down Windows...")
            subprocess.run(["shutdown", "/s", "/t", "0"], check=False)
        elif IS_LINUX:
            print("[*] Shutting down Linux...")
            subprocess.run(["systemctl", "poweroff"], check=False)
        elif IS_MAC:
            print("[*] Shutting down macOS...")
            subprocess.run(["osascript", "-e", 'tell app "System Events" to shut down'], check=False)

    elif action == "restart":
        if IS_WINDOWS:
            print("[*] Restarting Windows...")
            subprocess.run(["shutdown", "/r", "/t", "0"], check=False)
        elif IS_LINUX:
            print("[*] Restarting Linux...")
            subprocess.run(["systemctl", "reboot"], check=False)
        elif IS_MAC:
            print("[*] Restarting macOS...")
            subprocess.run(["osascript", "-e", 'tell app "System Events" to restart'], check=False)
    else:
        print(f"[!] Unknown action: {action}")


# -------------------------------------------------------------
# System Telemetry Readers (Zero-Dependency Linux /proc reader)
# -------------------------------------------------------------
_last_cpu_time = 0.0
_last_cpu_total = 0.0
_last_cpu_idle = 0.0

def get_telemetry():
    """Reads CPU, RAM, Temperature, and Uptime metrics."""
    global _last_cpu_time, _last_cpu_total, _last_cpu_idle
    cpu_pct = 0.0
    ram_pct = 0.0
    ram_used_gb = 0.0
    ram_total_gb = 0.0
    temp_c = 0.0
    uptime_str = "0m"

    if IS_LINUX:
        # 1. CPU Usage from /proc/stat
        try:
            with open("/proc/stat", "r") as f:
                fields = [float(x) for x in f.readline().strip().split()[1:]]
            total = sum(fields)
            idle = fields[3] + fields[4]
            if _last_cpu_total > 0 and (total - _last_cpu_total) > 0:
                diff_total = total - _last_cpu_total
                diff_idle = idle - _last_cpu_idle
                cpu_pct = round(100.0 * (1.0 - (diff_idle / diff_total)), 1)
                cpu_pct = max(0.0, min(100.0, cpu_pct))
            _last_cpu_total = total
            _last_cpu_idle = idle
        except Exception:
            pass

        # 2. RAM from /proc/meminfo
        try:
            mem = {}
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        mem[parts[0].strip()] = int(parts[1].split()[0])
            total_kb = mem.get("MemTotal", 1)
            avail_kb = mem.get("MemAvailable", mem.get("MemFree", 0))
            used_kb = total_kb - avail_kb
            ram_pct = round((used_kb / total_kb) * 100.0, 1)
            ram_used_gb = round(used_kb / (1024.0 * 1024.0), 1)
            ram_total_gb = round(total_kb / (1024.0 * 1024.0), 1)
        except Exception:
            pass

        # 3. Temperature from /sys/class/thermal or /sys/class/hwmon
        thermal_candidates = [
            "/sys/class/thermal/thermal_zone0/temp",
            "/sys/class/thermal/thermal_zone1/temp",
            "/sys/class/hwmon/hwmon0/temp1_input",
            "/sys/class/hwmon/hwmon1/temp1_input",
            "/sys/class/hwmon/hwmon2/temp1_input",
            "/sys/class/hwmon/hwmon3/temp1_input",
        ]
        for path in thermal_candidates:
            if os.path.exists(path):
                try:
                    with open(path, "r") as f:
                        val = int(f.read().strip())
                        if val > 1000:
                            val = val / 1000.0
                        if 10.0 <= val <= 115.0:
                            temp_c = round(val, 1)
                            break
                except Exception:
                    pass

        # 4. System Uptime
        try:
            with open("/proc/uptime", "r") as f:
                uptime_sec = int(float(f.readline().split()[0]))
            hours = uptime_sec // 3600
            mins = (uptime_sec % 3600) // 60
            uptime_str = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"
        except Exception:
            pass

    elif IS_WINDOWS:
        # Windows fallback (psutil if installed or ctypes)
        try:
            import psutil
            cpu_pct = psutil.cpu_percent(interval=None)
            vm = psutil.virtual_memory()
            ram_pct = vm.percent
            ram_used_gb = round(vm.used / (1024.0 ** 3), 1)
            ram_total_gb = round(vm.total / (1024.0 ** 3), 1)
            uptime_sec = int(time.time() - psutil.boot_time())
            hours = uptime_sec // 3600
            mins = (uptime_sec % 3600) // 60
            uptime_str = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"
        except Exception:
            pass

    return {
        "cpu_pct": cpu_pct,
        "ram_pct": ram_pct,
        "ram_used_gb": ram_used_gb,
        "ram_total_gb": ram_total_gb,
        "temp_c": temp_c,
        "uptime": uptime_str,
        "timestamp": int(time.time()),
    }


# -------------------------------------------------------------
# Media & Audio Controls (MPRIS / PipeWire / PulseAudio / Win)
# -------------------------------------------------------------
def get_media_state():
    """Returns current audio playback status, volume, and track metadata."""
    status = "Stopped"
    title = ""
    artist = ""
    album = ""
    volume = 100
    muted = False

    if IS_LINUX:
        # Check playerctl for MPRIS media players (Spotify, YouTube in Chrome/Firefox, VLC, MPV)
        try:
            status = subprocess.check_output(
                ["playerctl", "status"], text=True, stderr=subprocess.DEVNULL
            ).strip()
        except Exception:
            status = "Stopped"

        if status in ("Playing", "Paused"):
            try:
                title = subprocess.check_output(
                    ["playerctl", "metadata", "title"], text=True, stderr=subprocess.DEVNULL
                ).strip()
            except Exception:
                pass
            try:
                artist = subprocess.check_output(
                    ["playerctl", "metadata", "artist"], text=True, stderr=subprocess.DEVNULL
                ).strip()
            except Exception:
                pass
            try:
                album = subprocess.check_output(
                    ["playerctl", "metadata", "album"], text=True, stderr=subprocess.DEVNULL
                ).strip()
            except Exception:
                pass

        # Query volume via wpctl (PipeWire) or pactl (PulseAudio)
        try:
            out = subprocess.check_output(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"], text=True).strip()
            m = re.search(r"Volume:\s*([0-9.]+)", out)
            if m:
                volume = int(float(m.group(1)) * 100)
            muted = "[MUTED]" in out
        except Exception:
            try:
                out = subprocess.check_output(["pactl", "get-sink-volume", "@DEFAULT_SINK@"], text=True)
                m = re.search(r"/\s*([0-9]+)%\s*/", out)
                if m:
                    volume = int(m.group(1))
                mute_out = subprocess.check_output(["pactl", "get-sink-mute", "@DEFAULT_SINK@"], text=True)
                muted = "yes" in mute_out.lower()
            except Exception:
                pass

    elif IS_WINDOWS:
        status = "Ready"

    return {
        "status": status,
        "title": title,
        "artist": artist,
        "album": album,
        "volume": max(0, min(100, volume)),
        "muted": muted,
    }


def execute_media_command(cmd: str):
    """Executes media playback or volume adjustments."""
    cmd = cmd.strip()
    print(f"[*] Executing media command: {cmd}")

    if IS_LINUX:
        if cmd == "play_pause":
            subprocess.run(["playerctl", "play-pause"], check=False)
        elif cmd == "next":
            subprocess.run(["playerctl", "next"], check=False)
        elif cmd == "prev":
            subprocess.run(["playerctl", "previous"], check=False)
        elif cmd == "play":
            subprocess.run(["playerctl", "play"], check=False)
        elif cmd == "pause":
            subprocess.run(["playerctl", "pause"], check=False)
        elif cmd == "mute":
            res = subprocess.run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"], check=False)
            if res.returncode != 0:
                subprocess.run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "toggle"], check=False)
        elif cmd == "vol_up":
            res = subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%+"], check=False)
            if res.returncode != 0:
                subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", "+5%"], check=False)
        elif cmd == "vol_down":
            res = subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%-"], check=False)
            if res.returncode != 0:
                subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", "-5%"], check=False)
        elif cmd.startswith("vol_set:"):
            try:
                target_pct = max(0, min(100, int(cmd.split(":")[1])))
                val_float = f"{target_pct / 100.0:.2f}"
                res = subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", val_float], check=False)
                if res.returncode != 0:
                    subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{target_pct}%"], check=False)
            except Exception as e:
                print(f"[-] Invalid volume set format: {e}")

    elif IS_WINDOWS:
        import ctypes
        VK_MEDIA_NEXT_TRACK = 0xB0
        VK_MEDIA_PREV_TRACK = 0xB1
        VK_MEDIA_PLAY_PAUSE = 0xB3
        VK_VOLUME_MUTE = 0xAD
        VK_VOLUME_DOWN = 0xAE
        VK_VOLUME_UP = 0xAF

        def send_vk(vk):
            ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
            ctypes.windll.user32.keybd_event(vk, 0, 2, 0)

        if cmd == "play_pause":
            send_vk(VK_MEDIA_PLAY_PAUSE)
        elif cmd == "next":
            send_vk(VK_MEDIA_NEXT_TRACK)
        elif cmd == "prev":
            send_vk(VK_MEDIA_PREV_TRACK)
        elif cmd == "mute":
            send_vk(VK_VOLUME_MUTE)
        elif cmd == "vol_up":
            send_vk(VK_VOLUME_UP)
            send_vk(VK_VOLUME_UP)
        elif cmd == "vol_down":
            send_vk(VK_VOLUME_DOWN)
            send_vk(VK_VOLUME_DOWN)


# -------------------------------------------------------------
# Main PC Agent Class
# -------------------------------------------------------------
class PCAgent:
    def __init__(self, broker_host, broker_port, topic_name, username=None, password=None):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.topic_name = topic_name
        self.username = username
        self.password = password

        self.stat_topic = f"stat/{self.topic_name}/status"
        self.stat_telemetry_topic = f"stat/{self.topic_name}/telemetry"
        self.stat_media_topic = f"stat/{self.topic_name}/media"

        self.cmnd_power_topic = f"cmnd/{self.topic_name}/power"
        self.cmnd_ping_topic = f"cmnd/{self.topic_name}/ping"
        self.cmnd_media_topic = f"cmnd/{self.topic_name}/media"

        self.running = False
        client_id = f"pc_agent_{self.topic_name}_{int(time.time())}"
        self.client = mqtt.Client(client_id=client_id)

        if self.username:
            self.client.username_pw_set(self.username, self.password)

        # Last Will and Testament
        self.client.will_set(self.stat_topic, payload="offline", qos=1, retain=True)

        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print(f"[+] Connected to MQTT broker at {self.broker_host}:{self.broker_port}")
            client.publish(self.stat_topic, payload="online", qos=1, retain=True)
            # Subscribe to command topics
            client.subscribe(self.cmnd_power_topic)
            client.subscribe(self.cmnd_ping_topic)
            client.subscribe(self.cmnd_media_topic)
            client.subscribe("cmnd/+/wake")
            print(f"[+] Subscribed to: {self.cmnd_power_topic}, {self.cmnd_media_topic}, cmnd/+/wake")
        else:
            print(f"[-] Connection failed with return code {rc}")

    def on_disconnect(self, client, userdata, rc):
        print(f"[*] Disconnected from broker (rc={rc})")

    def on_message(self, client, userdata, msg):
        topic = msg.topic
        payload = msg.payload.decode("utf-8").strip()
        print(f"[>] Message on {topic}: {payload}")

        if topic.endswith("/wake"):
            target_mac = payload.strip()
            if target_mac:
                print(f"[*] Relaying WoL Magic Packet for MAC: {target_mac}")
                send_wol_packet(target_mac)
            return

        if topic == self.cmnd_ping_topic:
            client.publish(self.stat_topic, payload="online", qos=1, retain=True)
            return

        if topic == self.cmnd_media_topic:
            execute_media_command(payload)
            # Immediately publish updated media state
            try:
                st = get_media_state()
                client.publish(self.stat_media_topic, payload=json.dumps(st), qos=0, retain=True)
            except Exception as e:
                print(f"[-] Failed to publish immediate media state: {e}")
            return

        if topic == self.cmnd_power_topic:
            if payload.lower() == "sleep":
                client.publish(self.stat_topic, payload="sleep", qos=1, retain=True)
                time.sleep(0.5)
                execute_power_action("sleep")
                time.sleep(2)
                client.publish(self.stat_topic, payload="online", qos=1, retain=True)
            elif payload.lower() in ("shutdown", "poweroff"):
                client.publish(self.stat_topic, payload="offline", qos=1, retain=True)
                time.sleep(0.5)
                execute_power_action("shutdown")
            elif payload.lower() == "restart":
                client.publish(self.stat_topic, payload="offline", qos=1, retain=True)
                time.sleep(0.5)
                execute_power_action("restart")

    def _telemetry_loop(self):
        """Background daemon thread publishing live telemetry & media state every 3 seconds."""
        time.sleep(1)
        while self.running:
            try:
                # 1. Telemetry
                telem = get_telemetry()
                self.client.publish(self.stat_telemetry_topic, payload=json.dumps(telem), qos=0, retain=True)

                # 2. Media state
                media = get_media_state()
                self.client.publish(self.stat_media_topic, payload=json.dumps(media), qos=0, retain=True)
            except Exception as e:
                print(f"[-] Error in telemetry loop: {e}")
            time.sleep(3.0)

    def run(self):
        print(f"[*] Starting PC Agent for '{self.topic_name}'...")
        print(f"[*] Connecting to {self.broker_host}:{self.broker_port}...")
        self.running = True
        self.client.connect(self.broker_host, self.broker_port, keepalive=30)

        # Start telemetry background thread
        telem_thread = threading.Thread(target=self._telemetry_loop, daemon=True)
        telem_thread.start()

        self.client.loop_forever()


def main():
    parser = argparse.ArgumentParser(description="PC/Laptop Agent for iPad Dock")
    parser.add_argument("--host", default="localhost", help="MQTT Broker Host / Azure IP")
    parser.add_argument("--port", type=int, default=1883, help="MQTT Broker Port (default: 1883)")
    parser.add_argument("--topic", default="desktop_pc", help="Unique topic name for this machine (e.g. desktop_pc or work_laptop)")
    parser.add_argument("--user", default=None, help="MQTT Username (optional)")
    parser.add_argument("--password", default=None, help="MQTT Password (optional)")
    parser.add_argument("--config", default=None, help="Path to JSON config file")

    args = parser.parse_args()

    host = args.host
    port = args.port
    topic = args.topic
    user = args.user
    pwd = args.password

    if args.config and os.path.exists(args.config):
        with open(args.config, "r") as f:
            cfg = json.load(f)
            host = cfg.get("host", host)
            port = cfg.get("port", port)
            topic = cfg.get("topic", topic)
            user = cfg.get("username", user)
            pwd = cfg.get("password", pwd)

    agent = PCAgent(host, port, topic, user, pwd)
    try:
        agent.run()
    except KeyboardInterrupt:
        print("\n[*] Exiting agent...")
        agent.running = False
        agent.client.publish(agent.stat_topic, payload="offline", qos=1, retain=True)
        agent.client.disconnect()


if __name__ == "__main__":
    main()
