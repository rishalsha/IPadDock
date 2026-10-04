#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <PubSubClient.h>
#include <WebServer.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#define SECRET_WIFI_SSID "YOUR_WIFI_SSID"
#define SECRET_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#endif

// Wi-Fi credentials (configured via secrets.h)
const char* WIFI_SSID     = SECRET_WIFI_SSID;
const char* WIFI_PASSWORD = SECRET_WIFI_PASSWORD;

// Azure MQTT Broker (matches iPad Dock)
const char* MQTT_SERVER    = "20.244.45.142";
const int   MQTT_PORT      = 1883;
const char* MQTT_CLIENT_ID = "esp32-wol-relay";

// Known Workstations
const char* MAC_DESKTOP_PC  = "04:7c:16:b7:5e:96";
const char* MAC_WORK_LAPTOP = "30:e3:a4:8e:ff:ee";

// Built-in LED on ESP32 (GPIO 2)
#define STATUS_LED 2

// Objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);
WiFiUDP udp;
WebServer server(80);

unsigned long lastMqttRetry = 0;
unsigned long lastHeartbeat = 0;

// ==========================================
// WAKE-ON-LAN LOGIC
// ==========================================
bool sendWOL(const char* macStr) {
  uint8_t mac[6];
  if (sscanf(macStr, "%hhx:%hhx:%hhx:%hhx:%hhx:%hhx",
             &mac[0], &mac[1], &mac[2], &mac[3], &mac[4], &mac[5]) != 6) {
    Serial.printf("[-] Invalid MAC address format: %s\n", macStr);
    return false;
  }

  uint8_t magicPacket[102];
  // 6 bytes of 0xFF
  for (int i = 0; i < 6; i++) magicPacket[i] = 0xFF;
  // 16 repetitions of target MAC
  for (int i = 1; i <= 16; i++) {
    memcpy(&magicPacket[i * 6], mac, 6);
  }

  // UDP broadcast to port 9 on 255.255.255.255
  IPAddress broadcastIP(255, 255, 255, 255);
  udp.beginPacket(broadcastIP, 9);
  udp.write(magicPacket, sizeof(magicPacket));
  udp.endPacket();

  // Send a second packet to port 7 for maximum motherboard compatibility
  udp.beginPacket(broadcastIP, 7);
  udp.write(magicPacket, sizeof(magicPacket));
  udp.endPacket();

  // Blink LED to confirm transmission
  digitalWrite(STATUS_LED, HIGH);
  delay(100);
  digitalWrite(STATUS_LED, LOW);

  Serial.printf("[+] Broadcasted WoL Magic Packet for MAC: %s\n", macStr);
  return true;
}

// Dispatches wake by target name or direct MAC
void handleWakeTarget(const char* targetOrMac) {
  if (strcmp(targetOrMac, "desktop_pc") == 0 || strcmp(targetOrMac, "pc") == 0) {
    sendWOL(MAC_DESKTOP_PC);
  } else if (strcmp(targetOrMac, "work_laptop") == 0 || strcmp(targetOrMac, "laptop") == 0) {
    sendWOL(MAC_WORK_LAPTOP);
  } else if (strcmp(targetOrMac, "all") == 0) {
    sendWOL(MAC_DESKTOP_PC);
    delay(200);
    sendWOL(MAC_WORK_LAPTOP);
  } else if (strlen(targetOrMac) >= 17) {
    sendWOL(targetOrMac);
  } else {
    Serial.printf("[-] Unknown target or MAC: %s\n", targetOrMac);
  }
}

// ==========================================
// LOCAL HTTP SERVER (Offline Fallback)
// ==========================================
void handleHttpRoot() {
  String html = "<!DOCTYPE html><html><head><title>ESP32 WoL Relay</title>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<style>body{font-family:sans-serif;background:#1c1c1e;color:#fff;text-align:center;padding:30px;}";
  html += "button{background:#0a84ff;color:#fff;border:none;padding:14px 28px;border-radius:12px;font-size:16px;margin:10px;cursor:pointer;}";
  html += "</style></head><body>";
  html += "<h2>⚡ ESP32 Local WoL Relay</h2>";
  html += "<p>Trigger Wake-on-LAN directly over local network:</p>";
  html += "<button onclick=\"location.href='/wake?target=desktop_pc'\">Wake Desktop PC</button><br>";
  html += "<button onclick=\"location.href='/wake?target=work_laptop'\">Wake Work Laptop</button><br>";
  html += "<button onclick=\"location.href='/wake?target=all'\">Wake All Workstations</button>";
  html += "<p style='color:#8e8e93;margin-top:30px;'>IP: " + WiFi.localIP().toString() + "</p>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void handleHttpWake() {
  String target = server.arg("target");
  String mac = server.arg("mac");
  if (target.length() > 0) {
    handleWakeTarget(target.c_str());
    server.send(200, "text/plain", "OK: Waking " + target);
  } else if (mac.length() > 0) {
    sendWOL(mac.c_str());
    server.send(200, "text/plain", "OK: Sent WoL to " + mac);
  } else {
    server.send(400, "text/plain", "Missing target or mac parameter");
  }
}

// ==========================================
// MQTT CALLBACK & RECONNECT
// ==========================================
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  char msg[64];
  int len = (length < 63) ? length : 63;
  memcpy(msg, payload, len);
  msg[len] = '\0';

  Serial.printf("[*] MQTT [%s] -> %s\n", topic, msg);

  // Matches cmnd/desktop_pc/wake, cmnd/work_laptop/wake, cmnd/room_light/WakeOnLan
  if (strstr(topic, "desktop_pc/wake") != NULL) {
    if (len >= 17) sendWOL(msg);
    else sendWOL(MAC_DESKTOP_PC);
  } else if (strstr(topic, "work_laptop/wake") != NULL) {
    if (len >= 17) sendWOL(msg);
    else sendWOL(MAC_WORK_LAPTOP);
  } else if (strstr(topic, "WakeOnLan") != NULL || strstr(topic, "/wake") != NULL) {
    handleWakeTarget(msg);
  }
}

void reconnectMqtt() {
  if (mqttClient.connected()) return;

  if (millis() - lastMqttRetry > 5000) {
    lastMqttRetry = millis();
    Serial.print("[*] Connecting to MQTT broker...");
    // Connect with Last Will & Testament (LWT) topic retained as OFFLINE
    if (mqttClient.connect(MQTT_CLIENT_ID, "tele/esp32_wol/LWT", 0, true, "OFFLINE")) {
      Serial.println(" connected!");
      // Listen to iPad Dock wake commands
      mqttClient.subscribe("cmnd/+/wake");
      mqttClient.subscribe("cmnd/room_light/WakeOnLan");
      mqttClient.subscribe("cmnd/esp32_wol/#");
      // Publish retained ONLINE LWT and telemetry state
      mqttClient.publish("tele/esp32_wol/LWT", "ONLINE", true);
      mqttClient.publish("tele/esp32_wol/STATE", "ONLINE");
      lastHeartbeat = millis();
    } else {
      Serial.printf(" failed (rc=%d), will retry.\n", mqttClient.state());
    }
  }
}

// ==========================================
// SETUP & MAIN LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  delay(1000);
  Serial.printf("\n========================================\n");
  Serial.printf("   ESP32 24/7 Wake-on-LAN Local Relay    \n");
  Serial.printf("========================================\n");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[*] Connecting to Wi-Fi SSID: %s", WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));
  }
  digitalWrite(STATUS_LED, LOW);
  Serial.printf("\n[+] Wi-Fi connected! IP Address: %s\n", WiFi.localIP().toString().c_str());

  udp.begin(9);

  // Setup Local Web Server
  server.on("/", handleHttpRoot);
  server.on("/wake", handleHttpWake);
  server.begin();
  Serial.println("[+] Local HTTP WoL Server running on port 80");

  // Setup MQTT
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);
  mqttClient.setKeepAlive(15);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      reconnectMqtt();
    }
    mqttClient.loop();

    // Periodic heartbeat every 15 seconds
    if (mqttClient.connected() && (millis() - lastHeartbeat > 15000)) {
      lastHeartbeat = millis();
      mqttClient.publish("tele/esp32_wol/STATE", "ONLINE");
    }
  } else {
    Serial.println("[-] Wi-Fi lost, reconnecting...");
    WiFi.reconnect();
    delay(2000);
  }

  server.handleClient();
}
