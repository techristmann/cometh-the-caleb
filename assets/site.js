(function () {
  var S = window.SITE || {};
  var root = document.documentElement;
  function lang() { return root.classList.contains("lang-pt") ? "pt" : "en"; }

  // ---- strings the script writes (comments and names are never translated) ----
  var T = {
    en: { togo: "days to go", togo1: "day to go", today: "today", anyday: "any day now",
          past: function (n) { return n + " day" + (n === 1 ? "" : "s") + " past due"; },
          soon: "Messages open soon!", first: "Be the first to say hello!", cant: "Couldn't load messages right now.",
          loading: "Loading…", notyet: "Messages aren't open yet.", sending: "Sending…",
          thanks: "Thank you! Your message was sent 💚", fail: "Sorry, that didn't go through. Please try again in a minute.",
          gThanks: "Your guess is locked in! 🎉", gTaken: function (n) { return n + " already made a guess. One guess per person!"; },
          gFirst: "No guesses yet. Be the first!", winnerTag: "Winner",
          locale: "en-US" },
    pt: { togo: "dias para chegar", togo1: "dia para chegar", today: "hoje", anyday: "a qualquer momento",
          past: function (n) { return n + " dia" + (n === 1 ? "" : "s") + " após a data prevista"; },
          soon: "As mensagens abrem em breve!", first: "Seja o primeiro a dizer olá!", cant: "Não foi possível carregar as mensagens agora.",
          loading: "Carregando…", notyet: "As mensagens ainda não estão abertas.", sending: "Enviando…",
          thanks: "Obrigado! Sua mensagem foi enviada 💚", fail: "Desculpe, não deu certo. Tente de novo em um minuto.",
          gThanks: "Seu palpite foi registrado! 🎉", gTaken: function (n) { return n + " já deu um palpite. Um palpite por pessoa!"; },
          gFirst: "Nenhum palpite ainda. Seja o primeiro!", winnerTag: "Vencedor",
          locale: "pt-BR" }
  };
  function tr(k) { return T[lang()][k]; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---- countdown ----
  function countdown() {
    var daysEl = document.getElementById("days");
    if (!daysEl || !S.due_date) return;
    var p = S.due_date.split("-");
    var due = new Date(+p[0], +p[1] - 1, +p[2]);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var d = Math.round((due - now) / 86400000);
    var label = document.getElementById("days-label");
    daysEl.parentNode.classList.toggle("word", d <= 0);
    if (d > 0) { daysEl.textContent = d; label.textContent = d === 1 ? tr("togo1") : tr("togo"); }
    else if (d === 0) { daysEl.textContent = tr("today"); label.textContent = ""; }
    else { daysEl.textContent = tr("anyday"); label.textContent = T[lang()].past(-d); }
  }

  // ---- older updates: show more / less ----
  var ups = document.getElementById("updates");
  var more = document.getElementById("more");
  var older = document.getElementById("older");
  if (more && older) more.addEventListener("click", function () {
    var open = older.hidden;
    older.hidden = !open;
    more.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) ups.scrollIntoView({ block: "start" });
  });

  // ---- Supabase REST, no library needed ----
  var ready = S.supabase_url && S.supabase_anon_key;
  var base = ready ? S.supabase_url.replace(/\/$/, "") + "/rest/v1/" : "";
  var headers = ready ? { apikey: S.supabase_anon_key } : {};
  // Legacy "anon" keys are JWTs (eyJ…) and also go in Authorization; new sb_publishable_ keys must not.
  if (ready && /^eyJ/.test(S.supabase_anon_key)) headers.Authorization = "Bearer " + S.supabase_anon_key;
  function post(table, body) {
    return fetch(base + table, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", Prefer: "return=minimal" }, headers),
      body: JSON.stringify(body)
    });
  }

  // ---- Say Hello comments ----
  var form = document.getElementById("wish-form");
  var list = document.getElementById("wish-list");
  var box = document.getElementById("wish-scroll");
  var moreEl = document.getElementById("wish-more");
  var status = document.getElementById("wish-status");
  var PAGE = 20, offset = 0, done = false, busy = false, msgKey = null;
  function note(k) { msgKey = k; moreEl.textContent = k ? tr(k) : ""; }

  function draw(w) {
    var b = el("div", "wish");
    b.appendChild(el("p", null, w.message));
    var who = el("p", "who");
    who.dataset.name = w.name; who.dataset.at = w.created_at;
    b.appendChild(who); list.appendChild(b);
    stamp(who);
  }
  function stamp(who) {
    var when = new Date(who.dataset.at).toLocaleDateString(tr("locale"), { month: "short", day: "numeric", year: "numeric" });
    who.textContent = "— " + who.dataset.name + " · " + when;
  }

  function page() {
    if (!ready) { note("soon"); return; }
    if (busy || done) return;
    busy = true; note("loading");
    fetch(base + "wishes?select=id,name,message,created_at&order=created_at.desc&limit=" + PAGE + "&offset=" + offset, { headers: headers })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (got) {
        got.forEach(draw); offset += got.length;
        if (got.length < PAGE) done = true;
        note(!offset ? "first" : null);
        busy = false;
        if (!done && box.scrollHeight <= box.clientHeight + 40) page();  // fill the box
      })
      .catch(function () { busy = false; note("cant"); });
  }
  function reset() { list.textContent = ""; offset = 0; done = false; page(); }

  if (box) {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { if (es[0].isIntersecting) page(); },
        { root: box, rootMargin: "200px" }).observe(moreEl);
    }
    box.addEventListener("scroll", function () {
      if (box.scrollTop + box.clientHeight > box.scrollHeight - 200) page();
    });
  }

  if (form) form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!ready) { status.textContent = tr("notyet"); return; }
    var f = new FormData(form);
    if (f.get("website")) return; // bot honeypot
    var body = { name: String(f.get("name")).trim().slice(0, 60), message: String(f.get("message")).trim().slice(0, 1000) };
    if (!body.name || !body.message) return;
    var btn = form.querySelector("button");
    btn.disabled = true; status.textContent = tr("sending");
    post("wishes", body)
      .then(function (r) { if (!r.ok) throw new Error(r.status); })
      .then(function () { status.textContent = tr("thanks"); form.reset(); box.scrollTop = 0; reset(); })
      .catch(function () { status.textContent = tr("fail"); })
      .then(function () { btn.disabled = false; });
  });

  // ---- birth-time guesses: their own table, one per name (supabase/guesses.sql) ----
  var gSec = document.getElementById("guesses"), gForm = document.getElementById("guess-form");
  var gList = document.getElementById("guess-list"), gStatus = document.getElementById("guess-status");
  var guesses = [], winner = null, winBox = document.getElementById("winner");
  var RX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

  function wall(y, mo, d, h, mi) { return Date.UTC(y, mo - 1, d, h, mi); }   // Arkansas clock, as plain numbers
  function gMs(g) { var m = RX.exec(g || ""); return m ? wall(+m[1], +m[2], +m[3], +m[4], +m[5]) : null; }
  function fmtGuess(g) {   // stored as "YYYY-MM-DDTHH:MM" in Arkansas time; shown as-is, never shifted
    var ms = gMs(g); if (ms == null) return "";
    return new Date(ms).toLocaleString(tr("locale"), { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function parseTime(s) {
    var m = /^\s*(\d{1,2})[:h.](\d{2})\s*([ap])?\.?\s*m?\.?\s*$/i.exec(s || "");
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (m[3]) h = h % 12 + (/p/i.test(m[3]) ? 12 : 0);
    return h < 24 && mi < 60 ? [h, mi] : null;
  }
  function chicagoToReal(ms) {   // Arkansas wall-clock -> real moment (for "guessed before birth")
    var t = ms + 6 * 3600e3;
    try {
      var f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23", year: "numeric",
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      for (var i = 0; i < 2; i++) {
        var o = {}; f.formatToParts(new Date(t)).forEach(function (p) { o[p.type] = p.value; });
        t += ms - wall(+o.year, +o.month, +o.day, +o.hour % 24, +o.minute);
      }
    } catch (e) {}
    return t;
  }
  function birthMs() {
    var A = S.arrival || {}, hm = parseTime(A.time), dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(A.date || "");
    return S.arrived && hm && dm ? wall(+dm[1], +dm[2], +dm[3], hm[0], hm[1]) : null;
  }

  var W = {
    en: { title: "🏆 Closest guess", spot: "spot on!", off: " off" },
    pt: { title: "🏆 Palpite mais próximo", spot: "na mosca!", off: " de diferença" }
  };
  function offText(ms) {
    var min = Math.round(ms / 60000), d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60), m = min % 60;
    if (!min) return W[lang()].spot;
    return (d ? d + " d " + h + " h" : h ? h + " h " + m + " min" : m + " min") + W[lang()].off;
  }

  function scoreGuesses() {   // once he's here: rank by closeness, ignore guesses made after the birth
    var birth = birthMs(); winner = null;
    guesses.forEach(function (g) { g.off = null; });
    if (birth == null) return;
    var cutoff = chicagoToReal(birth);
    guesses.forEach(function (g) {
      var ms = gMs(g.guess);
      if (ms == null || new Date(g.created_at).getTime() > cutoff) return;
      g.off = Math.abs(ms - birth);
      if (!winner || g.off < winner.off) winner = g;   // ties: earliest guess wins (list is oldest first)
    });
  }
  function drawWinner() {
    if (!winBox || !winner) return;
    winBox.textContent = "";
    winBox.appendChild(el("span", null, W[lang()].title));
    winBox.appendChild(el("b", null, winner.name));
    winBox.appendChild(el("small", null, fmtGuess(winner.guess) + " · " + offText(winner.off)));
    winBox.hidden = false;
  }
  function drawGuesses() {
    if (!gList) return;
    gList.textContent = "";
    var rows = guesses.slice();
    if (winner) rows = rows.filter(function (g) { return g.off != null; }).sort(function (a, b) { return a.off - b.off; });
    else rows.sort(function (a, b) { return a.guess < b.guess ? -1 : a.guess > b.guess ? 1 : 0; });
    if (!rows.length) { gList.appendChild(el("li", "guess-empty", tr("gFirst"))); return; }
    rows.forEach(function (g) {
      var li = el("li", g === winner ? "won" : null);
      li.appendChild(el("span", "g-name", g.name));
      li.appendChild(el("span", "g-when", fmtGuess(g.guess)));
      if (g === winner) li.appendChild(el("span", "g-tag", tr("winnerTag")));
      else if (g.off != null) li.appendChild(el("span", "g-off", offText(g.off)));
      gList.appendChild(li);
    });
  }
  function loadGuesses() {
    if (!ready || !gSec) return;
    fetch(base + "guesses?select=id,name,guess,created_at&order=created_at.asc&limit=2000", { headers: headers })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (rows) {
        guesses = rows; scoreGuesses();
        gSec.hidden = false;                       // table exists: show the section
        if (gForm) gForm.hidden = !!S.arrived;     // guessing closes once he's here
        drawGuesses(); drawWinner();
      })
      .catch(function () {});                      // table not set up yet: section stays hidden
  }

  if (gForm) gForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = new FormData(gForm);
    if (f.get("website")) return; // bot honeypot
    var body = { name: String(f.get("name")).trim().slice(0, 60), guess: String(f.get("guess") || "").slice(0, 16) };
    if (!body.name || !RX.test(body.guess)) return;
    var btn = gForm.querySelector("button");
    btn.disabled = true; gStatus.textContent = tr("sending");
    post("guesses", body)
      .then(function (r) {
        if (r.status === 409) { gStatus.textContent = T[lang()].gTaken(body.name); return; }
        if (!r.ok) throw new Error(r.status);
        gStatus.textContent = tr("gThanks"); gForm.reset(); loadGuesses();
      })
      .catch(function () { gStatus.textContent = tr("fail"); })
      .then(function () { btn.disabled = false; });
  });

  // ---- he's here: balloons + bottles ----
  var BALLOON = '<svg viewBox="0 0 40 68"><path d="M20 2C9 2 2 11 2 22c0 13 10 23 18 25 8-2 18-12 18-25C38 11 31 2 20 2z" fill="currentColor"/>' +
    '<ellipse cx="13" cy="15" rx="4" ry="7" fill="#fff" opacity=".35" transform="rotate(-20 13 15)"/>' +
    '<path d="M17 50l3-4 3 4z" fill="currentColor"/><path d="M20 50c-4 6 4 10 0 17" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".7"/></svg>';
  var BOTTLE = '<svg viewBox="0 0 32 68"><path d="M12 12c0-8 8-8 8 0v4h-8z" fill="#e9c58f"/>' +
    '<rect x="7" y="15" width="18" height="8" rx="3" fill="currentColor"/>' +
    '<rect x="8" y="22" width="16" height="42" rx="7" fill="#fffaf1" stroke="currentColor" stroke-width="2"/>' +
    '<rect x="10" y="38" width="12" height="24" rx="5" fill="#fff" opacity=".9"/>' +
    '<path d="M16 30h5M16 36h5M16 42h5" stroke="currentColor" stroke-width="1.5"/></svg>';
  var COLORS = ["#d4a03a", "#5e7f3f", "#b85c2a", "#2f5233", "#9bb08a", "#e0b252"];
  function party() {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var old = document.querySelector(".party"); if (old) old.remove();
    var layer = el("div", "party"); layer.setAttribute("aria-hidden", "true");
    var n = window.innerWidth < 600 ? 24 : 40;
    for (var i = 0; i < n; i++) {
      var f = el("div", "floaty"), bottle = i % 3 === 2, s = (bottle ? 26 : 34) + Math.random() * 26;
      f.innerHTML = bottle ? BOTTLE : BALLOON;
      f.style.cssText = "left:" + (Math.random() * 96) + "%;color:" + COLORS[i % COLORS.length] +
        ";--s:" + s + "px;--d:" + (7 + Math.random() * 5) + "s;--delay:" + (Math.random() * 3.5) + "s" +
        ";--drift:" + (Math.random() * 120 - 60) + "px;--r0:" + (Math.random() * 20 - 10) + "deg;--r1:" + (Math.random() * 50 - 25) + "deg";
      layer.appendChild(f);
    }
    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 17000);
  }
  if (S.arrived) {
    party();
    var banner = document.getElementById("arrived");
    if (banner) banner.addEventListener("click", party);
  }

  // ---- backup translation: if the build couldn't translate an update, the visitor's browser does it ----
  var filled = false;
  function plain(node) {   // text of one block, with <br> kept as a space
    var d = document.createElement("div"); d.innerHTML = node.innerHTML.replace(/<br\s*\/?>/gi, " ");
    return d.textContent.replace(/\s+/g, " ").trim();
  }
  function gtx(lines) {
    return fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "q=" + encodeURIComponent(lines.join("\n"))
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { return j[0].map(function (s) { return s[0] || ""; }).join("").split("\n"); });
  }
  function fillPt() {
    if (filled || lang() !== "pt") return;
    filled = true;
    document.querySelectorAll("article.update[data-needs-pt]").forEach(function (a) {
      var els = [].slice.call(a.querySelectorAll("h2 .l-pt, .body .l-pt p, .body .l-pt li, .body .l-pt h3"));
      if (!els.length) return;
      var src = els.map(plain), key = "pt:" + a.id + ":" + src.join("|").length, got = null;
      try { got = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
      function apply(out) { els.forEach(function (el, i) { if (out[i]) el.textContent = out[i].trim(); }); }
      if (got && got.length === els.length) { apply(got); return; }
      gtx(src).then(function (out) {
        if (out.length !== els.length) return;
        apply(out);
        try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
      }).catch(function () {});   // no luck: the English stays
    });
  }

  // ---- language switch ----
  function applyLang(l, save) {
    root.className = root.className.replace(/\blang-\w+\b/g, "").trim() + " lang-" + l;
    root.lang = l === "pt" ? "pt-BR" : "en";
    if (save) { try { localStorage.setItem("lang", l); } catch (e) {} }
    document.querySelectorAll("[data-ph-" + l + "]").forEach(function (i) { i.placeholder = i.getAttribute("data-ph-" + l); });
    countdown(); fillPt();
    if (list) list.querySelectorAll(".who").forEach(stamp);
    if (moreEl && msgKey) note(msgKey);
    if (guesses.length || (gSec && !gSec.hidden)) { drawGuesses(); drawWinner(); }
    if (status) status.textContent = "";
    if (gStatus) gStatus.textContent = "";
  }
  document.querySelectorAll(".lang [data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { applyLang(b.getAttribute("data-lang"), true); });
  });

  applyLang(lang(), false);
  if (list) page();
  loadGuesses();
})();
