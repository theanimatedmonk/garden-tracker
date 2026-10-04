#pragma once

#include <stddef.h>
#include <stdint.h>

class I2SMic {
 public:
  bool begin();
  void end();
  // Reads up to maxSamples int16 mono samples; returns count read
  size_t readInt16(int16_t *out, size_t maxSamples);
  bool measureLevel(int &peakOut, int &rmsOut, size_t sampleCount = 4096);

 private:
  bool installed_ = false;
};
