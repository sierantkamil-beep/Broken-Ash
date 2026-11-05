"""
Animation library for MakeHuman-rigged characters: poses as bone rotations, sampled per frame.

Axes are the character's own frame at rest (mh.rotate): +X is the character's left, -Y forward, +Z up.
Rules of thumb that follow:
  * a leg or arm swings FORWARD with a negative X rotation; a knee bends with a positive one;
  * the spine leans forward with a positive X rotation and twists with Z;
  * an arm hanging at rest is lowered towards the body by +Y (left) / -Y (right).

Every animation has a fixed frame count (FRAMES) shared by the renderer and the game client.
Attacks have three beats: wind-up (frames 0–1), strike (2–3), follow-through (4–5).
"""
import math

from mh import reset_pose, rotate, shift

FRAMES = {"idle": 6, "run": 8, "roll": 6, "hit": 3, "death": 6, "attack": 6, "skill1": 6, "skill2": 6}

# Which motion each path's attack and two skills use (see design.md §4).
PATH_MOTIONS = {
    "thorn": ("slash", "spin", "lunge"),
    "bark": ("heavy", "slam", "sweep"),
    "blood": ("sigil", "cast", "raise"),
    "ash": ("throw", "cast", "slam_hands"),
    "storm": ("fan", "fan_wide", "cast"),
    "graves": ("raise", "cast", "slam_hands"),
    "dusk": ("bow", "bow", "throw"),
    "sting": ("throw", "lunge", "throw_both"),
    # The Greyed: claws and bites; the Tapper swings his cleaver and slams.
    "shambler": ("claw", "claw", "claw"),
    "runner": ("lunge", "lunge", "lunge"),
    "bloated": ("slam_hands", "slam_hands", "slam_hands"),
    "tapper": ("heavy", "sweep", "slam"),
}
GREYED = {"shambler", "runner", "bloated", "tapper"}


def ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def beats(f, n=6):
    """Wind-up (0→1), strike (0→1), recovery (0→1) progress for frame f of an attack."""
    t = f / (n - 1)
    return ease(t / 0.3), ease((t - 0.3) / 0.35), ease((t - 0.65) / 0.35)


def stance(a, guard=1.0):
    """Arms from the rest A-pose down to the sides, elbows a little bent; knees soft."""
    for side, sx in (("L", 1), ("R", -1)):
        rotate(a, f"upperarm01.{side}", (0, 1, 0), sx * 38)
        rotate(a, f"upperarm01.{side}", (1, 0, 0), 10)
        rotate(a, f"lowerarm01.{side}", (1, 0, 0), -25 * guard)
        rotate(a, f"upperleg01.{side}", (1, 0, 0), -4)
        rotate(a, f"lowerleg01.{side}", (1, 0, 0), 7)


def guard_pose(a, path, k=1.0):
    """How each path holds its weapon when ready."""
    if path in ("thorn", "sting"):
        rotate(a, "upperarm01.R", (1, 0, 0), -25 * k)
        rotate(a, "lowerarm01.R", (1, 0, 0), -45 * k)
        rotate(a, "upperarm01.L", (1, 0, 0), -15 * k)
        rotate(a, "lowerarm01.L", (1, 0, 0), -40 * k)
    elif path == "bark":
        rotate(a, "upperarm01.R", (1, 0, 0), -30 * k)
        rotate(a, "lowerarm01.R", (1, 0, 0), -40 * k)
        rotate(a, "upperarm01.L", (1, 0, 0), -35 * k)
        rotate(a, "upperarm01.L", (0, 0, 1), -20 * k)
        rotate(a, "lowerarm01.L", (1, 0, 0), -55 * k)
    elif path == "dusk":
        rotate(a, "upperarm01.L", (1, 0, 0), -20 * k)
        rotate(a, "lowerarm01.L", (1, 0, 0), -20 * k)
    elif path == "storm":
        for side in "LR":
            rotate(a, f"upperarm01.{side}", (1, 0, 0), -20 * k)
            rotate(a, f"lowerarm01.{side}", (1, 0, 0), -50 * k)
    elif path == "graves":
        rotate(a, "upperarm01.L", (1, 0, 0), -25 * k)
        rotate(a, "lowerarm01.L", (1, 0, 0), -55 * k)
    else:
        rotate(a, "lowerarm01.R", (1, 0, 0), -35 * k)


def pose(r, path, anim, f):
    """Poses the rig of `r` for frame f of an animation."""
    a = r["armature"]
    reset_pose(a)
    n = FRAMES[anim]
    p = f / n * math.tau
    if path in GREYED and anim != "death":
        # The dead stoop: spine bent, head hanging forward and to one side.
        rotate(a, "spine04", (1, 0, 0), 14)
        rotate(a, "spine02", (1, 0, 0), 10)
        rotate(a, "neck01", (1, 0, 0), 12)
        rotate(a, "neck02", (0, 1, 0), 9)
    if anim == "idle":
        b = math.sin(p)
        stance(a)
        guard_pose(a, path)
        rotate(a, "spine03", (1, 0, 0), 2 + 1.2 * b)
        rotate(a, "neck01", (1, 0, 0), -1.5 * b)
        shift(a, "root", (0, 0, -0.012 + 0.005 * b))
        for side, sx in (("L", 1), ("R", -1)):
            rotate(a, f"upperarm01.{side}", (0, 1, 0), sx * 1.5 * b)
        return
    if anim == "run":
        s, c = math.sin(p), math.cos(p)
        stance(a, 1.6)
        if path in ("shambler", "bloated", "tapper"):
            for side in "LR":
                rotate(a, f"upperarm01.{side}", (1, 0, 0), -55)
        shift(a, "root", (0, 0, -0.04 + 0.035 * abs(c)))
        rotate(a, "root", (0, 0, 1), 6 * s)
        rotate(a, "spine05", (1, 0, 0), 10)
        rotate(a, "spine02", (0, 0, 1), -10 * s)
        rotate(a, "neck01", (1, 0, 0), -8)
        for side, sgn in (("L", 1), ("R", -1)):
            phase = s * sgn
            rotate(a, f"upperleg01.{side}", (1, 0, 0), -40 * phase - 8)
            knee = max(0.0, -c * sgn) * 85 + max(0.0, phase) * 25 + 10
            rotate(a, f"lowerleg01.{side}", (1, 0, 0), knee)
            rotate(a, f"foot.{side}", (1, 0, 0), -15 * max(0.0, -phase))
            rotate(a, f"upperarm01.{side}", (1, 0, 0), 35 * phase)
            rotate(a, f"lowerarm01.{side}", (1, 0, 0), -45)
        return
    if anim == "roll":
        k = f / (n - 1)
        tuck = math.sin(min(1.0, k * 1.15) * math.pi)
        spin = 360 * ease(min(1.0, k * 1.1))
        shift(a, "root", (0, -0.6 * k, -0.45 * tuck))
        rotate(a, "root", (1, 0, 0), spin)
        rotate(a, "spine05", (1, 0, 0), 55 * tuck)
        rotate(a, "spine02", (1, 0, 0), 25 * tuck)
        rotate(a, "neck01", (1, 0, 0), 30 * tuck)
        for side, sx in (("L", 1), ("R", -1)):
            rotate(a, f"upperleg01.{side}", (1, 0, 0), -110 * tuck)
            rotate(a, f"lowerleg01.{side}", (1, 0, 0), 130 * tuck)
            rotate(a, f"upperarm01.{side}", (0, 1, 0), sx * 40)
            rotate(a, f"upperarm01.{side}", (1, 0, 0), -70 * tuck)
            rotate(a, f"lowerarm01.{side}", (1, 0, 0), -80 * tuck)
        return
    if anim == "hit":
        k = [0.0, 1.0, 0.5][f]
        stance(a)
        guard_pose(a, path, 0.6)
        rotate(a, "spine04", (1, 0, 0), -12 * k)
        rotate(a, "spine02", (1, 0, 0), -10 * k)
        rotate(a, "neck01", (1, 0, 0), -18 * k)
        rotate(a, "neck01", (0, 1, 0), 10 * k)
        shift(a, "root", (0, 0.06 * k, -0.02 * k))
        return
    if anim == "death":
        k = ease(f / (n - 1))
        stance(a)
        knees = min(1.0, k * 1.8)
        fall = max(0.0, (k - 0.35) / 0.65)
        rotate(a, "root", (1, 0, 0), -82 * fall)
        shift(a, "root", (0, 0.35 * fall, -0.45 * knees + 0.25 * fall))
        for side, sx in (("L", 1), ("R", -1)):
            rotate(a, f"upperleg01.{side}", (1, 0, 0), -55 * knees * (1 - fall))
            rotate(a, f"lowerleg01.{side}", (1, 0, 0), 95 * knees * (1 - fall * 0.8))
            rotate(a, f"upperarm01.{side}", (0, 1, 0), sx * -40 * fall)
        rotate(a, "neck01", (1, 0, 0), -25 * fall)
        return
    motion = PATH_MOTIONS[path][("attack", "skill1", "skill2").index(anim)]
    stance(a)
    attack(a, path, motion, f, n)


def attack(a, path, motion, f, n):
    up, hit, back = beats(f, n)
    # Wind-up builds to 1, the strike swings through, recovery eases back towards guard.
    w = up * (1 - hit)
    s = hit * (1 - back * 0.6)
    lean = 8 * s - 4 * w
    rotate(a, "spine05", (1, 0, 0), lean)
    step = 0.12 * s
    shift(a, "root", (0, -step, -0.03 * s))
    rotate(a, "upperleg01.R", (1, 0, 0), 15 * w)
    rotate(a, "upperleg01.L", (1, 0, 0), -25 * s)
    rotate(a, "lowerleg01.L", (1, 0, 0), 25 * s)
    if motion == "claw":
        rotate(a, "spine02", (0, 0, 1), 25 * w - 30 * s)
        for side, sgn in (("R", 1), ("L", 0.5)):
            rotate(a, f"upperarm01.{side}", (1, 0, 0), (-120 * w - 30 * s) * sgn)
            rotate(a, f"lowerarm01.{side}", (1, 0, 0), (-50 * w + 30 * s) * sgn)
    if motion == "slash":
        rotate(a, "spine02", (0, 0, 1), 30 * w - 35 * s)
        rotate(a, "upperarm01.R", (1, 0, 0), -110 * w - 40 * s)
        rotate(a, "upperarm01.R", (0, 0, 1), -40 * w + 70 * s)
        rotate(a, "lowerarm01.R", (1, 0, 0), -60 * w + 40 * s)
        rotate(a, "upperarm01.L", (1, 0, 0), -30)
        rotate(a, "lowerarm01.L", (1, 0, 0), -50)
    elif motion in ("heavy", "slam"):
        for side in "LR":
            rotate(a, f"upperarm01.{side}", (1, 0, 0), -150 * w - 60 * s)
            rotate(a, f"lowerarm01.{side}", (1, 0, 0), -40 * w)
        rotate(a, "spine04", (1, 0, 0), -15 * w + 30 * s)
        if motion == "slam":
            shift(a, "root", (0, -0.1 * s, 0.15 * w - 0.12 * s))
    elif motion == "sweep":
        rotate(a, "spine02", (0, 0, 1), 50 * w - 80 * s)
        for side in "LR":
            rotate(a, f"upperarm01.{side}", (1, 0, 0), -70)
            rotate(a, f"upperarm01.{side}", (0, 0, 1), 30 * w - 60 * s)
    elif motion == "spin":
        t = f / (n - 1)
        rotate(a, "root", (0, 0, 1), -360 * ease(t))
        for side, sx in (("L", 1), ("R", -1)):
            rotate(a, f"upperarm01.{side}", (0, 1, 0), -sx * 75 * (1 - back))
            rotate(a, f"upperarm01.{side}", (1, 0, 0), -30)
    elif motion == "lunge":
        shift(a, "root", (0, -0.35 * s, -0.12 * s))
        rotate(a, "upperleg01.L", (1, 0, 0), -40 * s)
        rotate(a, "lowerleg01.L", (1, 0, 0), 50 * s)
        rotate(a, "upperleg01.R", (1, 0, 0), 25 * s)
        rotate(a, "upperarm01.R", (1, 0, 0), -30 * w - 75 * s)
        rotate(a, "lowerarm01.R", (1, 0, 0), -70 * w + 60 * s)
        rotate(a, "spine05", (1, 0, 0), 15 * s)
    elif motion in ("cast", "slam_hands"):
        for side, sx in (("L", 1), ("R", -1)):
            rotate(a, f"upperarm01.{side}", (1, 0, 0), -40 * w - 75 * s)
            rotate(a, f"upperarm01.{side}", (0, 0, 1), sx * -15 * s)
            rotate(a, f"lowerarm01.{side}", (1, 0, 0), -90 * w + 70 * s)
        if motion == "slam_hands":
            rotate(a, "spine05", (1, 0, 0), 25 * s)
            for side in "LR":
                rotate(a, f"upperarm01.{side}", (1, 0, 0), -60 * w + 40 * s)
    elif motion == "sigil":
        # A brush stroke: the hand draws a falling arc in front of the body.
        arc = math.radians(-60 + 160 * hit)
        rotate(a, "upperarm01.R", (1, 0, 0), -70 - 20 * w)
        rotate(a, "upperarm01.R", (0, 0, 1), 40 * math.sin(arc) * (1 - back))
        rotate(a, "lowerarm01.R", (1, 0, 0), -50 + 30 * math.cos(arc))
        rotate(a, "upperarm01.L", (1, 0, 0), -20)
    elif motion == "raise":
        rotate(a, "upperarm01.L", (1, 0, 0), -60 * w - 100 * s)
        rotate(a, "lowerarm01.L", (1, 0, 0), -30)
        rotate(a, "upperarm01.R", (1, 0, 0), -60 * s)
        rotate(a, "spine04", (1, 0, 0), -10 * s)
    elif motion in ("throw", "throw_both"):
        sides = ("R", "L") if motion == "throw_both" else ("R",)
        for side in sides:
            rotate(a, f"upperarm01.{side}", (1, 0, 0), -120 * w - 30 * s)
            rotate(a, f"upperarm01.{side}", (1, 0, 0), 100 * s)
            rotate(a, f"lowerarm01.{side}", (1, 0, 0), -90 * w + 80 * s)
        rotate(a, "spine02", (0, 0, 1), 25 * w - 30 * s)
    elif motion in ("fan", "fan_wide"):
        span = 1.6 if motion == "fan_wide" else 1.0
        for side, sx in (("L", 1), ("R", -1)):
            rotate(a, f"upperarm01.{side}", (1, 0, 0), -80)
            rotate(a, f"upperarm01.{side}", (0, 0, 1), sx * (40 * w - 70 * s) * span)
            rotate(a, f"lowerarm01.{side}", (1, 0, 0), -30)
        rotate(a, "spine02", (0, 0, 1), -25 * s)
    elif motion == "bow":
        # Bow arm up and forward, the drawing hand pulls back to the cheek, then lets go.
        draw = min(1.0, up + hit * 0.2) * (1 - back)
        rotate(a, "spine02", (0, 0, 1), 40)
        rotate(a, "upperarm01.L", (1, 0, 0), -85)
        rotate(a, "upperarm01.L", (0, 0, 1), -40)
        rotate(a, "lowerarm01.L", (1, 0, 0), -5)
        rotate(a, "upperarm01.R", (1, 0, 0), -85)
        rotate(a, "upperarm01.R", (0, 0, 1), -30 + 40 * draw * (1 - hit))
        rotate(a, "lowerarm01.R", (1, 0, 0), -120 * draw * (1 - hit))
