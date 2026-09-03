/* ------------------------------------------------------------------ *
 * Race data.
 *
 * Figma only carries real content for ONE state (Texas, in the "Drawer" frame).
 * For the other 50, the numbers below are generated deterministically from the
 * state code plus the rating the map already holds — they exist so the
 * prototype can be navigated, they are not election data.
 * ------------------------------------------------------------------ */

window.EH = (function () {
  const STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
    MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
    NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
    OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
    WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
  };

  const RATING_LABEL = {
    "safe-d": "Safe Democratic",
    "likely-d": "Likely Democratic",
    "lean-d": "Lean Democratic",
    "tossup": "Toss-up",
    "lean-r": "Lean Republican",
    "likely-r": "Likely Republican",
    "safe-r": "Safe Republican",
    "nodata": "Not yet rated",
    "off": "Not on ballot",
    "blank": "Not on ballot"
  };

  /* lead margin and favourite, per rating */
  const RATING_EDGE = {
    "safe-d": { lead: "D", spread: 22 },
    "likely-d": { lead: "D", spread: 11 },
    "lean-d": { lead: "D", spread: 4.5 },
    "tossup": { lead: null, spread: 0.8 },
    "lean-r": { lead: "R", spread: 4.5 },
    "likely-r": { lead: "R", spread: 11 },
    "safe-r": { lead: "R", spread: 22 },
    "nodata": { lead: null, spread: 0 },
    "off": { lead: null, spread: 0 },
    "blank": { lead: null, spread: 0 }
  };

  const R_NAMES = ["Adrian Smith", "Karen Boyd", "Wes Holloway", "Dana Pruitt", "Grant Ellery", "Marisol Vance"];
  const D_NAMES = ["Becky Stille", "Owen Marsh", "Priya Raman", "Devon Clarke", "Lena Ortiz", "Sam Whitfield"];
  const I_NAMES = ["Mark Cohen", "Tess Aguirre", "Ray Nakamura", "Iris Bell", "Gil Traoré", "Nora Kessler"];

  const RACES = [
    { id: "house", label: "House", title: "U.S. House" },
    { id: "senate", label: "Senate", title: "U.S. Senate" },
    { id: "governor", label: "Governor", title: "Governor" }
  ];

  const SOURCES = [
    { id: "ddhq", label: "DDHQ", kind: "Pooling Data" },
    { id: "kalshi", label: "Kalshi", kind: "Prediction Market" },
    { id: "polymarket", label: "Polymarket", kind: "Prediction Market" }
  ];

  /* Ratings in order, most Democratic to most Republican. Switching source
     shifts each state a few steps along this ramp — that is what conveys
     "Polymarket reads the race differently from DDHQ" without inventing data. */
  const RAMP = ["safe-d", "likely-d", "lean-d", "tossup", "lean-r", "likely-r", "safe-r"];

  /* stable hash per state code — same state, same numbers, every time */
  function seed(code) {
    let h = 0;
    for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
    return h;
  }

  /* Rating of a state for a given race/source, derived from the base rating the
     Figma map already carries (House + Polymarket, as the frame's pill shows). */
  function ratingFor(code, baseRating, race, source) {
    if (baseRating === "blank") return "blank";
    /* The Figma frame draws the House with the pill on Polymarket — that is the
       "original" map. DDHQ and Kalshi are shifts away from it. */
    if (race === "house" && source === "polymarket") return baseRating;

    const h = seed(code + ":" + race + ":" + source);

    /* who is on the ballot changes from chamber to chamber */
    if (race !== "house") {
      const onBallot = (seed(code + race) % 100) < (race === "senate" ? 68 : 72);
      if (!onBallot) return "off";
    } else if (baseRating === "off") {
      return "off";
    }

    let i = RAMP.indexOf(baseRating === "off" || baseRating === "nodata"
      ? RAMP[h % RAMP.length]
      : baseRating);
    if (i < 0) i = 3;
    if (source !== "polymarket") i += (h % 5) - 2;    /* ±2 steps per source */
    if (race !== "house") i += ((h >> 3) % 5) - 2;    /* another chamber, another map */
    return RAMP[Math.max(0, Math.min(RAMP.length - 1, i))];
  }
  function pick(list, code, salt) { return list[(seed(code) + salt) % list.length]; }
  function jitter(code, salt, range) { return ((seed(code) + salt * 97) % 1000) / 1000 * range; }

  function build(code, rating, race, source) {
    race = race || "house";
    source = source || "ddhq";
    const raceDef = RACES.filter(function (r) { return r.id === race; })[0] || RACES[0];
    const srcDef = SOURCES.filter(function (s) { return s.id === source; })[0] || SOURCES[0];
    const name = STATE_NAMES[code] || code;
    const edge = RATING_EDGE[rating] || RATING_EDGE.tossup;
    const onBallot = rating !== "off" && rating !== "blank";
    const salt = seed(code + race + source) % 7;

    const ind = +(1 + jitter(code + source, 3, 3)).toFixed(1);
    const base = (100 - ind) / 2;
    const wobble = jitter(code + source, 5, 2) - 1;
    let r = base + (edge.lead === "R" ? edge.spread / 2 : edge.lead === "D" ? -edge.spread / 2 : wobble)
      + (salt - 3) * 0.4;
    let d = 100 - ind - r;
    r = +r.toFixed(1); d = +d.toFixed(1);

    const margin = Math.abs(r - d).toFixed(1);
    const leader = r >= d ? "R" : "D";

    const candidates = [
      { name: pick(R_NAMES, code, 0), party: "Republican", key: "R", pct: r },
      { name: pick(D_NAMES, code, 1), party: "Democrat", key: "D", pct: d },
      { name: pick(I_NAMES, code, 2), party: "Independent", key: "I", pct: ind }
    ].sort((a, b) => b.pct - a.pct);

    /* only the House has districts; Senate and Governor are one office per state */
    const districtCount = onBallot && race === "house" ? 1 + (seed(code) % 3) : 0;
    const districts = [];
    for (let i = 1; i <= districtCount; i++) {
      const held = ((seed(code) + i) % 2) ? "Republican" : "Democrat";
      districts.push({
        id: code + "-" + String(i).padStart(2, "0"),
        held: held + " held",
        rating: RATING_LABEL[rating],
        pct: Math.round(62 + jitter(code, i * 11, 32))
      });
    }

    return {
      code: code,
      name: name,
      rating: rating,
      ratingLabel: RATING_LABEL[rating] || "—",
      onBallot: onBallot,
      race: raceDef.title,
      raceId: raceDef.id,
      source: srcDef.label,
      sourceKind: srcDef.kind,
      seatNote: (seed(code + race) % 3 === 0 ? "Open seat" : "Incumbent running"),
      margin: (leader === "R" ? "R+" : "D+") + margin,
      updated: "Updated " + (1 + (seed(code + source) % 8)) + "h ago",
      candidates: candidates,
      districts: districts
    };
  }

  return {
    names: STATE_NAMES,
    ratingLabel: RATING_LABEL,
    races: RACES,
    sources: SOURCES,
    ratingFor: ratingFor,
    build: build
  };
})();
