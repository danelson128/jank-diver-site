/* Jank Diver Gaming site. No build step: plain JS, hash routing, static JSON data. */
(() => {
  "use strict";

  const TIERS = ["S", "A", "B", "C", "D", "F"];
  const app = document.getElementById("app");
  const state = { site: null, lists: [], cards: {}, index: new Map() };

  /* ---------- Helpers ---------- */

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/’/g, "'").trim().toLowerCase();
  const slugOf = (file) => file.replace(/\.json$/i, "");
  const tierColor = (t) => `var(--tier-${TIERS.includes(t) ? t : "F"})`;

  function gradeLabel(c) {
    if (c.grade) return String(c.grade).replace(/-$/, "−");
    const mod = Number(c.mod) || 0;
    return c.tier + (mod > 0 ? "+" : mod === -1 ? "−" : mod <= -2 ? "⊘" : "");
  }
  // Lower is better. Used to sort cards inside and across tiers.
  const gradeScore = (c) => TIERS.indexOf(c.tier) * 10 - (Number(c.mod) || 0);

  function youtubeId(v) {
    if (!v) return "";
    const m = String(v).match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
    return m ? m[1] : /^[\w-]{11}$/.test(v) ? v : "";
  }
  const ytWatch = (id) => `https://www.youtube.com/watch?v=${id}`;
  const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  // Dates are plain "YYYY-MM-DD" or ISO strings. Show them in the local style.
  // An approximate date shows only the month.
  const fmtDate = (d, approx = false) => {
    if (!d) return "";
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00") : new Date(d);
    return approx
      ? "~" + dt.toLocaleDateString(undefined, { year: "numeric", month: "short" })
      : dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  const cardInfo = (name) => state.cards[norm(name)] || null;

  function artHTML(name, size = "normal") {
    const info = cardInfo(name);
    const src = info?.image?.[size] || info?.image?.normal;
    return src
      ? `<img src="${esc(src)}" alt="${esc(name)}" loading="lazy">`
      : `<span class="fallback">${esc(name)}</span>`;
  }

  function cardHTML(c, { highlight = false } = {}) {
    const g = gradeLabel(c);
    return `<button class="card${highlight ? " highlight" : ""}" data-card="${esc(c.name)}" title="${esc(c.name)} — ${esc(g)}">
      <span class="art">${artHTML(c.name)}</span>
      <span class="grade" style="background:${tierColor(c.tier)}">${esc(g)}</span>
      <span class="name">${esc(c.name)}</span>
    </button>`;
  }

  function distHTML(list) {
    const counts = TIERS.map((t) => list.cards.filter((c) => c.tier === t).length);
    return `<div class="dist" aria-label="Tier spread">${TIERS.map((t, i) =>
      counts[i] ? `<span style="width:${(counts[i] / list.cards.length) * 100}%;background:${tierColor(t)}" title="${t}: ${counts[i]}"></span>` : ""
    ).join("")}</div>`;
  }

  /* ---------- Data ---------- */

  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }

  async function load() {
    const [site, manifest, cards, videos] = await Promise.all([
      getJSON("data/site.json"),
      getJSON("data/tierlists.json"),
      getJSON("data/cards.json").catch(() => ({})),
      getJSON("data/videos.json").catch(() => []),
    ]);
    state.site = site;
    state.cards = cards;
    state.videos = videos.map((v) => ({ ...v, youtube: youtubeId(v.id || v.youtube) }));
    const videoById = new Map(state.videos.map((v) => [v.youtube, v]));
    const lists = await Promise.all(manifest.map(async (m) => {
      const data = await getJSON(`data/tierlists/${m.file}`);
      const seen = new Set();
      const cardsIn = data.cards.filter((c) => {
        const k = norm(c.name);
        if (seen.has(k)) return false; // Remove repeat entries.
        seen.add(k);
        return true;
      });
      const yt = youtubeId(m.youtube);
      const video = videoById.get(yt);
      return {
        slug: slugOf(m.file),
        title: data.title,
        date: m.date || video?.date || data.exported,
        dateApprox: !m.date && !!video?.date_approx,
        youtube: yt,
        videoTitle: video?.title || "",
        description: m.description || "",
        cards: cardsIn,
      };
    }));
    state.lists = lists.sort((a, b) => new Date(b.date) - new Date(a.date));

    for (const list of state.lists) {
      for (const c of list.cards) {
        const k = norm(c.name);
        if (!state.index.has(k)) state.index.set(k, { name: c.name, entries: [] });
        state.index.get(k).entries.push({ list, card: c });
      }
    }
  }

  // All videos from data/videos.json, linked to their tier lists.
  // Tier lists with no video yet show as "coming soon" tiles.
  function allVideos() {
    const listByVideo = new Map(state.lists.filter((l) => l.youtube).map((l) => [l.youtube, l]));
    const vids = state.videos.map((v, i) => ({
      title: v.title, date: v.date, approx: !!v.date_approx, youtube: v.youtube,
      tierlist: listByVideo.get(v.youtube)?.slug || "", kind: v.kind || "Video", i,
    }));
    const known = new Set(vids.map((v) => v.youtube));
    const pending = state.lists.filter((l) => !l.youtube || !known.has(l.youtube)).map((l) => ({
      title: l.title, date: l.date, approx: false, youtube: l.youtube, tierlist: l.slug, kind: "Tier List", i: -1,
    }));
    return [...pending, ...vids].sort((a, b) => new Date(b.date) - new Date(a.date) || a.i - b.i);
  }

  /* ---------- Search ---------- */

  function search(q) {
    const nq = norm(q);
    if (!nq) return [];
    const out = [];
    for (const [k, v] of state.index) {
      let score = -1;
      if (k === nq) score = 0;
      else if (k.startsWith(nq)) score = 1;
      else if (k.split(/[\s,'/-]+/).some((w) => w.startsWith(nq))) score = 2;
      else if (k.includes(nq)) score = 3;
      if (score >= 0) out.push({ ...v, score });
    }
    return out.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  }

  /* ---------- Views ---------- */

  function videoTile(v) {
    const list = state.lists.find((l) => l.slug === v.tierlist);
    const href = v.youtube ? ytWatch(v.youtube) : list ? `#/tierlist/${list.slug}` : "#/videos";
    const ext = v.youtube ? ' target="_blank" rel="noopener"' : "";
    const thumb = v.youtube
      ? `<img src="${ytThumb(v.youtube)}" alt="" loading="lazy"><span class="play">▶ Watch</span>`
      : `<div class="thumb-placeholder"><div>${esc(v.title)}<small>Video coming soon</small></div></div>`;
    return `<article class="tile">
      <a class="thumb" href="${href}"${ext}>${thumb}</a>
      <div class="tile-body">
        <span class="tile-meta">${esc(v.kind)} · ${fmtDate(v.date, v.approx)}</span>
        <span class="tile-title">${esc(v.title)}</span>
        ${list ? `<a href="#/tierlist/${list.slug}">View the tier list →</a>` : ""}
      </div>
    </article>`;
  }

  function linkButtons(cls = "btn") {
    return Object.entries(state.site.links || {}).filter(([, url]) => url)
      .map(([k, url]) => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${esc(k)}</a>`).join("");
  }

  function listTile(l) {
    const top = [...l.cards].sort((a, b) => gradeScore(a) - gradeScore(b))[0];
    const art = top && cardInfo(top.name)?.image?.normal;
    return `<a class="tile" href="#/tierlist/${l.slug}">
      <div class="thumb">${art
        ? `<img src="${esc(art)}" alt="" loading="lazy" style="object-position:center 18%">`
        : `<div class="thumb-placeholder">${esc(l.title)}</div>`}</div>
      <div class="tile-body">
        <span class="tile-title">${esc(l.title)}</span>
        <span class="tile-meta">${l.cards.length} cards · ${fmtDate(l.date, l.dateApprox)}${l.youtube ? " · ▶ Video" : " · Video coming soon"}</span>
        ${distHTML(l)}
      </div>
    </a>`;
  }

  function viewHome() {
    const s = state.site;
    const total = state.index.size;
    app.innerHTML = `
      <section class="hero">
        <h1>${esc(s.name)}</h1>
        <p>${esc(s.tagline)} ${total} cards graded across ${state.lists.length} tier lists.</p>
        <form class="hero-search" id="hero-search" role="search">
          <input type="search" name="q" placeholder="Find a card — e.g. Thraben Inspector" aria-label="Search cards" autocomplete="off">
        </form>
        <div class="hero-actions">
          <a class="btn primary" href="#/tierlists">Browse tier lists</a>
          <a class="btn" href="#/rank">Play This or That</a>
          ${linkButtons()}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Latest episodes</h2><a href="#/videos">All videos →</a></div>
        <div class="grid">${allVideos().slice(0, 3).map(videoTile).join("")}</div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Tier lists</h2><a href="#/tierlists">All tier lists →</a></div>
        <div class="grid">${state.lists.slice(0, 6).map(listTile).join("")}</div>
      </section>`;
    document.getElementById("hero-search").addEventListener("submit", (e) => {
      e.preventDefault();
      go(`#/search?q=${encodeURIComponent(e.target.q.value)}`);
    });
  }

  function viewVideos(params) {
    const vids = allVideos();
    const kinds = ["All", ...new Set(vids.map((v) => v.kind))];
    const kind = kinds.includes(params.get("kind")) ? params.get("kind") : "All";
    app.innerHTML = `
      <div class="rank-head">
        <div><h1>Videos</h1><p class="muted" style="margin:0">New Peasant Cube tier lists every Monday.</p></div>
        <div class="list-actions">${linkButtons("btn small")}</div>
      </div>
      <div class="list-actions" style="margin-bottom:16px">
        ${kinds.map((k) => `<a class="btn small" aria-pressed="${k === kind}" href="#/videos${k === "All" ? "" : `?kind=${encodeURIComponent(k)}`}">${esc(k)}</a>`).join("")}
        <input class="grow" type="search" id="video-filter" placeholder="Filter videos…" aria-label="Filter videos">
      </div>
      <div class="grid" id="video-grid"></div>
      <p class="muted" style="margin-top:20px">See every video on <a href="${esc(state.site.links?.YouTube || "#")}" target="_blank" rel="noopener">our YouTube channel ↗</a></p>`;
    const grid = document.getElementById("video-grid");
    const input = document.getElementById("video-filter");
    const draw = () => {
      const f = norm(input.value);
      const shown = vids.filter((v) => (kind === "All" || v.kind === kind) && norm(v.title).includes(f));
      grid.innerHTML = shown.length ? shown.map(videoTile).join("") : `<p class="empty">No videos match.</p>`;
    };
    input.addEventListener("input", draw);
    draw();
  }

  function viewTierlists(params) {
    const q = params.get("q") || "";
    app.innerHTML = `
      <h1>Tier Lists</h1>
      <div class="list-actions" style="margin-bottom:16px">
        <input class="grow" type="search" id="list-filter" placeholder="Filter tier lists…" value="${esc(q)}" aria-label="Filter tier lists">
      </div>
      <div class="grid" id="list-grid"></div>`;
    const grid = document.getElementById("list-grid");
    const render = (f) => {
      const nf = norm(f);
      const ls = state.lists.filter((l) => norm(l.title).includes(nf));
      grid.innerHTML = ls.length ? ls.map(listTile).join("") : `<p class="empty">No tier lists match.</p>`;
    };
    const input = document.getElementById("list-filter");
    input.addEventListener("input", () => render(input.value));
    render(q);
  }

  function viewTierlist(slug, params) {
    const list = state.lists.find((l) => l.slug === slug);
    if (!list) return viewNotFound();
    const focus = norm(params.get("card") || "");
    const mode = params.get("view") === "order" ? "order" : "tiers";

    const tiersHTML = TIERS.filter((t) => t !== "F" || list.cards.some((c) => c.tier === "F")).map((t) => {
      const cs = list.cards.filter((c) => c.tier === t).sort((a, b) => gradeScore(a) - gradeScore(b) || a.order - b.order);
      return `<div class="tier-row${cs.length ? "" : " empty-tier"}">
        <div class="tier-label" style="background:${tierColor(t)}">${t}</div>
        <div class="tier-cards">${cs.map((c) => cardHTML(c, { highlight: norm(c.name) === focus })).join("")}</div>
      </div>`;
    }).join("");

    const orderHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th>Card</th><th>Grade</th><th class="hide-sm">Rarity</th></tr></thead>
      <tbody>${[...list.cards].sort((a, b) => a.order - b.order).map((c, i) => `
        <tr class="${norm(c.name) === focus ? "highlight" : ""}">
          <td>${i + 1}</td>
          <td><button class="link" data-card="${esc(c.name)}">${esc(c.name)}</button></td>
          <td><span class="pill" style="background:${tierColor(c.tier)}">${esc(gradeLabel(c))}</span></td>
          <td class="hide-sm rarity">${esc(c.rarity || "")}</td>
        </tr>`).join("")}</tbody></table></div>`;

    const base = `#/tierlist/${slug}`;
    app.innerHTML = `
      <div class="list-head">
        <a href="#/tierlists">← All tier lists</a>
        <h1>${esc(list.title)}</h1>
        <p class="muted" style="margin:0">${list.cards.length} cards · ${fmtDate(list.date, list.dateApprox)}${list.videoTitle ? ` · <a href="${ytWatch(list.youtube)}" target="_blank" rel="noopener">${esc(list.videoTitle)} ↗</a>` : ""}</p>
        ${list.description ? `<p>${esc(list.description)}</p>` : ""}
        ${list.youtube
          ? `<iframe class="video-embed" src="https://www.youtube-nocookie.com/embed/${list.youtube}" title="${esc(list.title)} video" allowfullscreen loading="lazy"></iframe>`
          : `<p class="muted">Video coming soon.</p>`}
        <div class="list-actions">
          <a class="btn small" aria-pressed="${mode === "tiers"}" href="${base}">Tier view</a>
          <a class="btn small" aria-pressed="${mode === "order"}" href="${base}?view=order">Episode order</a>
        </div>
      </div>
      ${mode === "tiers" ? tiersHTML : orderHTML}`;

    const el = app.querySelector(".highlight");
    if (el) el.scrollIntoView({ block: "center" });
  }

  function searchResultsHTML(q) {
    const results = search(q);
    if (!q.trim()) return `<p class="empty">Type a card name to find its grade, tier list and video.</p>`;
    if (!results.length) return `<p class="empty">We have not tier listed “${esc(q)}” yet.</p>`;
    return `<p class="muted">${results.length} card${results.length === 1 ? "" : "s"} found.</p>
      <div class="results">${results.slice(0, 60).map(resultHTML).join("")}</div>`;
  }

  function viewSearch(params) {
    const q = params.get("q") || "";
    app.innerHTML = `
      <h1>Card search</h1>
      <div class="list-actions" style="margin-bottom:16px">
        <input class="grow" type="search" id="search-page-input" value="${esc(q)}" placeholder="Search cards…" aria-label="Search cards" autocomplete="off">
      </div>
      <div id="search-results">${searchResultsHTML(q)}</div>`;
    const input = document.getElementById("search-page-input");
    input.addEventListener("input", debounce(() => {
      history.replaceState(null, "", `#/search?q=${encodeURIComponent(input.value)}`);
      headerInput.value = input.value;
      document.getElementById("search-results").innerHTML = searchResultsHTML(input.value);
    }, 150));
  }

  function appearancesHTML(entries) {
    return entries.map(({ list, card }) => `
      <div class="appearance">
        <span class="pill" style="background:${tierColor(card.tier)}">${esc(gradeLabel(card))}</span>
        <a class="list-link" href="#/tierlist/${list.slug}?card=${encodeURIComponent(card.name)}">${esc(list.title)}</a>
        <span class="tile-meta">${fmtDate(list.date, list.dateApprox)}</span>
        ${list.youtube ? `<a href="${ytWatch(list.youtube)}" target="_blank" rel="noopener">▶ Watch review</a>` : `<span class="tile-meta">Video coming soon</span>`}
      </div>`).join("");
  }

  function resultHTML(r) {
    const first = r.entries[0].card;
    const info = cardInfo(r.name);
    return `<article class="result">
      ${cardHTML(first)}
      <div>
        <h3>${esc(r.name)}</h3>
        ${info ? `<p class="tile-meta" style="margin:0 0 8px">${esc(info.type_line)}</p>` : ""}
        <div class="appearances">${appearancesHTML(r.entries)}</div>
      </div>
    </article>`;
  }

  function viewNotFound() {
    app.innerHTML = `<h1>Page not found</h1><p><a href="#/">Go to the home page</a></p>`;
  }

  /* ---------- This or That (local beta) ---------- */

  const RANK_KEY = "jdg-rank-v1";
  function loadRatings() {
    try { return JSON.parse(localStorage.getItem(RANK_KEY)) || {}; } catch { return {}; }
  }
  function saveRatings(r) {
    try { localStorage.setItem(RANK_KEY, JSON.stringify(r)); } catch { /* storage off: keep in memory */ }
  }

  function viewRank(params) {
    const pool = [...state.index.values()];
    let ratings = loadRatings();
    const showResults = params.get("view") === "results";
    const votes = Object.values(ratings).reduce((n, r) => n + r.n, 0) / 2;

    if (showResults) {
      const rows = pool.filter((c) => ratings[norm(c.name)]?.n)
        .map((c) => ({ ...c, r: ratings[norm(c.name)] }))
        .sort((a, b) => b.r.elo - a.r.elo);
      // Split the ranked cards into tiers by position (top 10% S, next 20% A ...).
      const cuts = [0.1, 0.3, 0.6, 0.85, 1];
      const tierAt = (i) => TIERS[cuts.findIndex((c) => (i + 1) / rows.length <= c)];
      app.innerHTML = `
        <div class="rank-head"><div><h1>Your rankings</h1><p class="muted" style="margin:0">${Math.round(votes)} votes on this device.</p></div>
          <div class="list-actions"><a class="btn primary" href="#/rank">Keep playing</a><button class="btn" id="reset">Reset</button></div></div>
        ${rows.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>#</th><th>Card</th><th>Your tier</th><th>Jank Diver grade</th><th class="hide-sm">Votes</th></tr></thead>
          <tbody>${rows.map((c, i) => `<tr>
            <td>${i + 1}</td>
            <td><button class="link" data-card="${esc(c.name)}">${esc(c.name)}</button></td>
            <td><span class="pill" style="background:${tierColor(tierAt(i))}">${tierAt(i)}</span></td>
            <td>${c.entries.map((e) => `<span class="pill" style="background:${tierColor(e.card.tier)}">${esc(gradeLabel(e.card))}</span>`).join(" ")}</td>
            <td class="hide-sm">${c.r.n}</td></tr>`).join("")}</tbody></table></div>`
          : `<p class="empty">No votes yet. <a href="#/rank">Start playing</a>.</p>`}`;
      document.getElementById("reset").addEventListener("click", () => {
        if (confirm("Delete all your votes on this device?")) { saveRatings({}); render(); }
      });
      return;
    }

    const pick2 = () => {
      const a = Math.floor(Math.random() * pool.length);
      let b = Math.floor(Math.random() * (pool.length - 1));
      if (b >= a) b++;
      return [pool[a], pool[b]];
    };
    let pair = pick2();

    app.innerHTML = `
      <div class="rank-head">
        <div><h1>This or That</h1><p class="muted" style="margin:0">Which card would you rather pick for Peasant Cube?</p></div>
        <a class="btn" href="#/rank?view=results"><span>Your rankings (<span id="vote-count">${Math.round(votes)}</span>)</span></a>
      </div>
      <div class="duel" id="duel"></div>
      <div class="duel-actions"><button class="btn" id="skip">Skip (S)</button></div>
      <p class="notice">Beta: your votes stay on this device for now. Community tiers from all players are coming next.</p>`;

    const duel = document.getElementById("duel");
    const draw = () => {
      duel.innerHTML = pair.map((c, i) => `
        <button class="choice" data-pick="${i}">
          <span class="art">${artHTML(c.name, "large")}</span>
          <span>${esc(c.name)}</span><span class="key">Press ${i + 1}</span>
        </button>${i === 0 ? '<span class="vs">VS</span>' : ""}`).join("");
    };
    const vote = (i) => {
      const [w, l] = i === 0 ? pair : [pair[1], pair[0]];
      ratings = loadRatings();
      const rw = ratings[norm(w.name)] ||= { elo: 1500, n: 0 };
      const rl = ratings[norm(l.name)] ||= { elo: 1500, n: 0 };
      const exp = 1 / (1 + 10 ** ((rl.elo - rw.elo) / 400));
      const k = 32;
      rw.elo += k * (1 - exp); rl.elo -= k * (1 - exp);
      rw.n++; rl.n++;
      saveRatings(ratings);
      const vc = document.getElementById("vote-count");
      vc.textContent = Number(vc.textContent) + 1;
      pair = pick2(); draw();
    };
    duel.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pick]");
      if (b) vote(Number(b.dataset.pick));
    });
    document.getElementById("skip").addEventListener("click", () => { pair = pick2(); draw(); });
    rankKeys = (e) => {
      if (e.target.matches("input, textarea")) return;
      if (e.key === "1" || e.key === "ArrowLeft") vote(0);
      else if (e.key === "2" || e.key === "ArrowRight") vote(1);
      else if (e.key.toLowerCase() === "s") { pair = pick2(); draw(); }
    };
    draw();
  }
  let rankKeys = null;
  document.addEventListener("keydown", (e) => { if (rankKeys && location.hash.startsWith("#/rank") && !/view=results/.test(location.hash)) rankKeys(e); });

  /* ---------- Card modal ---------- */

  const modal = document.getElementById("card-modal");
  const modalBody = document.getElementById("modal-body");
  function openCard(name) {
    const entry = state.index.get(norm(name));
    if (!entry) return;
    const info = cardInfo(name);
    modalBody.innerHTML = `
      <div>
        <div class="big-art">${artHTML(name, "large")}</div>
        ${info?.back_image ? `<button class="btn small" id="flip" style="margin-top:8px">Flip card</button>` : ""}
      </div>
      <div>
        <h2 id="modal-title">${esc(entry.name)}</h2>
        ${info ? `<p class="tile-meta">${esc(info.type_line)}<br>Shown: ${esc(info.set_name)} (${esc(info.set.toUpperCase())}) #${esc(info.collector_number)}</p>` : ""}
        <h3 style="font-size:1rem;margin-top:16px">Our grades</h3>
        <div class="appearances">${appearancesHTML(entry.entries)}</div>
        ${info?.scryfall_uri ? `<p style="margin-top:16px"><a href="${esc(info.scryfall_uri)}" target="_blank" rel="noopener">View on Scryfall ↗</a></p>` : ""}
      </div>`;
    const flip = document.getElementById("flip");
    if (flip) {
      let back = false;
      flip.addEventListener("click", () => {
        back = !back;
        const img = modalBody.querySelector(".big-art img");
        img.src = back ? info.back_image.large : info.image.large;
      });
    }
    modal.hidden = false;
    modal.querySelector(".modal-close").focus();
  }
  function closeCard() { modal.hidden = true; }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeCard(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeCard(); });
  app.addEventListener("click", (e) => {
    const c = e.target.closest("[data-card]");
    if (c) openCard(c.dataset.card);
  });
  modalBody.addEventListener("click", (e) => { if (e.target.closest("a")) closeCard(); });

  /* ---------- Router ---------- */

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function go(hash) { location.hash = hash; }

  const headerInput = document.getElementById("header-search-input");
  function syncHeaderSearch() {
    const [path, qs] = location.hash.slice(1).split("?");
    headerInput.value = path === "/search" ? new URLSearchParams(qs).get("q") || "" : "";
  }
  document.getElementById("header-search").addEventListener("submit", (e) => {
    e.preventDefault();
    go(`#/search?q=${encodeURIComponent(headerInput.value)}`);
  });
  headerInput.addEventListener("input", debounce(() => {
    if (headerInput.value.trim()) {
      const target = `#/search?q=${encodeURIComponent(headerInput.value)}`;
      if (location.hash.startsWith("#/search")) {
        history.replaceState(null, "", target);
        const pi = document.getElementById("search-page-input");
        if (pi) pi.value = headerInput.value;
        document.getElementById("search-results").innerHTML = searchResultsHTML(headerInput.value);
      } else go(target);
      headerInput.focus();
    }
  }, 250));

  function render() {
    closeCard();
    rankKeys = null;
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const params = new URLSearchParams(qs || "");
    const parts = path.split("/").filter(Boolean);
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === (parts[0] === "tierlist" ? "tierlists" : parts[0])));
    const titles = { videos: "Videos", tierlists: "Tier Lists", rank: "This or That", search: "Card search" };
    switch (parts[0]) {
      case undefined: viewHome(); break;
      case "videos": viewVideos(params); break;
      case "tierlists": viewTierlists(params); break;
      case "tierlist": viewTierlist(decodeURIComponent(parts[1] || ""), params); break;
      case "search": viewSearch(params); break;
      case "rank": viewRank(params); break;
      default: viewNotFound();
    }
    const list = parts[0] === "tierlist" && state.lists.find((l) => l.slug === parts[1]);
    document.title = `${list ? list.title : titles[parts[0]] || "Peasant Cube tier lists"} · Jank Diver Gaming`;
    if (!params.get("card")) window.scrollTo(0, 0);
    if (parts[0] !== "search") syncHeaderSearch();
  }

  window.addEventListener("hashchange", render);
  load().then(render).catch((err) => {
    console.error(err);
    app.innerHTML = `<h1>Could not load data</h1><p class="muted">${esc(err.message)}</p>
      <p class="muted">Open the site through a web server (for example <code>python3 -m http.server</code>), not as a local file.</p>`;
  });
})();
