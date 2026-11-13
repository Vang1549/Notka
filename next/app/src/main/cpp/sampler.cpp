#include "sampler.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace notka {
constexpr double pi = 3.14159265358979323846;
float Biquad::process(float in, int ch) {
    double out = b0 * in + z1[ch];
    z1[ch] = b1 * in - a1 * out + z2[ch];
    z2[ch] = b2 * in - a2 * out;
    if (std::abs(z1[ch]) < 1e-24)
        z1[ch] = 0;
    if (std::abs(z2[ch]) < 1e-24)
        z2[ch] = 0;
    return float(out);
}
double Voice::envelope(double at) const {
    if (at > length)
        return offLevel * std::max(0.0, 1 - (at - length) / release);
    // Equal-time points use the last value, matching the legacy envelopePlan map.
    for (int i = 1; i < envelopePoints; ++i)
        if (at < envelopeTimes[i])
            return envelopeLevels[i - 1] + (envelopeLevels[i] - envelopeLevels[i - 1]) *
                                               (at - envelopeTimes[i - 1]) /
                                               (envelopeTimes[i] - envelopeTimes[i - 1]);
    return envelopeLevels[envelopePoints - 1];
}
void Voice::frame(float &l, float &r, double seconds) {
    if (!active)
        return;
    if (age >= length + release) {
        active = false;
        return;
    }
    if (looping && position >= loopHigh)
        position = loopLow + std::fmod(position - loopLow, loopHigh - loopLow);
    if (position >= high) {
        active = false;
        return;
    }
    double pos = settings.reverse ? double(sample->frames() - 1) - position : position;
    auto i = static_cast<size_t>(std::max(0.0, std::floor(pos)));
    auto j = std::min(i + 1, sample->frames() - 1);
    double t = pos - std::floor(pos);
    double env = envelope(age);
    float a = float(
        (sample->pcm[i * sample->channels] * (1 - t) + sample->pcm[j * sample->channels] * t) *
        env);
    float b = sample->channels == 1
                  ? a
                  : float((sample->pcm[i * 2 + 1] * (1 - t) + sample->pcm[j * 2 + 1] * t) * env);
    if (settings.filter) {
        a = filter.process(a, 0);
        b = filter.process(b, 1);
    }
    if (sample->channels == 1) {
        l += a * float(left);
        r += a * float(right);
    } else if (settings.pan < 0) {
        l += a + b * float(left);
        r += b * float(right);
    } else if (settings.pan > 0) {
        l += a * float(left);
        r += b + a * float(right);
    } else {
        l += a;
        r += b;
    }
    position += step;
    age += seconds;
}
void Sampler::addSample(Sample sample) {
    if (sample.channels < 1 || sample.channels > 2 || sample.rate < 8000 || sample.rate > 192000 ||
        sample.frames() < 2 || sample.pcm.size() % sample.channels || sample.root < 0 ||
        sample.root > 127 || !std::isfinite(sample.tune) || sample.gain <= 0 || sample.gain > 1 ||
        !std::isfinite(sample.gain) || sample.attack < 0 || sample.attack > 1 ||
        sample.release < .01 || sample.release > 3 || !std::isfinite(sample.attack) ||
        !std::isfinite(sample.release) || !std::isfinite(sample.loopStart) ||
        !std::isfinite(sample.loopEnd) || sample.rr < 0 || sample.rr > 7 || sample.loopStart < 0 ||
        sample.loopEnd > sample.frames() ||
        (sample.loopEnd > 0 && sample.loopStart >= sample.loopEnd))
        throw std::invalid_argument("Invalid PCM sample");
    for (float x : sample.pcm)
        if (!std::isfinite(x) || std::abs(x) > 1.01f)
            throw std::invalid_argument("Invalid PCM amplitude");
    if (!events_.empty())
        throw std::logic_error("Samples are immutable after prepare");
    samples_.push_back(std::move(sample));
}
Voice Sampler::makeVoice(const Event &e) const {
    Voice v;
    v.settings = e.settings;
    const Sample *selected = nullptr;
    int variants = 1;
    for (const auto &s : samples_)
        if (s.bank == e.bank)
            variants = std::max(variants, s.rr + 1);
    int rr = e.variant % variants;
    double tuned = e.pitch + e.settings.transpose;
    for (const auto &s : samples_)
        if (s.bank == e.bank && s.rr == rr &&
            (!selected || std::abs(s.root - tuned) < std::abs(selected->root - tuned)))
            selected = &s;
    if (!selected)
        for (const auto &s : samples_)
            if (s.bank == e.bank) {
                selected = &s;
                break;
            }
    if (!selected)
        throw std::invalid_argument("Missing bank");
    v.sample = selected;
    const auto &s = *selected;
    const auto &p = e.settings;
    v.step = double(s.rate) / rate_ * std::pow(2, (tuned - s.root + (s.tune + p.fine) / 100) / 12);
    v.low = s.frames() * p.start / 100;
    v.high = s.frames() * p.end / 100;
    v.position = v.low;
    v.loopLow = s.loopStart;
    v.loopHigh = s.loopEnd;
    if (p.reverse && v.loopHigh > v.loopLow) {
        v.loopLow = s.frames() - s.loopEnd;
        v.loopHigh = s.frames() - s.loopStart;
    }
    v.looping = p.loop && v.loopHigh > v.loopLow && v.loopLow >= v.low && v.loopHigh <= v.high;
    v.length = e.length;
    v.release = p.release < 0 ? s.release : p.release;
    v.attack = p.attack < 0 ? std::min(s.attack, e.length / 2) : p.attack;
    v.level = s.gain * p.volume / 100 * std::pow(e.volume / 100.0, p.velocity);
    const std::array<double, 5> times{0, p.delay, p.delay + v.attack, p.delay + v.attack + p.hold,
                                      p.delay + v.attack + p.hold + p.decay};
    const std::array<double, 5> levels{0, 0, v.level, v.level, v.level * p.sustain / 100};
    for (int i = 0; i < 5; ++i) {
        if (v.envelopePoints == 0 || times[i] != v.envelopeTimes[v.envelopePoints - 1])
            ++v.envelopePoints;
        v.envelopeTimes[v.envelopePoints - 1] = times[i];
        v.envelopeLevels[v.envelopePoints - 1] = levels[i];
    }
    v.offLevel = v.envelope(e.length);
    v.active = v.level > 0;
    if (s.channels == 1 && p.pan == 0) {
        v.left = 1;
        v.right = 1;
    } else if (s.channels == 1) {
        double angle = (p.pan / 100 + 1) * pi / 4;
        v.left = std::cos(angle);
        v.right = std::sin(angle);
    } else if (p.pan < 0) {
        double angle = (p.pan / 100 + 1) * pi / 2;
        v.left = std::cos(angle);
        v.right = std::sin(angle);
    } else {
        double angle = p.pan / 100 * pi / 2;
        v.left = std::cos(angle);
        v.right = std::sin(angle);
    }
    if (p.filter) {
        double w = 2 * pi * std::clamp(p.cutoff, 20.0, rate_ * .49) / rate_, c = std::cos(w),
               a = std::sin(w) / (2 * p.resonance), den = 1 + a;
        auto &f = v.filter;
        f.a1 = -2 * c / den;
        f.a2 = (1 - a) / den;
        if (p.filter == 1) {
            f.b0 = (1 - c) / 2 / den;
            f.b1 = (1 - c) / den;
            f.b2 = f.b0;
        } else if (p.filter == 2) {
            f.b0 = (1 + c) / 2 / den;
            f.b1 = -(1 + c) / den;
            f.b2 = f.b0;
        } else {
            f.b0 = a / den;
            f.b1 = 0;
            f.b2 = -a / den;
        }
    }
    return v;
}
void Sampler::prepare(std::vector<Event> events, double duration) {
    if (!std::isfinite(duration) || duration < 0 || duration > 24 * 3600)
        throw std::invalid_argument("Audio duration exceeds 24 hours");
    events_.clear();
    events_.reserve(events.size());
    for (const auto &e : events) {
        if (!std::isfinite(e.time) || !std::isfinite(e.length) || e.time < 0 || e.length <= 0 ||
            e.time + e.length > 24 * 3600 || e.pitch < 0 || e.pitch > 127 || e.volume < 0 ||
            e.volume > 100 || e.variant < 0)
            throw std::invalid_argument("Invalid note event");
        const auto &p = e.settings;
        auto bounded = [](double x, double low, double high) {
            return std::isfinite(x) && x >= low && x <= high;
        };
        if (!bounded(p.volume, 0, 150) || !bounded(p.pan, -100, 100) ||
            !bounded(p.transpose, -24, 24) || !bounded(p.fine, -100, 100) ||
            !(p.attack == -1 || bounded(p.attack, 0, 5)) ||
            !(p.release == -1 || bounded(p.release, .005, 10)) || !bounded(p.delay, 0, 2) ||
            !bounded(p.hold, 0, 5) || !bounded(p.decay, 0, 10) || !bounded(p.sustain, 0, 100) ||
            p.filter < 0 || p.filter > 3 || !bounded(p.cutoff, 20, 20000) ||
            !bounded(p.resonance, .1, 20) || !bounded(p.start, 0, 99.9) ||
            !bounded(p.end, .1, 100) || p.start >= p.end || !bounded(p.velocity, .25, 3))
            throw std::invalid_argument("Invalid voice settings");
        auto v = makeVoice(e);
        if (v.active)
            events_.push_back({int64_t(std::llround(e.time * rate_)), v});
    }
    std::stable_sort(events_.begin(), events_.end(),
                     [](const Prepared &a, const Prepared &b) { return a.frame < b.frame; });
    duration_ = duration;
    endFrame_ = std::max<int64_t>(1, std::llround(duration * rate_));
    seek(0);
}
void Sampler::trigger(const Prepared &e, double elapsed) {
    auto slot =
        std::find_if(voices_.begin(), voices_.end(), [](const Voice &v) { return !v.active; });
    if (slot == voices_.end()) {
        slot = std::min_element(voices_.begin(), voices_.end(),
                                [](const Voice &a, const Voice &b) { return a.order < b.order; });
        stolen_.fetch_add(1, std::memory_order_relaxed);
    }
    *slot = e.voice;
    slot->age = elapsed;
    slot->position += elapsed * slot->step * rate_;
    slot->order = order_++;
}
void Sampler::seek(double seconds) {
    if (!std::isfinite(seconds))
        throw std::invalid_argument("Invalid position");
    frame_ = std::llround(std::clamp(seconds, 0.0, duration_) * rate_);
    next_ = 0;
    limiter_ = 1;
    for (auto &v : voices_)
        v.active = false;
    while (next_ < events_.size() && events_[next_].frame < frame_) {
        const auto &e = events_[next_++];
        double elapsed = (frame_ - e.frame) / double(rate_);
        if (elapsed < e.voice.length + e.voice.release)
            trigger(e, elapsed);
    }
    publishedFrame_.store(frame_, std::memory_order_relaxed);
    finished_.store(false, std::memory_order_relaxed);
}
void Sampler::setLoop(bool enabled, double period) {
    if (!std::isfinite(period) || period < 0 || period > 24 * 3600)
        throw std::invalid_argument("Invalid loop period");
    loop_ = enabled;
    loopFrame_ = period > 0 ? std::max<int64_t>(1, std::llround(period * rate_)) : endFrame_;
}
void Sampler::render(float *out, int frames) {
    double dt = 1.0 / rate_, recovery = 1 - std::exp(-dt / .08);
    for (int i = 0; i < frames; i++) {
        if (loop_ && frame_ >= loopFrame_) {
            frame_ = 0;
            next_ = 0;
        }
        if (!loop_ && frame_ >= endFrame_) {
            std::fill(out + i * 2, out + frames * 2, 0.0f);
            finished_.store(true, std::memory_order_relaxed);
            break;
        }
        while (next_ < events_.size() && events_[next_].frame <= frame_)
            trigger(events_[next_++]);
        float l = 0, r = 0;
        for (auto &v : voices_)
            v.frame(l, r, dt);
        l *= .65f;
        r *= .65f;
        double peak = std::max(std::abs(l), std::abs(r));
        double target = peak > .94 ? .94 / peak : 1;
        if (target < limiter_)
            limiter_ = target;
        else
            limiter_ += (target - limiter_) * recovery;
        out[i * 2] = float(l * limiter_);
        out[i * 2 + 1] = float(r * limiter_);
        frame_++;
    }
    if (frame_ >= endFrame_ && !loop_)
        finished_.store(true, std::memory_order_relaxed);
    publishedFrame_.store(frame_, std::memory_order_relaxed);
}
} // namespace notka
