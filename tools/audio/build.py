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
    """Adds clip b into buffer a at time `at` (seconds), clipped to a's length. Mono meets stereo as stereo."""
    if b.ndim == 2 and a.ndim == 1:
        a = np.stack([a, a], 1)
    elif a.ndim == 2 and b.ndim == 1:
        b = np.stack([b, b], 1)
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


# ----------------------------------------------------------------------------- combat

def noise(n, lo=None, hi=None, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    return fft_filter(r.normal(0, 1, n), lo=lo, hi=hi)


def sweep_band(seconds, f0, f1, width=0.5, seed=None):
    """Noise whose band glides from f0 to f1 (a whoosh), built from crossfaded fixed bands."""
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    centers = np.geomspace(min(f0, f1), max(f0, f1), 6)
    track = f0 * (f1 / f0) ** (tt / seconds)
    for c in centers:
        out += noise(n, c * (1 - width), c * (1 + width), seed) * np.exp(-((np.log(track / c)) ** 2) / 0.08)
    return out


def blade(heavy=False, seed=0):
    """A blade cutting air, then a short metallic edge ring."""
    d = 0.5 if heavy else 0.32
    x = sweep_band(d, 800 if heavy else 1500, 3500 if heavy else 6000, seed=seed) * np.hanning(int(d * SR)) ** 0.7
    ring = bell(midi(96 if heavy else 101), 0.6, (1, 2.7, 5.1)) * 0.06
    return reverb(mixin(x * 0.8, ring, d * 0.4), 1.0, 0.15)


def impact_flesh(seed=0):
    n = int(0.35 * SR)
    tt = np.arange(n) / SR
    thud = np.sin(math.tau * (70 + 40 * np.exp(-tt / 0.03)) * tt) * np.exp(-tt / 0.06)
    wet = noise(n, 300, 2500, seed) * np.exp(-tt / 0.05) * (0.6 + 0.4 * np.sin(math.tau * 31 * tt))
    return thud * 0.9 + wet * 0.6


def splatter(seed=0):
    n = int(0.6 * SR)
    out = np.zeros(n)
    r = np.random.default_rng(seed)
    for _ in range(9):
        i = int(r.uniform(0, 0.35) * SR)
        k = int(0.04 * SR)
        out[i : i + k] += noise(k, 500, 4000, int(r.integers(1e6))) * np.hanning(k) * r.uniform(0.2, 0.6)
    return mixin(out, impact_flesh(seed), 0, 0.8)


def fire(heavy=False, seed=0):
    d = 1.4 if heavy else 0.7
    n = int(d * SR)
    tt = np.arange(n) / SR
    roar = noise(n, 80, 1800, seed) * (np.exp(-tt / (0.5 if heavy else 0.2)))
    crackle = np.zeros(n)
    r = np.random.default_rng(seed + 7)
    for _ in range(40 if heavy else 15):
        i = int(r.uniform(0, d * 0.8) * SR)
        crackle[i : i + 200] += r.normal(0, 1, 200) * np.exp(-np.arange(200) / 30) * 0.6
    whoosh = sweep_band(min(d, 0.6), 300, 2000, seed=seed) * np.hanning(int(min(d, 0.6) * SR))
    return reverb(mixin(roar + crackle, whoosh, 0, 0.7), 1.5, 0.2)


def thunder(seed=0):
    n = int(2.2 * SR)
    tt = np.arange(n) / SR
    crack = noise(n, 1500, 9000, seed) * np.exp(-tt / 0.03)
    rumble = noise(n, 30, 300, seed + 1) * np.exp(-tt / 0.8) * (0.6 + 0.4 * np.sin(math.tau * 3 * tt))
    return reverb(crack * 1.2 + rumble, 2.5, 0.3, dark=3000)


def wind_gust(seed=0):
    d = 0.8
    return sweep_band(d, 400, 1400, 0.6, seed) * np.hanning(int(d * SR)) ** 1.5


def spirit(heavy=False, seed=0):
    """A wailing, breathy spirit: a sliding sine choir through noise."""
    d = 1.6 if heavy else 0.9
    n = int(d * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for k, f in enumerate((midi(62), midi(65), midi(69))[: 3 if heavy else 2]):
        bend = 1 + 0.05 * np.sin(math.tau * (0.7 + k * 0.3) * tt)
        out += np.sin(np.cumsum(f * bend) / SR * math.tau) * 0.3
    breath = noise(n, 300, 3000, seed) * 0.4
    env_ = np.sin(np.linspace(0, math.pi, n)) ** 1.2
    return reverb((out + breath) * env_, 3.0, 0.45)


def bow(heavy=False, seed=0):
    n = int(0.5 * SR)
    tt = np.arange(n) / SR
    twang = np.sin(math.tau * (110 if heavy else 150) * tt) * np.exp(-tt / 0.12) * (1 + 0.5 * np.sin(math.tau * 9 * tt))
    hiss = sweep_band(0.3, 2500, 1200, seed=seed) * np.hanning(int(0.3 * SR)) * 0.5
    return mixin(twang * 0.7, hiss, 0.02)


def throw(seed=0):
    return sweep_band(0.22, 2500, 5000, 0.4, seed) * np.hanning(int(0.22 * SR)) * 0.8


def poison_hiss(seed=0):
    n = int(0.9 * SR)
    tt = np.arange(n) / SR
    hiss = noise(n, 3000, 9000, seed) * np.exp(-tt / 0.35)
    bubbles = np.zeros(n)
    r = np.random.default_rng(seed + 3)
    for _ in range(18):
        i = int(r.uniform(0, 0.7) * SR)
        f = r.uniform(300, 900)
        k = int(0.05 * SR)
        bubbles[i : i + k] += np.sin(math.tau * f * np.arange(k) / SR * (1 + np.arange(k) / k)) * np.hanning(k) * 0.3
    return hiss * 0.5 + bubbles


def roots_crack(seed=0):
    n = int(1.0 * SR)
    tt = np.arange(n) / SR
    creak = np.sin(math.tau * (60 + 30 * tt) * tt) * (0.5 + 0.5 * np.sign(np.sin(math.tau * 14 * tt))) * np.exp(-tt / 0.5) * 0.4
    snaps = np.zeros(n)
    r = np.random.default_rng(seed)
    for _ in range(12):
        i = int(r.uniform(0, 0.6) * SR)
        snaps[i : i + 300] += noise(300, 800, 5000, int(r.integers(1e6))) * np.exp(-np.arange(300) / 50)
    return reverb(creak + snaps * 0.7 + noise(n, 40, 200, seed) * np.exp(-tt / 0.3) * 0.6, 1.2, 0.2)


def groan(seed=0):
    """The Greyed: a dry, rattling moan."""
    d = 1.3
    n = int(d * SR)
    tt = np.arange(n) / SR
    r = np.random.default_rng(seed)
    f0 = r.uniform(70, 110)
    f = f0 * (1 - 0.25 * tt / d) * (1 + 0.04 * np.sin(math.tau * 5 * tt))
    ph = np.cumsum(f) / SR * math.tau
    voice = sum(np.sin(ph * k) / k for k in range(1, 9))
    rattle = 0.6 + 0.4 * np.sign(np.sin(math.tau * r.uniform(18, 30) * tt))
    formant = fft_filter(voice * rattle, lo=150, hi=1400, peak=r.uniform(500, 800), q=2)
    env_ = np.sin(np.linspace(0, math.pi, n)) ** 0.8
    return reverb(formant * env_ + noise(n, 500, 3000, seed) * env_ * 0.15, 1.5, 0.2)


def roar():
    d = 2.6
    n = int(d * SR)
    tt = np.arange(n) / SR
    f = 55 * (1 + 0.3 * np.sin(math.pi * tt / d))
    ph = np.cumsum(f) / SR * math.tau
    voice = sum(np.sin(ph * k + k) / k ** 0.8 for k in range(1, 14))
    growl = fft_filter(voice * (0.7 + 0.3 * np.sin(math.tau * 27 * tt)), lo=40, hi=2500, peak=420, q=1.5)
    env_ = np.clip(tt / 0.2, 0, 1) * np.clip((d - tt) / 0.8, 0, 1)
    return reverb(growl * env_ + noise(n, 200, 4000) * env_ * 0.2, 3.0, 0.35, dark=2500)


def horn():
    """A war horn from beyond the gate: a wave is coming."""
    d = 2.4
    n = int(d * SR)
    tt = np.arange(n) / SR
    f = midi(43) * (1 + 0.02 * np.clip(tt / 0.3, 0, 1))
    ph = np.cumsum(np.full(n, f)) / SR * math.tau
    tone = sum(np.sin(ph * k) * (0.9 ** k) for k in range(1, 10))
    env_ = np.clip(tt / 0.25, 0, 1) * np.clip((d - tt) / 0.7, 0, 1)
    return reverb(fft_filter(tone, hi=1800) * env_, 3.5, 0.45)


def chime(up=True):
    x = np.zeros(int(2.5 * SR))
    notes = (scale_note(5), scale_note(7), scale_note(9)) if up else (scale_note(9), scale_note(6), scale_note(3))
    for k, note in enumerate(notes):
        mixin(x, bell(midi(note + 12), 2.0, (1, 2.76, 5.4)), k * 0.12, 0.5)
    return reverb(x, 2.5, 0.35)


def heartbeat():
    x = np.zeros(int(1.2 * SR))
    for at, g in ((0.0, 1.0), (0.28, 0.7)):
        mixin(x, drum(0.5, 70, 40, 0.0), at, g)
    return x


def music_gate_fight(seconds=96):
    """The gate assault: war drums on a dark pulse, string stabs, a flute crying over it."""
    track = np.zeros((int((seconds + 6) * SR), 2))
    bpm = 104
    beat = 60 / bpm
    tt = t_axis(seconds + 6)
    drone = np.zeros(len(tt))
    for f in (midi(38), midi(45)):
        for det in (-0.1, 0.1):
            drone += 2 * ((f * (1 + det / 100) * tt) % 1) - 1
    track += pan(fft_filter(drone, lo=30, hi=260) * 0.07, 0)
    n_beats = int(seconds / beat)
    for b in range(n_beats):
        at = b * beat
        bar = b % 8
        if bar in (0, 3, 6) or (b // 8) % 2 and bar == 7:
            place(track, drum(1.4, 110, 45, 0.3), at, 0.55, p=-0.15)
        if bar in (2, 5):
            place(track, drum(0.8, 190, 80, 0.5), at, 0.3, p=0.2)
        if b % 2 == 1:
            place(track, drum(0.3, 380, 200, 0.8), at, 0.08, p=0.35)
        if bar == 0 and b % 16 == 0:
            for k, d in enumerate((0, 2, 4)):
                place(track, pluck(midi(scale_note(d, -1)), 2.5, 0.8), at + k * 0.02, 0.25, p=-0.3 + k * 0.3)
    # A flute line over the drums in the second half.
    a = seconds * 0.5
    for deg in (7, 8, 6, 7, 5, 4, 5):
        d = beat * 4
        place(track, flute(midi(scale_note(deg)), d + 0.5), a, 0.16, p=0.25)
        a += d
    track = reverb(track, 2.8, 0.3)
    return loop_seamless(track[: int(seconds * SR)], 2.0)


def combat_sfx():
    write_ogg("sfx_blade", blade(False, 1), 4)
    write_ogg("sfx_blade_heavy", blade(True, 2), 4)
    write_ogg("sfx_blade_spin", mixin(blade(False, 3), blade(False, 4), 0.12, 0.8), 4)
    write_ogg("sfx_whoosh", sweep_band(0.35, 600, 2500, seed=5) * np.hanning(int(0.35 * SR)), 4)
    write_ogg("sfx_gore", splatter(6), 4)
    write_ogg("sfx_hit_flesh", impact_flesh(7), 4)
    write_ogg("sfx_gong_small", reverb(bell(midi(57), 3.0, shimmer=0.04), 2.5, 0.35), 4)
    write_ogg("sfx_roots", roots_crack(8), 4)
    write_ogg("sfx_slam", reverb(mixin(drum(1.2, 90, 35, 0.6), noise(int(0.6 * SR), 80, 1200, 9) * np.exp(-np.arange(int(0.6 * SR)) / SR / 0.15), 0, 0.6), 1.5, 0.25), 4)
    write_ogg("sfx_blood", mixin(splatter(10) * 0.6, spirit(False, 10) * 0.25, 0), 4)
    write_ogg("sfx_blood_heavy", mixin(splatter(11), spirit(True, 11) * 0.3, 0), 4)
    write_ogg("sfx_fire", fire(False, 12), 4)
    write_ogg("sfx_fire_heavy", fire(True, 13), 4)
    write_ogg("sfx_wind", wind_gust(14), 4)
    write_ogg("sfx_thunder", thunder(15), 4)
    write_ogg("sfx_spirit", spirit(False, 16), 4)
    write_ogg("sfx_spirit_heavy", spirit(True, 17), 4)
    write_ogg("sfx_poison", poison_hiss(18), 4)
    write_ogg("sfx_bell", reverb(bell(midi(45), 4.0, shimmer=0.05), 3.0, 0.4), 4)
    write_ogg("sfx_bow", bow(False, 19), 4)
    write_ogg("sfx_bow_heavy", bow(True, 20), 4)
    write_ogg("sfx_throw", throw(21), 4)
    write_ogg("sfx_blowpipe", mixin(noise(int(0.15 * SR), 1500, 6000, 22) * np.hanning(int(0.15 * SR)), throw(23) * 0.5, 0.05), 4)
    write_ogg("sfx_smoke", noise(int(1.2 * SR), 200, 3000, 24) * np.hanning(int(1.2 * SR)) ** 0.6, 4)
    write_ogg("sfx_drink", mixin(poison_hiss(25) * 0.3, chime(True) * 0.6, 0), 4)
    for i in range(3):
        write_ogg(f"sfx_groan_{i}", groan(30 + i), 4)
    write_ogg("sfx_greyed_death", mixin(splatter(40), groan(41) * 0.5, 0.05), 4)
    write_ogg("sfx_tapper_roar", roar(), 4)
    write_ogg("sfx_horn", horn(), 4)
    write_ogg("sfx_revive", chime(True), 4)
    write_ogg("sfx_downed", mixin(chime(False) * 0.5, heartbeat(), 0.3), 4)
    write_ogg("sfx_execute", mixin(blade(True, 42), splatter(43), 0.12, 1.0), 4)
    write_ogg("sfx_victory", reverb(mixin(bell(midi(50), 6.0, shimmer=0.04), chime(True), 0.4, 0.8), 3.5, 0.4), 4)
    write_ogg("sfx_burst", mixin(splatter(44), poison_hiss(45), 0, 0.8), 4)


# Vowel formants (F1, F2) for whispered syllables: a, e, o, u, i.
VOWELS = [(800, 1200), (500, 1900), (500, 900), (350, 800), (300, 2300)]


def whisper_syllables(seconds, seed, syllables=5, low=1.0):
    """A whispered incantation: breathy noise shaped into vowel formants, one syllable after another."""
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    out = np.zeros(n)
    step = n // syllables
    for k in range(syllables):
        f1, f2 = VOWELS[r.integers(len(VOWELS))]
        seg = step + int(step * 0.3)
        breath = r.normal(0, 1, seg)
        v = fft_filter(breath, peak=f1 * low, q=6) * 0.8 + fft_filter(breath, peak=f2 * low, q=7) * 0.5
        # A consonant: a short hiss or click before the vowel.
        cons = fft_filter(r.normal(0, 1, seg), lo=3000, hi=8000) * np.exp(-np.arange(seg) / SR / 0.025) * 0.5
        e = np.sin(np.linspace(0, math.pi, seg)) ** 1.5
        at = k * step
        end = min(n, at + seg)
        out[at:end] += ((v + cons) * e)[: end - at]
    return out / (np.abs(out).max() + 1e-9)


def chant(kind, seed):
    """The four chants a spell is spoken with: a whisper, a hummed choir, a growl, a crackling hiss."""
    if kind == "whisper":
        x = whisper_syllables(1.1, seed, 6)
        return reverb(x * 0.9, 1.6, 0.35)
    if kind == "choir":
        d = 1.4
        n = int(d * SR)
        tt = np.arange(n) / SR
        hum = sum(np.sin(math.tau * midi(m) * tt * (1 + 0.004 * np.sin(math.tau * 5 * tt))) for m in (50, 57, 62)) / 3
        hum = fft_filter(hum, peak=500, q=2) * 0.8 + hum * 0.3
        x = hum * np.sin(np.linspace(0, math.pi, n)) ** 0.8 * 0.6 + whisper_syllables(d, seed, 4) * 0.5
        return reverb(x, 3.0, 0.5)
    if kind == "growl":
        d = 1.0
        n = int(d * SR)
        tt = np.arange(n) / SR
        buzz = np.sign(np.sin(math.tau * 70 * tt * (1 + 0.05 * np.sin(math.tau * 3 * tt)))) * 0.3
        buzz = fft_filter(buzz, peak=380, q=3)
        x = buzz * np.sin(np.linspace(0, math.pi, n)) + whisper_syllables(d, seed, 4, low=0.7) * 0.6
        return reverb(x, 1.5, 0.3)
    # crackle: a whisper riding on static.
    d = 1.0
    n = int(d * SR)
    crack = (np.random.default_rng(seed).random(n) > 0.995) * np.random.default_rng(seed + 1).normal(0, 1, n)
    x = whisper_syllables(d, seed, 5) * 0.7 + fft_filter(crack, lo=2000) * 0.6
    return reverb(x, 1.4, 0.3)


def chants():
    for kind in ("whisper", "choir", "growl", "crackle"):
        for i in range(2):
            write_ogg(f"sfx_chant_{kind}_{i}", master(chant(kind, 70 + i * 7 + len(kind)), 0.7), 4)


def main():
    which = sys.argv[1:] or ["music", "amb", "sfx", "combat", "chant"]
    if "chant" in which:
        chants()
    if "combat" in which:
        combat_sfx()
        write_ogg("music_gate_fight", music_gate_fight(), 5)
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
