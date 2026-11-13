#pragma once
#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <vector>

namespace notka {
struct Sample {
    int bank = 0, root = 60, rr = 0, rate = 32000, channels = 1;
    double tune = 0, loopStart = 0, loopEnd = 0, gain = .5, attack = .004, release = .25;
    std::vector<float> pcm;
    size_t frames() const { return pcm.size() / channels; }
};
struct Settings {
    double volume = 100, pan = 0, transpose = 0, fine = 0, attack = -1, release = -1, delay = 0,
           hold = 0, decay = 0, sustain = 100;
    int filter = 0;
    double cutoff = 16000, resonance = .7, start = 0, end = 100, velocity = 1;
    bool reverse = false, loop = true;
};
struct Event {
    double time = 0, length = 1;
    int pitch = 60, volume = 100, bank = 0, variant = 0;
    Settings settings;
};
struct Biquad {
    double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    std::array<double, 2> z1{}, z2{};
    float process(float in, int channel);
};
struct Voice {
    const Sample *sample = nullptr;
    Settings settings;
    Biquad filter;
    double position = 0, step = 1, low = 0, high = 0, loopLow = 0, loopHigh = 0;
    double age = 0, length = 0, release = .25, level = 0, attack = 0, offLevel = 0;
    double left = 1, right = 1;
    std::array<double, 5> envelopeTimes{}, envelopeLevels{};
    int envelopePoints = 0;
    bool looping = false, active = false;
    uint64_t order = 0;
    double envelope(double at) const;
    void frame(float &l, float &r, double seconds);
};
// Mutations happen with the stream stopped. render() allocates nothing, takes no locks,
// and neither touches the filesystem nor invokes the VM.
class Sampler {
  public:
    explicit Sampler(int rate = 48000) : rate_(rate) {}
    void addSample(Sample sample);
    void prepare(std::vector<Event> events, double duration);
    void seek(double seconds);
    void render(float *stereo, int frames);
    void setLoop(bool enabled, double period = 0);
    double position() const {
        return publishedFrame_.load(std::memory_order_relaxed) / double(rate_);
    }
    double duration() const { return duration_; }
    int rate() const { return rate_; }
    bool finished() const { return finished_.load(std::memory_order_relaxed); }
    uint64_t stolen() const { return stolen_.load(std::memory_order_relaxed); }

  private:
    int rate_;
    int64_t frame_ = 0, endFrame_ = 0, loopFrame_ = 0;
    size_t next_ = 0;
    uint64_t order_ = 0;
    double duration_ = 0, limiter_ = 1;
    bool loop_ = false;
    std::atomic<int64_t> publishedFrame_{0};
    std::atomic<bool> finished_{false};
    std::atomic<uint64_t> stolen_{0};
    std::vector<Sample> samples_;
    struct Prepared {
        int64_t frame;
        Voice voice;
    };
    std::vector<Prepared> events_;
    std::array<Voice, 64> voices_{};
    Voice makeVoice(const Event &event) const;
    void trigger(const Prepared &event, double elapsed = 0);
};
} // namespace notka
