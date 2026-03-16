Batch feed shortener
====================

What this is
------------

Two small utilities to trim RSS/Atom feeds to the newest N items and to run that
operation in batch across multiple feeds.

Files
-----

- `scripts/shorten_feed.py` — shorten a single feed (RSS or Atom) to N items.
- `scripts/batch_shorten.py` — fetch one or more feeds and produce shortened copies.

Quick usage
-----------

1) Shorten a single feed you already downloaded:

   python3 scripts/shorten_feed.py feeds/original.xml feeds/short.xml 5

2) Batch shorten by passing URLs on the command line:

   python3 scripts/batch_shorten.py https://example.com/feed.xml https://a.b/feed.xml --outdir feeds --keep 5

3) Batch shorten from a file (one URL per line):

   python3 scripts/batch_shorten.py --input feeds-list.txt --outdir feeds --keep 5

Proxying requests
-----------------

If you need to route requests through an HTTP proxy that accepts the original
feed URL in a `url` query parameter (like your `go.x2u.in` proxy), pass
`--proxy`:

   python3 scripts/batch_shorten.py --proxy 'https://go.x2u.in/proxy?email=you@x&apiKey=KEY' https://a.com/feed.xml

Output
------

By default the batch script writes into `--outdir` (default `feeds/`) two files
per feed:

- `<slug>.xml` — original downloaded feed
- `<slug>.short.xml` — shortened feed with the newest N items

Notes and tips
--------------

- Scripts are intentionally simple and use the stdlib for portability.
- If you need parallel fetches, automatic git commits, or a summary CSV, I can
  add those options — tell me which and I’ll extend the script.
