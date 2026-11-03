(function () {
  var S = window.SITE || {};

  // ---- countdown ----
  var daysEl = document.getElementById("days");
  if (daysEl && S.due_date) {
    var p = S.due_date.split("-");
    var due = new Date(+p[0], +p[1] - 1, +p[2]);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var d = Math.round((due - now) / 86400000);
    var label = document.getElementById("days-label");
    if (d > 0) { daysEl.textContent = d; label.textContent = d === 1 ? "day to go" : "days to go"; }
    else if (d === 0) { daysEl.textContent = "Today!"; label.textContent = "is the due date"; }
    else { daysEl.textContent = "Any day"; label.textContent = (-d) + " day" + (d === -1 ? "" : "s") + " past due"; }
  }

  // ---- wishes (Supabase REST, no library needed) ----
  var form = document.getElementById("wish-form");
  var list = document.getElementById("wish-list");
  var status = document.getElementById("wish-status");
  var ready = S.supabase_url && S.supabase_anon_key;
  var api = ready ? S.supabase_url.replace(/\/$/, "") + "/rest/v1/wishes" : "";
  var headers = ready ? { apikey: S.supabase_anon_key } : {};
  // Legacy "anon" keys are JWTs (eyJ…) and also go in Authorization; new sb_publishable_ keys must not.
  if (ready && /^eyJ/.test(S.supabase_anon_key)) headers.Authorization = "Bearer " + S.supabase_anon_key;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function load() {
    if (!ready) { list.appendChild(el("p", "hint", "Wishes open soon!")); return; }
    fetch(api + "?select=id,name,message,created_at&order=created_at.desc&limit=500", { headers: headers })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (rows) {
        list.textContent = "";
        if (!rows.length) list.appendChild(el("p", "hint", "Be the first to leave a wish!"));
        rows.forEach(function (w) {
          var box = el("div", "wish");
          box.appendChild(el("p", null, w.message));
          var when = new Date(w.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
          box.appendChild(el("p", "who", "— " + w.name + " · " + when));
          list.appendChild(box);
        });
      })
      .catch(function () { list.textContent = ""; list.appendChild(el("p", "hint", "Couldn't load wishes right now.")); });
  }

  if (form) form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!ready) { status.textContent = "Wishes aren't open yet."; return; }
    var f = new FormData(form);
    if (f.get("website")) return; // bot honeypot
    var body = { name: String(f.get("name")).trim().slice(0, 60), message: String(f.get("message")).trim().slice(0, 1000) };
    if (!body.name || !body.message) return;
    var btn = form.querySelector("button");
    btn.disabled = true; status.textContent = "Sending…";
    fetch(api, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", Prefer: "return=minimal" }, headers),
      body: JSON.stringify(body)
    })
      .then(function (r) { if (!r.ok) throw new Error(r.status); })
      .then(function () {
        status.textContent = "Thank you! Your wish was sent 💛";
        form.reset(); load();
      })
      .catch(function () { status.textContent = "Sorry, that didn't go through. Please try again in a minute."; })
      .then(function () { btn.disabled = false; });
  });

  if (list) load();
})();
