// Admin panel for the listings: Google sign-in, Firestore for listings and photos.
// Who may write is enforced by firebase/firestore.rules; SS_CONFIG.admins only picks which screen to show.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const cfg = window.SS_CONFIG || {};
const views = ["v-config", "v-login", "v-list", "v-edit"];
const view = v => views.forEach(x => { $(x).hidden = x !== v; });
const say = (el, text, kind) => { el.textContent = text || ""; el.className = "msg" + (kind ? " " + kind : ""); };
const KEY_CAR = ["מנוע", "הספק", "תיבה", "הנעה", "צבע", "טסט עד"];
const KEY_MOTO = ["נפח מנוע", "הספק", "סוג", "תיבה", "צבע", "טסט עד"];
const FIELDS = ["kind", "model", "subtitle", "price", "old_price", "year", "km", "hand", "key_specs", "details", "features", "note", "card_note", "card_warn", "illus", "deal", "hidden", "images", "wa_text"];

if (!cfg.projectId || !cfg.apiKey) {
  view("v-config");
} else {
  const app = initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const admins = (cfg.admins || []).map(e => e.toLowerCase());
  let listings = [], cur = null;
  const photoCache = {};   // photo id -> {main, thumb}

  const getPhotos = async ids => {
    await Promise.all(ids.filter(id => !photoCache[id]).map(async id => {
      const snap = await getDoc(doc(db, "photos", id));
      if (snap.exists()) photoCache[id] = snap.data();
    }));
    const out = {};
    ids.forEach(id => { if (photoCache[id]) out[id] = photoCache[id]; });
    return out;
  };
  const toDoc = l => { const data = {}; FIELDS.forEach(k => { data[k] = l[k] == null ? null : l[k]; }); return { sort: l.sort, hidden: !!l.hidden, data: JSON.stringify(data) }; };
  const fromDoc = snap => { const d = snap.data(); return Object.assign(JSON.parse(d.data), { id: snap.id, sort: d.sort, hidden: !!d.hidden }); };

  // ---------- auth ----------
  $("google").addEventListener("click", async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { if (e.code !== "auth/popup-closed-by-user") say($("login-msg"), "שגיאה בכניסה: " + e.message, "err"); }
  });
  $("logout").addEventListener("click", () => signOut(auth));
  onAuthStateChanged(auth, async user => {
    if (!user) { view("v-login"); $("logout").hidden = true; $("who").textContent = ""; return; }
    $("who").textContent = "· " + user.email;
    $("logout").hidden = false;
    if (!admins.includes((user.email || "").toLowerCase())) {
      view("v-login");
      say($("login-msg"), "לחשבון " + user.email + " אין הרשאת ניהול.", "err");
      return;
    }
    say($("login-msg"), "");
    await loadList();
    view("v-list");
  });

  // ---------- list ----------
  async function loadList() {
    try {
      const snap = await getDocs(collection(db, "listings"));
      listings = snap.docs.map(fromDoc);
    } catch (e) { say($("list-msg"), "שגיאה בטעינה: " + e.message, "err"); return; }
    // first login: copy the cars written in index.html into the database before anything else, otherwise the
    // first new listing would replace all of them on the site (the page shows the database once it has rows)
    if (!listings.length && !importing) { await importExisting(); return; }
    drawRows();
  }
  let importing = false;
  const fmt = n => n ? Number(n).toLocaleString("en-US") + " ₪" : "—";
  function drawRows() {
    const q = $("q").value.trim().toLowerCase();
    const shown = listings.filter(l => !q || (l.model + " " + l.year + " " + (l.subtitle || "")).toLowerCase().includes(q))
      .sort((a, b) => (b.deal - a.deal) || (b.sort - a.sort));
    $("count").textContent = listings.length + " מודעות · " + listings.filter(l => !l.hidden).length + " באתר";
    $("rows").innerHTML = "";
    shown.forEach(l => {
      const r = document.createElement("div");
      r.className = "row" + (l.hidden ? " is-hidden" : "");
      r.innerHTML = '<img alt=""><div><h3></h3><p></p></div><div class="acts">' +
        '<button type="button" data-a="edit">עריכה</button><button type="button" data-a="hide"></button><button type="button" data-a="deal"></button><button type="button" class="danger" data-a="del">מחיקה</button></div>';
      const im = (l.images || [])[0];
      const img = r.querySelector("img");
      if (im && im.photo) getPhotos([im.photo]).then(p => { if (p[im.photo]) img.src = p[im.photo].thumb; });
      else if (im) img.src = im.thumb || im.src;
      r.querySelector("h3").textContent = l.model + " " + (l.year || "");
      r.querySelector("h3").insertAdjacentHTML("beforeend", (l.kind === "moto" ? '<span class="tag moto">אופנוע</span>' : "") + (l.deal ? '<span class="tag deal">ממומן</span>' : "") + (l.hidden ? '<span class="tag hid">מוסתר</span>' : ""));
      r.querySelector("p").textContent = fmt(l.price) + " · " + (l.km || "") + " ק״מ · יד " + (l.hand || "");
      r.querySelector('[data-a="hide"]').textContent = l.hidden ? "הצגה באתר" : "הסתרה";
      r.querySelector('[data-a="deal"]').textContent = l.deal ? "ביטול ממומן" : "ממומן";
      r.addEventListener("click", e => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === "edit") openEditor(l);
        if (a === "hide") patch(l, { hidden: !l.hidden });
        if (a === "deal") patch(l, { deal: !l.deal });
        if (a === "del") remove(l);
      });
      $("rows").appendChild(r);
    });
  }
  $("q").addEventListener("input", drawRows);
  async function patch(l, fields) {
    const next = Object.assign({}, l, fields);
    try { await setDoc(doc(db, "listings", l.id), toDoc(next)); }
    catch (e) { return say($("list-msg"), "שגיאה: " + e.message, "err"); }
    Object.assign(l, fields); drawRows(); say($("list-msg"), "עודכן. השינוי כבר באתר.", "ok");
  }
  async function remove(l) {
    if (!confirm("למחוק לצמיתות את " + l.model + " " + (l.year || "") + "?\nאם רק רוצים להוריד זמנית מהאתר, עדיף 'הסתרה'.")) return;
    try {
      const b = writeBatch(db);
      b.delete(doc(db, "listings", l.id));
      (l.images || []).filter(i => i.photo).forEach(i => b.delete(doc(db, "photos", i.photo)));
      await b.commit();
    } catch (e) { return say($("list-msg"), "שגיאה: " + e.message, "err"); }
    listings = listings.filter(x => x.id !== l.id); drawRows();
    say($("list-msg"), "נמחק מהאתר.", "ok");
    if (cur && cur.id === l.id) { cur = null; view("v-list"); }
  }

  // ---------- editor ----------
  const blank = () => ({ id: null, kind: "car", model: "", subtitle: "", price: null, old_price: null, year: "", km: "", hand: "",
    key_specs: KEY_CAR.map(k => ({ k, v: "" })), details: [], features: [], note: "", card_note: "", card_warn: false,
    illus: false, deal: false, hidden: false, images: [], wa_text: "" });
  $("new").addEventListener("click", () => openEditor(null));
  $("back").addEventListener("click", () => view("v-list"));
  $("cancel").addEventListener("click", () => view("v-list"));

  function pairRow(host, item, withSmall) {
    const d = document.createElement("div");
    d.className = "pair";
    d.innerHTML = '<input placeholder="שם" data-f="k"><input placeholder="ערך" data-f="v">' +
      (withSmall ? '<label class="small-check"><input type="checkbox" data-f="small"> קטן</label>' : "<span></span>") +
      '<button type="button" aria-label="הסרה">✕</button>';
    d.querySelector('[data-f="k"]').value = item.k || "";
    d.querySelector('[data-f="v"]').value = item.v || "";
    if (withSmall) d.querySelector('[data-f="small"]').checked = !!item.small;
    d.querySelector("button").addEventListener("click", () => { d.remove(); preview(); });
    host.appendChild(d);
  }
  const readPairs = id => [...$(id).querySelectorAll(".pair")].map(p => {
    const o = { k: p.querySelector('[data-f="k"]').value.trim(), v: p.querySelector('[data-f="v"]').value.trim() };
    const s = p.querySelector('[data-f="small"]'); if (s && s.checked) o.small = true;
    return o;
  }).filter(o => o.k);
  document.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => pairRow($(b.dataset.add), {}, b.dataset.add === "key_specs")));

  const TEXT = ["model", "subtitle", "year", "km", "hand", "note", "card_note", "wa_text"];
  const CHECK = ["card_warn", "illus", "deal", "hidden"];
  async function openEditor(l) {
    cur = JSON.parse(JSON.stringify(l || blank()));
    cur.isNew = !l;
    $("edit-title").textContent = l ? "עריכה: " + l.model + " " + (l.year || "") : "רכב חדש";
    $("del").hidden = !l;
    $("kind").value = cur.kind;
    TEXT.forEach(k => { $(k).value = cur[k] || ""; });
    CHECK.forEach(k => { $(k).checked = !!cur[k]; });
    $("price").value = cur.price ? Number(cur.price).toLocaleString("en-US") : "";
    $("old_price").value = cur.old_price ? Number(cur.old_price).toLocaleString("en-US") : "";
    $("features").value = (cur.features || []).join("\n");
    $("key_specs").innerHTML = ""; (cur.key_specs || []).forEach(s => pairRow($("key_specs"), s, true));
    $("details").innerHTML = ""; (cur.details || []).forEach(s => pairRow($("details"), s, false));
    say($("edit-msg"), "");
    view("v-edit"); scrollTo(0, 0);
    const ids = cur.images.filter(i => i.photo).map(i => i.photo);
    if (ids.length) await getPhotos(ids);
    drawPhotos(); preview();
  }
  $("kind").addEventListener("change", () => {
    // offer the matching tile labels when the kind changes and the tiles are still empty
    if (readPairs("key_specs").every(p => !p.v)) {
      $("key_specs").innerHTML = "";
      ($("kind").value === "moto" ? KEY_MOTO : KEY_CAR).forEach(k => pairRow($("key_specs"), { k }, true));
    }
    preview();
  });
  const toInt = s => { const n = parseInt(String(s || "").replace(/[^\d]/g, ""), 10); return isNaN(n) ? null : n; };
  const withCommas = s => { const n = toInt(s); return n == null ? "" : n.toLocaleString("en-US"); };
  ["price", "old_price"].forEach(id => $(id).addEventListener("blur", () => { $(id).value = withCommas($(id).value); }));
  $("km").addEventListener("blur", () => { if (/^\d[\d,]*$/.test($("km").value.trim())) $("km").value = withCommas($("km").value); });

  function readForm() {
    const o = Object.assign({}, cur);
    o.kind = $("kind").value;
    TEXT.forEach(k => { o[k] = $(k).value.trim() || null; });
    CHECK.forEach(k => { o[k] = $(k).checked; });
    o.year = o.year || ""; o.km = o.km || ""; o.hand = o.hand || "";
    o.price = toInt($("price").value); o.old_price = toInt($("old_price").value);
    o.features = $("features").value.split("\n").map(s => s.trim()).filter(Boolean);
    o.key_specs = readPairs("key_specs"); o.details = readPairs("details");
    o.images = cur.images.map(im => Object.assign({}, im, { alt: im.alt || (o.model + (im.label ? ", " + im.label : "")) }));
    return o;
  }
  $("f-edit").addEventListener("input", preview);
  $("f-edit").addEventListener("change", preview);

  // preview inside a shadow root with the site's own stylesheet (taken from index.html)
  const pvRoot = $("pv").attachShadow({ mode: "open" });
  let siteCss = "";
  fetch("index.html", { cache: "no-store" }).then(r => r.text()).then(t => {
    siteCss = [...t.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join("\n").replace(/:root/g, ":host");
    preview();
  });
  function preview() {
    if (!cur) return;
    const l = readForm();
    if (!l.images.length) l.images = [{ src: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#e9ebee"/><text x="50%" y="50%" fill="#9aa0a6" font-family="sans-serif" font-size="18" text-anchor="middle">אין תמונה עדיין</text></svg>'), alt: "" }];
    pvRoot.innerHTML = "<style>" + siteCss + " :host{display:block} ul.cars{list-style:none;margin:0;padding:0;display:block} .car{max-width:none}</style><ul class=\"cars\">" + SSCards.renderCard(l, { eager: true, photos: photoCache }) + "</ul>";
    const card = pvRoot.querySelector(".car");
    card.addEventListener("click", e => {
      const b = e.target.closest(".thumbs button"); if (!b) return;
      const m = card.querySelector(".main"); m.src = b.dataset.src; m.style.objectPosition = b.dataset.pos || "";
      card.querySelectorAll(".thumbs button").forEach(x => x.setAttribute("aria-pressed", x === b));
    });
  }

  // ---------- photos: resized in the browser and saved as their own documents ----------
  $("drop").addEventListener("click", () => $("files").click());
  $("drop").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("files").click(); } });
  ["dragenter", "dragover"].forEach(t => $("drop").addEventListener(t, e => { e.preventDefault(); $("drop").classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => $("drop").addEventListener(t, e => { e.preventDefault(); $("drop").classList.remove("over"); }));
  $("drop").addEventListener("drop", e => addFiles(e.dataTransfer.files));
  $("files").addEventListener("change", e => { addFiles(e.target.files); e.target.value = ""; });

  const loadImage = file => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("לא ניתן לקרוא את התמונה"));
    img.src = URL.createObjectURL(file);
  });
  // JPEG data URL no longer than maxSide, shrinking quality/size until it fits the byte budget
  function encode(img, maxSide, budget) {
    let side = maxSide, q = 0.85;
    for (let tries = 0; tries < 8; tries++) {
      const s = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= budget) return { url, w: c.width, h: c.height };
      if (q > 0.6) q -= 0.1; else side = Math.round(side * 0.85);
    }
    throw new Error("התמונה גדולה מדי");
  }
  async function addFiles(files) {
    files = [...files].filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    say($("edit-msg"), "מעלה " + files.length + " תמונות…");
    for (const f of files) {
      try {
        const img = await loadImage(f);
        const big = encode(img, 1400, 700000), small = encode(img, 360, 60000);
        URL.revokeObjectURL(img.src);
        const id = crypto.randomUUID().replace(/-/g, "");
        await setDoc(doc(db, "photos", id), { main: big.url, thumb: small.url });
        photoCache[id] = { main: big.url, thumb: small.url };
        cur.images.push({ photo: id, alt: "", label: "", pos: null, w: big.w, h: big.h });
        (cur.uploaded = cur.uploaded || []).push(id);
        drawPhotos(); preview();
      } catch (err) { say($("edit-msg"), "שגיאה בהעלאת " + f.name + ": " + (err.message || err), "err"); return; }
    }
    say($("edit-msg"), "התמונות הועלו. אל תשכחו ללחוץ 'שמירה ופרסום'.", "ok");
  }
  const POS = [["", "מרכז"], ["50% 30%", "למעלה"], ["50% 70%", "למטה"]];
  function drawPhotos() {
    const host = $("photos"); host.innerHTML = "";
    cur.images.forEach((im, i) => {
      const d = document.createElement("div");
      d.className = "ph" + (i === 0 ? " first" : "");
      d.innerHTML = '<img alt=""><div class="ctl"><button type="button" data-m="-1" aria-label="הזזה קדימה">→</button><button type="button" data-m="1" aria-label="הזזה אחורה">←</button>' +
        '<select data-pos aria-label="מיקוד התמונה" style="padding:3px;font-size:12px">' + POS.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join("") + '</select>' +
        '<button type="button" class="danger" data-x aria-label="הסרת התמונה">✕</button></div><input placeholder="תיאור (למשל מבט מלפנים)">';
      d.querySelector("img").src = im.photo ? (photoCache[im.photo] || {}).thumb || "" : (im.thumb || im.src);
      const sel = d.querySelector("[data-pos]");
      sel.value = POS.some(p => p[0] === (im.pos || "")) ? (im.pos || "") : "";
      sel.addEventListener("change", () => { im.pos = sel.value || null; im.thumb_pos = sel.value || null; preview(); });
      const inp = d.querySelector("input"); inp.value = im.label || "";
      inp.addEventListener("input", () => { im.label = inp.value; im.alt = ""; preview(); });
      d.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
        const j = i + Number(b.dataset.m); if (j < 0 || j >= cur.images.length) return;
        [cur.images[i], cur.images[j]] = [cur.images[j], cur.images[i]]; drawPhotos(); preview();
      }));
      d.querySelector("[data-x]").addEventListener("click", () => {
        cur.images.splice(i, 1);
        if (im.photo) (cur.removed = cur.removed || []).push(im.photo);
        drawPhotos(); preview();
      });
      host.appendChild(d);
    });
  }

  // ---------- save / delete ----------
  $("f-edit").addEventListener("submit", async e => {
    e.preventDefault();
    const o = readForm();
    if (!o.model) return say($("edit-msg"), "חסר יצרן ודגם.", "err");
    if (!o.images.length) return say($("edit-msg"), "צריך לפחות תמונה אחת.", "err");
    const isNew = cur.isNew;
    if (isNew) { o.id = crypto.randomUUID().replace(/-/g, ""); o.sort = Date.now(); }
    $("save").disabled = true;
    try {
      const b = writeBatch(db);
      b.set(doc(db, "listings", o.id), toDoc(o));
      (cur.removed || []).forEach(id => b.delete(doc(db, "photos", id)));
      await b.commit();
    } catch (err) { $("save").disabled = false; return say($("edit-msg"), "שגיאה בשמירה: " + err.message, "err"); }
    $("save").disabled = false;
    cur = null;
    await loadList(); view("v-list");
    say($("list-msg"), (isNew ? "פורסם" : "נשמר") + ": " + o.model + " " + (o.year || "") + (o.hidden ? " (מוסתר)" : ". מופיע באתר עכשיו."), "ok");
  });
  $("cancel").addEventListener("click", () => {
    // photos uploaded for a listing that was never saved would be orphans
    if (cur && cur.uploaded) { const b = writeBatch(db); cur.uploaded.forEach(id => b.delete(doc(db, "photos", id))); b.commit().catch(() => {}); }
  });
  $("del").addEventListener("click", () => { const l = listings.find(x => x.id === cur.id); if (l) remove(l); });

  // ---------- one-time import of the cards written in index.html (runs on the first admin login) ----------
  async function importExisting() {
    importing = true;
    say($("list-msg"), "מעביר את הרכבים שכבר באתר למערכת…");
    const page = new DOMParser().parseFromString(await (await fetch("index.html", { cache: "no-store" })).text(), "text/html");
    const T = e => e ? e.textContent.replace(/\s+/g, " ").trim() : "";
    const posOf = el => { const m = (el.getAttribute("style") || "").match(/object-position:\s*([^;"]+)/); return m ? m[1].trim() : null; };
    const base = Date.now() - 100000;
    const rows = [...page.querySelectorAll("ul.cars > li.car")].map((c, i) => {
      const main = c.querySelector("img.main");
      let images = [...c.querySelectorAll(".thumbs button")].map(b => { const ti = b.querySelector("img"); return { src: b.dataset.src, thumb: ti && ti.getAttribute("src"), alt: b.dataset.alt || "", label: b.getAttribute("aria-label") || "", pos: b.dataset.pos || null, thumb_pos: ti ? posOf(ti) : null }; });
      if (!images.length) images = [{ src: main.getAttribute("src"), thumb: null, alt: main.alt, label: "", pos: posOf(main) }];
      if (images[0].src === main.getAttribute("src")) { images[0].w = +main.getAttribute("width") || null; images[0].h = +main.getAttribute("height") || null; if (!images[0].pos) images[0].pos = posOf(main); }
      const priceEl = c.querySelector(".price"), s = priceEl.querySelector("s"); const old = s ? toInt(s.textContent) : null; if (s) s.remove();
      const sp = {}; c.querySelectorAll(".specs > div").forEach(d => { sp[T(d.querySelector("dt"))] = T(d.querySelector("dd")); });
      let wa = null; try { wa = new URL(c.querySelector("a.cta").href).searchParams.get("text"); } catch (err) { /* default message */ }
      const cn = c.querySelector(".card-note");
      return { id: crypto.randomUUID().replace(/-/g, ""), sort: base + i, kind: c.dataset.kind === "moto" ? "moto" : "car",
        model: T(c.querySelector(".model")), subtitle: T(c.querySelector(".trim")) || null,
        price: toInt(priceEl.textContent), old_price: old, year: sp["שנה"] || "", km: sp["ק״מ"] || "", hand: sp["יד"] || "",
        key_specs: [...c.querySelectorAll(".key-specs > div")].map(d => { const dd = d.querySelector("dd"); const o = { k: T(d.querySelector("dt")), v: T(dd) }; if ((dd.getAttribute("style") || "").includes("font-size")) o.small = true; return o; }),
        details: [...c.querySelectorAll(".details > li")].map(li => { const sp2 = li.querySelectorAll("span"); return { k: T(sp2[0]), v: T(sp2[1]) }; }),
        features: [...c.querySelectorAll(".features > li")].map(T), note: T(c.querySelector(".note")) || null,
        card_note: T(cn) || null, card_warn: !!(cn && cn.classList.contains("warn")), illus: !!c.querySelector(".illus"), deal: c.hasAttribute("data-deal"),
        hidden: false, images, wa_text: wa };
    });
    try {
      const b = writeBatch(db);
      rows.forEach(r => b.set(doc(db, "listings", r.id), toDoc(r)));
      await b.commit();
    } catch (err) { importing = false; return say($("list-msg"), "שגיאה בהעברת הרכבים: " + err.message, "err"); }
    await loadList();
    importing = false;
    say($("list-msg"), "הועברו " + rows.length + " רכבים מהאתר. מעכשיו מנהלים הכול מכאן.", "ok");
  }
}
