/* ------------------------------------------------------------------ *
 * Election Hub — theme, map camera and state panel.
 * ------------------------------------------------------------------ */

(function () {
  const root = document.documentElement;
  const STORAGE_KEY = "dw-election-theme";

  /* ============================== INTRO ==============================
     One curtain-up on load: the headline sets itself letter by letter, the
     rule wipes out from the left, the countdown rolls in, the forecast rises
     and the seats grid fills as a diagonal wave. The whole thing is one
     shared timeline, so every part knows when the part before it lands.

     Every animation uses `backwards`, never `both`: the fill has to release
     the element at the end, or the dots would keep the entrance transform
     and their hover would have nothing left to animate. */
  const INTRO = {
    title: 40,
    mark: 140,
    presented: 230,
    rule: 260,
    countdown: 360,
    statement: 520,
    margin: 580,
    dots: 660
  };
  const introStill = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.EH_INTRO_AT = function (key) { return introStill ? 0 : (INTRO[key] || 0); };

  /* Letters get their own inline-blocks. Spaces stay text nodes so the words
     still break and measure normally. */
  function splitLetters(el, base, step) {
    const text = el.textContent;
    el.textContent = "";
    let n = 0;
    for (const ch of text) {
      if (ch === " " || ch === "\n") { el.appendChild(document.createTextNode(" ")); continue; }
      const s = document.createElement("span");
      s.className = "letter";
      s.textContent = ch;
      s.style.animationDelay = (base + n * step) + "ms";
      el.appendChild(s);
      n++;
    }
  }

  function rise(sel, delay) {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) return;
    el.classList.add("intro-rise");
    el.style.animationDelay = delay + "ms";
  }

  if (!introStill) {
    const title = document.querySelector(".hero__title");
    if (title) splitLetters(title, INTRO.title, 26);
    rise(".hero__mark", INTRO.mark);
    rise(".hero__presented", INTRO.presented);
    rise(".statement__text", INTRO.statement);

    const rule = document.querySelector(".hero__rule");
    if (rule) { rule.classList.add("intro-wipe"); rule.style.animationDelay = INTRO.rule + "ms"; }
  }

  /* ============================= THEME ============================== */
  const stored = (function () {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  })();
  if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);

  const toggle = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeToggleLabel");

  /* Sun and moon lifted from the election-hub-design prototype's ThemeToggle:
     the icon shows the side you would switch TO, not the one you are on. */
  const SUN = '<svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">' +
    '<circle cx="8.5" cy="8.5" r="3.4" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M8.5 1.2v1.9M8.5 13.9v1.9M1.2 8.5h1.9M13.9 8.5h1.9M3.3 3.3l1.35 1.35' +
    'M12.35 12.35l1.35 1.35M13.7 3.3l-1.35 1.35M4.65 12.35 3.3 13.7" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const MOON = '<svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">' +
    '<path d="M14.2 10.3A6.4 6.4 0 0 1 6.7 2.8a6.4 6.4 0 1 0 7.5 7.5Z" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

  function syncToggle() {
    const isLight = root.getAttribute("data-theme") === "light";
    if (!toggle) return;
    toggle.innerHTML = (isLight ? MOON : SUN) +
      '<span class="sr-only" id="themeToggleLabel">' +
      (isLight ? "Switch to dark mode" : "Switch to light mode") + "</span>";
    toggle.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
    toggle.setAttribute("aria-pressed", String(isLight));
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
     Counts to the real deadline — polls close 8pm ET on Election Day,
     3 November 2026 — so the four cells tick on their own and stay honest
     whatever day the page is opened. The seconds are on show, so the clock
     is re-aligned to the wall-clock second on every tick rather than
     drifting on a plain 1000ms interval. */
  const ELECTION_CLOSE = Date.parse("2026-11-03T20:00:00-05:00");
  const cd = {
    d: document.getElementById("cdD"),
    h: document.getElementById("cdH"),
    m: document.getElementById("cdM"),
    s: document.getElementById("cdS")
  };
  if (cd.d && cd.h && cd.m && cd.s) {
    const pad = function (n) { return n < 10 ? "0" + n : String(n); };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ROLL = 420;   /* must match --dur-medium */
    const STEP = 70;    /* stagger between digits, so they land one by one */

    /* Each numeral is its own slot: the outgoing glyph leaves downwards while
       the incoming one arrives from above, so a tick reads as the digits
       rolling rather than the text swapping. Only the digits that actually
       changed move — at :59 the whole cell rolls, at :51 only the units. */
    function glyph(ch) {
      const g = document.createElement("span");
      g.className = "digit__glyph";
      g.textContent = ch;
      return g;
    }

    function build(el, value, order) {
      el.textContent = "";
      for (let i = 0; i < value.length; i++) {
        const slot = document.createElement("span");
        slot.className = "digit";
        slot.dataset.v = value[i];
        const g = glyph(value[i]);
        if (!still) {
          g.style.animation = "digit-in " + ROLL + "ms var(--ease) " +
            (window.EH_INTRO_AT("countdown") + (order * value.length + i) * STEP) +
            "ms both";
        }
        slot.appendChild(g);
        el.appendChild(slot);
      }
    }

    function roll(el, value, order) {
      if (el.childElementCount !== value.length) { build(el, value, order); return; }
      for (let i = 0; i < value.length; i++) {
        const slot = el.children[i];

        /* Settle whatever the last roll left behind before starting another.
           Without this the outgoing glyph of an in-flight roll survives — the
           cell ends up reading "343" — and the old timer wipes the new
           animation off a glyph it no longer owns. */
        if (slot.rollTimer) { clearTimeout(slot.rollTimer); slot.rollTimer = null; }
        while (slot.childElementCount > 1) slot.removeChild(slot.firstElementChild);

        if (slot.dataset.v === value[i]) continue;
        slot.dataset.v = value[i];

        const out = slot.lastElementChild;
        const inc = glyph(value[i]);
        slot.appendChild(inc);
        if (still) { out.remove(); continue; }

        const delay = i * STEP;
        out.style.animation = "digit-out " + ROLL + "ms var(--ease) " + delay + "ms both";
        inc.style.animation = "digit-in " + ROLL + "ms var(--ease) " + delay + "ms both";
        slot.rollTimer = setTimeout(function () {
          slot.rollTimer = null;
          out.remove();
          inc.style.animation = "";
        }, delay + ROLL + 40);
      }
    }

    function tick() {
      const left = Math.max(0, ELECTION_CLOSE - Date.now());
      const total = Math.floor(left / 1000);
      roll(cd.d, pad(Math.floor(total / 86400)), 0);
      roll(cd.h, pad(Math.floor((total % 86400) / 3600)), 1);
      roll(cd.m, pad(Math.floor((total % 3600) / 60)), 2);
      roll(cd.s, pad(total % 60), 3);
      if (left === 0) return;
      setTimeout(tick, 1000 - (Date.now() % 1000));
    }
    tick();
  }

  /* =========================== FEED FILTER ===========================
     Pill motion ported from election-hub-design (`.anim-pill-*` in its
     index.css). Two rules from there that matter:

       - the pills that leave FADE, they do not squeeze. Collapsing their width
         reads as a bounce; opacity alone reads as them stepping back.
       - their borders go first, otherwise a fading chip leaves a grey ring
         hanging in the air.

     The chosen pill then FLIPs into its new slot: the leavers go out of flow at
     the position they already held, the chip's new left is measured, and it is
     animated from the old offset to zero. Clicking the active pill returns,
     which is also how the prototype exits. */
  const filterChips = Array.prototype.slice.call(document.querySelectorAll(".filter-chip"));
  const filterRow = document.querySelector(".filter-row");

  if (filterChips.length && filterRow) {
    const feedCards = Array.prototype.slice.call(document.querySelectorAll(".card[data-kind]"));
    const hostField = document.getElementById("hostField");
    const hostTrigger = document.getElementById("hostTrigger");
    const hostMenu = document.getElementById("hostMenu");
    const hostLabel = document.getElementById("hostLabel");
    const stateTrigger = document.getElementById("stateTrigger");
    const stateMenu = document.getElementById("stateMenu");
    const stateLabel = document.getElementById("stateLabel");
    const avatar = filterRow.querySelector(".host-avatar");

    let kind = "all";
    let host = null;
    let stateScope = null;

    const uniq = function (list) {
      return list.filter(function (v, i) { return v && list.indexOf(v) === i; }).sort();
    };
    const HOSTS = uniq(feedCards.map(function (c) { return c.dataset.host; }));
    const STATES = uniq(feedCards.map(function (c) { return c.dataset.stateTag; }));

    /* Hiding: play the collapse, then drop out of the flow so the element stops
       contributing a flex gap. Showing: back into the flow first, then let the
       expand animate from the collapsed state. */
    function collapse(el, hide) {
      if (hide) {
        if (el.classList.contains("is-filtered-out")) return;
        el.classList.add("is-filtered-out");
        setTimeout(function () {
          if (el.classList.contains("is-filtered-out")) el.classList.add("is-gone");
        }, 420);
      } else if (el.classList.contains("is-filtered-out")) {
        el.classList.remove("is-gone");
        void el.offsetHeight;
        el.classList.remove("is-filtered-out");
      }
    }

    function applyFilter() {
      let shown = 0;
      feedCards.forEach(function (item) {
        const match = (kind === "all" || item.dataset.kind === kind) &&
          (!host || item.dataset.host === host) &&
          (!stateScope || item.dataset.stateTag === stateScope);
        if (match) {
          item.style.setProperty("--delay", shown * 55 + "ms");
          shown++;
        } else {
          item.style.removeProperty("--delay");
        }
        collapse(item, !match);
      });
      document.querySelectorAll(".day-group").forEach(function (group) {
        const any = group.querySelector(".card[data-kind]:not(.is-filtered-out)");
        collapse(group, !any);
        /* the topmost visible card of each day drops its divider, whatever
           is hidden above it */
        group.querySelectorAll(".card[data-kind]").forEach(function (c) {
          c.classList.toggle("is-feed-first", c === any);
        });
      });

      let empty = document.getElementById("feedEmpty");
      const groups = document.querySelector(".coverage__groups");
      if (!shown && !empty && groups) {
        empty = document.createElement("p");
        empty.id = "feedEmpty";
        empty.className = "feed-empty";
        empty.textContent = "Nothing here yet under these filters.";
        groups.prepend(empty);
      } else if (shown && empty) {
        empty.remove();
      }
    }

    function offsets() {
      const base = filterRow.getBoundingClientRect().left;
      return filterChips.map(function (c) { return c.getBoundingClientRect().left - base; });
    }

    /* FLIP every pill that moved, in both directions — going in AND coming
       back. Only animating the chosen one made the return snap. */
    function flip(before, after) {
      filterChips.forEach(function (c, i) {
        const dx = before[i] - after[i];
        if (!dx || c.classList.contains("is-fading")) return;
        c.style.transition = "none";
        c.style.transform = "translateX(" + dx + "px)";
        requestAnimationFrame(function () {
          c.style.transition = "";
          c.classList.add("is-flipping");
          c.style.transform = "";
          setTimeout(function () { c.classList.remove("is-flipping"); }, 340);
        });
      });
    }

    function setKind(next) {
      const active = filterChips.filter(function (c) { return c.dataset.filter === next; })[0];
      if (!active) return;
      const before = offsets();

      kind = next;
      filterChips.forEach(function (c, i) {
        const on = c === active;
        c.classList.toggle("is-active", on && next !== "all");
        c.setAttribute("aria-pressed", String(on));
        /* leavers hold the slot they already had while they fade */
        if (next !== "all" && !on) {
          c.style.setProperty("--x", before[i] + "px");
          c.classList.add("is-fading");
        } else {
          c.classList.remove("is-fading");
          c.style.removeProperty("--x");
        }
      });

      /* The two secondary pills slide out from behind the chosen one, so the
         distance they travel is that pill's width plus the gap — not some
         fixed offset off the side of the row. */
      const selecting = next !== "all";
      filterRow.style.setProperty("--slide", (active.offsetWidth + 8) + "px");
      const clearEl = document.getElementById("filterClear");
      if (!selecting && clearEl && filterRow.classList.contains("is-selected")) {
        /* the X leaves the flow first so the pills measure their true targets,
           then fades out in place instead of blinking off */
        clearEl.classList.add("is-out");
        setTimeout(function () { clearEl.classList.remove("is-out"); }, 240);
      }
      filterRow.classList.toggle("is-selected", selecting);
      if (hostField) hostField.hidden = next === "opinion";
      [hostTrigger, stateTrigger, document.getElementById("filterClear")].forEach(function (el) {
        if (el) el.tabIndex = selecting ? 0 : -1;
      });
      if (!selecting) {
        host = null;
        stateScope = null;
        if (hostLabel) hostLabel.textContent = "All Hosts";
        if (stateLabel) stateLabel.textContent = "All States";
        if (avatar) avatar.textContent = "";
        closeFeedMenus();
      }

      flip(before, offsets());
      applyFilter();
    }

    /* ---- the two secondary pills ---- */
    function closeFeedMenus() {
      [[hostTrigger, hostMenu], [stateTrigger, stateMenu]].forEach(function (pair) {
        if (!pair[0] || pair[1].hidden) return;
        pair[1].classList.remove("is-open");
        pair[0].setAttribute("aria-expanded", "false");
        const menu = pair[1];
        setTimeout(function () {
          if (!menu.classList.contains("is-open")) menu.hidden = true;
        }, 280);
      });
    }

    function buildMenu(menu, items, current, onPick) {
      menu.innerHTML = items.map(function (it) {
        return '<li><button type="button" role="option" data-id="' + it.id + '"' +
          ((it.id || null) === current ? ' aria-selected="true"' : ' aria-selected="false"') +
          ">" + it.label + "</button></li>";
      }).join("");
      menu.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          onPick(b.dataset.id || null);
          closeFeedMenus();
        });
      });
    }

    function openMenu(trigger, menu) {
      const willOpen = !menu.classList.contains("is-open");
      closeFeedMenus();
      if (!willOpen) return;
      menu.hidden = false;
      requestAnimationFrame(function () { menu.classList.add("is-open"); });
      trigger.setAttribute("aria-expanded", "true");
    }

    if (hostTrigger) {
      hostTrigger.addEventListener("click", function (e) {
        e.stopPropagation();
        buildMenu(hostMenu,
          [{ id: "", label: "All Hosts" }].concat(HOSTS.map(function (h) {
            const ini = h.split(" ").map(function (w) { return w[0]; }).slice(0, 2).join("");
            return { id: h, label: '<span class="host-avatar" aria-hidden="true">' + ini + "</span>" + h };
          })),
          host,
          function (id) {
            host = id;
            hostLabel.textContent = id || "All Hosts";
            if (avatar) {
              avatar.textContent = id
                ? id.split(" ").map(function (w) { return w[0]; }).slice(0, 2).join("")
                : "";
            }
            applyFilter();
          });
        openMenu(hostTrigger, hostMenu);
      });
    }

    if (stateTrigger) {
      stateTrigger.addEventListener("click", function (e) {
        e.stopPropagation();
        buildMenu(stateMenu,
          [{ id: "", label: "All States" }].concat(STATES.map(function (s) {
            return { id: s, label: window.EH.names[s] || s };
          })),
          stateScope,
          function (id) {
            stateScope = id;
            stateLabel.textContent = id ? (window.EH.names[id] || id) : "All States";
            applyFilter();
          });
        openMenu(stateTrigger, stateMenu);
      });
    }

    document.addEventListener("click", closeFeedMenus);

    filterChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        /* clicking the pill that is already on returns to browsing */
        setKind(chip.classList.contains("is-active") ? "all" : chip.dataset.filter);
      });
    });

    const clearBtn = document.getElementById("filterClear");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () { setKind("all"); });
    }
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
    /* One frame later, so forcing layout for the bars does not land in the same
       task that started the sheet's own transition and cut it short. */
    requestAnimationFrame(growBars);
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
  const COUNT_BASE = { dem: 5, toss: 6, rep: 4 };
  /* the frame's widths (639 / 18 / 654 of 1312) — in the file the bar is not
     the proportion of the numbers beside it, it is the current seat
     composition; so it is the baseline and moves along without becoming
     something else */
  const WIDTH_BASE = { dem: 48.70, toss: 1.37, rep: 49.93 };

  /* The seat bar is gone from the screen — the dot grid already says who is
     ahead and by how much, and two devices repeating it was noise. The split
     it used to draw is still computed here, because the grid is dealt from it. */
  const SEAT_SPLIT_SOURCE = true;

  function updateSeatbar() {
    if (!svg) return;
    const count = { dem: 0, toss: 0, rep: 0 };
    svg.querySelectorAll(".state").forEach(function (g) {
      const r = g.getAttribute("class").match(/r-([a-z-]+)/)[1];
      if (r === "off" || r === "blank") return;
      if (r === "tossup" || r === "nodata") count.toss++;
      else if (r.slice(-2) === "-d") count.dem++;
      else count.rep++;
    });

    const chamber = CHAMBER_SEATS[race] || CHAMBER_SEATS.house;
    const cSum = count.dem + count.toss + count.rep || 1;
    const seats = {
      dem: Math.round(chamber * count.dem / cSum),
      toss: Math.round(chamber * count.toss / cSum),
      rep: 0
    };
    seats.rep = chamber - seats.dem - seats.toss;

    renderSeats(seats);
  }

  /* ---------------------------- seats grid ----------------------------
     The frame draws 15 rows of 54 21px dots — 810 slots — under the name
     "Grid 436". The geometry here is the frame's (54 to a row, 3.48 gap); the
     COUNT follows the brief instead: 435 for the House, 100 for the Senate.
     Flagged rather than silently split the difference. */
  const CHAMBER_SEATS = { house: 435, senate: 100, governor: 36 };
  const SEATS_PER_ROW = 54;
  const DOT_GAP = 3.48;
  /* 54 columns is the frame's geometry, and it only works at the frame's
     width. On a 393 phone the same 54 columns leave a 3px dot, which reads
     as noise — so the column count drops until the dot is legible. */
  const DOT_MIN = 9;

  const seatsGrid = document.getElementById("seatsGrid");
  let seatsIntro = !introStill;
  const marginBig = document.getElementById("marginBig");
  const pickPct = document.getElementById("pickPct");
  const pickSourceLabel = document.getElementById("pickSourceLabel");
  const pickRaceLabel = document.getElementById("pickRaceLabel");

  /* The ramp as the frame uses it in the grid: five steps a side. */
  const GRID_D = ["#01cefb", "#0f45db", "#0017a3", "#001b7e", "#17075d"];
  const GRID_R = ["#33003b", "#65003a", "#99003b", "#cc003b", "#fc002c"];

  function dealt(n, ramp, reverse) {
    let out = "";
    for (let i = 0; i < n; i++) {
      const step = Math.min(ramp.length - 1, Math.floor(i * ramp.length / Math.max(1, n)));
      out += '<i style="background:' + ramp[reverse ? ramp.length - 1 - step : step] + '"></i>';
    }
    return out;
  }

  function renderSeats(seats) {
    if (!seatsGrid) return;
    const total = CHAMBER_SEATS[race] || CHAMBER_SEATS.house;
    let cols = Math.min(SEATS_PER_ROW, total);
    const box = seatsGrid.clientWidth;
    if (box) {
      const fits = Math.floor((box + DOT_GAP) / (DOT_MIN + DOT_GAP));
      cols = Math.max(10, Math.min(cols, fits));
    }
    seatsGrid.style.setProperty("--cols", cols);

    const sum = seats.dem + seats.toss + seats.rep || 1;
    const nDem = Math.round(total * seats.dem / sum);
    const nToss = Math.round(total * seats.toss / sum);
    const nRep = total - nDem - nToss;

    /* Democrats run out from the cyan end, Republicans in to the red end, so
       the row reads as one spectrum with the close races meeting in the dark. */
    seatsGrid.innerHTML =
      dealt(nDem, GRID_D, false) +
      dealt(nToss, ["#17075d", "#33003b"], false) +
      dealt(nRep, GRID_R, false);

    if (pickRaceLabel) pickRaceLabel.textContent = label(window.EH.races, race);
    if (pickSourceLabel) pickSourceLabel.textContent = label(window.EH.sources, source);
    if (pickPct) pickPct.textContent = Math.round(seats.dem / sum * 100) + "%";
    if (marginBig) {
      const lead = seats.rep >= seats.dem ? "R" : "D";
      marginBig.textContent = lead + Math.abs(seats.rep - seats.dem);
    }

    /* Only the first deal is an entrance. Re-dealing on a race change or a
       resize must not replay it, and the split has to happen here rather than
       up in the intro because renderSeats rewrites this text itself. */
    if (seatsIntro) {
      seatsIntro = false;
      if (marginBig) splitLetters(marginBig, INTRO.margin, 44);
      /* row by row, top to bottom: the delay follows the row alone, so each
         line of dots grows in together and the fill reads as it fills down */
      const dots = seatsGrid.children;
      for (let i = 0; i < dots.length; i++) {
        dots[i].style.animation = "dot-in 380ms var(--ease) " +
          (INTRO.dots + Math.floor(i / cols) * 34) + "ms backwards";
      }
    }
  }

  /* The column count is width-dependent now, so the grid has to be re-dealt
     when its box changes. A ResizeObserver rather than window.resize: this
     also catches the rails coming and going. Guarded on the width it last
     dealt at, since re-dealing changes the grid's own height. */
  let dealtAt = 0;
  function redealIfResized() {
    if (!seatsGrid) return;
    const w = seatsGrid.clientWidth;
    if (!w || w === dealtAt) return;
    const first = dealtAt === 0;
    dealtAt = w;
    /* The observer's first callback fires straight after the initial deal, at
       the same width. Re-dealing there would throw away the entrance wave
       before a single dot had moved. */
    if (first) return;
    updateSeatbar();
  }
  if (seatsGrid && window.ResizeObserver) {
    new ResizeObserver(redealIfResized).observe(seatsGrid);
  }
  /* window.resize as well as the observer: a backgrounded tab suspends the
     rendering steps the observer rides on, and the grid must be right by the
     time the tab is looked at again. */
  window.addEventListener("resize", redealIfResized);

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
    /* The panel goes from display:none (via [hidden]) straight to visible. One
       rAF is not enough: the browser can batch that with the class below into a
       single style pass, and the sheet simply appears instead of rising.
       Reading a layout property forces the closed state to be committed first,
       so there is something to transition FROM. */
    void panel.offsetHeight;
    /* Synchronously, not in a rAF: the forced reflow above already commits the
       closed state, so there is something to transition from — and a throttled
       frame can no longer swallow the opening. */
    panel.classList.add("is-open");
    if (scrim && mqSheet.matches) scrim.classList.add("is-open");
    syncZoomButtons();
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
    /* The bars are grown by growBars(), AFTER the panel is on screen: setting
       their width while the panel is still display:none skips the transition
       and they simply appear at full length. */
  }

  /* Commit the zero-width state, then set the real widths so the bars grow
     from the left instead of appearing. */
  function growBars() {
    void panel.offsetHeight;
    panel.querySelectorAll(".race-row__bar").forEach(function (b) {
      b.style.width = b.dataset.w + "%";
    });
    panel.classList.add("is-settled");
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

  /* ------------------------------ tooltip ------------------------------
     Follows the pointer inside the card, clamped so it never leaves the frame.
     Pointer only: on touch the tap opens the panel, which says all of this and
     more. */
  const tip = document.getElementById("mapTip");

  function showTip(code, ev) {
    if (!tip || !svg) return;
    const g = svg.querySelector('[data-state="' + code + '"]');
    const rating = g.getAttribute("class").match(/r-([a-z-]+)/)[1];
    const onBallot = rating !== "off" && rating !== "blank";
    const d = window.EH.build(code, rating, race, source);

    tip.innerHTML =
      '<b>' + d.name + "</b>" +
      (onBallot
        ? "<span>" + d.ratingLabel + " — " + d.margin + "</span>" +
          "<span>" + d.source + " " + d.sourceKind.toLowerCase() + " · " + d.updated.toLowerCase() + "</span>" +
          (d.districts.length
            ? "<span>" + d.districts.length + " curated of " +
              (d.districts.length + 5) + " districts — click to zoom in</span>"
            : "")
        : "<span>No 2026 election in this chamber</span>");

    tip.hidden = false;
    tip.setAttribute("aria-hidden", "false");
    moveTip(ev);
    requestAnimationFrame(function () { tip.classList.add("is-on"); });
  }

  function moveTip(ev) {
    if (!tip || tip.hidden) return;
    const r = card.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = ev.clientX - r.left + 16;
    let y = ev.clientY - r.top + 16;
    if (x + w > r.width - 12) x = ev.clientX - r.left - w - 16;
    if (y + h > r.height - 12) y = ev.clientY - r.top - h - 16;
    tip.style.transform = "translate(" + Math.max(12, x) + "px," + Math.max(12, y) + "px)";
  }

  function hideTip() {
    if (!tip) return;
    tip.classList.remove("is-on");
    tip.setAttribute("aria-hidden", "true");
    setTimeout(function () { if (!tip.classList.contains("is-on")) tip.hidden = true; }, 200);
  }

  function bindMap() {
    if (window.matchMedia("(hover: hover)").matches) {
      svg.addEventListener("pointerover", function (ev) {
        const p = ev.target.closest(".state");
        if (p) showTip(p.dataset.state, ev);
      });
      svg.addEventListener("pointermove", function (ev) {
        if (ev.target.closest(".state")) moveTip(ev);
        else hideTip();
      });
      svg.addEventListener("pointerleave", hideTip);
      card.addEventListener("pointerdown", hideTip);
    }

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
