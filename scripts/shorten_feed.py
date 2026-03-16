#!/usr/bin/env python3
"""Shorten an RSS/Atom feed to the newest N entries.

Usage: scripts/shorten_feed.py <input.xml> <output.xml> [keep=5]
"""

import sys
import copy
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime


def parse_date(text):
    if not text:
        return None
    text = text.strip()
    try:
        return parsedate_to_datetime(text)
    except Exception:
        try:
            # ISO8601 fallback
            return datetime.fromisoformat(text.replace("Z", "+00:00"))
        except Exception:
            return None


def localname(tag):
    return tag.split("}")[-1] if "}" in tag else tag


def find_children(parent, name):
    return [c for c in list(parent) if localname(c.tag) == name]


def find_text(parent, name):
    for c in parent:
        if localname(c.tag) == name:
            return (c.text or "").strip()
    return None


def shorten_rss(root, keep=5):
    channel = None
    for c in root:
        if localname(c.tag) == "channel":
            channel = c
            break
    if channel is None:
        channel = root.find(".//channel")
    items = find_children(channel, "item")
    scored = []
    for idx, it in enumerate(items):
        pd = find_text(it, "pubDate") or find_text(it, "date")
        dt = parse_date(pd)
        scored.append((dt, idx, it))
    # sort newest first; items lacking dates go to the end but keep original order
    scored_sorted = sorted(
        scored, key=lambda x: (x[0] is None, x[0] or datetime.min, x[1]), reverse=True
    )
    keep_items = [s[2] for s in scored_sorted[:keep]]
    new_root = copy.deepcopy(root)
    new_channel = None
    for c in new_root:
        if localname(c.tag) == "channel":
            new_channel = c
            break
    # remove existing items
    for it in list(new_channel):
        if localname(it.tag) == "item":
            new_channel.remove(it)
    # append kept items (already newest-first)
    for it in keep_items:
        new_channel.append(copy.deepcopy(it))
    return new_root


def shorten_atom(root, keep=5):
    entries = [c for c in list(root) if localname(c.tag) == "entry"]
    if not entries:
        entries = root.findall(".//{http://www.w3.org/2005/Atom}entry")
    scored = []
    for idx, en in enumerate(entries):
        pd = find_text(en, "updated") or find_text(en, "published")
        dt = parse_date(pd)
        scored.append((dt, idx, en))
    scored_sorted = sorted(
        scored, key=lambda x: (x[0] is None, x[0] or datetime.min, x[1]), reverse=True
    )
    keep_entries = [s[2] for s in scored_sorted[:keep]]
    new_root = copy.deepcopy(root)
    for en in list(new_root):
        if localname(en.tag) == "entry":
            new_root.remove(en)
    for en in keep_entries:
        new_root.append(copy.deepcopy(en))
    return new_root


def main(inpath, outpath, keep=5):
    tree = ET.parse(inpath)
    root = tree.getroot()
    rn = localname(root.tag).lower()
    if rn == "rss" or root.find("channel") is not None:
        new_root = shorten_rss(root, keep)
    elif rn == "feed" or root.findall(".//{http://www.w3.org/2005/Atom}entry"):
        new_root = shorten_atom(root, keep)
    else:
        print("Unknown feed format", file=sys.stderr)
        sys.exit(2)
    ET.ElementTree(new_root).write(outpath, encoding="utf-8", xml_declaration=True)
    print("Wrote", outpath)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: shorten_feed.py <input.xml> <output.xml> [keep=5]")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 5)
