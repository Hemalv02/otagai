"""Writes audio/cues.json for the 165 s cut (96 BPM, bar = 2.5 s). Times mirror scenes/v2*.js."""
import json, os

E = []
def ev(t, type, **kw):
    E.append(dict(t=round(t, 3), type=type, **kw))

def ticks(t0, n, step, freq=3400, gain=0.2):
    for i in range(n):
        ev(t0 + i * step, 'tick', gain=gain, freq=freq)

# ---- hook / problem (0–17.5)
ticks(1.0, 16, 0.1, 2400, 0.28)            # 34.9% counter
ev(1.0, 'pop'); ev(2.6, 'pop', gain=0.7)
for i in range(3): ev(5.6 + i * 0.75, 'pop', gain=0.7, pan=-0.3 + 0.3 * i)  # steps chips
ev(4.9, 'whoosh', dur=0.6, gain=0.5); ev(9.3, 'whoosh', dur=0.6, gain=0.5)
ticks(9.8, 22, 1 / 26, 3600, 0.16)         # typing
ticks(11.6, 14, 1 / 40, 3000, 0.12)        # deleting
ev(12.9, 'whoosh', dur=0.6, gain=0.4)
# ---- turn: Otagai wordmark (17.5)
ev(17.5, 'boom', gain=0.45); ev(17.6, 'whoosh', dur=1.4, gain=0.7); ev(18.6, 'chime')
for i, t in enumerate((20.4, 22.0, 23.2)): ev(t, 'pop', gain=0.7, pan=-0.4 + 0.4 * i)
ev(24.4, 'whoosh', dur=0.7, gain=0.5)

# ---- section changes: whoosh + crash on the downbeat
for t, g in ((25, 1.1), (35, 0.6), (42.5, 0.7), (62.5, 0.9), (75, 0.6), (85, 0.6), (95, 0.7),
             (105, 0.7), (115, 0.8), (140, 0.7)):
    ev(t, 'crash', gain=g)
    ev(t - 0.35, 'whoosh', dur=0.7, gain=0.55)

# ---- app taps (from taps() keyframes in scenes)
for t in (26.4, 27.2, 29.0, 31.6, 36.8, 38.3, 43.2, 44.8, 49.0, 51.4, 53.2, 64.1, 78.6, 82.6, 85.4,
          91.9, 93.4, 95.6, 98.7, 106.1, 106.5, 107.3, 108.0, 110.2, 121.8, 129.8, 135.6,
          143.4, 145.8, 147.0):
    ev(t, 'pop', gain=0.75)
ev(31.7, 'chime')                          # approved
ticks(45.0, 30, 0.05, 3800, 0.16)          # AI writing the request
ev(53.3, 'chime')                          # request sent
# ripple rings 55.6–59.5
for i, (t, n) in enumerate(zip((55.6, 56.9, 58.2, 59.5), ('D5', 'F#5', 'A5', 'D6'))):
    ev(t, 'bell', note=n); ev(t + 0.02, 'pop', gain=0.6)
ev(55.4, 'riser', dur=4.0)
ev(64.2, 'chime'); ev(66.4, 'bell', note='A5')   # offer / meet
ev(75.2, 'shutter')                        # Rahim photographs the wall
ticks(79.0, 24, 0.05, 3600, 0.15)
ev(82.7, 'chime')
ev(86.4, 'shutter'); ticks(86.8, 24, 0.05, 3600, 0.15)  # photo → listing
ev(89.0, 'chime')
ev(93.5, 'slot')
# thank-you: knots tie 100.2 + i*0.4
for i, n in enumerate(('D5', 'F#5', 'A5', 'D6')):
    ev(100.2 + i * 0.4, 'bell', note=n)
ev(99.0, 'chime')
ev(110.3, 'chime')                         # family consent saved
ev(117.0, 'whoosh', dur=0.5, gain=0.35); ev(118.8, 'whoosh', dur=0.5, gain=0.35)

# ---- disaster (125–140)
ev(124.9, 'boom', gain=0.9); ev(124.9, 'crash', gain=0.5)
ev(125.8, 'pop', gain=0.9)                 # Emergency level
ev(127.3, 'boom', gain=0.6)                # alert sent
ev(127.5, 'whoosh', dur=1.0, gain=0.6)
ev(130.0, 'chime')                         # I'm safe
for i in range(6): ev(131.0 + i * 0.35, 'pop', gain=0.5, pan=-0.5 + 0.2 * i)   # replies arrive
ev(135.0, 'whoosh', dur=0.6, gain=0.45); ev(135.7, 'chime')

# ---- close (152–165)
ev(150.2, 'riser', dur=2.3)
ev(152.5, 'crash', gain=1.2); ev(152.5, 'boom', gain=0.5); ev(152.6, 'whoosh', dur=2.2, gain=0.6)
ev(155.0, 'boom', gain=0.4); ev(155.1, 'chime')

E.sort(key=lambda e: e['t'])
HOOK = [["F#5", 0, 1], ["A5", 1, 1], ["B5", 2, 1], ["A5", 3, 1], ["D6", 4, 3]]
cues = {
    "bpm": 96, "duration": 165, "key": "D", "seed": 11,
    "progression": ["I", "vi", "IV", "V"],
    "drive_progression": ["I", "V", "vi", "IV"],
    "sections": [
        dict(start=0, end=5, mood="intro", level=0.8),
        dict(start=5, end=12.5, mood="build1", level=0.85),
        dict(start=12.5, end=17.5, mood="brk", level=0.8),
        dict(start=17.5, end=25, mood="build2", level=0.9),
        dict(start=25, end=42.5, mood="drive_full", level=0.92),
        dict(start=42.5, end=62.5, mood="drive", level=0.85),
        dict(start=62.5, end=75, mood="drive_full", level=0.9),
        dict(start=75, end=95, mood="drive", level=0.85),
        dict(start=95, end=105, mood="drive_full", level=0.9),
        dict(start=105, end=115, mood="drive", level=0.85),
        dict(start=115, end=125, mood="drive_full", level=0.9),
        dict(start=125, end=132.5, mood="dark", level=0.6),
        dict(start=132.5, end=140, mood="build2", level=0.8),
        dict(start=140, end=150, mood="drive", level=0.85),
        dict(start=150, end=152.5, mood="brk", level=0.8),
        dict(start=152.5, end=162.5, mood="drive_full", level=1.0),
        dict(start=162.5, end=165, mood="outro", level=1.0),
    ],
    "motifs": [
        dict(at=25.6, notes=HOOK, gain=0.85),
        dict(at=95.6, notes=HOOK, gain=0.8, octave_double=True),
        dict(at=153.1, notes=HOOK, gain=0.85, octave_double=True),
    ],
    "swells": [dict(at=150.0, dur=3, chord="I9")],
    "events": E,
}
with open(os.path.join(os.path.dirname(__file__), 'cues.json'), 'w') as f:
    json.dump(cues, f, indent=1)
print(len(E), 'events')
