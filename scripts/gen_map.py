"""Generates the map SVGs.

Geometry comes from the sibling `election-hub-design` prototype: pre-projected
albersUsa outlines from us-atlas (`states-albers-10m`), viewBox 0 0 975 610. It
replaces the traced vectors that used to be pulled out of Figma — those were
hand-drawn approximations, and the mobile frame's set was faulty (Montana came
out with a chunk missing).

Ratings still come from Figma (`assets/ratings.json`), so the map reads exactly
as the frame does; only the outlines changed.

Output: assets/map-desktop.svg, assets/map-mobile.svg, assets/state-boxes.json
        and the CSS snippet with each abbreviation's colour (printed at the end).

Abbreviations are `<text>` at each state's "pole of inaccessibility" — the
centre of the largest circle that fits inside the shape. A centroid will not do:
on concave states (FL, LA, MI, ID) it falls outside. States too small to hold two
letters are left unlabelled, as Figma leaves them.
"""

import json
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SOURCE_TS = os.path.join(
    os.path.dirname(ROOT), "election-hub-design", "src", "data", "states.ts"
)

# The albersUsa canvas the shapes were projected into.
MAP_W, MAP_H = 975.0, 610.0

# Where each breakpoint's card puts the map: (x, y, width, height).
DESKTOP_BOX = (32.0, 26.0, 1248.0, 759.0)     # inside the 1312 x 811 card
MOBILE_BOX = (2.0, 96.0, 357.0, 232.0)        # inside the 361 x 410 card

# Label size on screen, in CSS pixels — fixed, as in the prototype's
# `.state-label { font-size: 11px }`. Scaling it with each state's inscribed
# radius made Texas shout and Rhode Island whisper.
LABEL_PX = 11.0

FILL_BY_THEME = {
    "safe-d": ("#1d4ed8", "#1d4ed8"),
    "likely-d": ("#2563eb", "#2563eb"),
    "lean-d": ("#93c5fd", "#93c5fd"),
    "tossup": ("#ecddb7", "#ecddb7"),
    "lean-r": ("#f7b0af", "#f7b0af"),
    "likely-r": ("#ef4444", "#ef4444"),
    "safe-r": ("#991b1b", "#991b1b"),
    "nodata": ("#8f8f8f", "#8f8f8f"),
    "off": ("#292929", "#dfdfdf"),      # dark, light
    "blank": ("#151515", "#151515"),
}

INK_DARK = "#0a0909"
INK_LIGHT = "#fafafa"


# ------------------------------------------------------------------ colour

def luminance(hexs):
    def chan(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hexs[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def best_ink(bg):
    """Black or white — whichever contrasts more over the fill."""
    return INK_DARK if contrast(bg, INK_DARK) >= contrast(bg, INK_LIGHT) else INK_LIGHT


# -------------------------------------------------------------------- path

CMD_RE = re.compile(r"([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)")
NUM_RE = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")


def flatten(d):
    """Path -> list of polygons. The albers data is polylines only (M/L/Z)."""
    polys, cur, start, pos = [], [], (0.0, 0.0), (0.0, 0.0)
    for m in CMD_RE.finditer(d):
        cmd = m.group(1)
        n = [float(x) for x in NUM_RE.findall(m.group(2))]
        if cmd == "M":
            if len(cur) > 2:
                polys.append(cur)
            pos = (n[0], n[1]); start = pos; cur = [pos]
            for i in range(2, len(n), 2):
                pos = (n[i], n[i + 1]); cur.append(pos)
        elif cmd == "L":
            for i in range(0, len(n), 2):
                pos = (n[i], n[i + 1]); cur.append(pos)
        elif cmd == "H":
            for v in n:
                pos = (v, pos[1]); cur.append(pos)
        elif cmd == "V":
            for v in n:
                pos = (pos[0], v); cur.append(pos)
        elif cmd in "Zz":
            if len(cur) > 2:
                polys.append(cur)
            cur = [start]; pos = start
    if len(cur) > 2:
        polys.append(cur)
    return polys


def area(poly):
    a = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        a += x0 * y1 - x1 * y0
    return abs(a) / 2


def inside(poly, x, y):
    hit = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            hit = not hit
        j = i
    return hit


def edge_dist(poly, x, y):
    best = float("inf")
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        dx, dy = x1 - x0, y1 - y0
        L = dx * dx + dy * dy
        t = 0.0 if L == 0 else max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / L))
        best = min(best, math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)))
    return best


def pole_of_inaccessibility(poly, steps=30, refine=3):
    """Centre and radius of the largest inscribed circle — grid search, refined."""
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    best = ((x0 + x1) / 2, (y0 + y1) / 2, -1.0)
    for _ in range(refine + 1):
        for i in range(steps + 1):
            for j in range(steps + 1):
                x = x0 + (x1 - x0) * i / steps
                y = y0 + (y1 - y0) * j / steps
                if not inside(poly, x, y):
                    continue
                d = edge_dist(poly, x, y)
                if d > best[2]:
                    best = (x, y, d)
        span = max(x1 - x0, y1 - y0) / steps * 2
        x0, x1 = best[0] - span, best[0] + span
        y0, y1 = best[1] - span, best[1] + span
        steps = 10
    return best


def load_shapes():
    src = open(SOURCE_TS, encoding="utf-8").read()
    i = src.index("= [", src.index("STATE_SHAPES")) + 2
    depth = 0
    for j, ch in enumerate(src[i:], start=i):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return json.loads(src[i:j + 1])
    raise ValueError("STATE_SHAPES array not found")


def fit(box):
    """Uniform scale + offset that centres the 975x610 canvas inside `box`."""
    x, y, w, h = box
    k = min(w / MAP_W, h / MAP_H)
    return round(k, 5), round(x + (w - MAP_W * k) / 2, 2), round(y + (h - MAP_H * k) / 2, 2)


def build(shapes, ratings, anchors, out, viewbox, box):
    k, ox, oy = fit(box)
    parts, boxes = [], {}

    for s in shapes:
        code = s["id"]
        cls = ratings.get(code, "off")
        bx, by, bw, bh, ax, ay, radius = anchors[code]
        boxes[code] = [round(bx * k, 2), round(by * k, 2), round(bw * k, 2), round(bh * k, 2)]

        label = ""
        # The prototype's rule: no label where the shape cannot hold two letters.
        if bw >= 30 and bh >= 22:
            label = ('\n  <text class="lbl" x="%.2f" y="%.2f" font-size="%.2f">%s</text>'
                     % (ax, ay, LABEL_PX / k, code))

        parts.append(
            '<g class="state r-%s" data-state="%s" tabindex="0" role="button" aria-label="%s">'
            '\n  <path class="st" d="%s"/>%s\n</g>'
            % (cls, code, code, s["d"], label)
        )

    svg = (
        '<svg class="usmap" viewBox="%s" preserveAspectRatio="xMidYMid meet" '
        'xmlns="http://www.w3.org/2000/svg" role="group" '
        'aria-label="Map of the United States with the forecast by state">\n'
        '<g class="cam">\n<g class="cam__shift" transform="translate(%s,%s) scale(%s)">\n'
        % (viewbox, ox, oy, k)
        + "\n".join(parts)
        + "\n</g>\n</g>\n</svg>\n"
    )
    open(out, "w", encoding="utf-8").write(svg)
    print(out, len(svg), len(shapes))
    return boxes, (ox, oy)


if __name__ == "__main__":
    OUT = os.path.join(ROOT, "assets") + os.sep
    shapes = load_shapes()
    ratings = json.load(open(OUT + "ratings.json"))

    # One pass of geometry analysis, reused by both breakpoints.
    anchors = {}
    for s in shapes:
        polys = [p for p in flatten(s["d"]) if len(p) > 2]
        main = max(polys, key=area)
        xs = [p[0] for poly in polys for p in poly]
        ys = [p[1] for poly in polys for p in poly]
        ax, ay, radius = pole_of_inaccessibility(main)
        anchors[s["id"]] = (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys),
                            round(ax, 2), round(ay, 2), radius)

    desktop, d_origin = build(shapes, ratings, anchors,
                              OUT + "map-desktop.svg", "0 0 1312 811", DESKTOP_BOX)
    mobile, m_origin = build(shapes, ratings, anchors,
                             OUT + "map-mobile.svg", "0 0 361 410", MOBILE_BOX)

    json.dump({"desktop": desktop, "mobile": mobile,
               "desktop_origin": list(d_origin), "mobile_origin": list(m_origin)},
              open(OUT + "state-boxes.json", "w"), separators=(",", ":"))

    print("\n/* abbreviation colour — best contrast over each fill */")
    for rating, (dark_bg, light_bg) in FILL_BY_THEME.items():
        d_ink, l_ink = best_ink(dark_bg), best_ink(light_bg)
        print("  --label-%-11s %s;  /* dark %s : %.1f:1 */" %
              (rating + ":", d_ink, dark_bg, contrast(dark_bg, d_ink)))
        if l_ink != d_ink or light_bg != dark_bg:
            print("      light -> %s over %s : %.1f:1" % (l_ink, light_bg, contrast(light_bg, l_ink)))
