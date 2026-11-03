(function () {
  var S = window.SITE || {};
  var root = document.documentElement;
  function lang() { return root.getAttribute("data-lang") === "pt" ? "pt" : "en"; }
  function L(en, pt) { return lang() === "pt" ? pt : en; }

  // ---- language toggle ----
  function applyLang(l) {
    root.setAttribute("data-lang", l); root.lang = l === "pt" ? "pt-BR" : "en";
    try { localStorage.setItem("site_lang", l); } catch (e) {}
    document.querySelectorAll("[data-ph-en]").forEach(function (el) { el.placeholder = el.getAttribute("data-ph-" + l); });
    countdown();
    if (lastRows) render(lastRows);
  }
  document.querySelectorAll("[data-set-lang]").forEach(function (b) {
    b.addEventListener("click", function () { applyLang(b.getAttribute("data-set-lang")); });
  });

  // ---- countdown ----
  function countdown() {
    var daysEl = document.getElementById("days");
    if (!daysEl || !S.due_date) return;
    var p = S.due_date.split("-");
    var due = new Date(+p[0], +p[1] - 1, +p[2]);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var d = Math.round((due - now) / 86400000);
    var label = document.getElementById("days-label");
    if (d > 0) { daysEl.textContent = d; label.textContent = d === 1 ? L("day to go", "dia para a chegada") : L("days to go", "dias para a chegada"); }
    else if (d === 0) { daysEl.textContent = L("Today!", "Hoje!"); label.textContent = L("is the due date", "é a data prevista"); }
    else {
      var n = -d;
      daysEl.textContent = L("Any day", "A qualquer momento");
      label.textContent = L(n + " day" + (n === 1 ? "" : "s") + " past due", n + " dia" + (n === 1 ? "" : "s") + " após a data prevista");
    }
  }

  // ---- wishes (Supabase REST, no library needed) ----
  var form = document.getElementById("wish-form");
  var list = document.getElementById("wish-list");
  var status = document.getElementById("wish-status");
  var ready = S.supabase_url && S.supabase_anon_key;
  var base = ready ? S.supabase_url.replace(/\/$/, "") : "";
  var api = base + "/rest/v1/wishes";
  var headers = ready ? { apikey: S.supabase_anon_key } : {};
  // Legacy "anon" keys are JWTs (eyJ…) and also go in Authorization; new sb_publishable_ keys must not.
  if (ready && /^eyJ/.test(S.supabase_anon_key)) headers.Authorization = "Bearer " + S.supabase_anon_key;
  var lastRows = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function render(rows) {
    lastRows = rows;
    list.textContent = "";
    if (!rows.length) list.appendChild(el("p", "hint", L("Be the first to leave a wish!", "Seja o primeiro a deixar um recado!")));
    rows.forEach(function (w) {
      var box = el("div", "wish");
      var msg = el("p", null, w.message);
      box.appendChild(msg);
      var when = new Date(w.created_at).toLocaleDateString(lang() === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric", year: "numeric" });
      box.appendChild(el("p", "who", "— " + w.name + " · " + when));
      var tb = el("button", "tr", L("Translate", "Traduzir")); tb.type = "button";
      var showing = false;
      tb.addEventListener("click", function () {
        var to = lang();
        if (showing) { msg.textContent = w.message; tb.textContent = L("Translate", "Traduzir"); showing = false; return; }
        var col = to === "pt" ? "message_pt" : "message_en";
        function show(text) { msg.textContent = text; tb.textContent = L("Show original", "Ver original"); showing = true; }
        if (w[col]) return show(w[col]);
        tb.textContent = L("Translating…", "Traduzindo…"); tb.disabled = true;
        fetch(base + "/functions/v1/translate-wish", {
          method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers),
          body: JSON.stringify({ id: w.id, to: to })
        })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.text) throw new Error(j.error || r.status); return j.text; }); })
          .then(function (text) { w[col] = text; show(text); })
          .catch(function () { tb.textContent = L("Translation unavailable", "Tradução indisponível"); })
          .then(function () { tb.disabled = false; });
      });
      box.appendChild(tb);
      list.appendChild(box);
    });
  }

  function load() {
    if (!ready) { list.appendChild(el("p", "hint", L("Wishes open soon!", "Recados em breve!"))); return; }
    var q = "?order=created_at.desc&limit=500&select=";
    function get(cols) {
      return fetch(api + q + cols, { headers: headers, cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }
    // Saved translations come along if supabase/translate.sql has been run; otherwise plain wishes.
    get("id,name,message,created_at,message_en,message_pt")
      .catch(function () { return get("id,name,message,created_at"); })
      .then(render)
      .catch(function () { list.textContent = ""; list.appendChild(el("p", "hint", L("Couldn't load wishes right now.", "Não foi possível carregar os recados agora."))); });
  }

  if (form) form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!ready) { status.textContent = L("Wishes aren't open yet.", "Os recados ainda não estão abertos."); return; }
    var f = new FormData(form);
    if (f.get("website")) return; // bot honeypot
    var body = { name: String(f.get("name")).trim().slice(0, 60), message: String(f.get("message")).trim().slice(0, 1000) };
    if (!body.name || !body.message) return;
    var btn = form.querySelector("button");
    btn.disabled = true; status.textContent = L("Sending…", "Enviando…");
    fetch(api, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", Prefer: "return=minimal" }, headers),
      body: JSON.stringify(body)
    })
      .then(function (r) { if (!r.ok) throw new Error(r.status); })
      .then(function () {
        status.textContent = L("Thank you! Your wish was sent 💛", "Obrigado! Seu recado foi enviado 💛");
        form.reset(); load();
      })
      .catch(function () { status.textContent = L("Sorry, that didn't go through. Please try again in a minute.", "Desculpe, não deu certo. Tente de novo em um minuto."); })
      .then(function () { btn.disabled = false; });
  });

  applyLang(lang());
  if (list) load();
})();
