/* Jank Diver Gaming site. No build step: plain JS, hash routing, static JSON data. */
(() => {
  "use strict";

  const TIERS = ["S", "A", "B", "C", "D", "F"];
  const MODS = [1, 0, -1];
  const MOD_SIGN = { 1: "+", 0: "", "-1": "−" };
  const app = document.getElementById("app");
  const state = { site: {}, lists: [], cards: {}, videos: [], index: new Map() };

  /* ---------- Helpers ---------- */

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/’/g, "'").trim().toLowerCase();
  const slugOf = (file) => file.replace(/\.json$/i, "");
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // Shown grades are +, plain or −. A ★ (2) shows as + and a ⊘ (−2) shows as −;
  // they still sort first or last inside their grade (see rawMod in bestFirst).
  const rawMod = (c) => Number(c.mod) || 0;
  const modOf = (c) => Math.max(-1, Math.min(1, rawMod(c)));
  const gradeLabel = (c) => c.tier + MOD_SIGN[modOf(c)];
  // Position on the full grade scale, S+ = 0 ... D− = 14. Lower is better.
  const gradeIndex = (c) => Math.max(0, TIERS.indexOf(c.tier)) * MODS.length + MODS.indexOf(modOf(c));
  // Green for the best grades, red for the worst.
  const gradeColor = (i) => `hsl(${Math.round(140 * (1 - Math.min(i, 14) / 14))} 72% 50%)`;
  const tierColor = (t) => gradeColor(TIERS.indexOf(t) * MODS.length + 1);
  const cardGradeColor = (c) => gradeColor(gradeIndex(c));

  function youtubeId(v) {
    if (!v) return "";
    const m = String(v).match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
    return m ? m[1] : /^[\w-]{11}$/.test(v) ? v : "";
  }
  const ytWatch = (id) => `https://www.youtube.com/watch?v=${id}`;
  const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

  // Dates are "YYYY-MM-DD" or ISO strings. An approximate date shows only the month.
  const fmtDate = (d, approx = false) => {
    if (!d) return "";
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00") : new Date(d);
    return approx
      ? "~" + dt.toLocaleDateString(undefined, { year: "numeric", month: "short" })
      : dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  const cardInfo = (name) => state.cards[norm(name)] || null;
  const imgSrc = (name, size = "normal") => { const i = cardInfo(name)?.image; return i?.[size] || i?.normal || ""; };
  const imgHTML = (name, size = "normal") => {
    const src = imgSrc(name, size);
    return src ? `<img src="${esc(src)}" alt="${esc(name)}" loading="lazy">` : `<span>${esc(name)}</span>`;
  };
  const gpill = (c) => `<span class="gpill" style="background:${cardGradeColor(c)}">${esc(gradeLabel(c))}</span>`;

  function distHTML(list) {
    const counts = TIERS.map((t) => list.cards.filter((c) => c.tier === t).length);
    return `<div class="dist" aria-hidden="true">${TIERS.map((t, i) =>
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

  // All videos, linked to their tier lists. Tier lists with no video yet show as "coming soon".
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

  /* ---------- Shared pieces ---------- */

  function videoTile(v) {
    const list = state.lists.find((l) => l.slug === v.tierlist);
    const href = v.youtube ? ytWatch(v.youtube) : list ? `#/tierlist/${list.slug}` : "#/videos";
    const ext = v.youtube ? ' target="_blank" rel="noopener"' : "";
    const thumb = v.youtube
      ? `<img src="${ytThumb(v.youtube)}" alt="" loading="lazy">`
      : `<div class="soon"><div>${esc(v.title)}<small>Video coming soon</small></div></div>`;
    return `<a class="video" href="${href}"${ext}>
      <div class="thumb">${thumb}</div>
      <div class="meta">
        <span class="kind"><b>${esc(v.kind)}</b> · ${fmtDate(v.date, v.approx)}</span>
        <span class="title">${esc(v.title)}</span>
      </div>
    </a>`;
  }

  function linkButtons(cls) {
    return Object.entries(state.site.links || {}).filter(([, url]) => url)
      .map(([k, url]) => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${esc(k)}</a>`).join("");
  }

  const bestFirst = (cards) => [...cards].sort((a, b) => gradeIndex(a) - gradeIndex(b) || rawMod(b) - rawMod(a) || a.order - b.order);

  /* ---------- Home ---------- */

  function viewHome() {
    const s = state.site;
    const latest = state.lists[0];
    const miniRows = latest ? TIERS.filter((t) => latest.cards.some((c) => c.tier === t)).map((t) => `
      <div class="mini-row">
        <span class="t" style="border-color:${tierColor(t)}">${t}</span>
        <div class="strip">${bestFirst(latest.cards.filter((c) => c.tier === t)).map((c) =>
          `<button data-card="${esc(c.name)}" title="${esc(c.name)} — ${esc(gradeLabel(c))}">${imgHTML(c.name, "small")}</button>`).join("")}</div>
      </div>`).join("") : "";

    app.innerHTML = `
      <div class="dash">
        <div class="dash-col">
          <section class="panel about">
            <div class="panel-head"><h2>About the channel</h2></div>
            <div class="panel-body">
              <p>${esc(s.tagline)} We grade every card for <strong>Peasant Cube</strong>, one color and slot at a time.</p>
              <ul class="bullets">
                <li>Weekly tier lists</li><li>Set reviews</li>
                <li>The Jank Tank podcast</li><li>Cube drafts</li>
              </ul>
              <p>Join the Discord to talk cube, draft with us and argue about our grades.</p>
              ${s.links?.Discord ? `<a class="btn-cta" href="${esc(s.links.Discord)}" target="_blank" rel="noopener">Join the Discord</a>` : ""}
              <div class="btn-row">${linkButtons("btn-tile")}</div>
            </div>
          </section>
          ${latest ? `<section class="panel">
            <div class="panel-head"><div><h2>Latest tier list</h2><span class="label" style="margin:4px 0 0;color:var(--accent)">${esc(latest.title)}</span></div></div>
            <div class="mini-tiers">${miniRows}</div>
            <div class="panel-foot"><a class="more" href="#/tierlist/${latest.slug}">Full tier list</a></div>
          </section>` : ""}
        </div>

        <div class="dash-col center">
          <section class="panel">
            <div class="panel-head"><h2>Latest content</h2><a class="more" href="#/videos">View all videos</a></div>
            <div class="panel-body"><div class="video-grid">${allVideos().slice(0, 6).map(videoTile).join("")}</div></div>
          </section>
        </div>

        <div class="dash-col">
          <section class="panel">
            <div class="panel-head"><h2>Card search</h2><span class="label" style="margin:0">${state.index.size} cards</span></div>
            <div class="panel-body">
              <form id="home-search" role="search">
                <input type="search" name="q" id="home-q" placeholder="Find a card…" aria-label="Search cards" autocomplete="off">
              </form>
              <div class="quick-results" id="quick"></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Tier lists</h2><a class="more" href="#/tierlists">All</a></div>
            <ul class="list-index">${state.lists.map((l) => `<li><a href="#/tierlist/${l.slug}">
              <span class="name">${esc(l.title)}</span><span class="info">${l.cards.length} cards</span>
              <span class="info" style="grid-column:1/-1">${fmtDate(l.date, l.dateApprox)}${l.youtube ? " · ▶ video" : " · video soon"}</span>
              <span style="grid-column:1/-1">${distHTML(l)}</span></a></li>`).join("")}</ul>
          </section>
        </div>
      </div>`;

    const q = document.getElementById("home-q");
    const quick = document.getElementById("quick");
    q.addEventListener("input", debounce(() => {
      const r = search(q.value);
      quick.innerHTML = !q.value.trim() ? "" : !r.length ? `<p>Not tier listed yet.</p>`
        : r.slice(0, 8).map((x) => {
          const e = x.entries[0];
          return `<a href="#/tierlist/${e.list.slug}?card=${encodeURIComponent(x.name)}"><span>${esc(x.name)}</span>${gpill(e.card)}</a>`;
        }).join("") + (r.length > 8 ? `<a href="#/search?q=${encodeURIComponent(q.value)}"><span class="more">All ${r.length} results</span></a>` : "");
    }, 120));
    document.getElementById("home-search").addEventListener("submit", (e) => {
      e.preventDefault();
      location.hash = `#/search?q=${encodeURIComponent(q.value)}`;
    });
  }

  /* ---------- Videos ---------- */

  function viewVideos(params) {
    const vids = allVideos();
    const counts = vids.reduce((m, v) => m.set(v.kind, (m.get(v.kind) || 0) + 1), new Map());
    const kinds = ["All", ...counts.keys()];
    const kind = kinds.includes(params.get("kind")) ? params.get("kind") : "All";
    const order = params.get("sort") === "oldest" ? "oldest" : "newest";
    const qs = (o) => {
      const p = new URLSearchParams();
      if (o.kind && o.kind !== "All") p.set("kind", o.kind);
      if (o.sort === "oldest") p.set("sort", "oldest");
      const s = p.toString();
      return `#/videos${s ? "?" + s : ""}`;
    };

    app.innerHTML = `
      <div class="library">
        <aside class="lib-side">
          <h2>Library</h2>
          <nav>${kinds.map((k) => `<a class="${k === kind ? "active" : ""}" href="${qs({ kind: k, sort: order })}">${esc(k)} <span>${k === "All" ? vids.length : counts.get(k)}</span></a>`).join("")}</nav>
          <div class="links">${linkButtons("btn-tile")}</div>
        </aside>
        <div class="lib-main">
          <div class="lib-bar">
            <input type="search" id="video-filter" placeholder="Search videos…" aria-label="Search videos">
            <div class="seg">
              <a href="${qs({ kind, sort: "newest" })}" aria-pressed="${order === "newest"}">Newest</a>
              <a href="${qs({ kind, sort: "oldest" })}" aria-pressed="${order === "oldest"}">Oldest</a>
            </div>
          </div>
          <div class="video-grid" id="video-grid"></div>
        </div>
      </div>`;
    const grid = document.getElementById("video-grid");
    const input = document.getElementById("video-filter");
    const draw = () => {
      const f = norm(input.value);
      let shown = vids.filter((v) => (kind === "All" || v.kind === kind) && norm(v.title).includes(f));
      if (order === "oldest") shown = shown.reverse();
      grid.innerHTML = shown.length ? shown.map(videoTile).join("") : `<p class="empty">No videos match.</p>`;
    };
    input.addEventListener("input", draw);
    draw();
  }

  /* ---------- Tier list index ---------- */

  function viewTierlists() {
    app.innerHTML = `
      <div class="page-head"><div><h1>Tier lists</h1><p>${state.lists.length} lists · ${state.index.size} cards graded for Peasant Cube.</p></div></div>
      <div class="list-grid">${state.lists.map((l) => `
        <a class="list-card" href="#/tierlist/${l.slug}">
          <div class="fan">${bestFirst(l.cards).slice(0, 5).map((c) => imgSrc(c.name) ? `<img src="${esc(imgSrc(c.name))}" alt="" loading="lazy">` : "").join("")}</div>
          ${distHTML(l)}
          <div class="body">
            <h2>${esc(l.title)}</h2>
            <span class="info">${l.cards.length} cards · ${fmtDate(l.date, l.dateApprox)} · ${l.youtube ? "▶ video" : "video coming soon"}</span>
          </div>
        </a>`).join("")}</div>`;
  }

  /* ---------- Tier list page ---------- */

  function viewTierlist(slug, params) {
    const list = state.lists.find((l) => l.slug === slug);
    if (!list) return viewNotFound();
    const focus = norm(params.get("card") || "");
    const mode = ["cards", "names", "order"].includes(params.get("view")) ? params.get("view") : "cards";
    const base = `#/tierlist/${slug}`;
    const rarities = ["common", "uncommon", "rare", "mythic"].filter((r) => list.cards.some((c) => c.rarity === r));

    // One row per tier (S, A, B …). Inside a tier, + cards come first, then plain, then −.
    const rowsHTML = TIERS.filter((t) => t !== "F" || list.cards.some((c) => c.tier === "F")).map((t) => {
      const cs = bestFirst(list.cards.filter((c) => c.tier === t));
      return `<div class="grade-row">
        <div class="grade-label" style="border-color:${tierColor(t)}">${t}</div>
        ${!cs.length ? `<div class="chips"><span class="empty" style="padding:8px 4px">No cards</span></div>`
          : mode === "cards"
          ? `<div class="art-chips">${cs.map((c) => `<button class="art-card${norm(c.name) === focus ? " highlight" : ""}" data-card="${esc(c.name)}" data-rarity="${esc(c.rarity)}" title="${esc(c.name)} — ${esc(gradeLabel(c))}">
              <span class="img">${imgHTML(c.name)}</span><span class="g" style="background:${cardGradeColor(c)}">${esc(gradeLabel(c))}</span></button>`).join("")}</div>`
          : `<div class="chips">${cs.map((c) => `<button class="chip${norm(c.name) === focus ? " highlight" : ""}" data-card="${esc(c.name)}" data-rarity="${esc(c.rarity)}" data-preview><span class="chip-name">${esc(c.name)}</span><span class="chip-g">${esc(MOD_SIGN[modOf(c)])}</span></button>`).join("")}</div>`}
      </div>`;
    }).join("");

    const orderHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>#</th><th></th><th>Card</th><th>Grade</th><th class="hide-sm">Rarity</th></tr></thead>
      <tbody>${[...list.cards].sort((a, b) => a.order - b.order).map((c, i) => `
        <tr class="${norm(c.name) === focus ? "highlight" : ""}" data-row="${esc(norm(c.name))}" data-rarity="${esc(c.rarity)}">
          <td class="num">${i + 1}</td>
          <td class="thumbcell"><button class="thumbbtn" data-card="${esc(c.name)}" aria-label="Show ${esc(c.name)}">${imgHTML(c.name, "small")}</button></td>
          <td><button class="link" data-card="${esc(c.name)}">${esc(c.name)}</button></td>
          <td>${gpill(c)}</td>
          <td class="hide-sm rarity">${esc(c.rarity || "")}</td>
        </tr>`).join("")}</tbody></table></div>`;

    app.innerHTML = `
      <div class="toolbar">
        <div class="list-picker">
          <label class="label" for="list-picker">Tier list</label>
          <select id="list-picker">${state.lists.map((l) => `<option value="${l.slug}"${l.slug === slug ? " selected" : ""}>${esc(l.title)}</option>`).join("")}</select>
        </div>
        <div>
          <span class="label">View</span>
          <div class="seg">
            <a href="${base}" aria-pressed="${mode === "cards"}">Cards</a>
            <a href="${base}?view=names" aria-pressed="${mode === "names"}">Names</a>
            <a href="${base}?view=order" aria-pressed="${mode === "order"}">Episode order</a>
          </div>
        </div>
        ${rarities.length > 1 ? `<div>
          <span class="label">Rarity</span>
          <div class="seg" id="rarity-filter">${rarities.map((r) => `<button type="button" data-r="${r}" aria-pressed="true" title="Show ${r}s">${r[0].toUpperCase()}</button>`).join("")}</div>
        </div>` : ""}
        <div class="grow">
          <label class="label" for="in-list">Search this list</label>
          <input type="search" id="in-list" placeholder="Card name…" autocomplete="off">
        </div>
        <div class="right">
          <span class="label">${list.cards.length} cards</span>
          <span class="mono muted" style="font-size:.75rem">${fmtDate(list.date, list.dateApprox)}</span>
        </div>
      </div>
      <div class="watch-bar">
        ${list.youtube
          ? `<a class="yt" href="${ytWatch(list.youtube)}" target="_blank" rel="noopener">▶ Watch</a>
             <span>${esc(list.videoTitle || list.title)}</span>
             <button class="btn-outline" style="margin-left:auto;font-size:.95rem;padding:4px 12px" id="embed-toggle">Play here</button>`
          : `<span class="muted">Video coming soon.</span>`}
        ${list.description ? `<span class="muted">${esc(list.description)}</span>` : ""}
      </div>
      <div id="embed-slot"></div>
      ${mode === "order" ? orderHTML : `<div class="board">${rowsHTML}</div>`}
      <div class="legend" style="margin-top:10px">${rarities.map((r) => `<span style="--c:var(--r-${r})">${r}</span>`).join("")}</div>`;

    document.getElementById("list-picker").addEventListener("change", (e) => {
      location.hash = `#/tierlist/${e.target.value}${mode === "cards" ? "" : `?view=${mode}`}`;
    });
    const toggle = document.getElementById("embed-toggle");
    if (toggle) toggle.addEventListener("click", () => {
      const slot = document.getElementById("embed-slot");
      const open = !slot.innerHTML;
      slot.innerHTML = open ? `<div class="embed-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${list.youtube}?autoplay=1" title="${esc(list.title)} video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : "";
      toggle.textContent = open ? "Close player" : "Play here";
    });

    // Dim cards that do not match the in-list search or the rarity filter.
    const input = document.getElementById("in-list");
    const off = new Set();
    const applyFilter = () => {
      const f = norm(input.value);
      app.querySelectorAll(".chip, .art-card, tr[data-row]").forEach((el) => {
        const name = el.dataset.row || norm(el.dataset.card);
        el.classList.toggle("dim", Boolean(f && !name.includes(f)) || off.has(el.dataset.rarity));
      });
    };
    input.addEventListener("input", applyFilter);
    const rf = document.getElementById("rarity-filter");
    if (rf) rf.addEventListener("click", (e) => {
      const b = e.target.closest("[data-r]");
      if (!b) return;
      const on = b.getAttribute("aria-pressed") === "true";
      b.setAttribute("aria-pressed", String(!on));
      if (on) off.add(b.dataset.r); else off.delete(b.dataset.r);
      applyFilter();
    });

    const el = app.querySelector(".highlight");
    if (el) el.scrollIntoView({ block: "center" });
  }

  /* ---------- Search page ---------- */

  function appearancesHTML(entries) {
    return entries.map(({ list, card }) => `
      <div class="app">
        ${gpill(card)}
        <a href="#/tierlist/${list.slug}?card=${encodeURIComponent(card.name)}">${esc(list.title)}</a>
        <span class="date">${fmtDate(list.date, list.dateApprox)}</span>
        ${list.youtube ? `<a class="watch" href="${ytWatch(list.youtube)}" target="_blank" rel="noopener">▶ Watch review</a>` : `<span class="date">video coming soon</span>`}
      </div>`).join("");
  }

  function searchResultsHTML(q) {
    if (!q.trim()) return `<p class="empty">Type a card name to see its grade, its tier list and the video where we reviewed it.</p>`;
    const results = search(q);
    if (!results.length) return `<p class="empty">We have not tier listed “${esc(q)}” yet.</p>`;
    return `<p class="label">${results.length} card${results.length === 1 ? "" : "s"} found</p>
      <div class="results">${results.slice(0, 60).map((r) => {
        const info = cardInfo(r.name);
        return `<article class="result">
          <button class="thumbbtn" data-card="${esc(r.name)}" aria-label="Show ${esc(r.name)}">${imgHTML(r.name, "small")}</button>
          <div><h3>${esc(r.name)}</h3>${info ? `<div class="type">${esc(info.type_line)}</div>` : ""}<div class="apps">${appearancesHTML(r.entries)}</div></div>
        </article>`;
      }).join("")}</div>`;
  }

  function viewSearch(params) {
    const q = params.get("q") || "";
    app.innerHTML = `
      <div class="page-head"><div><h1>Card search</h1><p>Search ${state.index.size} cards from ${state.lists.length} tier lists.</p></div></div>
      <div class="search-big"><input type="search" id="search-input" value="${esc(q)}" placeholder="Card name — e.g. Thraben Inspector" aria-label="Search cards" autocomplete="off"></div>
      <div id="search-results">${searchResultsHTML(q)}</div>`;
    const input = document.getElementById("search-input");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.addEventListener("input", debounce(() => {
      history.replaceState(null, "", `#/search${input.value ? `?q=${encodeURIComponent(input.value)}` : ""}`);
      document.getElementById("search-results").innerHTML = searchResultsHTML(input.value);
    }, 120));
  }

  function viewNotFound() {
    app.innerHTML = `<div class="page-head"><div><h1>Page not found</h1><p><a href="#/">Go to the home page</a></p></div></div>`;
  }

  /* ---------- Card modal ---------- */

  const modal = document.getElementById("card-modal");
  const modalBody = document.getElementById("modal-body");
  const preview = document.getElementById("hover-preview");
  const hidePreview = () => { preview.hidden = true; };

  function openCard(name) {
    const entry = state.index.get(norm(name));
    if (!entry) return;
    hidePreview();
    const info = cardInfo(name);
    modalBody.innerHTML = `
      <div>
        <div class="big">${imgHTML(name, "large")}</div>
        ${info?.back_image ? `<button class="btn-outline" id="flip" style="margin-top:10px;width:100%;justify-content:center">Flip card</button>` : ""}
      </div>
      <div>
        <h2 id="modal-title">${esc(entry.name)}</h2>
        ${info ? `<div class="type">${esc(info.type_line)}<br>Shown: ${esc(info.set_name)} (${esc(info.set.toUpperCase())}) #${esc(info.collector_number)}</div>` : ""}
        <span class="label">Our grades</span>
        <div class="apps">${appearancesHTML(entry.entries)}</div>
        ${info?.scryfall_uri ? `<p style="margin-top:18px"><a href="${esc(info.scryfall_uri)}" target="_blank" rel="noopener">View on Scryfall ↗</a></p>` : ""}
      </div>`;
    const flip = document.getElementById("flip");
    if (flip) {
      let back = false;
      flip.addEventListener("click", () => {
        back = !back;
        modalBody.querySelector(".big img").src = back ? info.back_image.large : info.image.large;
      });
    }
    modal.hidden = false;
    modal.querySelector(".modal-close").focus();
  }
  const closeCard = () => { modal.hidden = true; };
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeCard(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeCard(); });
  app.addEventListener("click", (e) => {
    const c = e.target.closest("[data-card]");
    if (c) openCard(c.dataset.card);
  });
  modalBody.addEventListener("click", (e) => { if (e.target.closest("a")) closeCard(); });

  /* ---------- Hover preview (mouse only) ---------- */

  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    app.addEventListener("mouseover", (e) => {
      const el = e.target.closest("[data-preview]");
      if (!el) return;
      const src = imgSrc(el.dataset.card);
      if (!src) return;
      preview.src = src;
      preview.hidden = false;
    });
    app.addEventListener("mousemove", (e) => {
      if (preview.hidden) return;
      const w = 240, h = 335, pad = 18;
      let x = e.clientX + pad;
      if (x + w > innerWidth - 8) x = e.clientX - w - pad;
      const y = Math.max(8, Math.min(e.clientY - h / 2, innerHeight - h - 8));
      preview.style.left = x + "px";
      preview.style.top = y + "px";
    });
    app.addEventListener("mouseout", (e) => {
      if (e.target.closest("[data-preview]") && !e.relatedTarget?.closest?.("[data-preview]")) hidePreview();
    });
  }

  /* ---------- Router ---------- */

  const brandSub = document.getElementById("brand-sub");
  function render() {
    closeCard();
    hidePreview();
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const params = new URLSearchParams(qs || "");
    const parts = path.split("/").filter(Boolean);
    const section = parts[0] === "tierlist" ? "tierlists" : parts[0];
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === section));
    const titles = { videos: "Videos", tierlists: "Tier Lists", search: "Card Search" };
    brandSub.textContent = titles[section] || "Home";
    switch (parts[0]) {
      case undefined: viewHome(); break;
      case "videos": viewVideos(params); break;
      case "tierlists": viewTierlists(); break;
      case "tierlist": viewTierlist(decodeURIComponent(parts[1] || ""), params); break;
      case "search": viewSearch(params); break;
      default: viewNotFound();
    }
    const list = parts[0] === "tierlist" && state.lists.find((l) => l.slug === parts[1]);
    document.title = `${list ? list.title : titles[section] || "Peasant Cube tier lists"} · Jank Diver Gaming`;
    if (!params.get("card")) window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);
  load().then(render).catch((err) => {
    console.error(err);
    app.innerHTML = `<div class="page-head"><div><h1>Could not load data</h1><p class="mono">${esc(err.message)}</p>
      <p>Open the site through a web server (for example <code>python3 -m http.server</code>), not as a local file.</p></div></div>`;
  });
})();
