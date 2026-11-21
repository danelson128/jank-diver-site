/* Printings, prices and shop links for one card. Shared by the card popup (app.js)
   and the card pages (cards/<slug>/). Exposes window.JDGBuy. */
(() => {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // All paper printings of a card, oldest first, from Scryfall. Fetched only when a
  // visitor looks at a card. Scryfall asks apps to keep its data for at least 24 hours,
  // so the result is kept in the browser's storage for that long (and in memory for the visit).
  const DAY = 24 * 60 * 60 * 1000;
  const cache = new Map();
  const stored = (key) => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v && Date.now() - v.t < DAY ? v.data : null;
    } catch { return null; }
  };
  const store = (key, data) => {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch { /* storage full or blocked */ }
  };
  function loadPrintings(name) {
    const front = name.split(" // ")[0];
    if (!cache.has(front)) {
      const key = `jdg-prints:${front}`;
      const saved = stored(key);
      if (saved) { cache.set(front, Promise.resolve(saved)); return cache.get(front); }
      const q = new URLSearchParams({ q: `!"${front}" game:paper`, unique: "prints", order: "released", dir: "asc" });
      cache.set(front, fetch(`https://api.scryfall.com/cards/search?${q}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((d) => d.data.map((c) => {
          const face = c.image_uris || c.card_faces?.[0]?.image_uris || {};
          const back = c.card_faces?.[1]?.image_uris || null;
          return {
            set: c.set, setName: c.set_name, num: c.collector_number, date: c.released_at,
            image: face.large || face.normal || "", back: back?.large || back?.normal || "",
            usd: c.prices?.usd, usdFoil: c.prices?.usd_foil, eur: c.prices?.eur,
            tcgplayerId: c.tcgplayer_id, cardmarketId: c.cardmarket_id, scryfall: c.scryfall_uri,
          };
        }))
        .then((prints) => { store(key, prints); return prints; })
        .catch((err) => { cache.delete(front); throw err; }));
    }
    return cache.get(front);
  }

  // Wrap a shop URL with the affiliate link template from data/site.json, if one is
  // set. The template uses {url} for the encoded product URL.
  function shopUrl(shops, shop, url) {
    const tpl = shops?.[shop]?.affiliate;
    return tpl ? tpl.replace("{url}", encodeURIComponent(url)) : url;
  }

  // Do not use Scryfall's "purchase_uris": they carry Scryfall's own affiliate code.
  function shopLinks(shops, name, p) {
    const out = [];
    const tcg = p?.tcgplayerId
      ? `https://www.tcgplayer.com/product/${p.tcgplayerId}`
      : `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(name.split(" // ")[0])}`;
    out.push(`<a class="btn-cta" href="${esc(shopUrl(shops, "tcgplayer", tcg))}" target="_blank" rel="noopener sponsored">Buy on TCGplayer</a>`);
    if (p?.cardmarketId) {
      const cm = `https://www.cardmarket.com/en/Magic/Products?idProduct=${p.cardmarketId}`;
      out.push(`<a class="btn-tile" href="${esc(shopUrl(shops, "cardmarket", cm))}" target="_blank" rel="noopener sponsored">Cardmarket</a>`);
    }
    return out.join("");
  }

  const money = (v, sign) => (v ? `${sign}${Number(v).toFixed(2)}` : "");
  function priceLine(p) {
    const parts = [money(p.usd, "$"), money(p.usdFoil, "$") && `foil ${money(p.usdFoil, "$")}`, money(p.eur, "€")].filter(Boolean);
    return parts.length ? parts.join(" · ") : "No price data";
  }

  // The markup for the printing picker, prices and shop buttons.
  // `info` is the card's entry in data/cards.json (may be null).
  function html(shops, name, info) {
    return `<div class="buy">
      <label class="label jdg-printing-label">Printing</label>
      <select class="jdg-printing" disabled aria-label="Printing"><option>${info ? `${esc(info.set_name)} (${esc(info.set.toUpperCase())}) #${esc(info.collector_number)}` : "Loading printings…"}</option></select>
      <div class="price mono jdg-price">Loading prices…</div>
      <div class="shop-row jdg-shops">${shopLinks(shops, name, null)}</div>
      <p class="fine mono">Prices from <a class="jdg-sf" href="${esc(info?.scryfall_uri || "https://scryfall.com")}" target="_blank" rel="noopener">Scryfall</a>, updated daily.</p>
    </div>`;
  }

  // Bring a block made by html() to life. `img` is the big card image that should
  // follow the chosen printing; `flip` an optional "Flip card" button.
  // `alive()` returns false once the block is gone (e.g. the popup was closed).
  function wire(root, { shops, name, info, img, flip, alive = () => true }) {
    const sel = root.querySelector(".jdg-printing");
    const label = root.querySelector(".jdg-printing-label");
    const price = root.querySelector(".jdg-price");
    const shopRow = root.querySelector(".jdg-shops");
    const sf = root.querySelector(".jdg-sf");
    // The printing on screen. Starts as the site's printing (the first paper printing).
    let cur = { image: info?.image?.large || "", back: info?.back_image?.large || "" };
    let back = false;
    if (flip) flip.addEventListener("click", () => {
      back = !back;
      if (img) img.src = back && cur.back ? cur.back : cur.image;
    });
    const show = (p) => {
      cur = p;
      back = false;
      if (img && p.image) img.src = p.image;
      price.textContent = priceLine(p);
      shopRow.innerHTML = shopLinks(shops, name, p);
      if (p.scryfall) sf.href = p.scryfall;
    };
    loadPrintings(name).then((prints) => {
      if (!alive() || !prints.length) return;
      const start = Math.max(0, prints.findIndex((p) => info && p.set === info.set && p.num === info.collector_number));
      sel.innerHTML = prints.map((p, i) =>
        `<option value="${i}"${i === start ? " selected" : ""}>${esc(p.setName)} (${esc(p.set.toUpperCase())}) #${esc(p.num)} · ${esc((p.date || "").slice(0, 4))}${p.usd ? ` · $${Number(p.usd).toFixed(2)}` : ""}</option>`).join("");
      sel.disabled = prints.length < 2;
      label.textContent = `Printing (${prints.length})`;
      sel.addEventListener("change", () => show(prints[Number(sel.value)]));
      show(prints[start]);
    }).catch(() => {
      if (alive()) price.textContent = "Could not load printings right now.";
    });
  }

  window.JDGBuy = { html, wire };
})();
