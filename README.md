# Baby updates site

A small, private-by-link site for family and friends: updates, photos and wishes.

- **Hosting:** GitHub Pages, built by GitHub Actions (`.github/workflows/deploy.yml` runs `build.py`).
- **Updates:** markdown files in `updates/`. **Photos:** in `photos/`.
- **Wishes:** stored in Supabase (free tier). No account is needed to leave one.
- **Privacy:** link-only. Every page has `noindex`, and `robots.txt` blocks crawlers. The repo is public, so anyone who finds it can browse the photos. Don't post anything you wouldn't want a stranger to see.
- **Photo safety:** the Post page shrinks each photo and strips **GPS location** and other metadata *on your phone, before upload*. The build strips them again for the site. ⚠️ If you drag original photos straight into the repo on github.com, the original file (location included) sits in the public repo. Use the Post page for photos.

---

## How I post an update

### Everything goes through the Post page (text, photos, arrival banner)
1. Open **`https://<your-site>/post/`** on your phone and add it to your Home Screen.
2. The first time, paste your GitHub key (see "One-time setup" below). It's saved only on that phone.
3. Type a title and text, tap **Photos**, pick pictures from your camera roll, and tap **Publish**.

The page shrinks the photos and removes their location data on the phone before uploading, then commits everything in one go.

> **Text only?** Leave Photos empty. **Arrival banner?** Use the "Baby has arrived" form at the bottom of the same page.


### Flip the "Baby has arrived!" banner
Use the "Baby has arrived" form on the Post page, or edit `config.json` on github.com yourself: change `"arrived": false` to `true` and fill in `arrival`. Until then, the site shows a countdown to `due_date`.

### Update file format (for reference)
```markdown
---
title: "She's here!"
date: 2026-12-14
time: "04:12"          # optional, orders same-day posts
photos:                # optional, file names inside photos/
  - first-cuddle.jpg
  - toes.heic          # iPhone HEIC is fine; it's converted to JPEG
draft: true            # optional, hides the post
---

Text with **bold**, *italic*, [links](https://example.com) and
- bullet lists
```

---

## Wishes: moderating and deleting
Use the Supabase dashboard. It works in a phone browser.
1. Open **supabase.com → your project → Table Editor → `wishes`**.
2. **Hide** a wish: set `hidden` to `true`. It disappears from the site but stays in the table.
   **Delete** it: tick the row → **Delete**.

You can also ask Claude to give you a `delete from wishes where id = …` line to paste into the SQL Editor.

Built-in protection: the database refuses wishes longer than 1,000 characters, exact duplicates, and floods of more than 20 wishes in 10 minutes. The form also has a hidden honeypot field that catches bots.

---

## One-time setup

### 1. Supabase (wishes)
1. Create a project at supabase.com (free tier).
2. **SQL Editor → New query**, paste all of `supabase/setup.sql`, then click **Run**.
3. **Project Settings → API Keys**: copy the **Publishable key** (`sb_publishable_…`), or the legacy **anon public** key (`eyJ…`), into `config.json` as `supabase_anon_key`. `supabase_url` is `https://<project-ref>.supabase.co`, without `/rest/v1`.

The anon key is *meant* to be public. It's what every Supabase website ships to the browser. The Row Level Security rules in `setup.sql` are what protect the data: visitors can only **read visible wishes** and **add new ones**. They can't edit, hide, or delete anything.
**Never** put the `service_role` key, or any other secret, in this repo.

### 2. GitHub Pages
Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. Every push then rebuilds the site.

### 3. Your phone posting key
github.com → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
- Repository access: **Only select repositories** → this repo
- Permissions → Repository → **Contents: Read and write** (nothing else)
- Expiration: 1 year is fine
Paste it into the Post page once. If your phone is lost, delete the token on GitHub.

---

## Files
| Path | What it is |
|---|---|
| `config.json` | Title, names, due date, arrived banner, Supabase URL + anon key, repo name |
| `updates/*.md` | One file per update |
| `photos/` | Original photos (processed during the build) |
| `assets/` | Styles, wishes script, Post page |
| `build.py` | Turns everything into the `_site/` folder (`python3 build.py` to preview locally) |
| `supabase/setup.sql` | Wishes table and security rules |
