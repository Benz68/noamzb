// Builds a car card (li.car) from a listing row, with the same markup as the hand-written cards.
// Used by the public page (listings from the database) and by the admin panel's live preview.
(function () {
  const WA = { car: "972523748060", moto: "972587514898" };   // WhatsApp for car enquiries / motorcycle enquiries
  const WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>';

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // escape, then keep Latin runs (model names, units) in <bdi> so they sit right inside Hebrew text
  const LATIN = /[A-Za-z][A-Za-z0-9\-+./&' ]*[A-Za-z0-9+]|[A-Za-z]/g;
  const txt = s => {
    s = String(s == null ? "" : s);
    let out = "", last = 0;
    s.replace(LATIN, (m, at) => { out += esc(s.slice(last, at)) + "<bdi>" + esc(m) + "</bdi>"; last = at + m.length; return m; });
    return out + esc(s.slice(last));
  };
  const money = n => Number(n).toLocaleString("en-US") + " ₪";
  const pos = p => p ? ' style="object-position:' + esc(p) + '"' : "";

  // photos uploaded in the admin panel live in the database (photos/{id}); until they're fetched the card shows a
  // blank placeholder and carries data-ph, and loadPhotos() fills them in. opts.photos = {id: {main, thumb}} skips that
  const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  let known = {};
  const srcOf = im => im.photo ? (known[im.photo] ? known[im.photo].main : BLANK) : im.src;
  const thumbOf = im => im.photo ? (known[im.photo] ? known[im.photo].thumb : BLANK) : (im.thumb || im.src);
  const ph = im => im.photo && !known[im.photo] ? ' data-ph="' + esc(im.photo) + '"' : "";

  function renderCard(l, opts = {}) {
    known = opts.photos || {};
    const imgs = (l.images || []).filter(i => i && (i.src || i.photo));
    const first = imgs[0] || { src: "", alt: "" };
    const kind = l.kind === "moto" ? ' data-kind="moto"' : "";
    const deal = l.deal ? " data-deal" : "";
    const id = l.id ? ' data-id="' + esc(l.id) + '"' : "";
    const load = opts.eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"';
    const size = first.w && first.h ? ' width="' + first.w + '" height="' + first.h + '"' : "";

    let h = '<li class="car"' + id + kind + deal + '>\n<div class="gallery">';
    if (l.deal) h += '<span class="deal-tag">ממומן</span>';
    if (l.illus) h += '<span class="illus">תמונות להמחשה</span>';
    h += '<img class="main"' + load + ' src="' + esc(srcOf(first)) + '"' + ph(first) + ' alt="' + esc(first.alt) + '"' + size + pos(first.pos) + '>';
    if (imgs.length > 1) {
      h += '<div class="thumbs">';
      imgs.forEach((im, i) => {
        h += '<button type="button" aria-pressed="' + (i === 0) + '" aria-label="' + esc(im.label || "תמונה " + (i + 1)) + '" data-src="' + esc(srcOf(im)) + '"' + ph(im) +
          (im.pos ? ' data-pos="' + esc(im.pos) + '"' : "") + ' data-alt="' + esc(im.alt) + '"><img src="' + esc(thumbOf(im)) + '" alt="" loading="lazy"' + pos(im.thumb_pos || im.pos) + '></button>';
      });
      h += '</div>';
    }
    h += '</div>\n<div class="car-body"><div class="car-head"><div><h2 class="model">' + txt(l.model) + '</h2>';
    if (l.subtitle) h += '<p class="trim">' + txt(l.subtitle) + '</p>';
    h += '</div><p class="price">' + (l.price ? money(l.price) : "לפרטים") + (l.old_price ? "<s>" + money(l.old_price) + "</s>" : "") + '</p></div>';
    h += '<dl class="specs"><div><dt>שנה</dt><dd>' + esc(l.year) + '</dd></div><div><dt>ק״מ</dt><dd>' + esc(l.km) + '</dd></div><div><dt>יד</dt><dd>' + esc(l.hand) + '</dd></div></dl>';
    const ks = (l.key_specs || []).filter(s => s && s.k);
    if (ks.length) {
      h += '<dl class="key-specs">' + ks.map(s => '<div><dt>' + txt(s.k) + '</dt><dd' + (s.small ? ' style="font-size:13px"' : "") + '>' + txt(s.v) + '</dd></div>').join("") + '</dl>';
    }
    const det = (l.details || []).filter(d => d && d.k);
    const feat = (l.features || []).filter(Boolean);
    if (det.length || feat.length || l.note) {
      h += '<details class="more"><summary>כל הפרטים והאבזור</summary>';
      if (det.length) h += '<ul class="details">' + det.map(d => '<li><span>' + txt(d.k) + '</span><span>' + txt(d.v) + '</span></li>').join("") + '</ul>';
      if (feat.length) h += '<ul class="features" aria-label="אבזור">' + feat.map(f => '<li>' + txt(f) + '</li>').join("") + '</ul>';
      if (l.note) h += '<p class="note">' + txt(l.note) + '</p>';
      h += '</details>';
    }
    if (l.card_note) h += '<p class="card-note' + (l.card_warn ? " warn" : "") + '">' + txt(l.card_note) + '</p>';
    const msg = l.wa_text || ("היי, אני מתעניין ב" + (l.kind === "moto" ? "אופנוע " : "-") + l.model + " " + l.year + " שראיתי באתר");
    h += '<a class="cta" href="https://wa.me/' + (l.kind === "moto" ? WA.moto : WA.car) + '?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener">' + WA_ICON + ' לפרטים בוואטסאפ</a>';
    h += '</div>\n</li>';
    return h;
  }

  // fill in database photos for one card: fetch(ids) must resolve to {id: {main, thumb}}
  async function loadPhotos(card, fetch) {
    const els = [...card.querySelectorAll("[data-ph]")];
    if (!els.length) return;
    const got = await fetch([...new Set(els.map(e => e.dataset.ph))]);
    els.forEach(e => {
      const p = got[e.dataset.ph];
      if (!p) return;
      if (e.tagName === "BUTTON") { e.dataset.src = p.main; const t = e.querySelector("img"); if (t) t.src = p.thumb; }
      else e.src = p.main;
      e.removeAttribute("data-ph");
    });
  }

  window.SSCards = { renderCard, loadPhotos, esc };
})();
