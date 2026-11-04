#!/usr/bin/env python3
"""Builds the baby site into _site/.

Reads config.json, every updates/*.md file and the photos/ folder.
Photos are resized to max 1600px, auto-rotated, converted to JPEG and
stripped of all metadata (including GPS location) before publishing.

The page is bilingual (English / Portuguese). Update titles and text are
machine-translated to Portuguese at build time. To fix a translation by hand,
add `title_pt:` to the update's front matter and/or put the Portuguese text
after a line that says exactly `=== pt ===` at the end of the update.
Wishes are never translated.

Run locally:  python3 build.py   (needs Pillow; pillow-heif for iPhone HEIC files)
"""
import html, json, re, shutil, sys, urllib.parse, urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "_site"
MAX_PX = 1600
IMG_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}
PT_SPLIT = re.compile(r"^\s*===\s*pt\s*===\s*$", re.M | re.I)

try:
    from PIL import Image, ImageOps
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass
except ImportError:
    sys.exit("Pillow is required: pip install pillow pillow-heif")


# ---------- translation (English -> Brazilian Portuguese) ----------
_tcache = {}


def _gtx(text):
    data = urllib.parse.urlencode({"q": text}).encode()
    url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t"
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        j = json.loads(r.read().decode("utf-8"))
    return "".join(seg[0] for seg in j[0] if seg and seg[0])


def translate(text):
    """Translate text to Portuguese. Falls back to the original if anything fails."""
    if not text or not text.strip():
        return text
    if text in _tcache:
        return _tcache[text]
    try:
        out = _gtx(text)
    except Exception as ex:
        print(f"  ! translation failed ({ex}); using English", file=sys.stderr)
        out = text
    _tcache[text] = out
    return out


def translate_md(md):
    """Translate markdown line by line so headings, lists and paragraphs keep their shape."""
    lines = md.splitlines()
    jobs = []  # (index, prefix, content)
    for i, line in enumerate(lines):
        m = re.match(r"^(\s*(?:#+\s*|[-*]\s+)?)(.*)$", line)
        if m.group(2).strip():
            jobs.append((i, m.group(1), m.group(2)))
    if not jobs:
        return md
    joined = "\n".join(c for _, _, c in jobs)
    res = translate(joined).split("\n")
    if len(res) != len(jobs):  # line count changed: translate one line at a time
        res = [translate(c) for _, _, c in jobs]
    for (i, prefix, _), t in zip(jobs, res):
        lines[i] = prefix + t.strip()
    return "\n".join(lines)


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
    parts = PT_SPLIT.split(body, maxsplit=1)
    meta["body"] = parts[0].strip()
    meta["body_pt"] = parts[1].strip() if len(parts) > 1 else translate_md(meta["body"])
    meta["title_pt"] = meta.get("title_pt") or translate(meta["title"])
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


# ---------- dates ----------
def parse_time(s):
    """'16:12', '04:12', '4:12 am', '4:12pm' -> (16, 12). None if unreadable."""
    m = re.match(r"^\s*(\d{1,2})[:h.](\d{2})\s*([ap])?\.?\s*m?\.?\s*$", str(s or ""), re.I)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if m.group(3):
        h = h % 12 + (12 if m.group(3).lower() == "p" else 0)
    return (h, mi) if h < 24 and mi < 60 else None



PT_DAYS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
PT_MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
             "agosto", "setembro", "outubro", "novembro", "dezembro"]


def fmt_date(d, lang="en"):
    try:
        dt = datetime.strptime(d[:10], "%Y-%m-%d")
    except (ValueError, TypeError):
        return d or ""
    if lang == "pt":
        return f"{PT_DAYS[dt.weekday()]}, {dt.day} de {PT_MONTHS[dt.month - 1]} de {dt.year}"
    return f"{dt.strftime('%A, %B')} {dt.day}, {dt.year}"


# ---------- page ----------
LEAVES = """<svg class="leaves" viewBox="0 0 120 24" aria-hidden="true">
  <path d="M8 12c10-9 22-9 30 0-8 9-20 9-30 0z" fill="var(--moss)"/>
  <path d="M46 12c8-10 20-10 28 0-8 10-20 10-28 0z" fill="var(--rust)"/>
  <path d="M82 12c10-9 22-9 30 0-8 9-20 9-30 0z" fill="var(--mustard)"/>
</svg>"""


def render(cfg, posts, photo_sizes):
    e = lambda s: html.escape(str(s or ""))

    def t(en, pt):  # both languages; CSS shows the active one
        return f'<span class="l-en">{en}</span><span class="l-pt" lang="pt-BR">{pt}</span>'

    a = cfg.get("arrival", {})
    public_cfg = {k: cfg.get(k) for k in ("due_date", "arrived", "supabase_url", "supabase_anon_key")}
    public_cfg["arrival"] = {"date": a.get("date", ""), "time": a.get("time", "")}

    if cfg.get("arrived"):
        msg = a.get("message") or "He's here!"
        msg_pt = "Ele chegou!" if msg.strip().lower() in ("he's here!", "he's here") else translate(msg)
        lis = []
        if a.get("date"):
            lis.append(t(e(fmt_date(a['date'])), e(fmt_date(a['date'], 'pt'))))
        hm = parse_time(a.get("time"))
        if hm:
            h, m = hm
            lis.append(t(f"{(h % 12) or 12}:{m:02d} {'AM' if h < 12 else 'PM'}", f"{h:02d}:{m:02d}"))
        elif a.get("time"):
            lis.append(e(a["time"]))
        lis += [e(x) for x in (a.get("weight"), a.get("length")) if x]
        stats = '<ul class="stats">' + "".join(f"<li>{x}</li>" for x in lis) + "</ul>" if lis else ""
        hero = f"""<section class="banner arrived" id="arrived" title="Tap to celebrate again">
  {LEAVES}
  <h2>{t(e(msg), e(msg_pt))}</h2>
  <p class="name">{e(cfg.get('baby_name'))}</p>
  {stats}
  <div class="winner" id="winner" hidden></div>
</section>"""
    else:
        due, nm = cfg.get("due_date", ""), e(cfg.get("baby_name"))
        if cfg.get("labor"):
            status = f'<p class="labor on"><span class="dot"></span>{t("In active labor", "Em trabalho de parto ativo")}</p>'
        else:
            status = f'<p class="labor"><span class="dot"></span>{t("Not in active labor", "Ainda não está em trabalho de parto ativo")}</p>'
        hero = f"""<section class="banner waiting">
  <p class="due-line"><span class="nm">{nm}</span>
    {t("is due " + e(fmt_date(due)), "tem data prevista para " + e(fmt_date(due, 'pt')))}</p>
  {status}
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
  <time datetime="{e(p['date'])}">{t(e(fmt_date(p['date'])), e(fmt_date(p['date'], 'pt')))}</time>
  <h2>{t(e(p['title']), e(p['title_pt']))}</h2>
  {gallery}
  <div class="body"><div class="l-en">{markdown(p['body'])}</div><div class="l-pt" lang="pt-BR">{markdown(p['body_pt'])}</div></div>
</article>""")

    if cards:
        older = ""
        if len(cards) > 1:
            older = f"""<div class="older" id="older" hidden>{chr(10).join(cards[1:])}</div>
<button type="button" class="more" id="more" aria-expanded="false" aria-controls="older">
  <span class="when-closed">{t("Show more", "Mostrar mais")}</span><span class="when-open">{t("Show less", "Mostrar menos")}</span>
</button>"""
        updates = f"""<section id="updates" class="updates" aria-label="Updates">
<h2 class="section-title">{t("Latest update", "Última novidade")}</h2>
{cards[0]}
{older}
</section>"""
    else:
        updates = f"""<section id="updates" class="updates" aria-label="Updates">
<h2 class="section-title">{t("Latest update", "Última novidade")}</h2>
<p class="empty">{t("No updates yet. Check back soon!", "Nenhuma novidade ainda. Volte em breve!")}</p>
</section>"""

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, noimageindex">
<meta name="theme-color" content="#2f5233">
<title>{e(cfg.get('site_title'))}</title>
<script>
(function () {{
  var q = /[?&]lang=(en|pt)/.exec(location.search), s = null;
  try {{ s = localStorage.getItem("lang"); }} catch (e) {{}}
  var l = q ? q[1] : s || ((navigator.language || "").toLowerCase().indexOf("pt") === 0 ? "pt" : "en");
  document.documentElement.className = "lang-" + l;
  document.documentElement.lang = l === "pt" ? "pt-BR" : "en";
}})();
</script>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%232f5233'/><rect x='16' y='28' width='42' height='36' rx='5' fill='%23f5eee1'/><rect x='56' y='40' width='28' height='24' rx='6' fill='%23f5eee1'/><rect x='61' y='45' width='15' height='10' rx='2' fill='%232f5233'/><circle cx='33' cy='68' r='10' fill='%23d4a03a' stroke='%232f5233' stroke-width='3'/><circle cx='69' cy='68' r='10' fill='%23d4a03a' stroke='%232f5233' stroke-width='3'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body{' class="arrived"' if cfg.get('arrived') else ''}>
<div class="lang" role="group" aria-label="Language">
  <button type="button" data-lang="en">EN</button><button type="button" data-lang="pt">PT</button>
</div>
<header class="site">
  {LEAVES}
  <p class="pre">{t("Cometh the hour…", "Chegou a hora…")}</p>
  <h1>{t("Cometh the Caleb!", "vai chegar o Caleb!")}</h1>
</header>
<main>
{hero}
{updates}
<section id="wishes" class="wishes">
  <h2 class="section-title">{t("Say Hello", "Diga Olá")}</h2>
  <p class="hint">{t("We'll be reading this in the hospital", "Vamos ler isto no hospital")}</p>
  <p class="hint small">{t("No need for an account!", "Não precisa de conta!")}</p>
  <form id="wish-form" autocomplete="on">
    <label>{t("Your name", "Seu nome")}<input name="name" maxlength="60" required
      data-ph-en="Grandma Sue" data-ph-pt="Vovó Maria" placeholder="Grandma Sue"></label>
    <label>{t("Your message", "Sua mensagem")}<textarea name="message" maxlength="1000" rows="4" required
      data-ph-en="Welcome to the world, Caleb…" data-ph-pt="Bem-vindo ao mundo, Caleb…" placeholder="Welcome to the world, Caleb…"></textarea></label>
    <label class="hp" aria-hidden="true">Leave blank<input name="website" tabindex="-1" autocomplete="off"></label>
    <button type="submit">{t("Say hello", "Dizer olá")}</button>
    <p id="wish-status" role="status"></p>
  </form>
  <div class="wish-scroll" id="wish-scroll" tabindex="0">
    <div id="wish-list"></div>
    <div id="wish-more" class="hint"></div>
  </div>
</section>
<section id="guesses" class="guesses" hidden>
  <h2 class="section-title">{t("Guess His Birth Time", "Adivinhe a Hora do Nascimento")}</h2>
  <p class="hint">{t("Just for bragging rights", "Só pelo direito de se gabar")}</p>
  <p class="hint small">{t("One guess per person · Arkansas time", "Um palpite por pessoa · horário do Arkansas")}</p>
  <form id="guess-form" autocomplete="on">
    <label>{t("Your name", "Seu nome")}<input name="name" maxlength="60" required
      data-ph-en="Grandma Sue" data-ph-pt="Vovó Maria" placeholder="Grandma Sue"></label>
    <label>{t("Date &amp; time he'll be born", "Data e hora em que ele vai nascer")}<input name="guess" type="datetime-local" required></label>
    <label class="hp" aria-hidden="true">Leave blank<input name="website" tabindex="-1" autocomplete="off"></label>
    <button type="submit">{t("Lock in my guess", "Registrar meu palpite")}</button>
    <p id="guess-status" role="status"></p>
  </form>
  <ol id="guess-list" class="guess-list"></ol>
</section>
</main>
<script>window.SITE = {json.dumps(public_cfg)};</script>
<script src="site.js"></script>
</body>
</html>
"""


def make_icons(dest: Path):
    """Home-screen icon for the Post page: little white truck on green."""
    from PIL import ImageDraw
    s, g = 512, (79, 138, 91)
    im = Image.new("RGB", (s, s), g)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((92, 150, 300, 330), 22, fill="white")          # cargo box
    d.rounded_rectangle((292, 210, 420, 330), 26, fill="white")         # cab
    d.rounded_rectangle((318, 232, 392, 282), 10, fill=g)               # window
    d.rectangle((280, 230, 320, 330), fill="white")
    for cx in (170, 350):                                               # wheels
        d.ellipse((cx - 50, 296, cx + 50, 396), fill=g)
        d.ellipse((cx - 40, 306, cx + 40, 386), fill="white")
        d.ellipse((cx - 15, 331, cx + 15, 361), fill=g)
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
                                                 "github_branch": cfg.get("github_branch", "main"),
                                                 "supabase_url": cfg.get("supabase_url", ""),
                                                 "supabase_anon_key": cfg.get("supabase_anon_key", "")}))
    (OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n")
    (OUT / ".nojekyll").write_text("")
    print(f"Built {len(posts)} update(s), {len(sizes)} photo(s) -> {OUT}")


if __name__ == "__main__":
    main()
