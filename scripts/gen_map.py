"""Generates the map SVGs from the vectorPaths exported out of Figma.

Input:  the `node.vectorPaths` dumps (shape + abbreviation for each state),
        pulled from the Figma file through the figma-console MCP Desktop Bridge.
        Those JSONs are not versioned — SRC, further down, points at where they
        were written on the machine this ran on; to regenerate, export the dumps
        again and adjust the path. The SVGs in assets/ are already built, so this
        script is only needed if the geometry changes in Figma.
Output: assets/map-desktop.svg, assets/map-mobile.svg, assets/state-boxes.json
        and the CSS snippet with each abbreviation's colour (printed at the end).

Departures from the Figma file, both asked for in review:
  * the abbreviation stops being a hole (boolean Subtract) and becomes its own
    path, so it can carry a colour with guaranteed contrast over the fill;
  * the abbreviation is re-centred on the state's "pole of inaccessibility" —
    the centre of the largest circle that fits inside the shape — instead of the
    hand-placed position. A centroid will not do: on concave states (FL, LA, MI,
    ID) it falls outside.
"""

import json
import math
import re

RATING = {
    "#1d4ed8": "safe-d", "#2563eb": "likely-d", "#93c5fd": "lean-d",
    "#ecddb7": "tossup", "#f7b0af": "lean-r", "#ef4444": "likely-r",
    "#991b1b": "safe-r", "#292929": "off", "#dfdfdf": "off",
    "#8f8f8f": "nodata", "#151515": "blank",
}

# fill of each rating in each theme, to work out the abbreviation contrast
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

INK_DARK = "#0a0909"    # semantic/color/text/inverse|neutral (preto da marca)
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


# ------------------------------------------------------------------- path

CMD_RE = re.compile(r"([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)")
NUM_RE = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")


def shift(d, dx, dy):
    """Translates a path with absolute commands (what Figma exports)."""
    def repl(m):
        cmd, body = m.group(1), m.group(2)
        nums = [float(x) for x in NUM_RE.findall(body)]
        if cmd in "MLTCSQ":
            pairs = [(nums[i] + dx, nums[i + 1] + dy) for i in range(0, len(nums), 2)]
            return cmd + " ".join("%.2f %.2f" % p for p in pairs)
        if cmd == "H":
            return "H" + " ".join("%.2f" % (n + dx) for n in nums)
        if cmd == "V":
            return "V" + " ".join("%.2f" % (n + dy) for n in nums)
        if cmd in "Zz":
            return "Z"
        return m.group(0)
    return CMD_RE.sub(repl, d)


def flatten(d):
    """Path -> list of polygons (beziers sampled)."""
    polys, cur, start, pos = [], [], (0.0, 0.0), (0.0, 0.0)

    def bez(p0, p1, p2, p3, n=12):
        out = []
        for i in range(1, n + 1):
            t = i / n
            u = 1 - t
            out.append((
                u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
            ))
        return out

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
        elif cmd == "C":
            for i in range(0, len(n), 6):
                p1 = (n[i], n[i + 1]); p2 = (n[i + 2], n[i + 3]); p3 = (n[i + 4], n[i + 5])
                cur.extend(bez(pos, p1, p2, p3)); pos = p3
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


def pole_of_inaccessibility(poly, steps=34, refine=3):
    """Centre of the largest inscribed circle — grid search, then refined."""
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
    return best[0], best[1]


def bbox(polys):
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


# ------------------------------------------------------------------ build

def build(src, out, viewbox, shiftxy=(0, 0), ratings=None, scale=1.0):
    data = json.load(open(src))
    parts, boxes = [], {}

    for st in data["states"]:
        code = st["state"]
        sh, lb = st["shape"], st["label"]
        cls = (ratings or {}).get(code) or RATING.get(sh["fill"], "off")
        boxes[code] = [round(sh["x"] * scale, 2), round(sh["y"] * scale, 2),
                       round(sh["w"] * scale, 2), round(sh["h"] * scale, 2)]

        shape_d = " ".join(shift(p["d"], sh["x"], sh["y"]) for p in sh["paths"])

        label_svg = ""
        if lb:
            label_d = " ".join(shift(p["d"], lb["x"], lb["y"]) for p in lb["paths"])
            polys = [p for p in flatten(shape_d) if len(p) > 2]
            if polys:
                main = max(polys, key=area)
                ax, ay = pole_of_inaccessibility(main)
                lx0, ly0, lx1, ly1 = bbox(flatten(label_d))
                label_d = shift(label_d, ax - (lx0 + lx1) / 2, ay - (ly0 + ly1) / 2)
            label_svg = ('\n  <path class="lbl r-%s" fill-rule="evenodd" d="%s"/>' % (cls, label_d))

        parts.append(
            '<g class="state r-%s" data-state="%s" tabindex="0" role="button" aria-label="%s">'
            '\n  <path class="st" fill-rule="evenodd" d="%s"/>%s\n</g>'
            % (cls, code, code, shape_d, label_svg)
        )

    svg = (
        '<svg class="usmap" viewBox="%s" preserveAspectRatio="xMidYMid meet" '
        'xmlns="http://www.w3.org/2000/svg" role="group" '
        'aria-label="Mapa dos Estados Unidos com a previsao por estado">\n'
        '<g class="cam">\n<g class="cam__shift" transform="translate(%s,%s) scale(%s)">\n'
        % (viewbox, shiftxy[0], shiftxy[1], scale)
        + "\n".join(parts)
        + "\n</g>\n</g>\n</svg>\n"
    )
    open(out, "w").write(svg)
    print(out, len(svg), len(data["states"]))
    return boxes


if __name__ == "__main__":
    SRC = "/private/tmp/claude-501/-Users-henriquelimamenezesdasneves-Documents-Projetos/0fe7b390-489a-477f-a389-ff82d43778ce/scratchpad/fig/"
    OUT = "/Users/henriquelimamenezesdasneves/Documents/Projetos/election-hub-web/assets/"

    dk = json.load(open(SRC + "mapvec-dark.json"))
    ratings = {s["state"]: RATING.get(s["shape"]["fill"], "off") for s in dk["states"]}

    desktop = build(SRC + "mapvec-dark.json", OUT + "map-desktop.svg", "0 0 1312 811", (86, 42))

    # Mobile reuses the SAME geometry as desktop, just scaled down to fit the
    # box the 393 frame reserves for the map (355 x 221 at 3,101). The vector
    # set Figma uses in the mobile frame is a different drawing, and a faulty
    # one (Montana comes out with a chunk missing) — a single geometry avoids
    # that and keeps both breakpoints identical.
    MW, MH = 1140.14, 727.24
    box_w, box_h = 355.0, 221.0
    k = min(box_w / MW, box_h / MH)
    mx = round(3 + (box_w - MW * k) / 2, 2)
    my = round(101 + (box_h - MH * k) / 2, 2)
    mobile = build(SRC + "mapvec-dark.json", OUT + "map-mobile.svg",
                   "0 0 361 410", (mx, my), None, round(k, 5))

    json.dump({"desktop": desktop, "mobile": mobile,
               "desktop_origin": [86, 42], "mobile_origin": [mx, my]},
              open(OUT + "state-boxes.json", "w"), separators=(",", ":"))
    json.dump(ratings, open(OUT + "ratings.json", "w"), indent=1)

    print("\n/* abbreviation colour — best contrast over each fill */")
    for rating, (dark_bg, light_bg) in FILL_BY_THEME.items():
        d_ink, l_ink = best_ink(dark_bg), best_ink(light_bg)
        print("  --label-%-9s %s;  /* dark %s : %.1f:1 */" %
              (rating + ":", d_ink, dark_bg, contrast(dark_bg, d_ink)))
        if l_ink != d_ink or light_bg != dark_bg:
            print("      light -> %s over %s : %.1f:1" % (l_ink, light_bg, contrast(light_bg, l_ink)))
