#!/usr/bin/env python3
"""
Cross-Platform PC & Laptop Background Agent for iPad Dock
Supports Windows & Linux.
Listens for MQTT power commands (sleep, shutdown, restart) and maintains online/sleep status.
"""

import sys
import os
import time
import json
import platform
import argparse
import subprocess
import socket
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
        for _ in range(2):
            for addr, port in destinations:
                sock.sendto(packet, (addr, port))
            time.sleep(0.05)
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


class PCAgent:
    def __init__(self, broker_host, broker_port, topic_name, username=None, password=None):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.topic_name = topic_name
        self.username = username
        self.password = password

        self.stat_topic = f"stat/{self.topic_name}/status"
        self.cmnd_power_topic = f"cmnd/{self.topic_name}/power"
        self.cmnd_ping_topic = f"cmnd/{self.topic_name}/ping"

        client_id = f"pc_agent_{self.topic_name}_{int(time.time())}"
        self.client = mqtt.Client(client_id=client_id)

        if self.username:
            self.client.username_pw_set(self.username, self.password)

        # Configure Last Will and Testament (LWT) so broker marks device offline on disconnect
        self.client.will_set(self.stat_topic, payload="offline", qos=1, retain=True)

        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print(f"[+] Connected to MQTT broker at {self.broker_host}:{self.broker_port}")
            # Announce online state with retain=True
            client.publish(self.stat_topic, payload="online", qos=1, retain=True)
            # Subscribe to command topics
            client.subscribe(self.cmnd_power_topic)
            client.subscribe(self.cmnd_ping_topic)
            client.subscribe("cmnd/+/wake")
            print(f"[+] Subscribed to: {self.cmnd_power_topic}, {self.cmnd_ping_topic}, cmnd/+/wake")
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

        if topic == self.cmnd_power_topic:
            if payload.lower() == "sleep":
                # Report sleep state before entering suspend
                client.publish(self.stat_topic, payload="sleep", qos=1, retain=True)
                time.sleep(0.5)
                execute_power_action("sleep")
                # When machine wakes up, announce online again
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

    def run(self):
        print(f"[*] Starting PC Agent for '{self.topic_name}'...")
        print(f"[*] Connecting to {self.broker_host}:{self.broker_port}...")
        self.client.connect(self.broker_host, self.broker_port, keepalive=30)
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

    # If config file provided, override args
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
        agent.client.publish(agent.stat_topic, payload="offline", qos=1, retain=True)
        agent.client.disconnect()


if __name__ == "__main__":
    main()
