#pragma once

// I2S pins for INMP441 (see module.md)
#define I2S_BCK_PIN 26
#define I2S_WS_PIN 25
#define I2S_DATA_PIN 33
#define I2S_PORT I2S_NUM_0
#define I2S_MIC_RIGHT_CHANNEL 0
// If WAVs stay silent: set to 1 and wire INMP441 L/R to 3V3 (not GND)


// 16 kHz mono keeps uplink light; backend resamples for BirdNET (48 kHz)
#define SAMPLE_RATE 16000
#define BITS_PER_SAMPLE 16

// Chunk size sent to backend (~1 s of audio)
#define SAMPLES_PER_CHUNK SAMPLE_RATE
#define CHUNK_BYTES (SAMPLES_PER_CHUNK * (BITS_PER_SAMPLE / 8))

// Backend on your computer (LAN IP — not "localhost" from ESP32's view)
#define BACKEND_HOST "192.168.1.5"
#define BACKEND_PORT 8000

#define DEVICE_ID "esp32-observer-1"

#define HEARTBEAT_INTERVAL_MS 30000
#define WIFI_CONNECT_TIMEOUT_MS 20000
