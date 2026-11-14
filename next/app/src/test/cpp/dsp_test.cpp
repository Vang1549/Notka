#include "sampler.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>
using namespace notka;
void check(bool value, const char *message) {
    if (!value)
        throw std::runtime_error(message);
}
Sample sine() {
    Sample s;
    s.rate = 48000;
    s.root = 69;
    s.gain = .5;
    s.attack = 0;
    s.release = .1;
    s.loopStart = 0;
    s.loopEnd = 48000;
    s.pcm.resize(48000);
    for (int i = 0; i < 48000; i++)
        s.pcm[i] = float(std::sin(i * 2 * 3.141592653589793 * 440 / 48000));
    return s;
}
double energy(const std::vector<float> &data, size_t start, size_t end) {
    double sum = 0;
    for (size_t i = start; i < end; i++)
        sum += data[i] * data[i];
    return sum / (end - start);
}
int main() {
    try {
        Sampler s;
        s.addSample(sine());
        Event e;
        e.time = .1;
        e.length = .3;
        e.pitch = 69;
        s.prepare({e}, .6);
        std::vector<float> a(57600);
        s.render(a.data(), 28800);
        check(energy(a, 0, 9600) == 0, "Start silence was lost");
        check(energy(a, 12000, 30000) > .005, "Note is silent");
        check(energy(a, 49000, 57600) == 0, "Release tail did not stop");
        check(s.finished(), "Completion state");
        s.seek(.2);
        float seek[2];
        s.render(seek, 1);
        check(std::abs(seek[0] - a[19200]) < .0001, "Seek did not recover sustained note");
        s.seek(0);
        std::vector<float> b(a.size());
        for (size_t i = 0; i < 28800; i += 128)
            s.render(b.data() + i * 2, int(std::min<size_t>(128, 28800 - i)));
        check(a == b, "Rendering depends on callback block size");
        s.seek(-.4);
        std::vector<float> lead(38400);
        s.render(lead.data(),19200);
        check(energy(lead,0,lead.size())==0,"Scene lead-in is not silent");
        std::vector<float> after(a.size());
        s.render(after.data(),28800);
        check(after==a,"Scene lead-in shifts musical audio samples");
        Event octave = e;
        octave.time = 0;
        octave.length = .2;
        octave.settings.transpose = 12;
        s.prepare({octave}, .3);
        s.render(a.data(), 4800);
        int crossings = 0;
        for (int i = 1; i < 4800; i++)
            if (a[i * 2] >= 0 && a[(i - 1) * 2] < 0)
                crossings++;
        check(crossings >= 87 && crossings <= 89, "Pitch ratio");
        octave.settings.pan = -100;
        s.prepare({octave}, .3);
        s.render(a.data(), 4800);
        double right = 0;
        for (int i = 0; i < 4800; i++)
            right += std::abs(a[i * 2 + 1]);
        check(right < .00001, "Hard-left pan");
        octave.settings.pan = 0;
        octave.settings.reverse = true;
        s.prepare({octave}, .3);
        s.render(a.data(), 4800);
        check(energy(a, 0, 9600) > .001, "Reverse silent");
        octave.settings.reverse = false;
        octave.settings.filter = 1;
        octave.settings.cutoff = 40;
        s.prepare({octave}, .3);
        s.render(a.data(), 4800);
        check(energy(a, 4800, 9600) < .00001, "Lowpass ineffective");
        octave.settings.filter = 0;
        std::vector<Event> many(100, octave);
        s.prepare(many, .3);
        s.render(a.data(), 4800);
        check(s.stolen() > 0, "Voice cap not enforced");
        for (int i = 0; i < 9600; i++)
            check(std::isfinite(a[i]) && std::abs(a[i]) <= .941, "Limiter produced invalid sample");
        s.setLoop(true);
        s.prepare({e}, .6);
        s.setLoop(true);
        s.render(a.data(), 28800);
        s.render(seek, 1);
        check(s.position() < .001 && !s.finished(), "Loop failed");
        std::cout << "DSP: timing, seek, block invariance, pitch, pan, reverse, filter, voice cap, "
                     "limiter and loop passed\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
