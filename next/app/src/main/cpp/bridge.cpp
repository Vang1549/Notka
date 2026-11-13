#include "sampler.h"
#include <jni.h>
#include <oboe/Oboe.h>
#include <stdexcept>
#include <string>

namespace {
class Audio final : public oboe::AudioStreamDataCallback, public oboe::AudioStreamErrorCallback {
  public:
    notka::Sampler sampler;
    std::shared_ptr<oboe::AudioStream> stream;
    std::atomic<bool> disconnected{false};
    int64_t previousXruns = 0;
    explicit Audio(int rate) : sampler(rate) {}
    ~Audio() { closeStream(); }
    void closeStream() {
        if (stream) {
            auto xruns = stream->getXRunCount();
            if (xruns)
                previousXruns += xruns.value();
            stream->requestStop();
            stream->close();
            stream.reset();
        }
    }
    void start() {
        closeStream();
        disconnected.store(false);
        oboe::AudioStreamBuilder b;
        b.setDirection(oboe::Direction::Output)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Shared)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(2)
            ->setSampleRate(sampler.rate())
            ->setSampleRateConversionQuality(oboe::SampleRateConversionQuality::Medium)
            ->setUsage(oboe::Usage::Media)
            ->setContentType(oboe::ContentType::Music)
            ->setDataCallback(this)
            ->setErrorCallback(this);
        auto result = b.openStream(stream);
        if (result != oboe::Result::OK)
            throw std::runtime_error(oboe::convertToText(result));
        result = stream->requestStart();
        if (result != oboe::Result::OK) {
            closeStream();
            throw std::runtime_error(oboe::convertToText(result));
        }
    }
    oboe::DataCallbackResult onAudioReady(oboe::AudioStream *, void *data,
                                          int32_t frames) override {
        sampler.render(static_cast<float *>(data), frames);
        return sampler.finished() ? oboe::DataCallbackResult::Stop
                                  : oboe::DataCallbackResult::Continue;
    }
    void onErrorAfterClose(oboe::AudioStream *, oboe::Result) override { disconnected.store(true); }
};
Audio &audio(jlong handle) {
    if (!handle)
        throw std::runtime_error("Audio engine is closed");
    return *reinterpret_cast<Audio *>(handle);
}
void fail(JNIEnv *env, const std::exception &e) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), e.what());
}
} // namespace
#define JNI_METHOD(name) Java_studio_notka_next_audio_NativeAudio_##name
extern "C" JNIEXPORT jlong JNICALL JNI_METHOD(create)(JNIEnv *env, jobject, jint rate) {
    try {
        if (rate < 8000 || rate > 192000)
            throw std::runtime_error("Invalid output rate");
        return reinterpret_cast<jlong>(new Audio(rate));
    } catch (const std::exception &e) {
        fail(env, e);
        return 0;
    }
}
extern "C" JNIEXPORT void JNICALL JNI_METHOD(destroy)(JNIEnv *, jobject, jlong h) {
    delete reinterpret_cast<Audio *>(h);
}
extern "C" JNIEXPORT void JNICALL JNI_METHOD(addSample)(JNIEnv *env, jobject, jlong h, jint bank,
                                                        jint root, jdouble tune, jint rr, jint rate,
                                                        jint channels, jfloatArray pcm,
                                                        jdouble loopStart, jdouble loopEnd,
                                                        jdouble gain, jdouble attack,
                                                        jdouble release) {
    try {
        auto &a = audio(h);
        if (a.stream)
            throw std::runtime_error("Stop stream before loading");
        notka::Sample s;
        s.bank = bank;
        s.root = root;
        s.tune = tune;
        s.rr = rr;
        s.rate = rate;
        s.channels = channels;
        s.loopStart = loopStart;
        s.loopEnd = loopEnd;
        s.gain = gain;
        s.attack = attack;
        s.release = release;
        s.pcm.resize(env->GetArrayLength(pcm));
        env->GetFloatArrayRegion(pcm, 0, static_cast<jsize>(s.pcm.size()), s.pcm.data());
        if (env->ExceptionCheck())
            return;
        a.sampler.addSample(std::move(s));
    } catch (const std::exception &e) {
        fail(env, e);
    }
}
extern "C" JNIEXPORT void JNICALL JNI_METHOD(prepare)(JNIEnv *env, jobject, jlong h,
                                                      jdoubleArray data, jdouble duration,
                                                      jboolean loop, jdouble period) {
    try {
        auto &a = audio(h);
        a.closeStream();
        auto count = env->GetArrayLength(data);
        constexpr int stride = 26;
        if (count % stride)
            throw std::runtime_error("Invalid event table");
        std::vector<double> raw(count);
        env->GetDoubleArrayRegion(data, 0, count, raw.data());
        if (env->ExceptionCheck())
            return;
        std::vector<notka::Event> events;
        events.reserve(count / stride);
        for (int i = 0; i < count; i += stride) {
            const double *p = raw.data() + i;
            notka::Event e;
            e.time = p[0];
            e.length = p[1];
            e.pitch = int(p[2]);
            e.volume = int(p[3]);
            e.bank = int(p[4]);
            e.variant = int(p[5]);
            auto &s = e.settings;
            s.volume = p[6];
            s.pan = p[7];
            s.transpose = p[8];
            s.fine = p[9];
            s.attack = p[10];
            s.release = p[11];
            s.delay = p[12];
            s.hold = p[13];
            s.decay = p[14];
            s.sustain = p[15];
            s.filter = int(p[16]);
            s.cutoff = p[17];
            s.resonance = p[18];
            s.start = p[19];
            s.end = p[20];
            s.reverse = p[21] != 0;
            s.loop = p[22] != 0;
            s.velocity = p[23];
            events.push_back(e);
        }
        a.sampler.prepare(std::move(events), duration);
        a.sampler.setLoop(loop, period);
    } catch (const std::exception &e) {
        fail(env, e);
    }
}
extern "C" JNIEXPORT void JNICALL JNI_METHOD(start)(JNIEnv *env, jobject, jlong h) {
    try {
        audio(h).start();
    } catch (const std::exception &e) {
        fail(env, e);
    }
}
extern "C" JNIEXPORT void JNICALL JNI_METHOD(pause)(JNIEnv *env, jobject, jlong h) {
    try {
        audio(h).closeStream();
    } catch (const std::exception &e) {
        fail(env, e);
    }
}
extern "C" JNIEXPORT void JNICALL JNI_METHOD(seek)(JNIEnv *env, jobject, jlong h, jdouble seconds) {
    try {
        auto &a = audio(h);
        a.closeStream();
        a.sampler.seek(seconds);
    } catch (const std::exception &e) {
        fail(env, e);
    }
}
extern "C" JNIEXPORT jdouble JNICALL JNI_METHOD(position)(JNIEnv *env, jobject, jlong h) {
    try {
        return audio(h).sampler.position();
    } catch (const std::exception &e) {
        fail(env, e);
        return 0;
    }
}
extern "C" JNIEXPORT jint JNICALL JNI_METHOD(state)(JNIEnv *env, jobject, jlong h) {
    try {
        auto &a = audio(h);
        return a.disconnected.load() ? 2 : a.sampler.finished() ? 1 : 0;
    } catch (const std::exception &e) {
        fail(env, e);
        return 2;
    }
}
extern "C" JNIEXPORT jlongArray JNICALL JNI_METHOD(metrics)(JNIEnv *env, jobject, jlong h) {
    try {
        auto &a = audio(h);
        int64_t xruns = a.previousXruns;
        if (a.stream) {
            auto current = a.stream->getXRunCount();
            if (current)
                xruns += current.value();
        }
        jlong values[2]{xruns, static_cast<jlong>(a.sampler.stolen())};
        auto result = env->NewLongArray(2);
        if (result)
            env->SetLongArrayRegion(result, 0, 2, values);
        return result;
    } catch (const std::exception &e) {
        fail(env, e);
        return nullptr;
    }
}
extern "C" JNIEXPORT void JNICALL JNI_METHOD(render)(JNIEnv *env, jobject, jlong h,
                                                     jfloatArray output, jint frames) {
    try {
        auto &a = audio(h);
        if (a.stream || frames < 0 || frames > 8192 || env->GetArrayLength(output) < frames * 2)
            throw std::runtime_error("Invalid render buffer");
        std::array<float, 16384> temp{};
        a.sampler.render(temp.data(), frames);
        env->SetFloatArrayRegion(output, 0, frames * 2, temp.data());
    } catch (const std::exception &e) {
        fail(env, e);
    }
}
