/* Greenpark Archery — scoring / ranking / seeding engine (in-browser, no server) */
(function () {
  "use strict";

  function normClub(c) {
    return (c || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function rng(seed) {
    var x = Math.sin(seed) * 43758.5453;
    return x - Math.floor(x);
  }
  // arrow value: 11 = X (worth 10). otherwise face value.
  function arrowScore(v) { return v === 11 ? 10 : v; }
  function genArrows(skill, salt) {
    var a = [];
    for (var j = 0; j < 36; j++) {
      var r = rng((skill * 100 + 1) * (j + 7) + j * j * 0.137 + salt * 3.7);
      var t = r * 0.46 + skill * 0.54;
      var v;
      if (t > 0.935) v = 11;
      else if (t > 0.79) v = 10;
      else if (t > 0.61) v = 9;
      else if (t > 0.43) v = 8;
      else if (t > 0.28) v = 7;
      else if (t > 0.16) v = 6;
      else v = 5;
      a.push(v);
    }
    return a;
  }
  function tally(arrows) {
    var score = 0, x = 0, ten = 0, nine = 0;
    for (var i = 0; i < arrows.length; i++) {
      var v = arrows[i];
      if (v == null) continue;
      score += arrowScore(v);
      if (v === 11) x++;
      else if (v === 10) ten++;
      else if (v === 9) nine++;
    }
    return { score: score, x: x, ten: ten, nine: nine };
  }

  var FIRST = ["Jose","Rafael","Miguel","Andres","Marco","Leo","Paolo","Nico","Diego","Carlo","Emil","Rey","Anton","Vic","JR","Ken","Aldo","Bert","Caloy","Dino"];
  var FIRSTF = ["Maria","Andrea","Patricia","Bea","Camille","Liza","Nicole","Aira","Diane","Carla","Erika","Rica","Anna","Vina","Kim","Faye","Alex","Bianca","Cathy","Donna"];
  // gender pattern (m/f) used for Mix Team pairing; deterministic so the demo is stable
  var GENDER = ["m","f","m","f","m","m","f","m","f","f","m","f","m","f","m","f","m","f","m","f"];
  var LAST = ["Dela Cruz","Mendoza","Reyes","Tan","Velasco","Lim","Santos","Garcia","Cruz","Ong","Yu","Co","Diaz","Ramos","Aquino","Bautista","Castro","Flores","Gomez","Torres"];
  var CLUBS = ["Pasig AC","QC Archers","Marikina Bowmen","Makati AC","Laguna Archery"];
  var CLUBVAR = { "Pasig AC": ["Pasig AC","Pasig A.C.","pasig archery club"] };

  function seedData() {
    var parts = [];
    for (var i = 0; i < 20; i++) {
      var skill = 0.93 - i * 0.034;
      var arrows = genArrows(skill, i);
      var clubName = CLUBS[i % CLUBS.length];
      // sprinkle club-name variants to demo normalization
      if (clubName === "Pasig AC" && i % 2 === 1) clubName = "Pasig A.C.";
      var fn = GENDER[i] === "f" ? FIRSTF[i] : FIRST[i];
      parts.push({
        id: "A" + (i + 1),
        first: fn,
        last: LAST[i],
        name: fn + " " + LAST[i],
        club: clubName,
        gender: GENDER[i],
        arrows: arrows,
      });
    }
    // Force a clean, unresolved tie around rank 3/4 to demo the shoot-off flow:
    var ord = parts.slice().sort(function (a, b) { return cmp(tally(a.arrows), tally(b.arrows)); });
    var third = ord[2], fourth = ord[3];
    fourth.arrows = third.arrows.slice(); // fully equal -> WA tie-break exhausted
    return parts;
  }

  function cmp(A, B) {
    if (B.score !== A.score) return B.score - A.score;
    if (B.x !== A.x) return B.x - A.x;
    if (B.ten !== A.ten) return B.ten - A.ten;
    if (B.nine !== A.nine) return B.nine - A.nine;
    return 0;
  }

  // Returns ranked list with rankNum, rank label, tie flag, and tally fields merged in.
  function rank(parts, shootoff) {
    shootoff = shootoff || {};
    var rows = parts.map(function (p) {
      var t = tally(p.arrows);
      return Object.assign({}, p, t, { done: p.arrows.filter(function (v) { return v != null; }).length });
    });
    rows.sort(function (a, b) {
      var c = cmp(a, b);
      if (c !== 0) return c;
      // tie-break by recorded shoot-off if present, else stable by name
      var sa = shootoff[a.id], sb = shootoff[b.id];
      if (sa != null && sb != null && sa !== sb) return sb - sa;
      return a.name < b.name ? -1 : 1;
    });
    // assign competition ranking with '=' for unresolved ties
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var prev = rows[i - 1];
      var equalPrev = prev && cmp(prev, r) === 0;
      var equalNext = rows[i + 1] && cmp(rows[i + 1], r) === 0;
      r.rankNum = equalPrev ? prev.rankNum : i + 1;
      var resolved = shootoff[r.id] != null;
      r.tie = (equalPrev || equalNext) && !resolved;
      r.rank = r.tie ? r.rankNum + "=" : String(r.rankNum);
      r.resolved = resolved;
    }
    return rows;
  }

  function tieGroups(ranked) {
    var groups = [];
    for (var i = 0; i < ranked.length; i++) {
      if (ranked[i].tie) {
        var g = [ranked[i]];
        var j = i + 1;
        while (j < ranked.length && ranked[j].tie && cmp(ranked[i], ranked[j]) === 0) { g.push(ranked[j]); j++; }
        if (g.length > 1) groups.push({ rank: ranked[i].rankNum, members: g });
        i = j - 1;
      }
    }
    return groups;
  }

  function teams(ranked, method, size) {
    var i, t;
    size = size || 3;
    if (method === "club") {
      var groups = {};
      ranked.forEach(function (p) {
        var k = normClub(p.club);
        (groups[k] = groups[k] || { label: p.club, list: [] }).list.push(p);
      });
      var out = [], excluded = [];
      Object.keys(groups).forEach(function (k) {
        var g = groups[k];
        if (g.list.length >= size) {
          var m = g.list.slice(0, size);
          out.push({ name: g.label, members: m, seedSum: m.reduce(function (s, x) { return s + x.rankNum; }, 0) });
          g.list.slice(size).forEach(function (x) { excluded.push(x); });
        } else {
          g.list.forEach(function (x) { excluded.push(x); });
        }
      });
      out.sort(function (a, b) { return a.seedSum - b.seedSum; });
      return { teams: out, excluded: excluded, method: method, reason: "club has fewer than " + size + " archers" };
    }
    // byRank, size 2 (Double): top + bottom pairing — Rank1+RankN, Rank2+RankN-1 …
    if (size === 2) {
      var n2 = ranked.length;
      var even = n2 - (n2 % 2);
      var used2 = ranked.slice(0, even);
      var excl2 = ranked.slice(even);
      var pairs = [];
      for (i = 0; i < even / 2; i++) {
        var hi = used2[i], lo = used2[even - 1 - i];
        pairs.push({ name: hi.name.split(" ")[0] + " / " + lo.name.split(" ")[0], members: [hi, lo], seedSum: hi.rankNum + lo.rankNum });
      }
      pairs.sort(function (a, b) { return a.seedSum - b.seedSum; });
      return { teams: pairs, excluded: excl2, method: method, reason: "odd count — one archer left unpaired" };
    }
    // byRank, size 3 (Team): snake distribution (high + low balancing) into teams of 3
    var n = ranked.length;
    var T = Math.floor(n / 3);
    var rem = n % 3;
    var used = ranked.slice(0, n - rem);
    var excludedR = ranked.slice(n - rem);
    var arr = [];
    for (i = 0; i < T; i++) arr.push([]);
    var idx = 0;
    for (var rnd = 0; rnd < 3; rnd++) {
      var order = [];
      for (i = 0; i < T; i++) order.push(i);
      if (rnd % 2 === 1) order.reverse();
      for (var z = 0; z < order.length; z++) { arr[order[z]].push(used[idx++]); }
    }
    var teamsArr = arr.map(function (m, k) {
      return { name: "Team " + String.fromCharCode(65 + k), members: m, seedSum: m.reduce(function (s, x) { return s + x.rankNum; }, 0) };
    });
    teamsArr.sort(function (a, b) { return a.seedSum - b.seedSum; });
    return { teams: teamsArr, excluded: excludedR, method: method, reason: "odd count — teams of 3 leave a remainder" };
  }

  // Seedable entrants for a given event type (Individual / Double / Team / Mix).
  // Each entrant exposes .name + .members + .seedSum so bracketEx can seed it.
  function entrants(ranked, format, mode) {
    mode = mode || "rank";
    var gmode = mode === "club" ? "club" : "rank";
    if (format === "individual") {
      return {
        format: format, size: 1,
        list: ranked.map(function (r) { return { name: r.name, members: [r], seedSum: r.rankNum, club: r.club }; }),
        excluded: [], reason: ""
      };
    }
    var sz = format === "double" ? 2 : 3;
    if (format === "mix") {
      var mt2 = mixTeams(ranked, mode === "club" ? "club" : "rank");
      return { format: format, size: 2, list: mt2.teams, excluded: mt2.excluded, reason: mt2.reason };
    }
    var tr = teams(ranked, gmode, sz);
    return { format: format, size: sz, list: tr.teams, excluded: tr.excluded, reason: tr.reason };
  }

  function seedOrder(n) {
    var pls = [1, 2];
    while (pls.length < n) {
      var s = pls.length * 2 + 1;
      var out = [];
      for (var i = 0; i < pls.length; i++) { out.push(pls[i]); out.push(s - pls[i]); }
      pls = out;
    }
    return pls;
  }

  // field = qualified archers (top N of ranked). size = bracket slots (8/16/32).
  function bracket(ranked, size, field) {
    var fieldList = ranked.slice(0, field);
    var order = seedOrder(size);
    var matches = [];
    for (var i = 0; i < size; i += 2) {
      var sA = order[i], sB = order[i + 1];
      var pA = fieldList[sA - 1] || null;
      var pB = fieldList[sB - 1] || null;
      matches.push({
        no: i / 2 + 1,
        seedA: sA, seedB: sB,
        a: pA, b: pB,
        bye: !pA || !pB,
        target: "T" + (i / 2 + 1),
      });
    }
    return { size: size, field: field, matches: matches, byes: matches.filter(function (m) { return m.bye; }).length };
  }

  // ---- Ranking Mode (§5.4) -------------------------------------------------
  // mode 'combined' = everyone ranked together (default).
  // mode 'separate' = ranked within sub-groups (here: gender). Each row keeps a
  // groupRank within its sub-group plus the overall position for table ordering.
  function rankMode(parts, shootoff, mode, dim) {
    var all = rank(parts, shootoff); // overall order + tie flags
    if (mode !== "separate") return all.map(function (r) { return Object.assign({}, r, { group: null, groupRank: r.rankNum }); });
    dim = dim || "gender";
    var buckets = {};
    all.forEach(function (r) {
      var k = r[dim] || "—";
      (buckets[k] = buckets[k] || []).push(r);
    });
    var out = [];
    Object.keys(buckets).forEach(function (k) {
      var list = buckets[k]; // already in overall order, which respects tie-break
      for (var i = 0; i < list.length; i++) {
        var prev = list[i - 1];
        var equalPrev = prev && cmp(prev, list[i]) === 0;
        var gr = equalPrev ? prev.groupRank : i + 1;
        list[i] = Object.assign({}, list[i], {
          group: k, groupRank: gr,
          rankNum: gr,
          rank: list[i].tie ? gr + "=" : String(gr),
        });
        out.push(list[i]);
      }
    });
    // table order: keep overall score order so the live board reads top-down
    out.sort(function (a, b) { var c = cmp(a, b); return c !== 0 ? c : (a.name < b.name ? -1 : 1); });
    return out;
  }

  // ---- Mix Team pairing (§6.2) ---------------------------------------------
  // Build ranked Boys + Girls lists, trim the longer to equal length, then pair
  // Boy rank i with Girl rank (N - i + 1): best boy + weakest girl, inward.
  function mixTeams(ranked, mode) {
    if (mode === "club") {
      // pair boys + girls WITHIN each club, inward by rank
      var groups = {};
      ranked.forEach(function (p) {
        var k = normClub(p.club);
        groups[k] = groups[k] || { label: p.club, boys: [], girls: [] };
        if (p.gender === "m") groups[k].boys.push(p); else groups[k].girls.push(p);
      });
      var ct = [], cx = [];
      Object.keys(groups).forEach(function (k) {
        var g = groups[k];
        g.boys.sort(function (a, b) { return cmp(a, b); });
        g.girls.sort(function (a, b) { return cmp(a, b); });
        var n = Math.min(g.boys.length, g.girls.length);
        for (var i = 0; i < n; i++) {
          var boy = g.boys[i], girl = g.girls[n - 1 - i];
          ct.push({ name: g.label, members: [boy, girl], seedSum: boy.rankNum + girl.rankNum });
        }
        g.boys.slice(n).forEach(function (x) { cx.push(x); });
        g.girls.slice(n).forEach(function (x) { cx.push(x); });
      });
      ct.sort(function (a, b) { return a.seedSum - b.seedSum; });
      return { teams: ct, excluded: cx, method: "mix", reason: "no opposite-gender partner in the same club" };
    }
    var boys = ranked.filter(function (r) { return r.gender === "m"; });
    var girls = ranked.filter(function (r) { return r.gender === "f"; });
    boys.sort(function (a, b) { return cmp(a, b); });
    girls.sort(function (a, b) { return cmp(a, b); });
    var n = Math.min(boys.length, girls.length);
    var excluded = boys.slice(n).concat(girls.slice(n));
    var teams = [];
    for (var i = 0; i < n; i++) {
      var boy = boys[i];
      var girl = girls[n - 1 - i];
      teams.push({
        name: boy.name.split(" ")[0] + " / " + girl.name.split(" ")[0],
        members: [boy, girl],
        seedSum: boy.rankNum + girl.rankNum,
      });
    }
    teams.sort(function (a, b) { return a.seedSum - b.seedSum; });
    return { teams: teams, excluded: excluded, method: "mix", reason: "no opposite-gender partner remaining" };
  }

  // ---- Match play (Olympic round, set system) ------------------------------
  // sets: [{a:[arrows], b:[arrows]}]. Win set +2, draw +1. First to 6 set pts wins.
  // If 5-5 after 5 sets, cumulative arrow total decides; else a 1-arrow tie-shoot.
  function scoreMatch(sets, shoot) {
    var spA = 0, spB = 0, totA = 0, totB = 0, lines = [], decided = -1;
    for (var i = 0; i < sets.length; i++) {
      var s = sets[i] || {};
      var arrA = s.a || [], arrB = s.b || [];
      var sa = arrA.reduce(function (x, v) { return x + (v == null ? 0 : arrowScore(v)); }, 0);
      var sb = arrB.reduce(function (x, v) { return x + (v == null ? 0 : arrowScore(v)); }, 0);
      var any = arrA.some(function (v) { return v != null; }) || arrB.some(function (v) { return v != null; });
      var ptA = 0, ptB = 0;
      if (any) { if (sa > sb) ptA = 2; else if (sb > sa) ptB = 2; else { ptA = 1; ptB = 1; } }
      if (decided < 0 && spA < 6 && spB < 6) { spA += ptA; spB += ptB; }
      if (decided < 0 && (spA >= 6 || spB >= 6)) decided = i;
      totA += sa; totB += sb;
      lines.push({ sa: sa, sb: sb, ptA: ptA, ptB: ptB, any: any });
    }
    var winner = null, note = '';
    if (spA >= 6) { winner = 'a'; }
    else if (spB >= 6) { winner = 'b'; }
    else if (spA === 5 && spB === 5) {
      // Explicit judge call (closest to centre) wins outright when recorded.
      if (shoot && (shoot.winner === 'a' || shoot.winner === 'b')) {
        winner = shoot.winner;
        note = 'tie-shoot';
      } else if (shoot && shoot.a != null && shoot.b != null && arrowScore(shoot.a) !== arrowScore(shoot.b)) {
        // arrow values differ -> higher value wins
        winner = arrowScore(shoot.a) > arrowScore(shoot.b) ? 'a' : 'b';
        note = 'tie-shoot';
      } else { note = 'tie-shoot-needed'; }
    }
    return { spA: spA, spB: spB, totA: totA, totB: totB, lines: lines, winner: winner, note: note };
  }

  // opts: { policy:'auto'|'admin', manualByes:[seed,...] }
  // Each slot carries a byeReason so the UI can explain WHY a seed is a BYE (§11).
  function bracketEx(ranked, size, field, opts) {
    opts = opts || {};
    var policy = opts.policy || "auto";
    var manual = opts.manualByes || [];
    var fieldList = ranked.slice(0, field);
    var order = seedOrder(size);

    // Which seed numbers are BYE?
    // 1) manual flags always win. 2) empty slots (seed > field) are BYE.
    // 3) auto policy tops up to a power of two by flagging the lowest live seeds
    //    that sit opposite a top seed — but here every slot is already filled to
    //    `size`, so empty-slot BYEs ARE the auto top-up. The difference the spec
    //    cares about: in 'admin' mode we DON'T silently invent BYEs — unfilled
    //    slots show as TBD until staff place them; in 'auto' they resolve to BYE.
    function reasonFor(seed) {
      if (manual.indexOf(seed) >= 0) return "manual";
      if (seed > field) return policy === "auto" ? "empty-auto" : "empty-tbd";
      return null;
    }

    var matches = [];
    for (var i = 0; i < size; i += 2) {
      var sA = order[i], sB = order[i + 1];
      var rA = reasonFor(sA), rB = reasonFor(sB);
      var pA = fieldList[sA - 1] || null;
      var pB = fieldList[sB - 1] || null;
      var aBye = !!rA, bBye = !!rB;
      // admin mode leaves unplaced empty slots as TBD (not BYE)
      var aTbd = policy === "admin" && rA === "empty-tbd";
      var bTbd = policy === "admin" && rB === "empty-tbd";
      matches.push({
        no: i / 2 + 1,
        seedA: sA, seedB: sB,
        a: pA, b: pB,
        byeA: aBye && !aTbd, byeB: bBye && !bTbd,
        tbdA: aTbd, tbdB: bTbd,
        reasonA: rA, reasonB: rB,
        bye: (aBye && !aTbd) || (bBye && !bTbd),
        tbd: aTbd || bTbd,
      });
    }
    var byes = 0;
    matches.forEach(function (m) { if (m.byeA) byes++; if (m.byeB) byes++; });
    return { size: size, field: field, policy: policy, matches: matches, byes: byes };
  }

  // ---- Target assignment engine (§8.2) -------------------------------------
  // For ONE round, given match count and an inclusive target range [from,to]:
  //  R  = range size; nPlayers = nMatches*2.
  //  Rule 1 (R >= nPlayers): every player a unique butt, no letter. Sequential.
  //  Rule 2 (R >= nMatches): one butt per match, players split L / R.
  //  Rule 3 (R <  nMatches): butts cycle; each full pass bumps the letter pair
  //         (A/B, C/D, E/F …). Never repeats a number+letter within the round.
  // Returns { rule, lettered, matches:[{aLabel,bLabel}] }.
  function assignTargets(nMatches, from, to) {
    from = Math.max(1, from | 0); to = Math.max(from, to | 0);
    var R = to - from + 1;
    var nPlayers = nMatches * 2;
    var out = [];
    var rule, lettered = false;
    if (R >= nPlayers) {
      rule = 1;
      var num = from;
      for (var i = 0; i < nMatches; i++) {
        out.push({ aLabel: String(num), bLabel: String(num + 1) });
        num += 2;
      }
    } else if (R >= nMatches) {
      rule = 2;
      for (var j = 0; j < nMatches; j++) {
        var b = from + j;
        out.push({ aLabel: b + " L", bLabel: b + " R" });
      }
    } else {
      rule = 3; lettered = true;
      for (var k = 0; k < nMatches; k++) {
        var butt = from + (k % R);
        var pass = Math.floor(k / R);
        var la = String.fromCharCode(65 + pass * 2);     // A, C, E …
        var lb = String.fromCharCode(65 + pass * 2 + 1); // B, D, F …
        out.push({ aLabel: butt + la, bLabel: butt + lb });
      }
    }
    return { rule: rule, lettered: lettered, R: R, nMatches: nMatches, matches: out };
  }

  // Round sizes for a bracket: R16->[8,4,2,1,1(3rd)] etc.
  function roundsFor(size) {
    var rounds = [];
    var labels = { 16: "R16", 8: "QF", 4: "SF", 2: "Final" };
    var m = size / 2;
    while (m >= 1) {
      var n = m; // matches this round
      var key = m * 2;
      rounds.push({ key: labels[key] || ("R" + key), matches: n });
      if (m === 1) break;
      m = m / 2;
    }
    rounds.push({ key: "3rd", matches: 1 });
    return rounds;
  }

  window.ArcheryEngine = {
    seedData: seedData,
    rank: rank,
    rankMode: rankMode,
    tally: tally,
    tieGroups: tieGroups,
    teams: teams,
    entrants: entrants,
    mixTeams: mixTeams,
    bracket: bracket,
    bracketEx: bracketEx,
    assignTargets: assignTargets,
    scoreMatch: scoreMatch,
    roundsFor: roundsFor,
    seedOrder: seedOrder,
    normClub: normClub,
    arrowScore: arrowScore,
  };
})();
