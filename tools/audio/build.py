"""
Synthesises the game's music, ambience and sound effects into .ogg files (numpy + ffmpeg).

Everything is original and generated from code, so there are no licences to track and every
sound can be re-tuned. The music uses the in-sen scale (D Eb G A C), plucked-string, breathy-flute,
drum and bell voices — the realm's sound, not a copy of any real piece.

    python tools/audio/build.py            # everything
    python tools/audio/build.py sfx        # only effects
"""
import math
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 44100
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "client", "public", "assets", "audio")
rng = np.random.default_rng(1919)


# ----------------------------------------------------------------------------- building blocks

def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def fft_filter(x, lo=None, hi=None, peak=None, q=4.0):
    """Static filtering in the frequency domain: high-pass at lo, low-pass at hi, optional resonant peak."""
    n = len(x)
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 4)
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if peak:
        g *= 1 + 3 / (1 + ((f - peak) / (peak / q)) ** 2)
    return np.fft.irfft(spec * g, n)


def env(n, attack, decay_s, hold=0.0):
    """Attack (s) then exponential decay with time constant decay_s."""
    tt = np.arange(n) / SR
    a = np.clip(tt / max(attack, 1e-4), 0, 1)
    d = np.exp(-np.maximum(0, tt - attack - hold) / decay_s)
    return a * d


def pluck(freq, seconds, bright=0.6, decay=0.996, bend=0.0):
    """Karplus–Strong string, processed a period at a time (fast in numpy). bend: semitones slid up after the attack."""
    n = int(seconds * SR)
    out = np.zeros(n)
    L = max(2, int(SR / freq))
    buf = fft_filter(rng.uniform(-1, 1, L * 4), hi=800 + 7000 * bright)[:L]
    i = 0
    while i < n:
        blk = buf.copy()
        out[i : i + L] = blk[: min(L, n - i)]
        buf = decay * 0.5 * (blk + np.roll(blk, -1))
        i += L
        if bend and i < SR * 0.6 and i > SR * 0.12:
            # Pressing the string behind the bridge: shorten the loop gradually.
            target = int(SR / (freq * 2 ** (bend / 12)))
            if len(buf) > target:
                buf = buf[:-1]
                L -= 1
    body = fft_filter(out, lo=90, peak=freq * 2.1, q=3)
    return body * env(n, 0.002, seconds * 0.45)


def flute(freq, seconds, vib=0.012):
    """A breathy bamboo flute: slide up into the note, vibrato that grows, breath noise around the pitch."""
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    slide = 1 - 0.035 * np.exp(-tt / 0.12)
    vibrato = 1 + vib * np.clip((tt - 0.6) / 1.2, 0, 1) * np.sin(math.tau * 5.2 * tt)
    phase = np.cumsum(freq * slide * vibrato) / SR * math.tau
    tone = np.sin(phase) + 0.28 * np.sin(2 * phase) + 0.08 * np.sin(3 * phase)
    breath = fft_filter(rng.normal(0, 1, n), lo=freq * 0.8, hi=freq * 4) * 0.22
    amp = np.clip(tt / 0.25, 0, 1) * np.clip((seconds - tt) / 0.6, 0, 1) * (0.85 + 0.15 * np.sin(math.tau * 0.4 * tt))
    return (tone * 0.6 + breath) * amp


def drum(seconds=1.6, f0=120, f1=48, noise=0.25):
    """A big barrel drum: falling pitch body plus a skin slap."""
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt / 0.06)
    body = np.sin(np.cumsum(f) / SR * math.tau) * np.exp(-tt / 0.45)
    slap = fft_filter(rng.normal(0, 1, n), lo=200, hi=2500) * np.exp(-tt / 0.03) * noise
    return body + slap


def bell(freq, seconds, ratios=(0.5, 1, 1.19, 1.56, 2.0, 2.51, 2.66, 3.01, 4.1), shimmer=0.0):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for i, r in enumerate(ratios):
        d = seconds * (0.9 / (1 + i * 0.6))
        beat = 1 + shimmer * np.sin(math.tau * (0.7 + i * 0.37) * tt)
        out += np.sin(math.tau * freq * r * tt + i) * np.exp(-tt / d) * beat / (1 + i * 0.35)
    return out * np.clip(tt / 0.003, 0, 1)


def reverb(x, seconds=3.2, wet=0.35, predelay=0.025, dark=4000):
    """Stereo convolution with a synthetic hall: decaying noise that loses its highs as it fades."""
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    irs = []
    for s in (1, 2):
        noise = np.random.default_rng(s).normal(0, 1, n) * np.exp(-tt * 6.9 / seconds)
        early = fft_filter(noise[: n // 4], hi=dark * 2)
        late = fft_filter(noise, hi=dark * 0.5)
        ir = late
        ir[: n // 4] = early * 0.6 + late[: n // 4] * 0.4
        ir = np.concatenate([np.zeros(int(predelay * SR)), ir])
        irs.append(ir / np.sqrt(np.sum(ir**2)))
    mono = x if x.ndim == 1 else x.mean(axis=1)
    m = len(mono) + len(irs[0])
    size = 1 << (m - 1).bit_length()
    X = np.fft.rfft(mono, size)
    wet_l = np.fft.irfft(X * np.fft.rfft(irs[0], size), size)[: len(mono)]
    wet_r = np.fft.irfft(X * np.fft.rfft(irs[1], size), size)[: len(mono)]
    dry = np.stack([x, x], 1) if x.ndim == 1 else x
    return dry * (1 - wet) + np.stack([wet_l, wet_r], 1) * wet * 1.6


def pan(x, p):
    """Equal-power pan, p in [-1, 1]."""
    a = (p + 1) * math.pi / 4
    return np.stack([x * math.cos(a), x * math.sin(a)], 1)


def place(track, clip, at, gain=1.0, p=0.0):
    i = int(at * SR)
    if i >= len(track):
        return
    c = pan(clip, p) * gain if clip.ndim == 1 else clip * gain
    j = min(len(track), i + len(c))
    track[i:j] += c[: j - i]


def mixin(a, b, at=0.0, gain=1.0):
    """Adds mono clip b into mono buffer a at time `at` (seconds), clipped to a's length."""
    i = int(at * SR)
    j = min(len(a), i + len(b))
    if i < len(a):
        a[i:j] += b[: j - i] * gain
    return a


def loop_seamless(x, xfade=3.0):
    """Folds the tail into the head so the file loops without a click or a gap."""
    k = int(xfade * SR)
    head, body, tail = x[:k], x[k:-k], x[-k:]
    ramp = np.linspace(0, 1, k)[:, None]
    return np.concatenate([head * ramp + tail * (1 - ramp), body], 0)


def master(x, peak=0.89):
    x = x - x.mean(axis=0)
    # Gentle soft clip, then normalise.
    x = np.tanh(x / (np.abs(x).max() + 1e-9) * 1.4) / np.tanh(1.4)
    return x / (np.abs(x).max() + 1e-9) * peak


def write_ogg(name, x, quality=5):
    os.makedirs(OUT, exist_ok=True)
    x = master(x if x.ndim == 2 else np.stack([x, x], 1))
    pcm = (x * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        path = os.path.join(OUT, f"{name}.ogg")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-c:a", "libvorbis", "-q:a", str(quality), path], check=True)
    os.unlink(tmp.name)
    print(f"{name}.ogg {len(x) / SR:.1f}s", flush=True)


# ----------------------------------------------------------------------------- music

INSEN = [62, 63, 67, 69, 72]  # D Eb G A C


def scale_note(degree, octave=0):
    return INSEN[degree % 5] + 12 * (degree // 5 + octave)


def music_soramei_night(seconds=104):
    """Night at the ruined keep: a low drone, sparse plucked phrases, a flute that comes and goes, a heartbeat drum."""
    track = np.zeros((int((seconds + 6) * SR), 2))
    tt = t_axis(seconds + 6)
    # Drone: D2 and A2 from detuned saws, darkly filtered, breathing slowly.
    drone = np.zeros(len(tt))
    for f, g in ((midi(38), 1.0), (midi(45), 0.6), (midi(50), 0.25)):
        for det in (-0.12, 0.0, 0.11):
            ph = (f * (1 + det / 100) * tt + rng.uniform()) % 1
            drone += (2 * ph - 1) * g
    drone = fft_filter(drone, lo=30, hi=320) * (0.55 + 0.45 * np.sin(math.tau * tt / 23)) * 0.08
    track += pan(drone, 0)

    # Plucked phrases: walk the scale, mostly stepwise, resting often.
    at = 2.0
    deg = 5
    while at < seconds - 4:
        phrase = rng.integers(3, 8)
        for _ in range(phrase):
            deg = int(np.clip(deg + rng.choice([-2, -1, -1, 1, 1, 2, 3]), 0, 11))
            note = scale_note(deg)
            dur = rng.choice([0.42, 0.42, 0.84, 1.26])
            clip = pluck(midi(note), 3.2, bright=rng.uniform(0.4, 0.75), bend=rng.choice([0, 0, 0, 1]))
            place(track, clip, at, 0.32, p=rng.uniform(-0.35, 0.35))
            if rng.random() < 0.18:
                # An octave ghost note, like a second string.
                place(track, pluck(midi(note - 12), 3.0, 0.3), at + 0.02, 0.18, p=-0.2)
            at += dur
        at += rng.uniform(3.5, 7.5)

    # Flute: three long phrases.
    for start in (18.0, 52.0, 79.0):
        a = start
        phrases = [[7, 6, 4, 5], [5, 7, 8, 6, 5], [9, 8, 6, 7]]
        for deg in phrases[int(rng.integers(len(phrases)))]:
            d = rng.choice([2.4, 3.2, 4.0])
            place(track, flute(midi(scale_note(deg)), d + 0.6), a, 0.2, p=0.25)
            a += d
    # Heartbeat drum in the middle third.
    for k, beat in enumerate(np.arange(40.0, 72.0, 2.6)):
        place(track, drum(1.6), beat, 0.5 if k % 2 == 0 else 0.35, p=-0.1)
        place(track, drum(1.0, 160, 70, 0.4), beat + 0.32, 0.18, p=0.1)
    # Temple bell at the top and two-thirds through.
    for b in (0.3, 66.0):
        place(track, bell(midi(50), 9.0, shimmer=0.03), b, 0.35, p=0.15)

    track = reverb(track, 4.0, 0.42)
    return loop_seamless(track[: int(seconds * SR)])


def amb_night_wind(seconds=64):
    """Wind through the courtyard, rustling blossom, distant chimes, crickets."""
    n = int((seconds + 4) * SR)
    tt = np.arange(n) / SR
    out = np.zeros((n, 2))
    # Wind: three noise bands with slow independent gusts.
    for lo, hi, g, rate in ((60, 400, 0.6, 1 / 11), (300, 1200, 0.35, 1 / 7), (1500, 5000, 0.12, 1 / 5)):
        for ch in range(2):
            band = fft_filter(rng.normal(0, 1, n), lo=lo, hi=hi)
            gust = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(math.tau * rate * tt + rng.uniform(0, 6))) ** 2
            out[:, ch] += band * gust * g
    # Leaves: short bursts of filtered noise.
    for _ in range(int(seconds * 1.5)):
        at = rng.uniform(0, seconds)
        k = int(rng.uniform(0.15, 0.5) * SR)
        burst = fft_filter(rng.normal(0, 1, k), lo=1800, hi=7000) * np.hanning(k) * 0.25
        place(out, burst, at, 1, rng.uniform(-0.8, 0.8))
    # Wind chimes.
    for _ in range(int(seconds / 4)):
        at = rng.uniform(0, seconds)
        f = midi(rng.choice([86, 88, 91, 93, 96]))
        place(out, bell(f, 3.0, (1, 2.76, 5.4)), at, 0.05, rng.uniform(-0.7, 0.7))
    # Crickets: trains of 4.4 kHz chirps.
    for side in (-0.7, 0.6):
        at = rng.uniform(0, 2)
        while at < seconds:
            k = int(0.05 * SR)
            ts = np.arange(k) / SR
            chirp = np.sin(math.tau * 4400 * ts) * (0.5 + 0.5 * np.sin(math.tau * 90 * ts)) * np.hanning(k)
            for r in range(3):
                place(out, chirp * 0.035, at + r * 0.07, 1, side)
            at += rng.uniform(0.6, 1.4)
    out = reverb(out, 2.5, 0.25)
    return loop_seamless(out[: int(seconds * SR)], 2.0)


# ----------------------------------------------------------------------------- effects

def sfx_title_gong():
    x = bell(midi(43), 7.5, ratios=(0.5, 1, 1.47, 1.98, 2.43, 2.97, 3.5, 4.2), shimmer=0.06)
    mixin(x, drum(2.0, 90, 40, 0.1), 0, 0.6)
    return reverb(x, 4.5, 0.4)


def sfx_cin_split():
    """The World-Ash split: a cracking tear, splintering wood, a sub boom, debris."""
    n = int(4.5 * SR)
    tt = np.arange(n) / SR
    crack = fft_filter(rng.normal(0, 1, n), lo=800, hi=9000) * np.exp(-tt / 0.08)
    tear = fft_filter(rng.normal(0, 1, n), lo=150, hi=2500) * np.exp(-tt / 0.6) * (0.6 + 0.4 * np.sign(np.sin(math.tau * 37 * tt)))
    boom = np.sin(np.cumsum(30 + 60 * np.exp(-tt / 0.15)) / SR * math.tau) * np.exp(-tt / 1.4)
    x = crack * 0.9 + tear * 0.5 + boom * 1.2
    debris = np.zeros(n)
    for _ in range(30):
        i = int(rng.uniform(0.2, 2.5) * SR)
        k = int(0.05 * SR)
        if i + k < n:
            debris[i : i + k] += fft_filter(rng.normal(0, 1, k), lo=1500, hi=6000) * np.hanning(k) * rng.uniform(0.05, 0.25)
    return reverb(x + debris, 4.0, 0.45, dark=2500)


def sfx_gate_bang():
    """Something heavy hitting the barred gate from outside: thud, wood rattle, iron ring."""
    n = int(1.8 * SR)
    tt = np.arange(n) / SR
    thud = drum(1.8, 85, 45, 0.6)[:n]
    rattle = fft_filter(rng.normal(0, 1, n), lo=400, hi=3000) * np.exp(-tt / 0.12) * (0.5 + 0.5 * np.sin(math.tau * 23 * tt))
    ring = bell(midi(70), 1.8, (1, 2.4, 3.9)) * 0.08
    return reverb(thud + rattle * 0.5 + ring, 1.8, 0.3)


def footstep(i, soft=False):
    n = int(0.22 * SR)
    tt = np.arange(n) / SR
    r = np.random.default_rng(300 + i + (50 if soft else 0))
    lo, hi = (120, 1600) if soft else (300, 4200)
    scuff = fft_filter(r.normal(0, 1, n), lo=lo, hi=hi) * np.exp(-tt / (0.05 if soft else 0.025))
    heel = np.sin(math.tau * (90 + 30 * i) * tt) * np.exp(-tt / 0.03) * (0.3 if soft else 0.5)
    return scuff * 0.7 + heel


def sfx_dodge():
    n = int(0.55 * SR)
    tt = np.arange(n) / SR
    cut = 400 + 3000 * np.sin(np.clip(tt / 0.36, 0, 1) * math.pi)
    # Approximate a sweeping band-pass with a few overlapping bands crossfaded over time.
    x = np.zeros(n)
    for c in (600, 1200, 2400, 3600):
        band = fft_filter(rng.normal(0, 1, n), lo=c * 0.6, hi=c * 1.6)
        x += band * np.exp(-((cut - c) / (c * 0.5)) ** 2)
    x *= np.sin(np.clip(tt / 0.4, 0, 1) * math.pi) ** 1.5
    return mixin(x * 0.6, footstep(2, soft=True), 0.33, 0.6)


def ui_click():
    n = int(0.12 * SR)
    tt = np.arange(n) / SR
    return (np.sin(math.tau * 1250 * tt) * 0.6 + np.sin(math.tau * 2600 * tt) * 0.25) * np.exp(-tt / 0.018)


def ui_hover():
    n = int(0.09 * SR)
    tt = np.arange(n) / SR
    return np.sin(math.tau * 1800 * tt) * np.exp(-tt / 0.012) * 0.35


def ui_confirm():
    x = np.zeros(int(2.5 * SR))
    for k, note in enumerate((scale_note(5), scale_note(7))):
        clip = pluck(midi(note), 2.0, 0.7)
        i = int(k * 0.09 * SR)
        x[i : i + len(clip)] += clip[: len(x) - i]
    return reverb(x, 2.0, 0.3)


def main():
    which = sys.argv[1:] or ["music", "amb", "sfx"]
    if "sfx" in which:
        write_ogg("sfx_title_gong", sfx_title_gong())
        write_ogg("sfx_cin_split", sfx_cin_split())
        write_ogg("sfx_gate_bang", sfx_gate_bang())
        for i in range(4):
            write_ogg(f"sfx_step_stone_{i}", footstep(i), 4)
            write_ogg(f"sfx_step_soft_{i}", footstep(i, True), 4)
        write_ogg("sfx_dodge", sfx_dodge(), 4)
        write_ogg("ui_click", ui_click(), 4)
        write_ogg("ui_hover", ui_hover(), 4)
        write_ogg("ui_confirm", ui_confirm(), 4)
    if "amb" in which:
        write_ogg("amb_night_wind", amb_night_wind(), 4)
    if "music" in which:
        write_ogg("music_soramei_night", music_soramei_night(), 5)


if __name__ == "__main__":
    main()
