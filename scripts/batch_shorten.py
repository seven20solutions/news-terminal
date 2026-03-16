#!/usr/bin/env python3
"""Batch shorten feeds.

Usage examples:
  # From a file listing one feed URL per line
  scripts/batch_shorten.py --input feeds-list.txt --outdir feeds --keep 5

  # Pass URLs on the command line
  scripts/batch_shorten.py https://a.com/feed.xml https://b.com/feed.xml --outdir feeds

By default the script fetches feeds directly. To route via a proxy endpoint that accepts
the original feed URL in a `url` query param, pass `--proxy 'https://proxy.example/?key=..'`.
The script writes: <outdir>/<slug>.xml (original) and <outdir>/<slug>.short.xml (shortened)
and invokes the existing `scripts/shorten_feed.py` to produce the shortened feed.
"""

import argparse
import subprocess
import sys
import urllib.parse
import urllib.request
import os
import re


def slugify(url: str) -> str:
    p = urllib.parse.urlparse(url)
    base = (p.netloc + p.path).strip("/")
    # replace non-alnum with - and collapse
    s = re.sub(r"[^A-Za-z0-9]+", "-", base)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "feed"


def fetch(url: str, dest: str, proxy: str | None, timeout: int = 30) -> bool:
    try:
        if proxy:
            sep = "&" if "?" in proxy else "?"
            fetch_url = proxy + sep + "url=" + urllib.parse.quote_plus(url)
        else:
            fetch_url = url
        req = urllib.request.Request(
            fetch_url, headers={"User-Agent": "batch-shorten/1.0"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
        with open(dest, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"ERROR fetching {url}: {e}", file=sys.stderr)
        return False


def shorten(inpath: str, outpath: str, keep: int) -> bool:
    try:
        subprocess.run(
            [sys.executable, "scripts/shorten_feed.py", inpath, outpath, str(keep)],
            check=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"ERROR shortening {inpath}: {e}", file=sys.stderr)
        return False


def main():
    p = argparse.ArgumentParser(description="Batch shorten RSS/Atom feeds")
    p.add_argument("--input", "-i", help="File with one feed URL per line")
    p.add_argument("--outdir", "-o", default="feeds", help="Output directory")
    p.add_argument(
        "--proxy", "-x", help="Proxy endpoint that accepts original URL as `url` param"
    )
    p.add_argument("--keep", "-k", type=int, default=5, help="How many items to keep")
    p.add_argument("urls", nargs="*", help="Feed URLs (if not using --input)")
    args = p.parse_args()

    urls = []
    if args.input:
        if not os.path.exists(args.input):
            print("Input file not found:", args.input, file=sys.stderr)
            sys.exit(2)
        with open(args.input, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    urls.append(line)
    urls.extend(args.urls)
    if not urls:
        print("No feed URLs provided", file=sys.stderr)
        sys.exit(2)

    os.makedirs(args.outdir, exist_ok=True)

    for u in urls:
        slug = slugify(u)
        orig = os.path.join(args.outdir, f"{slug}.xml")
        short = os.path.join(args.outdir, f"{slug}.short.xml")
        print("Fetching:", u)
        ok = fetch(u, orig, args.proxy)
        if not ok:
            print("Skipped:", u, file=sys.stderr)
            continue
        print("Shortening ->", short)
        ok2 = shorten(orig, short, args.keep)
        if ok2:
            print("Done:", short)
        else:
            print("Failed to shorten:", u, file=sys.stderr)


if __name__ == "__main__":
    main()
