#!/usr/bin/env python3
"""Stamp index.html's local CSS/JS links with a content hash.

GitHub Pages serves these with `cache-control: max-age=600`, so a push can
sit behind a stale copy in the browser for ten minutes. The query string
changes whenever the file does, which retires the old copy immediately.

Run before committing any change to css/ or js/:  python3 scripts/stamp_assets.py
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "index.html"
ASSETS = ["css/tokens.css", "css/app.css", "js/data.js", "js/app.js"]


def digest(rel):
    return hashlib.sha1((ROOT / rel).read_bytes()).hexdigest()[:8]


def main():
    html = PAGE.read_text(encoding="utf-8")
    for rel in ASSETS:
        pattern = re.compile(r'(["\'])' + re.escape(rel) + r'(\?v=[0-9a-f]+)?\1')
        html, n = pattern.subn(lambda m: m.group(1) + rel + "?v=" + digest(rel) + m.group(1), html)
        if not n:
            raise SystemExit("no link found for " + rel)
        print(rel, digest(rel), "x" + str(n))
    PAGE.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
