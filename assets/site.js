(function () {
  var S = window.SITE || {};
  var root = document.documentElement;
  function lang() { return root.classList.contains("lang-pt") ? "pt" : "en"; }

  // ---- strings the script writes (wishes themselves are never translated) ----
  var T = {
    en: { togo: "days to go", togo1: "day to go", today: "Today!", isdue: "is the due date", anyday: "Any day",
          past: function (n) { return n + " day" + (n === 1 ? "" : "s") + " past due"; },
          soon: "Messages open soon!", first: "Be the first to say hello!", cant: "Couldn't load messages right now.",
          loading: "Loading…", notyet: "Messages aren't open yet.", sending: "Sending…",
          thanks: "Thank you! Your message was sent 💚", fail: "Sorry, that didn't go through. Please try again in a minute.",
          locale: "en-US" },
    pt: { togo: "dias para chegar", togo1: "dia para chegar", today: "Hoje!", isdue: "é a data prevista", anyday: "A qualquer momento",
          past: function (n) { return n + " dia" + (n === 1 ? "" : "s") + " após a data prevista"; },
          soon: "As mensagens abrem em breve!", first: "Seja o primeiro a dizer olá!", cant: "Não foi possível carregar as mensagens agora.",
          loading: "Carregando…", notyet: "As mensagens ainda não estão abertas.", sending: "Enviando…",
          thanks: "Obrigado! Sua mensagem foi enviada 💚", fail: "Desculpe, não deu certo. Tente de novo em um minuto.",
          locale: "pt-BR" }
  };
  function tr(k) { return T[lang()][k]; }

  // ---- countdown ----
  function countdown() {
    var daysEl = document.getElementById("days");
    if (!daysEl || !S.due_date) return;
    var p = S.due_date.split("-");
    var due = new Date(+p[0], +p[1] - 1, +p[2]);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var d = Math.round((due - now) / 86400000);
    var label = document.getElementById("days-label");
    if (d > 0) { daysEl.textContent = d; label.textContent = d === 1 ? tr("togo1") : tr("togo"); }
    else if (d === 0) { daysEl.textContent = tr("today"); label.textContent = tr("isdue"); }
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

  // ---- wishes (Supabase REST, no library needed) ----
  var form = document.getElementById("wish-form");
  var list = document.getElementById("wish-list");
  var box = document.getElementById("wish-scroll");
  var moreEl = document.getElementById("wish-more");
  var status = document.getElementById("wish-status");
  var ready = S.supabase_url && S.supabase_anon_key;
  var api = ready ? S.supabase_url.replace(/\/$/, "") + "/rest/v1/wishes" : "";
  var headers = ready ? { apikey: S.supabase_anon_key } : {};
  // Legacy "anon" keys are JWTs (eyJ…) and also go in Authorization; new sb_publishable_ keys must not.
  if (ready && /^eyJ/.test(S.supabase_anon_key)) headers.Authorization = "Bearer " + S.supabase_anon_key;
  var PAGE = 20, offset = 0, done = false, busy = false, rows = [], msgKey = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
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
    fetch(api + "?select=id,name,message,created_at&order=created_at.desc&limit=" + PAGE + "&offset=" + offset, { headers: headers })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (got) {
        got.forEach(draw); offset += got.length; rows = rows.concat(got);
        if (got.length < PAGE) done = true;
        note(!offset ? "first" : null);
        busy = false;
        if (!done && box.scrollHeight <= box.clientHeight + 40) page();  // fill the box
      })
      .catch(function () { busy = false; note("cant"); });
  }
  function reset() { list.textContent = ""; offset = 0; done = false; rows = []; page(); }

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
    fetch(api, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", Prefer: "return=minimal" }, headers),
      body: JSON.stringify(body)
    })
      .then(function (r) { if (!r.ok) throw new Error(r.status); })
      .then(function () { status.textContent = tr("thanks"); form.reset(); box.scrollTop = 0; reset(); })
      .catch(function () { status.textContent = tr("fail"); })
      .then(function () { btn.disabled = false; });
  });

  // ---- language switch ----
  function applyLang(l, save) {
    root.className = root.className.replace(/\blang-\w+\b/g, "").trim() + " lang-" + l;
    root.lang = l === "pt" ? "pt-BR" : "en";
    if (save) { try { localStorage.setItem("lang", l); } catch (e) {} }
    document.querySelectorAll("[data-ph-" + l + "]").forEach(function (i) { i.placeholder = i.getAttribute("data-ph-" + l); });
    countdown();
    if (list) list.querySelectorAll(".who").forEach(stamp);
    if (moreEl && msgKey) note(msgKey);
    if (status) status.textContent = "";
  }
  document.querySelectorAll(".lang [data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { applyLang(b.getAttribute("data-lang"), true); });
  });

  applyLang(lang(), false);
  if (list) page();
})();
