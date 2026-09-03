/* ------------------------------------------------------------------ *
 * Election Hub — theme, map camera and state panel.
 * ------------------------------------------------------------------ */

(function () {
  const root = document.documentElement;
  const STORAGE_KEY = "dw-election-theme";

  /* ============================= THEME ============================== */
  const stored = (function () {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  })();
  if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);

  const toggle = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeToggleLabel");
  const themeIcon = document.getElementById("themeToggleIcon");

  function syncToggle() {
    const isLight = root.getAttribute("data-theme") === "light";
    if (themeLabel) themeLabel.textContent = isLight ? "Dark" : "Light";
    if (themeIcon) themeIcon.textContent = isLight ? "◐" : "◑";
    if (toggle) toggle.setAttribute("aria-pressed", String(isLight));
  }
  syncToggle();

  if (toggle) {
    toggle.addEventListener("click", function () {
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* private mode */ }
      syncToggle();
    });
  }

  /* =========================== COUNTDOWN ============================
     The frame reads "3d 5h 20m" — that is how far the election is when the page
     opens, and from there the clock actually runs, with the seconds on show so
     you can watch time move. */
  const countdownEl = document.getElementById("countdown");
  if (countdownEl) {
    const target = Date.now() + ((3 * 24 + 5) * 60 + 20) * 60 * 1000;

    function tick() {
      let left = Math.max(0, target - Date.now());
      if (left === 0) { countdownEl.textContent = "moments"; return; }
      const s = Math.floor(left / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      countdownEl.textContent =
        (d ? d + "d " : "") +
        (d || h ? h + "h " : "") +
        m + "m " + sec + "s";
      requestAnimationFrame(function () {
        setTimeout(tick, 1000 - (Date.now() % 1000));
      });
    }
    tick();
  }

  /* =========================== FEED FILTER ===========================
     The chips actually filter. Cards leaving fade and collapse, cards arriving
     rise back in on a short stagger, so the list reflows instead of snapping. */
  const filterChips = document.querySelectorAll(".filter-chip");
  if (filterChips.length) {
    const feedCards = document.querySelectorAll(".card[data-kind]");

    filterChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        const want = chip.dataset.filter;
        filterChips.forEach(function (c) {
          c.setAttribute("aria-pressed", String(c === chip));
        });

        let shown = 0;
        feedCards.forEach(function (item) {
          const match = want === "all" || item.dataset.kind === want;
          if (match) {
            item.style.setProperty("--delay", shown * 55 + "ms");
            shown++;
          } else {
            item.style.removeProperty("--delay");
          }
          item.classList.toggle("is-filtered-out", !match);
        });

        /* a day heading with nothing left under it goes too */
        document.querySelectorAll(".day-group").forEach(function (group) {
          const any = group.querySelector(".card[data-kind]:not(.is-filtered-out)");
          group.classList.toggle("is-filtered-out", !any);
        });
      });
    });
  }

  /* =============================== MAP =============================== */

  const card = document.querySelector(".map-card");
  const slot = document.getElementById("mapSlot");
  const panel = document.getElementById("statePanel");
  const scrim = document.getElementById("panelScrim");
  const zoomIn = document.getElementById("zoomIn");
  const zoomOut = document.getElementById("zoomOut");
  const zoomReset = document.getElementById("zoomReset");

  const mqMobileMap = window.matchMedia("(max-width: 900px)");   /* which geometry to load */
  const mqSheet = window.matchMedia("(max-width: 1023px)");      /* panel becomes a sheet */

  /* geometry of each map: the card viewBox and the map offset inside it */
  const GEO = {
    desktop: { vw: 1312, vh: 811, ox: 86, oy: 42 },
    mobile: { vw: 361, vh: 410, ox: 7.26, oy: 101 }
  };

  const MIN_SCALE = 1;
  const MAX_SCALE = 6;
  const STEP = 1.45;           /* button step — gentler than 1.6 */

  /* active race and source — the map pills and the panel tabs are two views of
     the SAME state, so touching one shows up in the other */
  let race = "house";
  let source = "polymarket";     /* what the Figma frame shows in the pill */
  let baseRating = {};           /* original rating (House / Polymarket) per state */

  const cache = {};
  let boxes = null;          /* bounding box of each state, per breakpoint */
  let geoKey = null;
  let cam = null;            /* <g class="cam"> */
  let svg = null;
  let selected = null;
  let view = { s: 1, x: 0, y: 0 };
  let ballot = [];           /* navigable states, alphabetical */

  fetch("assets/state-boxes.json")
    .then(function (r) { return r.json(); })
    .then(function (json) {
      boxes = json;
      if (json.desktop_origin) { GEO.desktop.ox = json.desktop_origin[0]; GEO.desktop.oy = json.desktop_origin[1]; }
      if (json.mobile_origin) { GEO.mobile.ox = json.mobile_origin[0]; GEO.mobile.oy = json.mobile_origin[1]; }
    })
    .catch(function () { boxes = null; });

  function geo() { return GEO[geoKey] || GEO.desktop; }

  /* ---------------------------- camera ---------------------------- */

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* Width the panel takes up, in the card viewBox's units. */
  function panelWidth() {
    const g = geo();
    return mqSheet.matches ? 0 : (512 + 32 + 32) * (g.vw / 1312);
  }

  /* Keeps the map inside the card frame. With the panel open the slack grows by
     however much the panel covers: without it a state on the right edge (Maine)
     could never reach the free area on the left. */
  function clampView(v) {
    const g = geo();
    const s = clamp(v.s, MIN_SCALE, MAX_SCALE);
    const w = g.vw * s;
    const h = g.vh * s;
    /* enough slack for ANY state — Maine on the right edge included — to reach
       the centre of the free strip on the left */
    const slack = selected ? panelWidth() + g.vw * 0.5 : 0;
    const x = w <= g.vw && !slack ? (g.vw - w) / 2 : clamp(v.x, g.vw - w - slack, slack);
    const y = h <= g.vh ? (g.vh - h) / 2 : clamp(v.y, g.vh - h, 0);
    return { s: s, x: x, y: y };
  }

  function applyView(animate) {
    if (!cam) return;
    view = clampView(view);
    cam.style.transition = animate ? "transform 620ms cubic-bezier(.22,.61,.36,1)" : "none";
    cam.setAttribute("transform", "translate(" + view.x.toFixed(2) + "," + view.y.toFixed(2) + ") scale(" + view.s.toFixed(4) + ")");
    /* the outline holds 2px on screen at any scale */
    if (svg) svg.style.setProperty("--sel-stroke", (2 / view.s).toFixed(3));
    if (card) card.classList.toggle("is-zoomed", view.s > MIN_SCALE + 0.001);
    syncZoomButtons();
  }

  function syncZoomButtons() {
    const locked = zoomLocked();
    const atMin = view.s <= MIN_SCALE + 0.001;
    const atMax = view.s >= MAX_SCALE - 0.001;
    if (zoomIn) zoomIn.disabled = locked || atMax;
    if (zoomOut) zoomOut.disabled = locked || atMin;
    if (zoomReset) zoomReset.disabled = locked || atMin;
  }

  /* Zoom while holding the point (px,py) — in card coordinates — still. */
  function zoomAt(nextScale, px, py, animate) {
    const g = geo();
    const s0 = view.s;
    const s1 = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (px === undefined) { px = g.vw / 2; py = g.vh / 2; }
    view = {
      s: s1,
      x: px - (px - view.x) * (s1 / s0),
      y: py - (py - view.y) * (s1 / s0)
    };
    applyView(animate !== false);
  }

  const FOCUS_SCALE = 1.55;   /* the requested "reading" zoom: ~155% */

  /* Selecting on desktop drags the WHOLE map — not the state on its own —
     until the chosen state sits centred in the free strip left of the panel,
     always at the same zoom. Works from any scale: if the reader had zoomed in
     before, it returns to the reading framing. */
  function focusSelected(code) {
    if (mqSheet.matches) return;                 /* on mobile the camera stays put */
    if (!boxes || !boxes[geoKey] || !boxes[geoKey][code]) return;
    const g = geo();
    const b = boxes[geoKey][code];
    const cx = b[0] + b[2] / 2 + g.ox;
    const cy = b[1] + b[3] / 2 + g.oy;
    const availW = g.vw - panelWidth();
    const s = FOCUS_SCALE;
    view = { s: s, x: availW / 2 - cx * s, y: g.vh / 2 - cy * s };
    applyView(true);
  }

  function resetView() {
    view = { s: 1, x: 0, y: 0 };
    applyView(true);
  }

  /* -------------------------- selection --------------------------- */

  /* SVG has no z-index: so the selection outline does not end up beneath its
     neighbours, the selected path moves to the end of the group. `anchor` keeps
     its original slot so it can be put back on cleanup. */
  let anchor = null;

  function restoreOrder() {
    if (!selected || !svg) return;
    const prev = svg.querySelector('[data-state="' + selected + '"]');
    if (!prev) return;
    prev.classList.remove("is-selected");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(prev, anchor);
    anchor = null;
  }

  function select(code) {
    if (!svg) return;
    const path = svg.querySelector('[data-state="' + code + '"]');
    if (!path) return;

    restoreOrder();
    selected = code;
    anchor = path.nextSibling;
    path.parentNode.appendChild(path);
    path.classList.add("is-selected");
    card.classList.add("has-selection");

    panel.classList.remove("is-settled");
    renderPanel(code);
    openPanel();
    focusSelected(code);
  }

  function deselect() {
    restoreOrder();
    selected = null;
    card.classList.remove("has-selection");
    closePanel();
    /* selecting zoomed the map in, so closing gives the whole map back */
    if (!mqSheet.matches) resetView();
  }

  function step(dir) {
    if (!ballot.length) return;
    const i = ballot.indexOf(selected);
    const next = ballot[(i + dir + ballot.length) % ballot.length];
    select(next);
  }

  /* ----------------------------- pills ----------------------------- */

  const raceChip = document.getElementById("raceChip");
  const sourceChip = document.getElementById("sourceChip");
  const raceMenu = document.getElementById("raceMenu");
  const sourceMenu = document.getElementById("sourceMenu");
  const raceValue = document.getElementById("raceValue");
  const sourceValue = document.getElementById("sourceValue");

  function fillMenu(menu, items, current, onPick) {
    menu.innerHTML = items.map(function (it) {
      return '<li><button type="button" role="option" data-id="' + it.id + '"' +
        (it.id === current ? ' aria-selected="true"' : ' aria-selected="false"') +
        '>' + it.label + '</button></li>';
    }).join("");
    menu.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { onPick(b.dataset.id); closeMenus(); });
    });
  }

  /* `hidden` stays the source of truth for screen readers, but it is only
     applied after the transition — otherwise the menu vanishes before it
     finishes closing. */
  function closeMenus() {
    [[raceChip, raceMenu], [sourceChip, sourceMenu]].forEach(function (pair) {
      if (!pair[0] || pair[1].hidden) return;
      pair[1].classList.remove("is-open");
      pair[0].setAttribute("aria-expanded", "false");
      const menu = pair[1];
      setTimeout(function () {
        if (!menu.classList.contains("is-open")) menu.hidden = true;
      }, 280);
    });
  }

  function toggleMenu(chip, menu) {
    const willOpen = !menu.classList.contains("is-open");
    closeMenus();
    if (!willOpen) return;
    menu.hidden = false;
    requestAnimationFrame(function () { menu.classList.add("is-open"); });
    chip.setAttribute("aria-expanded", "true");
  }

  if (raceChip) raceChip.addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(raceChip, raceMenu); });
  if (sourceChip) sourceChip.addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(sourceChip, sourceMenu); });
  document.addEventListener("click", closeMenus);

  function label(list, id) {
    const hit = list.filter(function (i) { return i.id === id; })[0];
    return hit ? hit.label : id;
  }

  /* ------------------------------ seat bar ------------------------------
     The frame's numbers (470 D · 60 toss · 1,000 R) hold for House +
     Polymarket, which is what Figma drew. Switching race or source moves the
     map's rating distribution, and the bar follows in the same proportion —
     each bucket's state count against the baseline count. */
  const SEAT_BASE = { dem: 470, toss: 60, rep: 1000 };
  const COUNT_BASE = { dem: 13, toss: 6, rep: 19 };
  /* the frame's widths (639 / 18 / 654 of 1312) — in the file the bar is not
     the proportion of the numbers beside it, it is the current seat
     composition; so it is the baseline and moves along without becoming
     something else */
  const WIDTH_BASE = { dem: 48.70, toss: 1.37, rep: 49.93 };

  const seatEls = {
    dem: document.getElementById("seatDem"),
    toss: document.getElementById("seatToss"),
    rep: document.getElementById("seatRep"),
    segDem: document.getElementById("segDem"),
    segToss: document.getElementById("segToss"),
    segRep: document.getElementById("segRep"),
    bar: document.getElementById("seatbar")
  };

  /* The frame writes "1.000" — a pt/eu thousands separator. On an English page
     for a US reader that reads as one, so the separator here is a comma. */
  function fmt(n) {
    return n.toLocaleString("en-US");
  }

  function updateSeatbar() {
    if (!svg || !seatEls.bar) return;
    const count = { dem: 0, toss: 0, rep: 0 };
    svg.querySelectorAll(".state").forEach(function (g) {
      const r = g.getAttribute("class").match(/r-([a-z-]+)/)[1];
      if (r === "off" || r === "blank") return;
      if (r === "tossup" || r === "nodata") count.toss++;
      else if (r.slice(-2) === "-d") count.dem++;
      else count.rep++;
    });

    const seats = {
      dem: Math.round(SEAT_BASE.dem * count.dem / COUNT_BASE.dem),
      toss: Math.round(SEAT_BASE.toss * count.toss / COUNT_BASE.toss),
      rep: Math.round(SEAT_BASE.rep * count.rep / COUNT_BASE.rep)
    };
    const w = {
      dem: WIDTH_BASE.dem * seats.dem / SEAT_BASE.dem,
      toss: WIDTH_BASE.toss * seats.toss / SEAT_BASE.toss,
      rep: WIDTH_BASE.rep * seats.rep / SEAT_BASE.rep
    };
    const wTotal = w.dem + w.toss + w.rep || 1;

    seatEls.dem.textContent = fmt(seats.dem);
    seatEls.toss.textContent = fmt(seats.toss);
    seatEls.rep.textContent = fmt(seats.rep);
    seatEls.segDem.style.width = (w.dem / wTotal * 100).toFixed(2) + "%";
    seatEls.segToss.style.width = (w.toss / wTotal * 100).toFixed(2) + "%";
    seatEls.segRep.style.width = (w.rep / wTotal * 100).toFixed(2) + "%";
    seatEls.bar.setAttribute("aria-label",
      "Assentos: Democratas " + fmt(seats.dem) + ", indefinidos " + fmt(seats.toss) +
      ", Republicanos " + fmt(seats.rep));
  }

  /* Repaints the whole map for the current race/source. */
  function repaint() {
    if (!svg) return;
    svg.querySelectorAll(".state").forEach(function (g) {
      const code = g.dataset.state;
      const next = window.EH.ratingFor(code, baseRating[code], race, source);
      g.setAttribute("class", "state r-" + next + (g.classList.contains("is-selected") ? " is-selected" : ""));
    });
    rebuildBallot();
    updateSeatbar();
    if (selected) renderPanel(selected);
  }

  function setRace(id) {
    if (race === id) return;
    race = id;
    if (raceValue) raceValue.textContent = label(window.EH.races, id);
    fillMenu(raceMenu, window.EH.races, race, setRace);
    repaint();
  }

  function setSource(id) {
    if (source === id) return;
    source = id;
    if (sourceValue) sourceValue.textContent = label(window.EH.sources, id);
    fillMenu(sourceMenu, window.EH.sources, source, setSource);
    repaint();
  }

  if (raceMenu) fillMenu(raceMenu, window.EH.races, race, setRace);
  if (sourceMenu) fillMenu(sourceMenu, window.EH.sources, source, setSource);
  if (raceValue) raceValue.textContent = label(window.EH.races, race);
  if (sourceValue) sourceValue.textContent = label(window.EH.sources, source);

  /* ----------------------------- panel ----------------------------- */

  /* With the sheet open the body does not scroll: the page stays where it was
     and only the panel content moves. */
  let lockedAt = 0;
  function lockScroll(on) {
    if (on === document.body.classList.contains("is-locked")) return;
    if (on) {
      lockedAt = window.scrollY;
      document.body.style.top = -lockedAt + "px";
      document.body.classList.add("is-locked");
    } else {
      document.body.classList.remove("is-locked");
      document.body.style.top = "";
      window.scrollTo(0, lockedAt);
    }
  }

  function openPanel() {
    panel.hidden = false;
    if (scrim && mqSheet.matches) scrim.hidden = false;
    requestAnimationFrame(function () {
      panel.classList.add("is-open");
      if (scrim && mqSheet.matches) scrim.classList.add("is-open");
      syncZoomButtons();
    });
    lockScroll(mqSheet.matches);
    syncZoomButtons();
  }

  function closePanel() {
    panel.classList.remove("is-open");
    panel.classList.remove("is-settled");
    if (scrim) scrim.classList.remove("is-open");
    lockScroll(false);
    syncZoomButtons();
    setTimeout(function () {
      if (panel.classList.contains("is-open")) return;
      panel.hidden = true;
      if (scrim) scrim.hidden = true;
    }, 640);
  }

  const PARTY_COLOR = { R: "var(--party-rep)", D: "var(--party-dem)", I: "var(--party-ind)" };

  function candidateRow(c, i) {
    return (
      '<li class="race-row" style="--delay:' + (i * 70) + 'ms">' +
      '<span class="race-row__bar" data-w="' + c.pct + '" style="background:' + PARTY_COLOR[c.key] + '"></span>' +
      '<span class="race-row__who">' +
      '<span class="race-row__avatar" style="background:' + PARTY_COLOR[c.key] + '">' + c.name.charAt(0) + '</span>' +
      '<span class="race-row__names"><b>' + c.name + '</b><em>' + c.party + '</em></span>' +
      '</span>' +
      '<span class="race-row__pct">' + c.pct.toFixed(1).replace(/\.0$/, "") + "%" + '</span>' +
      '</li>'
    );
  }

  function districtRow(d, i) {
    return (
      '<li class="race-row race-row--district" style="--delay:' + (i * 70) + 'ms">' +
      '<span class="race-row__bar" data-w="' + d.pct + '" style="background:var(--party-rep)"></span>' +
      '<span class="race-row__names"><b>' + d.id + '</b><em>' + d.rating + " · " + d.held + '</em></span>' +
      '<span class="race-row__pct">' + d.pct + '%</span>' +
      '</li>'
    );
  }

  const DISCLAIMER =
    "Estimates, not results - measured in different units (points vs implied probability) and never combined.";

  function renderPanel(code) {
    const g = svg.querySelector('[data-state="' + code + '"]');
    const rating = g.getAttribute("class").match(/r-([a-z-]+)/)[1];
    const d = window.EH.build(code, rating, race, source);
    /* grey on the map = no race here: the panel opens in the empty state, with
       no source tabs, no candidates and no districts */
    const onBallot = rating !== "off" && rating !== "blank" && rating !== "nodata";
    const i = ballot.indexOf(code);
    const prev = ballot[(i - 1 + ballot.length) % ballot.length];
    const next = ballot[(i + 1) % ballot.length];
    const names = window.EH.names;

    panel.innerHTML =
      '<header class="panel__top">' +
      '<span class="panel__crumb">' + label(window.EH.races, race) + ' / ' + d.name + '</span>' +
      '<button class="icon-btn" type="button" id="panelClose" aria-label="Fechar">' +
      '<span class="icon icon--lg" style="-webkit-mask-image:url(assets/icons/icon_tabler-icon-x.svg);mask-image:url(assets/icons/icon_tabler-icon-x.svg)"></span>' +
      '</button>' +
      '</header>' +

      '<div class="panel__scroll">' +

      '<div class="panel__head">' +
      '<div class="panel__identity">' +
      '<img class="panel__flag" src="assets/flags/' + code + '.png" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<span class="panel__identity-actions">' +
      '<button class="btn btn--primary btn--pill" type="button">Follow ' + d.name + '</button>' +
      '<button class="icon-btn icon-btn--outline" type="button" aria-label="Compartilhar">' +
      '<span class="icon" style="-webkit-mask-image:url(assets/icons/icon_tabler-icon-share.svg);mask-image:url(assets/icons/icon_tabler-icon-share.svg)"></span>' +
      '</button>' +
      '</span>' +
      '</div>' +
      '<h2 class="panel__title">' + d.name + ' · ' + d.race + '</h2>' +
      (onBallot
        ? '<p class="panel__subtitle">' + d.seatNote + ' · Rated ' + d.ratingLabel + '</p>'
        : '<p class="panel__empty">' +
          '<b>No 2026 election in ' + d.name + ' yet.</b>' +
          'Nothing on the ' + label(window.EH.races, race) + ' ballot here — try another race, ' +
          'or come back closer to election night.' +
          '</p>') +
      '</div>' +

      (onBallot ? '<div class="panel__tabs" role="tablist">' +
      window.EH.sources.map(function (s) {
        return '<button class="panel__tab' + (s.id === source ? " is-active" : "") +
          '" role="tab" data-source="' + s.id + '" aria-selected="' + (s.id === source) + '">' +
          '<i></i>' + s.label + '</button>';
      }).join("") +
      '</div>' : "") +

      (onBallot ? '<section class="panel__section">' +
      '<h3 class="panel__section-title">Candidates</h3>' +
      '<p class="panel__section-meta">' + d.sourceKind + ' · ' + d.margin + ' · ' + d.updated + '</p>' +
      '<ul class="race-list">' + d.candidates.map(candidateRow).join("") + '</ul>' +
      '<p class="panel__note">' + DISCLAIMER + '</p>' +
      '</section>' : "") +

      (d.districts.length
        ? '<section class="panel__section panel__section--divided">' +
          '<h3 class="panel__section-title">Districts (' + d.districts.length + ')</h3>' +
          '<p class="panel__section-meta">' + d.sourceKind + ' · ' + d.margin + ' · ' + d.updated + '</p>' +
          '<ul class="race-list">' + d.districts.map(districtRow).join("") + '</ul>' +
          '<p class="panel__note">' + DISCLAIMER + '</p>' +
          '</section>'
        : "") +

      '</div>' +

      '<footer class="panel__bottom">' +
      '<button class="panel__nav" type="button" data-step="-1">' +
      '<span class="icon icon--sm" style="-webkit-mask-image:url(assets/icons/icon_tabler-icon-chevron-left.svg);mask-image:url(assets/icons/icon_tabler-icon-chevron-left.svg)"></span>' +
      (names[prev] || prev) + '</button>' +
      '<button class="panel__nav" type="button" data-step="1">' + (names[next] || next) +
      '<span class="icon icon--sm" style="-webkit-mask-image:url(assets/icons/icon_tabler-icon-chevron-right.svg);mask-image:url(assets/icons/icon_tabler-icon-chevron-right.svg)"></span>' +
      '</button>' +
      '</footer>';

    panel.querySelector("#panelClose").addEventListener("click", deselect);
    panel.querySelectorAll("[data-step]").forEach(function (b) {
      b.addEventListener("click", function () { step(Number(b.dataset.step)); });
    });
    panel.querySelectorAll(".panel__tab").forEach(function (tab) {
      tab.addEventListener("click", function () { setSource(tab.dataset.source); });
    });
    const sc = panel.querySelector(".panel__scroll");
    if (sc) sc.scrollTop = 0;

    /* bars start at zero and grow left to right, cascading */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        panel.querySelectorAll(".race-row__bar").forEach(function (b) {
          b.style.width = b.dataset.w + "%";
        });
        panel.classList.add("is-settled");
      });
    });
  }

  /* --------------------- mouse / touch events ---------------------- */

  function cardPoint(ev) {
    const r = card.getBoundingClientRect();
    const g = geo();
    return {
      x: (ev.clientX - r.left) / r.width * g.vw,
      y: (ev.clientY - r.top) / r.height * g.vh
    };
  }

  function bindMap() {
    svg.addEventListener("click", function (ev) {
      const p = ev.target.closest(".state");
      if (!p) return;
      const code = p.dataset.state;
      if (code === selected) { deselect(); return; }
      select(code);
    });

    svg.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const p = ev.target.closest(".state");
      if (p) { ev.preventDefault(); select(p.dataset.state); }
    });
  }

  /* With the sheet open (mobile/tablet) the map takes no zoom at all — it only
     responds again once the modal closes. */
  function zoomLocked() {
    return mqSheet.matches && panel && panel.classList.contains("is-open");
  }

  /* Wheel / trackpad, anchored at the cursor.
     deltaMode normalises mouse wheels (lines) and trackpads (pixels); trackpad
     pinch arrives as wheel + ctrlKey and deserves a larger step. */
  function onWheel(ev) {
    /* wheel over the panel or the pills = normal scroll, not zoom */
    if (ev.target.closest(".panel") || ev.target.closest(".chip-menu")) return;
    if (zoomLocked()) return;
    ev.preventDefault();
    const p = cardPoint(ev);
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
    let d = ev.deltaY * unit;
    d = Math.max(-120, Math.min(120, d));           /* avoids absurd jumps */
    const k = ev.ctrlKey ? 0.012 : 0.0032;
    zoomAt(view.s * Math.exp(-d * k), p.x, p.y, false);
  }

  /* drag to pan */
  let drag = null;
  function onPointerDown(ev) {
    if (zoomLocked() || view.s <= MIN_SCALE + 0.001) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    if (ev.target.closest(".panel") || ev.target.closest(".map-chips") || ev.target.closest(".map-zoom")) return;
    /* No setPointerCapture on purpose: capturing on the card makes the next
       `click` target the card, and then no state is clickable while zoomed.
       The drag listens on the window and the click stays on the <g>. */
    drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, ox: view.x, oy: view.y, moved: false };
    card.classList.add("is-dragging");
  }
  function onPointerMove(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const r = card.getBoundingClientRect();
    const g = geo();
    const dx = (ev.clientX - drag.x) / r.width * g.vw;
    const dy = (ev.clientY - drag.y) / r.height * g.vh;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    view.x = drag.ox + dx;
    view.y = drag.oy + dy;
    applyView(false);
  }
  function onPointerUp(ev) {
    if (!drag) return;
    if (drag.moved) {
      /* keeps the click that ended the drag from selecting a state */
      const swallow = function (e) { e.stopPropagation(); e.preventDefault(); };
      card.addEventListener("click", swallow, { capture: true, once: true });
    }
    drag = null;
    card.classList.remove("is-dragging");
  }

  /* two-finger pinch */
  let pinch = null;
  function touchDist(t) {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }
  function onTouchStart(ev) {
    if (zoomLocked() || ev.touches.length !== 2) return;
    pinch = { d: touchDist(ev.touches), s: view.s };
  }
  function onTouchMove(ev) {
    if (!pinch || ev.touches.length !== 2) return;
    ev.preventDefault();
    const r = card.getBoundingClientRect();
    const g = geo();
    const mx = (ev.touches[0].clientX + ev.touches[1].clientX) / 2;
    const my = (ev.touches[0].clientY + ev.touches[1].clientY) / 2;
    zoomAt(pinch.s * (touchDist(ev.touches) / pinch.d),
      (mx - r.left) / r.width * g.vw, (my - r.top) / r.height * g.vh, false);
  }
  function onTouchEnd(ev) { if (ev.touches.length < 2) pinch = null; }

  if (card) {
    card.addEventListener("wheel", onWheel, { passive: false });
    card.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    card.addEventListener("touchstart", onTouchStart, { passive: true });
    card.addEventListener("touchmove", onTouchMove, { passive: false });
    card.addEventListener("touchend", onTouchEnd);
  }

  if (zoomIn) zoomIn.addEventListener("click", function () { if (!zoomLocked()) zoomAt(view.s * STEP); });
  if (zoomOut) zoomOut.addEventListener("click", function () { if (!zoomLocked()) zoomAt(view.s / STEP); });

  /* double click zooms at the clicked point, as any map does */
  if (card) card.addEventListener("dblclick", function (ev) {
    if (zoomLocked() || ev.target.closest(".panel") || ev.target.closest(".map-chips")) return;
    const p = cardPoint(ev);
    zoomAt(view.s * STEP * STEP, p.x, p.y, true);
  });
  if (zoomReset) zoomReset.addEventListener("click", resetView);
  /* the scrim only blocks the rest of the page — closing is the ✕ (or Esc) */
  if (scrim) scrim.addEventListener("touchmove", function (ev) { ev.preventDefault(); }, { passive: false });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && selected) deselect();
    if (!selected) return;
    if (ev.key === "ArrowRight") { ev.preventDefault(); step(1); }
    if (ev.key === "ArrowLeft") { ev.preventDefault(); step(-1); }
  });

  /* --------------------------- SVG loading --------------------------- */

  /* Every state joins the navigation — the grey ones included, which open the
     panel in the empty state explaining there is no 2026 election there. */
  function rebuildBallot() {
    ballot = Array.prototype.slice
      .call(svg.querySelectorAll(".state"))
      .map(function (p) { return p.dataset.state; })
      .sort(function (a, b) {
        return (window.EH.names[a] || a).localeCompare(window.EH.names[b] || b);
      });
  }

  function afterLoad() {
    svg = slot.querySelector("svg");
    cam = svg.querySelector(".cam");

    /* the SVG ships with the House rating on Polymarket — what Figma drew */
    svg.querySelectorAll(".state").forEach(function (p) {
      const code = p.dataset.state;
      if (!baseRating[code]) baseRating[code] = p.getAttribute("class").match(/r-([a-z-]+)/)[1];
      p.setAttribute("aria-label", window.EH.names[code] || code);
    });
    repaint();

    bindMap();
    view = { s: 1, x: 0, y: 0 };
    applyView(false);
    if (selected) select(selected);
  }

  function load(key) {
    if (geoKey === key) return;
    geoKey = key;
    if (cache[key]) { slot.innerHTML = cache[key]; afterLoad(); return; }
    fetch("assets/map-" + key + ".svg")
      .then(function (r) { return r.text(); })
      .then(function (text) {
        cache[key] = text;
        if (geoKey === key) { slot.innerHTML = text; afterLoad(); }
      })
      .catch(function () { geoKey = null; });
  }

  function pick() { load(mqMobileMap.matches ? "mobile" : "desktop"); }
  pick();

  function onBreakpoint() {
    pick();
    if (selected && panel.classList.contains("is-open")) {
      if (scrim) {
        scrim.hidden = !mqSheet.matches;
        scrim.classList.toggle("is-open", mqSheet.matches);
      }
      lockScroll(mqSheet.matches);
    }
  }
  if (mqMobileMap.addEventListener) {
    mqMobileMap.addEventListener("change", onBreakpoint);
    mqSheet.addEventListener("change", onBreakpoint);
  } else {
    mqMobileMap.addListener(onBreakpoint);
    mqSheet.addListener(onBreakpoint);
  }
})();
