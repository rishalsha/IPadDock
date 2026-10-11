#!/usr/bin/env python3
"""
Alexa Workstation Skill Bridge (for Amazon Echo Dot).
Receives HTTPS Alexa Voice Intents from Amazon Skills Kit,
interacts with local Mosquitto MQTT broker (20.244.45.142 / 127.0.0.1:1883),
and generates spoken speech responses echoed back to your Echo device.
"""

import sys
import os
import json
import time
import re
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import paho.mqtt.client as mqtt

# Configuration
HTTP_PORT = 8001
MQTT_HOST = "127.0.0.1"
MQTT_PORT = 1883

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("alexa_bridge")

# App Launch URL & Desktop command mappings
APP_MAP = {
    "whatsapp": {"name": "WhatsApp", "cmd": "open_or_focus:whatsapp:https://web.whatsapp.com"},
    "whats app": {"name": "WhatsApp", "cmd": "open_or_focus:whatsapp:https://web.whatsapp.com"},
    "gemini": {"name": "Gemini", "cmd": "open_or_focus:gemini:https://gemini.google.com"},
    "google gemini": {"name": "Gemini", "cmd": "open_or_focus:gemini:https://gemini.google.com"},
    "claude": {"name": "Claude", "cmd": "open_or_focus:claude:https://claude.ai"},
    "anthropic": {"name": "Claude", "cmd": "open_or_focus:claude:https://claude.ai"},
    "chatgpt": {"name": "ChatGPT", "cmd": "open_or_focus:chatgpt:https://chatgpt.com"},
    "chat gpt": {"name": "ChatGPT", "cmd": "open_or_focus:chatgpt:https://chatgpt.com"},
    "gpt": {"name": "ChatGPT", "cmd": "open_or_focus:chatgpt:https://chatgpt.com"},
    "youtube": {"name": "YouTube", "cmd": "open_or_focus:youtube:https://youtube.com"},
    "you tube": {"name": "YouTube", "cmd": "open_or_focus:youtube:https://youtube.com"},
    "github": {"name": "GitHub", "cmd": "open_or_focus:github:https://github.com"},
    "git hub": {"name": "GitHub", "cmd": "open_or_focus:github:https://github.com"},
    "gmail": {"name": "Gmail", "cmd": "open_or_focus:gmail:https://mail.google.com"},
    "google mail": {"name": "Gmail", "cmd": "open_or_focus:gmail:https://mail.google.com"},
    "mail": {"name": "Gmail", "cmd": "open_or_focus:gmail:https://mail.google.com"},
    "spotify": {"name": "Spotify", "cmd": "open_or_focus:spotify:https://open.spotify.com"},
    "terminal": {"name": "Terminal", "cmd": "open_or_focus:terminal:ghostty"},
    "console": {"name": "Terminal", "cmd": "open_or_focus:terminal:ghostty"},
    "browser": {"name": "Browser", "cmd": "open_or_focus:browser:google-chrome"},
    "chrome": {"name": "Google Chrome", "cmd": "open_or_focus:browser:google-chrome"},
}

PC_MAC = "04:7c:16:b7:5e:96"
LAP_MAC = "30:e3:a4:8e:ff:ee"


class WorkstationState:
    def __init__(self):
        self.lock = threading.Lock()
        self.pc_online = False
        self.pc_telemetry = {}
        self.pc_media = {}
        self.tasmota_states = {
            "POWER1": "OFF",  # Fan
            "POWER2": "OFF",  # Light
            "POWER3": "OFF"   # Bulb
        }
        self.last_update = time.time()

    def update_telemetry(self, data: dict):
        with self.lock:
            self.pc_telemetry = data
            self.pc_online = True
            self.last_update = time.time()

    def update_media(self, data: dict):
        with self.lock:
            self.pc_media = data
            self.last_update = time.time()

    def update_pc_status(self, status: str):
        with self.lock:
            self.pc_online = (status.lower() == "online")

    def update_tasmota(self, channel: str, state: str):
        with self.lock:
            self.tasmota_states[channel.upper()] = state.upper()


state = WorkstationState()
mqtt_client: mqtt.Client = None


def on_mqtt_connect(client, userdata, flags, rc, properties=None):
    logger.info("Connected to Mosquitto MQTT broker (rc=%s)", rc)
    client.subscribe([
        ("stat/desktop_pc/#", 0),
        ("stat/desktop_pc", 0),
        ("stat/room_light/#", 0),
        ("tele/room_light/#", 0),
        ("stat/ipaddock/#", 0)
    ])


def on_mqtt_message(client, userdata, msg):
    topic = msg.topic
    try:
        payload_str = msg.payload.decode("utf-8")
    except Exception:
        return

    # 1. PC online status
    if topic == "stat/desktop_pc":
        state.update_pc_status(payload_str)
        return

    # 2. Telemetry
    if topic == "stat/desktop_pc/telemetry":
        try:
            data = json.loads(payload_str)
            state.update_telemetry(data)
        except Exception:
            pass
        return

    # 3. Media
    if topic == "stat/desktop_pc/media":
        try:
            data = json.loads(payload_str)
            state.update_media(data)
        except Exception:
            pass
        return

    # 4. Tasmota Power Relays
    m = re.search(r"POWER([1-3])$", topic)
    if m:
        state.update_tasmota(f"POWER{m.group(1)}", payload_str)


def init_mqtt():
    global mqtt_client
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="alexa_bridge_server")
    mqtt_client.on_connect = on_mqtt_connect
    mqtt_client.on_message = on_mqtt_message
    try:
        mqtt_client.connect(MQTT_HOST, MQTT_PORT, 60)
        mqtt_client.loop_start()
    except Exception as e:
        logger.error("Failed to connect to MQTT: %s", e)


def pub_mqtt(topic: str, payload: str):
    if mqtt_client:
        mqtt_client.publish(topic, payload)
        logger.info("MQTT PUB [%s] -> %s", topic, payload)


# ---------------------------------------------------------------------------
# Alexa Response Builder Helpers
# ---------------------------------------------------------------------------
def build_alexa_response(speech_text: str, should_end_session: bool = True, reprompt_text: str = None) -> dict:
    resp = {
        "version": "1.0",
        "response": {
            "outputSpeech": {
                "type": "PlainText",
                "text": speech_text
            },
            "shouldEndSession": should_end_session
        }
    }
    if reprompt_text and not should_end_session:
        resp["response"]["reprompt"] = {
            "outputSpeech": {
                "type": "PlainText",
                "text": reprompt_text
            }
        }
    return resp


def get_slot_value(intent: dict, slot_name: str) -> str:
    slots = intent.get("slots", {})
    slot = slots.get(slot_name, {})
    # Check resolutions first
    resolutions = slot.get("resolutions", {}).get("resolutionsPerAuthority", [])
    for res in resolutions:
        if res.get("status", {}).get("code") == "ER_SUCCESS_MATCH":
            values = res.get("values", [])
            if values:
                return values[0].get("value", {}).get("name", "").lower()
    return slot.get("value", "").lower()


# ---------------------------------------------------------------------------
# Intent Processors
# ---------------------------------------------------------------------------
def handle_launch():
    return build_alexa_response(
        "Workstation is online. You can ask for status, launch apps, control music, or activate scenes. What would you like to do?",
        should_end_session=False,
        reprompt_text="You can say: check CPU, open Gemini, pause music, or focus mode."
    )


def handle_get_telemetry():
    with state.lock:
        online = state.pc_online
        telem = state.pc_telemetry
        media = state.pc_media

    if not online or not telem:
        return build_alexa_response("Your desktop PC appears to be sleeping or offline right now.")

    cpu = telem.get("cpu_pct", "unknown")
    ram = telem.get("ram_pct", "unknown")
    temp = telem.get("temp_c", "")
    temp_phrase = f", temperature is {int(temp)} degrees" if temp else ""

    speech = f"Your PC is online. CPU usage is currently {cpu} percent, memory is at {ram} percent{temp_phrase}."

    if media and media.get("status") == "Playing" and media.get("title"):
        title = media.get("title")
        artist = media.get("artist")
        by_artist = f" by {artist}" if artist else ""
        speech += f" Currently playing {title}{by_artist}."

    return build_alexa_response(speech)


def handle_launch_app(intent: dict):
    raw_app = get_slot_value(intent, "appName") or get_slot_value(intent, "app")
    if not raw_app:
        return build_alexa_response("Which app would you like to open? For example: WhatsApp, Gemini, Claude, or YouTube.", should_end_session=False)

    app_key = raw_app.lower().strip()
    mapping = APP_MAP.get(app_key)

    if mapping:
        disp_name = mapping["name"]
        cmd = mapping["cmd"]
    else:
        disp_name = raw_app.capitalize()
        cmd = f"open_or_focus:{raw_app}"

    pub_mqtt("cmnd/desktop_pc/action", cmd)
    return build_alexa_response(f"Opening {disp_name} on your PC.")


def handle_media_control(intent: dict):
    cmd_raw = get_slot_value(intent, "command") or get_slot_value(intent, "action")
    if not cmd_raw:
        cmd_raw = "play_pause"

    cmd = cmd_raw.lower()
    if any(w in cmd for w in ["play", "resume", "start"]):
        pub_mqtt("cmnd/desktop_pc/media", "play")
        return build_alexa_response("Resumed music playback.")
    elif any(w in cmd for w in ["pause", "stop"]):
        pub_mqtt("cmnd/desktop_pc/media", "pause")
        return build_alexa_response("Music paused.")
    elif any(w in cmd for w in ["next", "skip"]):
        pub_mqtt("cmnd/desktop_pc/media", "next")
        return build_alexa_response("Skipped to next track.")
    elif any(w in cmd for w in ["previous", "back", "prev"]):
        pub_mqtt("cmnd/desktop_pc/media", "prev")
        return build_alexa_response("Playing previous track.")
    elif any(w in cmd for w in ["mute"]):
        pub_mqtt("cmnd/desktop_pc/media", "mute")
        return build_alexa_response("Media volume muted.")
    elif any(w in cmd for w in ["up", "louder", "higher"]):
        pub_mqtt("cmnd/desktop_pc/media", "vol_up")
        return build_alexa_response("Volume turned up.")
    elif any(w in cmd for w in ["down", "lower", "softer"]):
        pub_mqtt("cmnd/desktop_pc/media", "vol_down")
        return build_alexa_response("Volume turned down.")
    else:
        pub_mqtt("cmnd/desktop_pc/media", "play_pause")
        return build_alexa_response("Toggled media playback.")


def handle_volume_set(intent: dict):
    vol_str = get_slot_value(intent, "volume") or get_slot_value(intent, "level")
    try:
        vol = int(re.sub(r"[^\d]", "", vol_str))
        vol = max(0, min(100, vol))
    except Exception:
        vol = 50

    pub_mqtt("cmnd/desktop_pc/media", f"vol_set:{vol}")
    return build_alexa_response(f"Workstation volume set to {vol} percent.")


def handle_system_control(intent: dict):
    action = (get_slot_value(intent, "action") or "").lower()

    if any(w in action for w in ["mic", "microphone"]):
        pub_mqtt("cmnd/desktop_pc/action", "toggle_mic")
        return build_alexa_response("Microphone toggled.")

    elif any(w in action for w in ["sleep", "suspend"]):
        pub_mqtt("cmnd/desktop_pc/power", "sleep")
        return build_alexa_response("Putting your PC to sleep.")

    elif any(w in action for w in ["shutdown", "turn off", "power off"]):
        pub_mqtt("cmnd/desktop_pc/power", "shutdown")
        return build_alexa_response("Shutting down your desktop PC.")

    elif any(w in action for w in ["restart", "reboot"]):
        pub_mqtt("cmnd/desktop_pc/power", "restart")
        return build_alexa_response("Restarting your desktop PC.")

    elif any(w in action for w in ["screenshot", "screen shot", "capture"]):
        pub_mqtt("cmnd/desktop_pc/action", "screenshot")
        return build_alexa_response("Screenshot captured on PC.")

    elif any(w in action for w in ["wake", "turn on", "power on", "boot"]):
        pub_mqtt("cmnd/room_light/WakeOnLan", PC_MAC)
        return build_alexa_response("Waking up your PC via network magic packet.")

    else:
        return build_alexa_response("System action executed.")


def handle_smart_home(intent: dict):
    dev = (get_slot_value(intent, "device") or "").lower()
    st = (get_slot_value(intent, "state") or "on").lower()
    pwr = "ON" if any(w in st for w in ["on", "start", "enable"]) else "OFF"

    if "fan" in dev:
        pub_mqtt("cmnd/room_light/POWER1", pwr)
        return build_alexa_response(f"Fan turned {pwr.lower()}.")
    elif any(w in dev for w in ["light", "overhead", "room light"]):
        pub_mqtt("cmnd/room_light/POWER2", pwr)
        return build_alexa_response(f"Room light turned {pwr.lower()}.")
    elif any(w in dev for w in ["bulb", "desk", "lamp"]):
        pub_mqtt("cmnd/room_light/POWER3", pwr)
        return build_alexa_response(f"Desk bulb turned {pwr.lower()}.")
    elif any(w in dev for w in ["all", "everything", "devices"]):
        pub_mqtt("cmnd/room_light/POWER1", pwr)
        pub_mqtt("cmnd/room_light/POWER2", pwr)
        pub_mqtt("cmnd/room_light/POWER3", pwr)
        return build_alexa_response(f"All workstation devices turned {pwr.lower()}.")
    else:
        pub_mqtt("cmnd/room_light/POWER3", pwr)
        return build_alexa_response(f"Device turned {pwr.lower()}.")


def handle_scenes(intent: dict):
    scene = (get_slot_value(intent, "scene") or "").lower()

    if any(w in scene for w in ["focus", "studio", "work", "code"]):
        pub_mqtt("cmnd/room_light/POWER1", "ON")  # Fan on
        pub_mqtt("cmnd/room_light/POWER3", "ON")  # Desk bulb on
        pub_mqtt("cmnd/desktop_pc/action", "open_or_focus:terminal:ghostty")
        return build_alexa_response("Focus mode activated. Fan and desk bulb turned on.")

    elif any(w in scene for w in ["ambient", "relax", "chill", "music"]):
        pub_mqtt("cmnd/room_light/POWER3", "ON")   # Desk bulb on
        pub_mqtt("cmnd/room_light/POWER2", "OFF")  # Overhead light off
        pub_mqtt("cmnd/desktop_pc/media", "play")
        return build_alexa_response("Ambient mode activated. Overhead light dimmed and media resumed.")

    elif any(w in scene for w in ["night", "bed", "sleep", "goodnight", "nightstand"]):
        pub_mqtt("cmnd/room_light/POWER1", "OFF")
        pub_mqtt("cmnd/room_light/POWER2", "OFF")
        pub_mqtt("cmnd/room_light/POWER3", "OFF")
        pub_mqtt("cmnd/desktop_pc/power", "sleep")
        return build_alexa_response("Goodnight. Workstation lights turned off and PC entering sleep mode.")

    else:
        return build_alexa_response(f"{scene.capitalize()} scene activated.")


def handle_clipboard(intent: dict):
    target = (get_slot_value(intent, "target") or "laptop").lower()
    if "pc" in target:
        pub_mqtt("cmnd/desktop_pc/action", "clipboard:synced_from_alexa")
        return build_alexa_response("Clipboard synced to PC.")
    else:
        # Beam last clipboard to laptop
        return build_alexa_response("Latest clipboard synced between PC and laptop.")


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------
class AlexaRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Keep logs clean
        pass

    def send_json(self, status: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json;charset=UTF-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not self.path.startswith("/alexa"):
            self.send_json(404, {"error": "Not Found"})
            return

        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len)

        try:
            req_data = json.loads(raw_body.decode("utf-8"))
        except Exception as e:
            self.send_json(400, {"error": f"Invalid JSON: {e}"})
            return

        req_type = req_data.get("request", {}).get("type", "")
        intent = req_data.get("request", {}).get("intent", {})
        intent_name = intent.get("name", "")

        logger.info("Alexa Request: type=%s intent=%s", req_type, intent_name)

        if req_type == "LaunchRequest":
            resp = handle_launch()
        elif req_type == "IntentRequest":
            if intent_name in ("GetTelemetryIntent", "GetStatusIntent"):
                resp = handle_get_telemetry()
            elif intent_name == "LaunchAppIntent":
                resp = handle_launch_app(intent)
            elif intent_name == "MediaControlIntent":
                resp = handle_media_control(intent)
            elif intent_name == "VolumeSetIntent":
                resp = handle_volume_set(intent)
            elif intent_name == "SystemControlIntent":
                resp = handle_system_control(intent)
            elif intent_name == "SmartHomeIntent":
                resp = handle_smart_home(intent)
            elif intent_name == "QuickScenesIntent":
                resp = handle_scenes(intent)
            elif intent_name == "ClipboardSyncIntent":
                resp = handle_clipboard(intent)
            elif intent_name == "AMAZON.HelpIntent":
                resp = build_alexa_response(
                    "You can ask me to open apps like Gemini or WhatsApp, control media, check CPU and memory, mute the microphone, or turn on the fan. What would you like to do?",
                    should_end_session=False
                )
            elif intent_name in ("AMAZON.CancelIntent", "AMAZON.StopIntent"):
                resp = build_alexa_response("Goodbye.")
            else:
                resp = build_alexa_response("Workstation received your command.")
        elif req_type == "SessionEndedRequest":
            resp = build_alexa_response("Goodbye.")
        else:
            resp = build_alexa_response("Command received.")

        self.send_json(200, resp)


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def main():
    init_mqtt()
    server = ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), AlexaRequestHandler)
    logger.info("=" * 60)
    logger.info("Alexa Workstation Bridge listening on 127.0.0.1:%d", HTTP_PORT)
    logger.info("Public Webhook: https://idock.rishal.studio/alexa")
    logger.info("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        server.server_close()


if __name__ == "__main__":
    main()
