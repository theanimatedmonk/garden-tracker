#include "audio_stream.h"

#include "config.h"

#include <HTTPClient.h>
#include <WiFi.h>

namespace {

String backendBaseUrl() {
  return String("http://") + BACKEND_HOST + ":" + String(BACKEND_PORT);
}

}  // namespace

bool AudioStream::sendPcmChunk(const int16_t *samples, size_t sampleCount) {
  if (samples == nullptr || sampleCount == 0 || WiFi.status() != WL_CONNECTED) {
    return false;
  }

  const size_t byteCount = sampleCount * sizeof(int16_t);
  HTTPClient http;
  const String url = backendBaseUrl() + "/api/ingest/audio";
  http.begin(url);
  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/octet-stream");
  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("X-Sample-Rate", String(SAMPLE_RATE));
  http.addHeader("X-Bits-Per-Sample", String(BITS_PER_SAMPLE));
  http.addHeader("X-Channels", "1");

  const int code = http.POST((uint8_t *)samples, byteCount);
  http.end();
  return code >= 200 && code < 300;
}

bool AudioStream::sendHeartbeat(bool micOk, bool wifiOk) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  const String url = backendBaseUrl() + "/api/ingest/heartbeat";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  const String body = String("{\"device_id\":\"") + DEVICE_ID +
                      "\",\"mic_ok\":" + (micOk ? "true" : "false") +
                      ",\"wifi_ok\":" + (wifiOk ? "true" : "false") + "}";
  const int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}
