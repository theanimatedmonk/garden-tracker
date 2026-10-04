#pragma once

#include <stddef.h>
#include <stdint.h>

class AudioStream {
 public:
  bool sendPcmChunk(const int16_t *samples, size_t sampleCount);
  bool sendHeartbeat(bool micOk, bool wifiOk);
};
