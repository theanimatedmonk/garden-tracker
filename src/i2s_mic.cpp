#include "i2s_mic.h"

#include "config.h"

#include <driver/i2s.h>
#include <cmath>
#include <stdlib.h>

namespace {

constexpr size_t kI2sBlockFrames = 256;

int16_t clampSample(int32_t s) {
  if (s > 32767) {
    return 32767;
  }
  if (s < -32768) {
    return -32768;
  }
  return static_cast<int16_t>(s);
}

int16_t inmp441ToPcm(int32_t raw32) {
  return clampSample(raw32 >> 16);
}

int32_t rawBlock[kI2sBlockFrames * 2];

bool readStereoBlock(int16_t *out, size_t maxFrames, size_t *framesWritten) {
  if (framesWritten != nullptr) {
    *framesWritten = 0;
  }
  if (out == nullptr || maxFrames == 0) {
    return false;
  }

  const size_t framesToRead = maxFrames > kI2sBlockFrames ? kI2sBlockFrames : maxFrames;
#if I2S_MIC_RIGHT_CHANNEL
  const size_t slots = framesToRead;
#else
  const size_t slots = framesToRead * 2;
#endif

  size_t bytesRead = 0;
  const esp_err_t err =
      i2s_read(I2S_PORT, rawBlock, slots * sizeof(int32_t), &bytesRead, portMAX_DELAY);
  if (err != ESP_OK || bytesRead == 0) {
    return false;
  }

  const size_t slotsRead = bytesRead / sizeof(int32_t);
#if I2S_MIC_RIGHT_CHANNEL
  const size_t frames = slotsRead;
  for (size_t i = 0; i < frames; ++i) {
    out[i] = inmp441ToPcm(rawBlock[i]);
  }
#else
  const size_t frames = slotsRead / 2;
  for (size_t i = 0; i < frames; ++i) {
    const int16_t left = inmp441ToPcm(rawBlock[i * 2]);
    const int16_t right = inmp441ToPcm(rawBlock[i * 2 + 1]);
    out[i] = (abs(left) >= abs(right)) ? left : right;
  }
#endif

  if (framesWritten != nullptr) {
    *framesWritten = frames;
  }
  return true;
}

}  // namespace

bool I2SMic::begin() {
  if (installed_) {
    return true;
  }

  i2s_config_t i2s_config = {};
  i2s_config.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  i2s_config.sample_rate = SAMPLE_RATE;
  i2s_config.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
#if I2S_MIC_RIGHT_CHANNEL
  i2s_config.channel_format = I2S_CHANNEL_FMT_ONLY_RIGHT;
#else
  i2s_config.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
#endif
  i2s_config.communication_format =
      (i2s_comm_format_t)(I2S_COMM_FORMAT_I2S | I2S_COMM_FORMAT_I2S_MSB);
  i2s_config.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  i2s_config.dma_buf_count = 8;
  i2s_config.dma_buf_len = 1024;
  i2s_config.use_apll = true;
  i2s_config.tx_desc_auto_clear = false;
  i2s_config.fixed_mclk = 0;

  i2s_pin_config_t pin_config = {};
  pin_config.bck_io_num = I2S_BCK_PIN;
  pin_config.ws_io_num = I2S_WS_PIN;
  pin_config.data_out_num = I2S_PIN_NO_CHANGE;
  pin_config.data_in_num = I2S_DATA_PIN;

  esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, nullptr);
  if (err != ESP_OK) {
    return false;
  }

  err = i2s_set_pin(I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    i2s_driver_uninstall(I2S_PORT);
    return false;
  }

  i2s_zero_dma_buffer(I2S_PORT);
  uint8_t discard[1024];
  size_t discarded = 0;
  i2s_read(I2S_PORT, discard, sizeof(discard), &discarded, pdMS_TO_TICKS(100));
  installed_ = true;
  return true;
}

void I2SMic::end() {
  if (!installed_) {
    return;
  }
  i2s_driver_uninstall(I2S_PORT);
  installed_ = false;
}

size_t I2SMic::readInt16(int16_t *out, size_t maxSamples) {
  if (!installed_ || out == nullptr || maxSamples == 0) {
    return 0;
  }

  size_t total = 0;
  int16_t block[kI2sBlockFrames];

  while (total < maxSamples) {
    const size_t want = maxSamples - total;
    size_t got = 0;
    if (!readStereoBlock(block, want, &got) || got == 0) {
      break;
    }
    for (size_t i = 0; i < got; ++i) {
      out[total + i] = block[i];
    }
    total += got;
  }

  return total;
}

bool I2SMic::measureLevel(int &peakOut, int &rmsOut, size_t sampleCount) {
  peakOut = 0;
  rmsOut = 0;
  if (!installed_ || sampleCount == 0) {
    return false;
  }

  int16_t *buf = static_cast<int16_t *>(malloc(sampleCount * sizeof(int16_t)));
  if (buf == nullptr) {
    return false;
  }

  const size_t n = readInt16(buf, sampleCount);
  if (n == 0) {
    free(buf);
    return false;
  }

  long long sumSq = 0;
  for (size_t i = 0; i < n; ++i) {
    const int v = buf[i];
    const int av = v < 0 ? -v : v;
    if (av > peakOut) {
      peakOut = av;
    }
    sumSq += static_cast<long long>(v) * v;
  }
  rmsOut = static_cast<int>(sqrt(static_cast<double>(sumSq) / n));
  free(buf);
  return true;
}
