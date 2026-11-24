#!/usr/bin/env python3
"""Synthesized score + sound design, driven by audio/cues.json. No samples, no API keys.

    python3 audio/score.py            → audio/score.wav (48 kHz stereo, normalised ~-14 LUFS, -1 dBTP)

cues.json (all times in FILM seconds — if you use a WARP, convert story times with window.unwarp first):
{
  "bpm": 96, "duration": 10, "key": "D",
  "sections": [ {"start": 0, "end": 5, "mood": "dark"},
                {"start": 5, "end": 10, "mood": "groove", "level": 0.8} ],
  "motifs":   [ {"at": 4.4, "notes": [["A4",0,1],["D5",1,1],["F#5",2,2],["E5",4,2],["D5",6,2]], "octave_double": false} ],
  "swells":   [ {"at": 8.0, "dur": 5, "chord": "I9"} ],
  "events":   [ {"t": 1.25, "type": "boom"}, {"t": 4.4, "type": "whoosh"}, {"t": 8.0, "type": "pop"},
                {"t": 6.0, "type": "riser", "dur": 1.5}, {"t": 7.0, "type": "bell", "note": "A5"} ]
}
moods: silence · dark (drone + filtered pulse + heartbeat, opens up over the section) · turn (warm pad swell)
       · sparse (pad + soft arps) · groove (pad, arps, bass, kick, hats) · groove_full (+ claps, octave arps)
       · outro (sustained tonic chord, fades)
event types: boom · whoosh · riser(dur) · pop · tick · bell(note) · shutter · heartbeat · kick · clap · slot · chime
"""
import json
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
CUES = json.load(open(os.path.join(HERE, 'cues.json')))
SR = 48000
DUR = float(CUES['duration'])
N = int(SR * DUR)
BPM = float(CUES.get('bpm', 96))
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(int(CUES.get('seed', 7)))

KEYS = {'C': 48, 'C#': 49, 'Db': 49, 'D': 50, 'D#': 51, 'Eb': 51, 'E': 52, 'F': 53, 'F#': 54, 'Gb': 54, 'G': 55, 'G#': 56, 'Ab': 56, 'A': 57, 'A#': 58, 'Bb': 58, 'B': 59}
TONIC = KEYS[CUES.get('key', 'D')]  # MIDI of the tonic in octave 3
NAMES = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def hz(note):
    if isinstance(note, (int, float)):
        return midi_hz(note)
    n, o = note[:-1], int(note[-1])
    return midi_hz(NAMES[n] + 12 * (o + 1))


# Chords as semitone offsets from the tonic (octave 3). Major-key I–vi–IV–V plus colour chords.
CHORDS = {
    'I': [0, 7, 12, 16], 'vi': [-3, 4, 9, 12], 'IV': [-7, 0, 5, 9], 'V': [-5, 2, 7, 11],
    'ii': [2, 9, 14, 17], 'I9': [0, 7, 11, 14, 16], 'IVmaj7': [-7, 0, 4, 9],
    'i': [0, 7, 12, 15], 'VI': [-4, 3, 8, 12], 'VII': [-2, 5, 10, 14],
}
ROOTS = {'I': 0, 'vi': -3, 'IV': -7, 'V': -5, 'ii': 2, 'I9': 0, 'IVmaj7': -7, 'i': 0, 'VI': -4, 'VII': -2}
PROG = CUES.get('progression', ['I', 'vi', 'IV', 'V'])

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
verb_send = np.zeros((N, 2))
duck = np.ones(N)


def add(bus, t0, sig, gain=1.0, pan=0.0, send=0.0):
    i0 = int(round(t0 * SR))
    if i0 >= N or len(sig) == 0:
        return
    if i0 < 0:
        sig, i0 = sig[-i0:], 0
    sig = sig[: N - i0]
    l, r = np.cos((pan + 1) * np.pi / 4) * gain, np.sin((pan + 1) * np.pi / 4) * gain
    bus[i0 : i0 + len(sig), 0] += sig * l
    bus[i0 : i0 + len(sig), 1] += sig * r
    if send:
        verb_send[i0 : i0 + len(sig), 0] += sig * l * send
        verb_send[i0 : i0 + len(sig), 1] += sig * r * send


def tt(d):
    return np.arange(int(d * SR)) / SR


def lp(x, fc, o=2):
    return sosfilt(butter(o, fc, 'low', fs=SR, output='sos'), x)


def hp(x, fc, o=2):
    return sosfilt(butter(o, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, o=2):
    return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)


def env(n, a=0.01, r=0.3):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr and nr < n:
        e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def mixsig(*sigs):
    L = max(len(s) for s in sigs)
    out = np.zeros(L)
    for s in sigs:
        out[: len(s)] += s
    return out


# ---------------- instruments ----------------
def piano(f, d=3.0, vel=1.0, bright=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for n in range(1, 9):
        fn = f * n * (1 + 0.0004 * n * n)
        if fn > 12000:
            break
        s += (1 / n ** 1.6) * (bright if n > 2 else 1) * np.sin(2 * np.pi * fn * t + n) * np.exp(-t * (0.9 + n * 0.75))
    s += 0.6 * np.sin(2 * np.pi * f * 1.002 * t) * np.exp(-t * 0.7)
    s += lp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 60) * 0.15
    s *= np.minimum(1, t / 0.004) * vel * env(len(t), 0.004, 0.4)
    return lp(s, 4200) * 0.35


def pad(f, d, bright=1400, detune=7):
    t = tt(d)
    s = np.zeros_like(t)
    for c in (-detune, 0, detune):
        ff, ph = f * 2 ** (c / 1200), rng.uniform(0, 2 * np.pi)
        for n in range(1, 10):
            s += np.sin(2 * np.pi * ff * n * t + ph * n) / n
    return hp(lp(s, bright), 140) * env(len(t), min(1.2, d / 3), min(1.6, d / 2)) * 0.05


def bass(f, d):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * env(len(t), 0.01, 0.25) * np.exp(-t * 0.6) * 0.26


def kick(f0=110, f1=42, d=0.45, click=0.3):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    return (s + click * lp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 200)) * 0.9


def heartbeat():
    return lp(kick(85, 38, 0.5, 0.05), 300) * 1.3


def hat(d=0.06, bright=7000):
    t = tt(d)
    return hp(rng.standard_normal(len(t)), bright) * np.exp(-t * 70) * 0.12


def clap():
    t = tt(0.25)
    e = sum(np.exp(-np.maximum(0, t - o) * (180 if k < 2 else 22)) * (t >= o) for k, o in enumerate((0, 0.011, 0.022)))
    return bp(rng.standard_normal(len(t)), 900, 3200) * e * 0.25


def tick(f=2600, d=0.03, g=0.25):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 160) + 0.4 * hp(rng.standard_normal(len(t)), 4000) * np.exp(-t * 400)) * g


def bell(f, d=2.5, g=0.25):
    t = tt(d)
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * k) for r, a, k in ((1, 1, 1.4), (2.0, 0.5, 2.2), (2.76, 0.35, 3), (5.4, 0.15, 5), (8.93, 0.08, 8)))
    return s * np.minimum(1, t / 0.002) * g


def _sweep_noise(t, centers):
    n = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    L = len(t) // len(centers) + 1
    for b, c in enumerate(centers):
        seg = n[b * L : (b + 1) * L]
        out[b * L : b * L + len(seg)] = bp(seg, c * 0.65, min(c * 1.5, SR / 2 - 100))
    return out


def whoosh(d=0.8, lo=300, hi=5000, g=0.35, rise=0.6):
    t = tt(d)
    cs = [lo * (hi / lo) ** (np.sin(np.pi * p) ** 0.8) for p in np.linspace(0, 1, 24)]
    e = np.where(t < d * rise, (t / (d * rise)) ** 2, np.exp(-(t - d * rise) / (d * (1 - rise) / 3)))
    return _sweep_noise(t, cs) * e * g


def riser(d, g=0.25):
    t = tt(d)
    cs = [200 * (6000 / 200) ** (b / 40) for b in range(40)]
    sweep = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (3 * t / d)) / SR) * 0.3
    return (_sweep_noise(t, cs) + sweep) * (t / d) ** 2.2 * g


def boom(g=0.9):
    t = tt(3.5)
    s = np.sin(2 * np.pi * np.cumsum(35 + 30 * np.exp(-t * 4)) / SR) * np.exp(-t * 1.1)
    return (s + lp(rng.standard_normal(len(t)), 400) * np.exp(-t * 3) * 0.3) * g


def pop(f0=520, f1=880, d=0.09, g=0.22):
    t = tt(d)
    return np.sin(2 * np.pi * np.cumsum(f0 + (f1 - f0) * (t / d)) / SR) * np.exp(-t * 45) * g


def shutter():
    t = tt(0.12)
    a = hp(rng.standard_normal(len(t)), 1800) * np.exp(-t * 300)
    b = np.zeros_like(t)
    o = int(0.045 * SR)
    b[o:] = hp(rng.standard_normal(len(t) - o), 1200) * np.exp(-tt(0.12)[: len(t) - o] * 220)
    return (a + 0.8 * b) * 0.35


def slot():
    return mixsig(tick(1500, 0.04, 0.3), tick(3200, 0.02, 0.15))


def chord_notes(name, octave_shift=0):
    return [TONIC + o + 12 * octave_shift for o in CHORDS[name]]


def arp_pattern(name):
    c = sorted(set(CHORDS[name]))
    up = [TONIC + 12 + v for v in c][:4]
    return up + [up[2], up[1], up[0] + (2 if len(up) > 0 else 0), up[1]]


def snare(g=1.0):
    t = tt(0.32)
    body = np.sin(2 * np.pi * np.cumsum(230 * np.exp(-t * 18) + 170) / SR) * np.exp(-t * 28) * 0.55
    nz = bp(rng.standard_normal(len(t)), 1400, 9000) * np.exp(-t * 15)
    return (body + nz * 0.75) * 0.42 * g


def ohat():
    t = tt(0.3)
    return hp(rng.standard_normal(len(t)), 7500) * np.exp(-t * 13) * 0.1


def crash(g=1.0):
    t = tt(2.8)
    n = hp(rng.standard_normal(len(t)), 4200) * np.exp(-t * 1.6)
    return (n + 0.3 * bp(rng.standard_normal(len(t)), 3000, 6000) * np.exp(-t * 4)) * 0.16 * g


def shaker():
    t = tt(0.07)
    return bp(rng.standard_normal(len(t)), 6000, 12000) * np.sin(np.pi * t / 0.07) ** 2 * 0.07


def pluck(f, d=0.42, cutoff=6000, g=1.0):
    t = tt(d)
    saw = np.zeros_like(t)
    for n in range(1, 16):
        if f * n > 15000:
            break
        saw += np.sin(2 * np.pi * f * n * t + n * 0.3) / n
    sq = np.sign(np.sin(2 * np.pi * f * 1.003 * t)) * 0.25
    bright = lp(saw + sq, min(cutoff, SR / 2 - 200)) * np.exp(-t * 22)
    body = lp(saw, min(1100 + cutoff * 0.15, 4000)) * np.exp(-t * 7)
    return (bright * 0.8 + body * 0.5) * env(len(t), 0.002, 0.06) * 0.15 * g


def stab(notes, d=0.32, g=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for m in notes:
        f = midi_hz(m)
        for c in (-9, 0, 9):
            ff = f * 2 ** (c / 1200)
            for n in range(1, 10):
                s += np.sin(2 * np.pi * ff * n * t + n * c) / n
    return hp(lp(s, 3200), 220) * np.exp(-t * 6) * env(len(t), 0.004, 0.1) * 0.022 * g


def sub(f, d):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    return hp(np.tanh(s * 1.4), 38) * env(len(t), 0.004, 0.05) * np.exp(-t * 2.2) * 0.13


def lead(f, d, g=1.0):
    t = tt(d)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.25)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    s = np.sin(ph) + 0.45 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph) + 0.08 * np.sin(5 * ph)
    return lp(s, 6000) * env(len(t), 0.01, 0.12) * np.exp(-t * 1.6) * 0.1 * g


def koto(f, d=1.6, g=1.0):
    from scipy.signal import lfilter
    n = int(d * SR)
    P = max(2, int(round(SR / f)))
    exc = np.zeros(n)
    burst = rng.standard_normal(P) * np.hanning(P) ** 0.3
    exc[:P] = lp(burst, 7000)
    dec = 0.996 if f < 600 else 0.993
    a = np.zeros(P + 2)
    a[0] = 1.0
    a[P] = -0.5 * dec
    a[P + 1] = -0.5 * dec
    y = lfilter([1.0], a, exc)
    t = np.arange(n) / SR
    y += 0.3 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 7) * 0.2
    y = hp(y, 180) * env(n, 0.001, 0.3)
    return y / (np.abs(y).max() + 1e-9) * 0.16 * g


def chop(f, d=0.14, g=1.0):
    t = tt(d)
    saw = sum(np.sin(2 * np.pi * f * n * t) / n for n in range(1, 30) if f * n < 14000)
    s = bp(saw, 650, 1050) * 1.0 + bp(saw, 1100, 1500) * 0.7 + bp(saw, 2400, 3000) * 0.25
    return s * np.sin(np.pi * np.minimum(1, t / d)) ** 0.6 * 0.12 * g


# ---------------- arrangement ----------------
DRIVE = {
    'intro':      dict(kick=0.6, kick_from=0, hat8=0.0, hat16=0.0, shk=0.55, ohat=0.0, clap=0.0, bass=0.0, pluck=0.8, f0=900, f1=3800, pad=0.6, stab=0.0, hook=0.0, koto=1.0, chop=0.0, fills=False, roll=False),
    'build1':     dict(kick=0.85, kick_from=0, hat8=0.75, hat16=0.0, shk=0.65, ohat=0.0, clap=0.75, bass=0.8, pluck=0.95, f0=3500, f1=6000, pad=0.7, stab=0.0, hook=0.0, koto=0.9, chop=0.0, fills=True, roll=False),
    'brk':        dict(kick=0.0, kick_from=0, hat8=0.0, hat16=0.0, shk=0.0, ohat=0.0, clap=0.0, bass=0.0, pluck=0.5, f0=1000, f1=800, pad=1.0, stab=0.0, hook=0.0, koto=0.6, chop=0.0, fills=False, roll=False),
    'build2':     dict(kick=0.95, kick_from=0, hat8=0.0, hat16=0.75, shk=0.6, ohat=0.45, clap=0.85, bass=0.9, pluck=1.0, f0=2500, f1=8000, pad=0.85, stab=0.0, hook=0.0, koto=0.0, chop=0.0, fills=False, roll=True),
    'drive':      dict(kick=1.0, kick_from=0, hat8=0.0, hat16=0.8, shk=0.6, ohat=0.75, clap=1.0, bass=1.0, pluck=0.95, f0=7000, f1=7000, pad=0.85, stab=0.55, hook=0.0, koto=0.55, chop=0.0, fills=True, roll=False),
    'drive_full': dict(kick=1.0, kick_from=0, hat8=0.0, hat16=0.9, shk=0.7, ohat=0.9, clap=1.05, bass=1.05, pluck=1.0, f0=8000, f1=8000, pad=1.0, stab=0.85, hook=0.9, koto=0.85, chop=0.75, fills=True, roll=False),
}
PROG4 = CUES.get('drive_progression', ['I', 'V', 'vi', 'IV'])
HOOK = [
    [('A5', 0, 1), ('F#5', 1, 0.5), ('A5', 1.5, 0.5), ('B5', 2, 1), ('A5', 3, 1)],
    [('A5', 0, 1), ('E5', 1, 0.5), ('F#5', 1.5, 0.5), ('A5', 2, 1.5), ('E5', 3.5, 0.5)],
    [('B5', 0, 1), ('F#5', 1, 0.5), ('B5', 1.5, 0.5), ('C#6', 2, 1), ('B5', 3, 1)],
    [('A5', 0, 1), ('G5', 1, 0.5), ('F#5', 1.5, 0.5), ('E5', 2, 1), ('D5', 3, 1)],
]
S16 = BEAT / 4


def pump(t0, depth=0.42, rel=0.32):
    i0, i1 = int(t0 * SR), min(N, int((t0 + rel) * SR))
    if i0 >= N or i1 <= i0:
        return
    duck[i0:i1] = np.minimum(duck[i0:i1], (1 - depth) + depth * np.linspace(0, 1, i1 - i0) ** 0.7)


def drive_section(a, b, mood, level):
    L = DRIVE[mood]
    nbars = int(round((b - a) / BAR))
    for k in range(nbars):
        b0 = a + k * BAR
        prog = k / max(1, nbars - 1)
        ch = PROG4[k % 4]
        root = TONIC - 12 + ROOTS[ch]
        if L['pad']:
            for m in chord_notes(ch):
                add(music, b0, pad(midi_hz(m), BAR + 0.5, 1300 + 900 * L['pad']), L['pad'] * level * 0.9, pan=rng.uniform(-0.4, 0.4), send=0.35)
        if L['pluck']:
            tones = sorted(set(TONIC + 12 + v for v in CHORDS[ch]))
            seq = tones + [tones[-1] + 12] + tones[::-1][1:] + [tones[0] + 12]
            cut = L['f0'] + (L['f1'] - L['f0']) * prog
            for j in range(16):
                m = seq[j % len(seq)] + (12 if j % 8 == 6 else 0)
                acc = 1.0 if j % 4 == 0 else 0.7
                add(music, b0 + j * S16, pluck(midi_hz(m), 0.4, cut, acc), L['pluck'] * level, pan=0.45 * np.sin(j * 1.7), send=0.28)
        if L['stab']:
            notes = [TONIC + 12 + v for v in CHORDS[ch]]
            for bt in (1.5, 3.0):
                add(music, b0 + bt * BEAT, stab(notes), L['stab'] * level, pan=0.0, send=0.3)
        if L['hook']:
            for n, bo, du in HOOK[k % 4]:
                add(music, b0 + bo * BEAT, lead(hz(n), du * BEAT + 0.25), L['hook'] * level, pan=0.1, send=0.45)
        if L['koto']:
            for n, bo, du in HOOK[k % 4]:
                add(music, b0 + bo * BEAT, koto(hz(n) / (2 if L['hook'] else 1), 1.4), L['koto'] * level, pan=-0.2, send=0.4)
        if L['chop']:
            tones = [TONIC + 24 + v for v in CHORDS[ch]]
            for j, step in enumerate((0, 3, 6, 10, 12, 14)):
                add(music, b0 + step * S16, chop(midi_hz(tones[j % len(tones)])), L['chop'] * level, pan=0.3 * (-1) ** j, send=0.35)
        if L['bass']:
            for e in range(8):
                f = midi_hz(root + (12 if e % 2 else 0))
                add(music, b0 + e * BEAT / 2, sub(f, BEAT / 2 * 0.92), L['bass'] * level * (1.0 if e % 2 else 0.85))
        is_fill = L['fills'] and k % 4 == 3
        for bt in range(4):
            tb = b0 + bt * BEAT
            if L['kick'] and (k > 0 or bt >= L['kick_from']):
                add(sfx, tb, hp(kick(125, 48, 0.36, 0.45), 35), L['kick'] * level * 0.6)
                pump(tb)
            if L['clap'] and bt in (1, 3) and not (is_fill and bt == 3):
                add(sfx, tb, mixsig(clap(), snare(0.8)), L['clap'] * level * 0.8, send=0.22)
            if L['hat8']:
                add(sfx, tb + BEAT / 2, hat(0.05, 7000), L['hat8'] * level * 0.9, pan=0.3)
            if L['hat16']:
                for q in range(4):
                    add(sfx, tb + q * S16, hat(0.045, 7200 + 900 * (q % 2)), L['hat16'] * level * (0.95 if q == 2 else 0.5), pan=0.35 * (-1) ** q)
            if L['ohat']:
                add(sfx, tb + BEAT / 2, ohat(), L['ohat'] * level, pan=-0.25)
            if L['shk']:
                for q in range(4):
                    add(sfx, tb + q * S16, shaker(), L['shk'] * level * (1.0 if q % 2 else 0.6), pan=0.55)
        if is_fill:
            for q in range(4):
                add(sfx, b0 + 3 * BEAT + q * S16, snare(0.55 + q * 0.18), level * 0.8, send=0.2)
        if L['roll'] and k >= nbars - 2:
            rb = b0
            steps = 8 if k < nbars - 1 else 16
            for q in range(steps):
                tq = rb + q * BAR / steps
                g = 0.25 + 0.75 * ((k - (nbars - 2)) + q / steps) / 2
                add(sfx, tq, snare(g), level * 0.75, send=0.25)


def section_layers(mood, level):
    base = dict(pad=0, arp=0, bass=0, kick=0, hat=0, clap=0, oct=False)
    if mood == 'sparse':
        base.update(pad=0.8, arp=0.6)
    elif mood == 'groove':
        base.update(pad=0.9, arp=0.85, bass=0.8, kick=0.7, hat=0.6)
    elif mood == 'groove_full':
        base.update(pad=1.0, arp=1.0, bass=0.95, kick=0.85, hat=0.85, clap=0.75, oct=True)
    return {k: (v * level if isinstance(v, float) else v) for k, v in base.items()}


for sec in CUES.get('sections', []):
    a, b, mood, level = float(sec['start']), float(sec['end']), sec['mood'], float(sec.get('level', 1.0))
    if mood == 'silence':
        continue
    if mood in DRIVE:
        drive_section(a, b, mood, level)
        continue
    if mood == 'dark':
        d = b - a
        t = tt(d)
        dr = sum(g * np.sin(2 * np.pi * midi_hz(TONIC - 12 + o) * t * k) for o, g, k in ((0, 1, 1), (7, 0.6, 1.001), (12, 0.3, 0.999)))
        dr = lp(dr * (1 + 0.15 * np.sin(2 * np.pi * 0.2 * t)), 500)
        add(music, a, dr * np.minimum(1, t / 2) * (0.55 + 0.45 * t / d) * 0.12 * level, send=0.2)
        minor_line = [0, 0, 3, 0, -5, 0, -4, -2]
        for k in range(int(d / (BEAT / 2))):
            t0, prog = a + k * BEAT / 2, k * BEAT / 2 / d
            f = midi_hz(TONIC - 12 + minor_line[(k // 8) % 8])
            tb = tt(BEAT / 2)
            saw = sum(np.sin(2 * np.pi * f * n * tb) / n for n in range(1, 12))
            add(music, t0, lp(saw, 300 + 2200 * prog ** 1.5) * env(len(tb), 0.005, 0.12) * 0.09 * level, pan=0.15 * (-1) ** k)
        for k in range(int(d / BAR) + 1):
            if a + k * BAR < b - 0.3:
                add(sfx, a + k * BAR, heartbeat(), 0.55 * level)
                add(sfx, a + k * BAR + 0.24, heartbeat(), 0.35 * level)
        continue
    if mood == 'turn':
        for m in chord_notes('I'):
            add(music, a, pad(midi_hz(m), b - a + 1.5, 900), level, send=0.5)
        continue
    if mood == 'outro':
        for m in chord_notes('I') + [TONIC + 19, TONIC + 24]:
            add(music, a, pad(midi_hz(m), b - a + 0.5, 1800, 8), 1.1 * level, pan=rng.uniform(-0.5, 0.5), send=0.6)
        add(music, a, bass(midi_hz(TONIC - 12), min(5, b - a)), 0.8 * level)
        continue
    lv = section_layers(mood, level)
    k = 0
    while a + k * BAR < b - 0.01:
        b0 = a + k * BAR
        ch = PROG[k % len(PROG)]
        for m in chord_notes(ch):
            add(music, b0, pad(midi_hz(m), BAR + 0.6, 1100 + 500 * lv['pad']), lv['pad'], pan=rng.uniform(-0.3, 0.3), send=0.35)
        if lv['arp']:
            for j, m in enumerate(arp_pattern(ch)):
                f = midi_hz(m) * (2 if (lv['oct'] and j % 2) else 1)
                add(music, b0 + j * BEAT / 2, piano(f, 1.6, 0.5 + 0.15 * (j == 0), 0.9), lv['arp'] * 0.75, pan=0.35 * np.sin(j), send=0.4)
        if lv['bass']:
            r = midi_hz(TONIC - 12 + ROOTS[ch])
            add(music, b0, bass(r, BEAT * 1.8), lv['bass'])
            add(music, b0 + 2 * BEAT, bass(r, BEAT * 1.5), lv['bass'] * 0.8)
        for bt in range(4):
            tb = b0 + bt * BEAT
            if tb >= b:
                break
            if lv['kick'] and bt in (0, 2):
                add(sfx, tb, kick(), lv['kick'] * 0.55)
                i0, i1 = int(tb * SR), min(N, int((tb + 0.35) * SR))
                duck[i0:i1] = np.minimum(duck[i0:i1], 0.55 + 0.45 * np.linspace(0, 1, max(1, i1 - i0)) ** 0.6)
            if lv['clap'] and bt in (1, 3):
                add(sfx, tb, clap(), lv['clap'] * 0.5, send=0.25)
            if lv['hat']:
                for q in range(4):
                    add(sfx, tb + q * BEAT / 4, hat(0.05, 6500 + 1500 * (q % 2)), lv['hat'] * (0.9 if q % 2 else 0.5), pan=0.4 * (-1) ** q)
        k += 1

for mo in CUES.get('motifs', []):
    for note, b_off, _ in mo['notes']:
        f = hz(note)
        sig = mixsig(piano(f, 3.5, 0.85, 0.85), piano(f * 2, 3.5, 0.4)) if mo.get('octave_double') else piano(f, 3.5, 0.8, 0.8)
        add(music, float(mo['at']) + b_off * BEAT, sig, mo.get('gain', 0.9), pan=0.1, send=0.65)

for sw in CUES.get('swells', []):
    at, d = float(sw['at']), float(sw.get('dur', 6))
    for m in chord_notes(sw.get('chord', 'I9')):
        add(music, at, pad(midi_hz(m), d, 2200, 9), 1.2, pan=rng.uniform(-0.4, 0.4), send=0.6)
    add(music, at, bass(midi_hz(TONIC - 12), min(4, d)), 0.9)
    add(sfx, at, boom(0.3), send=0.4)

EVENTS = {
    'boom': lambda e: (boom(e.get('gain', 0.8)), 0.5),
    'whoosh': lambda e: (whoosh(e.get('dur', 0.8), 300, 6000, 0.3), 0.2),
    'riser': lambda e: (riser(e.get('dur', 1.5), 0.2), 0.1),
    'pop': lambda e: (pop(), 0.0),
    'tick': lambda e: (tick(e.get('freq', 2600), 0.03, 0.14), 0.0),
    'bell': lambda e: (bell(hz(e.get('note', 'A5')), 2.0, 0.09), 0.6),
    'chime': lambda e: (mixsig(bell(hz('A5'), 2.5, 0.07), np.concatenate([np.zeros(int(0.08 * SR)), bell(hz('D6'), 2.5, 0.06)])), 0.7),
    'shutter': lambda e: (shutter(), 0.15),
    'heartbeat': lambda e: (mixsig(heartbeat(), np.concatenate([np.zeros(int(0.22 * SR)), heartbeat() * 0.65])), 0.0),
    'kick': lambda e: (kick(), 0.0),
    'clap': lambda e: (clap(), 0.25),
    'slot': lambda e: (slot(), 0.0),
    'crash': lambda e: (crash(e.get('gain', 1.0)), 0.3),
    'snare': lambda e: (snare(e.get('gain', 1.0)), 0.2),
}
for e in CUES.get('events', []):
    sig, send = EVENTS[e['type']](e)
    add(sfx, float(e['t']), sig, e.get('gain', 1.0), pan=e.get('pan', 0.0), send=send)

# ---------------- mix & master ----------------
music *= duck[:, None]
send_total = verb_send + music * 0.15
ir_t = tt(3.2)
ir = np.stack([lp(rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 2.1), 6000) for _ in range(2)], axis=1)
ir /= np.sqrt((ir ** 2).sum(axis=0))
wet = np.stack([fftconvolve(send_total[:, c], ir[:, c])[:N] for c in range(2)], axis=1)
mix = music + sfx + wet * 0.55
for c in range(2):
    mix[:, c] = hp(mix[:, c], 28)
peak = np.abs(mix).max() or 1
mix = np.tanh(mix / peak * 1.4) / np.tanh(1.4)
fade = np.ones(N)
fl = int(min(1.5, DUR / 4) * SR)
fade[-fl:] = np.linspace(1, 0, fl) ** 1.5
fade[: int(0.02 * SR)] = np.linspace(0, 1, int(0.02 * SR))
mix *= fade[:, None] * 0.89
out = os.path.join(HERE, 'score.wav')
wavfile.write(out, SR, (mix * 32767).astype(np.int16))
print(out, f'{DUR:.1f}s', 'peak', round(float(np.abs(mix).max()), 3))
