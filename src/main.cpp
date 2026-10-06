#include <Arduino.h>
#include <WiFi.h>
#include <cmath>

#include "audio_stream.h"
#include "config.h"
#include "i2s_mic.h"
#include "secrets.h"

I2SMic mic;
AudioStream stream;

int16_t chunkBuffer[SAMPLES_PER_CHUNK];

bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connect failed");
    return false;
  }

  Serial.print("Wi-Fi OK, IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("Wildlife Observer — ESP32 audio sensor");

  if (!connectWifi()) {
    return;
  }

  if (!mic.begin()) {
    Serial.println("I2S microphone init failed");
    return;
  }
  Serial.println("I2S microphone ready");

  int setupPeak = 0;
  int setupRms = 0;
  if (mic.measureLevel(setupPeak, setupRms, 4096)) {
    Serial.printf("Setup mic level (0.25 s): peak=%d  rms=%d\n", setupPeak, setupRms);
  } else {
    Serial.println("Setup mic level: read failed");
  }

  Serial.printf("Streaming to http://%s:%d\n", BACKEND_HOST, BACKEND_PORT);
  Serial.println("Every ~1 s you should see: Sent 16000 samples  peak=…  rms=…");
  Serial.println("Phone test: play audio near the mic — peak should jump above ~100.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi lost — reconnecting");
    connectWifi();
    delay(1000);
    return;
  }

  static unsigned long lastHeartbeat = 0;
  const unsigned long now = millis();

  const size_t n = mic.readInt16(chunkBuffer, SAMPLES_PER_CHUNK);
  if (n == 0) {
    Serial.println("I2S read returned 0 samples");
    delay(500);
    return;
  }

  int peak = 0;
  long long sumSq = 0;
  for (size_t i = 0; i < n; ++i) {
    const int v = chunkBuffer[i];
    const int av = v < 0 ? -v : v;
    if (av > peak) {
      peak = av;
    }
    sumSq += static_cast<long long>(v) * v;
  }
  const int rms = static_cast<int>(sqrt(static_cast<double>(sumSq) / n));

  const bool sent = stream.sendPcmChunk(chunkBuffer, n);
  if (sent) {
    Serial.printf("Sent %u samples  peak=%d  rms=%d\n", static_cast<unsigned>(n), peak, rms);
    if (peak < 50) {
      Serial.println("  (very quiet — tap mic or play sound near it; check wiring in architecture.md)");
    }
  } else {
    Serial.println("Upload failed");
    delay(500);
  }

  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    stream.sendHeartbeat(true, true);
    lastHeartbeat = now;
  }
}
