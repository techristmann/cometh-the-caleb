#!/usr/bin/env python3
"""Builds the baby site into _site/.

Reads config.json, every updates/*.md file and the photos/ folder.
Photos are resized to max 1600px, auto-rotated, converted to JPEG and
stripped of all metadata (including GPS location) before publishing.

Run locally:  python3 build.py   (needs Pillow; pillow-heif for iPhone HEIC files)
"""
import html, json, re, shutil, sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "_site"
MAX_PX = 1600
IMG_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}

try:
    from PIL import Image, ImageOps
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass
except ImportError:
    sys.exit("Pillow is required: pip install pillow pillow-heif")


# ---------- tiny markdown ----------
def inline(text):
    t = html.escape(text, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", t)
    t = re.sub(r"(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])", r"<em>\1</em>", t)
    t = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)",
               r'<a href="\2" rel="noopener" target="_blank">\1</a>', t)
    return t


def markdown(md):
    out, para, items = [], [], []

    def flush():
        if para:
            out.append("<p>" + "<br>".join(inline(l) for l in para) + "</p>")
            para.clear()
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>")
            items.clear()

    for line in md.splitlines():
        s = line.strip()
        if not s:
            flush()
        elif s.startswith("#"):
            flush()
            out.append(f"<h3>{inline(s.lstrip('#').strip())}</h3>")
        elif re.match(r"^[-*] ", s):
            if para:
                flush()
            items.append(s[2:])
        else:
            if items:
                flush()
            para.append(s)
    flush()
    return "\n".join(out)


# ---------- front matter ----------
def parse_post(path):
    raw = path.read_text(encoding="utf-8")
    meta, body = {}, raw
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", raw, re.S)
    if m:
        body = m.group(2)
        key = None
        for line in m.group(1).splitlines():
            if re.match(r"^\s+-\s+", line) and key:
                meta.setdefault(key, [])
                if isinstance(meta[key], list):
                    meta[key].append(line.split("-", 1)[1].strip().strip("\"'"))
            elif ":" in line:
                key, val = line.split(":", 1)
                key, val = key.strip(), val.strip().strip("\"'")
                meta[key] = val if val else []
    fm = re.match(r"^(\d{4}-\d{2}-\d{2})-?(.*)$", path.stem)
    meta.setdefault("date", fm.group(1) if fm else "")
    if not meta.get("title"):
        meta["title"] = (fm.group(2) if fm else path.stem).replace("-", " ").strip().capitalize()
    photos = meta.get("photos") or []
    if isinstance(photos, str):
        photos = [p.strip() for p in photos.split(",") if p.strip()]
    meta["photos"] = photos
    meta["body"] = body
    meta["slug"] = path.stem
    return meta


# ---------- photos ----------
def process_photo(src: Path, dest: Path):
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        im.thumbnail((MAX_PX, MAX_PX))
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        # Saving without exif= drops all metadata, including GPS.
        im.save(dest, "JPEG", quality=84, optimize=True, progressive=True)
        return im.size


def web_name(name):
    return Path(name).stem + ".jpg"


# ---------- page ----------
def fmt_date(d):
    try:
        dt = datetime.strptime(d[:10], "%Y-%m-%d")
        return f"{dt.strftime('%A, %B')} {dt.day}, {dt.year}"
    except ValueError:
        return d


def render(cfg, posts, photo_sizes):
    e = lambda s: html.escape(str(s or ""))
    a = cfg.get("arrival", {})
    public_cfg = {k: cfg.get(k) for k in ("due_date", "arrived", "supabase_url", "supabase_anon_key")}

    if cfg.get("arrived"):
        stats = [x for x in (fmt_date(a.get("date")) if a.get("date") else "", a.get("time"),
                             a.get("weight"), a.get("length")) if x]
        hero = f"""<section class="banner arrived">
  <div class="confetti" aria-hidden="true">✿ ✦ ✿ ✦ ✿</div>
  <h2>{e(a.get('message') or 'Baby has arrived!')}</h2>
  <p class="name">{e(cfg.get('baby_name'))}</p>
  {'<ul class="stats">' + ''.join(f'<li>{e(s)}</li>' for s in stats) + '</ul>' if stats else ''}
</section>"""
    else:
        hero = f"""<section class="banner waiting">
  <p class="eyebrow">Coming soon</p>
  <div class="count"><span id="days">–</span><small id="days-label">days to go</small></div>
  <p>Due {e(fmt_date(cfg.get('due_date', '')))}</p>
</section>"""

    cards = []
    for p in posts:
        imgs = []
        for ph in p["photos"]:
            wn = web_name(ph)
            if wn not in photo_sizes:
                print(f"  ! {p['slug']}: photo '{ph}' not found in photos/", file=sys.stderr)
                continue
            w, h = photo_sizes[wn]
            imgs.append(f'<a href="photos/{e(wn)}" target="_blank"><img src="photos/{e(wn)}" '
                        f'width="{w}" height="{h}" loading="lazy" alt=""></a>')
        gallery = f'<div class="gallery n{min(len(imgs), 3)}">{"".join(imgs)}</div>' if imgs else ""
        cards.append(f"""<article class="update" id="{e(p['slug'])}">
  <time datetime="{e(p['date'])}">{e(fmt_date(p['date']))}</time>
  <h2>{e(p['title'])}</h2>
  {gallery}
  <div class="body">{markdown(p['body'])}</div>
</article>""")
    if not cards:
        cards.append('<p class="empty">No updates yet — check back soon!</p>')

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, noimageindex">
<title>{e(cfg.get('site_title'))}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍼</text></svg>">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header>
  <p class="family">{e(cfg.get('family_name'))}</p>
  <h1>{e(cfg.get('site_title'))}</h1>
  <p class="tagline">{e(cfg.get('tagline'))}</p>
  <nav><a href="#updates">Updates</a><a href="#wishes">Leave a wish</a></nav>
</header>
<main>
{hero}
<section id="updates" aria-label="Updates">
{chr(10).join(cards)}
</section>
<section id="wishes" class="wishes">
  <h2>Wishes &amp; love notes</h2>
  <p class="hint">No account needed. Just your name and a few words.</p>
  <form id="wish-form" autocomplete="on">
    <label>Your name<input name="name" maxlength="60" required placeholder="Grandma Sue"></label>
    <label>Your wish<textarea name="message" maxlength="1000" rows="4" required placeholder="Welcome to the world, little one…"></textarea></label>
    <label class="hp" aria-hidden="true">Leave blank<input name="website" tabindex="-1" autocomplete="off"></label>
    <button type="submit">Send wish 💛</button>
    <p id="wish-status" role="status"></p>
  </form>
  <div id="wish-list"></div>
</section>
</main>
<footer>Made with love · Please don't share this link publicly</footer>
<script>window.SITE = {json.dumps(public_cfg)};</script>
<script src="site.js"></script>
</body>
</html>
"""


def make_icons(dest: Path):
    """Home-screen icon for the Post page: pink square with a white heart."""
    from PIL import ImageDraw
    s = 512
    im = Image.new("RGB", (s, s), (244, 194, 194))
    d = ImageDraw.Draw(im)
    d.ellipse((126, 150, 266, 290), fill="white")
    d.ellipse((246, 150, 386, 290), fill="white")
    d.polygon([(136, 250), (376, 250), (256, 400)], fill="white")
    im.save(dest / "icon-512.png")
    im.resize((180, 180), Image.LANCZOS).save(dest / "icon-180.png")


def main():
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "photos").mkdir(parents=True)

    sizes = {}
    pdir = ROOT / "photos"
    if pdir.exists():
        for f in sorted(pdir.iterdir()):
            if f.suffix.lower() in IMG_EXT:
                try:
                    sizes[web_name(f.name)] = process_photo(f, OUT / "photos" / web_name(f.name))
                except Exception as ex:  # keep building if one photo is bad
                    print(f"  ! could not process {f.name}: {ex}", file=sys.stderr)

    posts = [parse_post(p) for p in (ROOT / "updates").glob("*.md")] if (ROOT / "updates").exists() else []
    posts = [p for p in posts if str(p.get("draft", "")).lower() != "true"]
    posts.sort(key=lambda p: (p["date"], p.get("time", ""), p["slug"]), reverse=True)

    (OUT / "index.html").write_text(render(cfg, posts, sizes), encoding="utf-8")
    for name in ("style.css", "site.js"):
        shutil.copy(ROOT / "assets" / name, OUT / name)
    (OUT / "post").mkdir()
    shutil.copy(ROOT / "assets" / "post.html", OUT / "post" / "index.html")
    make_icons(OUT / "post")
    shutil.copy(ROOT / "assets" / "post-manifest.json", OUT / "post" / "manifest.json")
    (OUT / "config.json").write_text(json.dumps({"github_repo": cfg.get("github_repo"),
                                                 "github_branch": cfg.get("github_branch", "main")}))
    (OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n")
    (OUT / ".nojekyll").write_text("")
    print(f"Built {len(posts)} update(s), {len(sizes)} photo(s) -> {OUT}")


if __name__ == "__main__":
    main()
