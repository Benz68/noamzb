// Read-only access to the listings database (Firestore REST API) for the public page.
// Each listing document holds {sort, hidden, data}; data is the listing as JSON (see cards.js for its fields).
// Photos uploaded in the admin panel are separate documents photos/{id} = {main, thumb} (JPEG data URLs).
(function () {
  const cfg = window.SS_CONFIG || {};
  const root = "projects/" + cfg.projectId + "/databases/(default)/documents";
  const api = "https://firestore.googleapis.com/v1/" + root;
  const post = (path, body, signal) => fetch(api + path + "?key=" + encodeURIComponent(cfg.apiKey), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal
  }).then(r => { if (!r.ok) throw new Error("Firestore " + r.status); return r.json(); });

  async function listings(signal) {
    const res = await post(":runQuery", { structuredQuery: {
      from: [{ collectionId: "listings" }],
      where: { fieldFilter: { field: { fieldPath: "hidden" }, op: "EQUAL", value: { booleanValue: false } } }
    } }, signal);
    return res.filter(x => x.document).map(x => {
      try {
        const f = x.document.fields;
        const l = JSON.parse(f.data.stringValue);
        l.id = x.document.name.split("/").pop();
        l.sort = Number(f.sort.integerValue != null ? f.sort.integerValue : f.sort.doubleValue);
        return l.model ? l : null;
      } catch (e) { return null; }   // one broken listing shouldn't hide the rest
    }).filter(Boolean).sort((a, b) => a.sort - b.sort);
  }

  const cache = {};
  async function photos(ids) {
    const need = ids.filter(id => !cache[id]);
    if (need.length) {
      const res = await post(":batchGet", { documents: need.map(id => root + "/photos/" + id) });
      res.forEach(x => {
        if (x.found) cache[x.found.name.split("/").pop()] = { main: x.found.fields.main.stringValue, thumb: x.found.fields.thumb.stringValue };
      });
    }
    const out = {};
    ids.forEach(id => { if (cache[id]) out[id] = cache[id]; });
    return out;
  }

  window.SSStore = { ready: !!(cfg.projectId && cfg.apiKey), listings, photos };
})();
