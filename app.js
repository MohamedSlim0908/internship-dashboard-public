/* ============================================================
   Runway — internship pipeline dashboard
   Plain client-side app. Reads window.__DATA__ (built by build.py),
   keeps a small localStorage overlay for personal workflow marks,
   renders five views + a full-screen offer detail.
   No network, no timers, no auto-refresh.
   ============================================================ */
(function () {
"use strict";

var D = window.__DATA__;
if (!D) { document.getElementById("viewport").innerHTML =
  "<p style='padding:40px;color:#a1a4b4'>data.js failed to load — run <code>python3 build.py</code>.</p>";
  return; }

/* index offers by id for quick lookup */
var BY_ID = {};
D.internships.forEach(function (i) { BY_ID[i.id] = i; });

/* ---- localStorage overlay (personal workflow marks) -------- */
var SKEY = "runway.v1";
var store = (function () {
  try { return JSON.parse(localStorage.getItem(SKEY)) || {}; }
  catch (e) { return {}; }
})();
store.applied = store.applied || {};
store.snoozed = store.snoozed || {};
store.starred = store.starred || {};
function persist() {
  try { localStorage.setItem(SKEY, JSON.stringify(store)); } catch (e) {}
}
function isApplied(id) { return !!store.applied[id]; }
function isSnoozed(id) { return !!store.snoozed[id]; }
function isStarred(id) { return !!store.starred[id]; }
function toggle(bag, id) {
  if (bag[id]) { delete bag[id]; return false; }
  bag[id] = new Date().toISOString(); return true;
}

/* ---- app state -------------------------------------------- */
var state = {
  view: "today",
  detailId: null,
  apply: { q: "", filter: "all", page: 1 },
  roles: { q: "", status: "active", sort: "score", company: "", page: 1 },
  employers: { q: "", sector: "all" }
};
var APPLY_PAGE = 12, ROLES_PAGE = 16;

/* ============================================================
   Static maps
   ============================================================ */
var STATUS = {
  new:           { label: "New",      c: "--st-new" },
  qualified:     { label: "Qualified",c: "--st-qualified" },
  manual_review: { label: "Review",   c: "--st-manual_review" },
  applied:       { label: "Applied",  c: "--st-applied" },
  wishlist:      { label: "Wishlist", c: "--st-wishlist" },
  blocked:       { label: "Blocked",  c: "--st-blocked" },
  closed:        { label: "Closed",   c: "--st-closed" }
};
var STAGE_LABEL = {
  Discover:  "LinkedIn + web sweep",
  Scan:      "Reads application questions",
  Inventory: "Catalogs the questions",
  Map:       "Maps ATS form fields",
  Draft:     "Drafts resume + cover letter",
  Brief:     "Daily 9 AM digest"
};
var HEALTH_LABEL = {
  healthy: "On track", lagging: "Behind", error: "Error",
  waiting: "Waiting", paused: "Paused"
};

var ICON = {
  today:'<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.3 4.9-4.9 2.3 2.3-4.9z"/>',
  apply:'<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  roles:'<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  employers:'<path d="M4 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M13 21v-9h5a2 2 0 0 1 2 2v7"/><path d="M7.5 7h2M7.5 11h2M7.5 15h2"/><path d="M3 21h18"/>',
  automation:'<rect x="6.5" y="6.5" width="11" height="11" rx="2.2"/><rect x="10" y="10" width="4" height="4" rx="1"/><path d="M9.5 2v3M14.5 2v3M9.5 19v3M14.5 19v3M2 9.5h3M2 14.5h3M19 9.5h3M19 14.5h3"/>',
  pin:'<path d="M12 21s-6.5-5-6.5-10.5A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.5C18.5 16 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.4 2"/>',
  ext:'<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  check:'<path d="M5 13l4.5 4.5L20 6"/>',
  star:'<path d="M12 3.2l2.7 5.9 6.3.6-4.8 4.3 1.4 6.3L12 17.7l-5.8 3.4 1.4-6.3L2.8 9.7l6.3-.6z"/>',
  moon:'<path d="M20 14.2A8 8 0 1 1 9.4 4a6.4 6.4 0 0 0 10.6 10.2z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  arrowR:'<path d="M5 12h13M12 5.5l6.5 6.5L12 18.5"/>',
  arrowL:'<path d="M19 12H6M12.5 5.5L6 12l6.5 6.5"/>',
  alert:'<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 9.5v5M12 17.6v.05"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5.2M12 7.6v.05"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
  bulb:'<path d="M9.2 18h5.6M10.3 21.5h3.4M12 2.5A6.5 6.5 0 0 0 8 14c.7.6 1.2 1.3 1.3 2.2h5.4c.1-.9.6-1.6 1.3-2.2A6.5 6.5 0 0 0 12 2.5z"/>',
  send:'<path d="M21.5 2.5L11 13M21.5 2.5L15 21.5 11 13 2.5 9z"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8.5 3v4M15.5 3v4"/>',
  hash:'<path d="M9.5 4L7.5 20M16.5 4l-2 16M4.5 9h15M3.8 15h15"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  brief:'<rect x="3" y="7.5" width="18" height="12.5" rx="2.2"/><path d="M8.5 7.5V5.6A1.6 1.6 0 0 1 10 4h4a1.6 1.6 0 0 1 1.6 1.6V7.5M3 13h18"/>',
  flow:'<path d="M5 6h6M5 12h14M5 18h9"/><circle cx="18" cy="6" r="2.2"/><circle cx="16" cy="18" r="2.2"/>',
  bell:'<path d="M18 9a6 6 0 0 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9z"/><path d="M10 20a2.4 2.4 0 0 0 4 0"/>',
  inbox:'<path d="M3 13l3.2-7.5A2 2 0 0 1 8 4h8a2 2 0 0 1 1.8 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  doc:'<path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5z"/><path d="M14 3.5V8h4M8.8 12h6.4M8.8 15.5h6.4"/>',
  spark:'<path d="M12 3v5M12 16v5M5 12H3M21 12h-2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"/><circle cx="12" cy="12" r="3.4"/>'
};
function svg(name, cls) {
  return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" ' +
    'aria-hidden="true">' + ICON[name] + "</svg>";
}

/* ============================================================
   Helpers
   ============================================================ */
function $(s, r) { return (r || document).querySelector(s); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c];
  });
}
function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

function tier(score) {
  if (score >= 85) return { k:"hot",    name:"Apply now",      sub:"Top of your queue" };
  if (score >= 70) return { k:"strong", name:"Strong match",   sub:"High-confidence pick" };
  if (score >= 55) return { k:"fair",   name:"Worth a look",   sub:"Check the fit, then apply" };
  return { k:"low", name:"Lower priority", sub:"Lower readiness for now" };
}
function recFlag(rec) {
  var r = (rec || "").toUpperCase();
  if (r === "APPLY NOW")          return { cls:"flag-now",   t:"Apply now" };
  if (r === "APPLY TODAY")        return { cls:"flag-now",   t:"Apply today" };
  if (r === "APPLY TODAY IF TIME")return { cls:"flag-soon",  t:"Apply if time" };
  if (r === "REVIEW FIT AND APPLY" || r === "REVIEW")
                                  return { cls:"flag-soon",  t:"Review & apply" };
  if (r === "SAVE FOR LATER")     return { cls:"flag-later", t:"Save for later" };
  return null;
}
function statusPill(s) {
  var m = STATUS[s] || { label: s, c: "--st-closed" };
  return '<span class="pill" style="color:var(' + m.c + ');background:' +
    'color-mix(in srgb,var(' + m.c + ') 14%,transparent);box-shadow:inset 0 0 0 1px ' +
    'color-mix(in srgb,var(' + m.c + ') 32%,transparent)">' +
    '<span class="dot" style="background:var(' + m.c + ')"></span>' +
    esc(m.label) + "</span>";
}
function ring(score, size) {
  var t = tier(score);
  return '<div class="ring' + (size ? " " + size : "") + " tier-" + t.k + '">' +
    '<svg viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="16"/>' +
    '<circle class="fg" cx="20" cy="20" r="16" pathLength="100" ' +
    'stroke-dasharray="' + score + ' 100"/></svg>' +
    '<span class="ring-val">' + score + "</span></div>";
}
function dlChip(dl) {
  if (!dl || dl.cls === "none") return "";
  var ic = (dl.cls === "urgent" || dl.cls === "soon") ? svg("clock") : "";
  return '<span class="dl dl-' + dl.cls + '">' + ic + esc(dl.label) + "</span>";
}
function metaBits(i) {
  var out = [];
  if (i.location) out.push("<span>" + svg("pin") + esc(i.location) + "</span>");
  if (i.workModel) out.push("<span>" + esc(i.workModel) + "</span>");
  if (i.ats) out.push("<span>" + esc(i.ats) + "</span>");
  return out.join("");
}

/* ---- queues ------------------------------------------------ */
function liveQueue() {
  /* in-queue offers minus the ones you've personally cleared */
  return D.internships.filter(function (i) {
    return i.inQueue && !isApplied(i.id) && !isSnoozed(i.id);
  });
}
function extraAppliedCount() {
  return Object.keys(store.applied).filter(function (id) {
    return BY_ID[id] && BY_ID[id].status !== "applied";
  }).length;
}

/* ============================================================
   Components
   ============================================================ */
function offerCard(i, idx, rank) {
  var flag = recFlag(i.recommendation);
  var lead = rank
    ? '<span class="offer-rank">#' + rank + "</span>"
    : "";
  var step = i.nextStep
    ? '<div class="offer-step">' + esc(i.nextStep) + "</div>" : "";
  var applied = isApplied(i.id) || i.status === "applied";
  var openBtn = i.url
    ? '<a class="qa" href="' + esc(i.url) + '" target="_blank" rel="noopener" ' +
      'aria-label="Open application">' + svg("ext") + "Apply</a>"
    : '<span class="qa" style="opacity:.45">No link</span>';
  var docBtn = i.downloads && i.downloads.coverLetter
    ? '<a class="qa" href="' + esc(i.downloads.coverLetter) + '" download ' +
      'aria-label="Download cover letter">' + svg("doc") + "Cover letter</a>"
    : "";

  return '<div class="offer stagger" role="button" tabindex="0" ' +
    'data-act="detail" data-id="' + esc(i.id) + '" style="--i:' + (idx || 0) + '">' +
    '<div class="offer-row">' + ring(i.applyScore, "sm") +
      '<div class="offer-main">' +
        '<div class="offer-co">' + lead + esc(i.company) + statusPill(i.status) +
          (flag ? '<span class="flag ' + flag.cls + '">' + esc(flag.t) + "</span>" : "") +
        "</div>" +
        '<div class="offer-role">' + esc(i.role) + "</div>" +
        '<div class="offer-meta">' + metaBits(i) +
          (dlChip(i.deadline) ? "<span>" + dlChip(i.deadline) + "</span>" : "") +
        "</div>" +
      "</div>" +
    "</div>" + step +
    '<div class="offer-foot">' +
      '<button class="qa' + (isStarred(i.id) ? " is-on" : "") + '" data-act="star" ' +
        'data-id="' + esc(i.id) + '" aria-label="Star">' + svg("star") +
        (isStarred(i.id) ? "Starred" : "Star") + "</button>" +
      '<button class="qa' + (applied ? " is-done" : "") + '" data-act="applied" ' +
        'data-id="' + esc(i.id) + '">' + svg("check") +
        (applied ? "Applied" : "Mark applied") + "</button>" +
      '<span class="spacer"></span>' + docBtn + openBtn +
    "</div></div>";
}

function documentButtons(i) {
  var d = i.downloads || {};
  var labels = [
    ["coverLetter", "Cover letter PDF"],
    ["tailoredCv", "Tailored CV PDF"],
    ["packetNote", "Packet note"],
    ["answers", "Application answers"],
    ["postingEvidence", "Posting evidence"]
  ];
  var buttons = labels.map(function (pair) {
    var href = d[pair[0]];
    if (!href) return "";
    return '<a class="btn btn-ghost" href="' + esc(href) + '" download>' +
      svg("doc") + esc(pair[1]) + "</a>";
  }).join("");
  if (!buttons) return "";
  return '<div class="dt-sec"><div class="eyebrow">Documents ready to download</div>' +
    '<div class="dt-actions" style="margin-top:10px">' + buttons + "</div></div>";
}

function eligibilityRow(i, idx) {
  return '<div class="offer stagger" role="button" tabindex="0" ' +
    'data-act="detail" data-id="' + esc(i.id) + '" style="--i:' + idx +
    ';border-color:rgba(244,177,62,.26)">' +
    '<div class="offer-co">' + esc(i.company) + statusPill(i.status) + "</div>" +
    '<div class="offer-role">' + esc(i.role) + "</div>" +
    '<div class="offer-step">' + esc(i.nextStep) + "</div></div>";
}

function cronCard(j, idx) {
  var cell = function (k, v, mono) {
    return '<div class="cron-cell"><div class="k">' + k + "</div>" +
      '<div class="v' + (mono ? " mono" : "") + '">' + v + "</div></div>";
  };
  var tools = (j.toolsets || []).map(function (t) {
    return '<span class="pill-tag">' + esc(t) + "</span>";
  }).join("");
  return '<div class="cron card stagger h-' + j.health + '" style="--i:' + idx + '">' +
    '<div class="cron-head"><div style="flex:1;min-width:0">' +
      '<div class="flow-stage">' + esc(j.stage) + " · stage " + (j.order + 1) + "</div>" +
      '<div class="cron-name">' + esc(j.name) + "</div>" +
      '<div class="cron-id">' + esc(j.id) + "</div></div>" +
      '<span class="cron-health"><span class="dot"></span>' + esc(j.healthLabel) +
      "</span></div>" +
    '<p class="cron-desc">' + esc(j.summary) + "</p>" +
    '<div class="cron-grid">' +
      cell("Schedule", esc(j.scheduleLabel), false) +
      cell("Delivers to", svg("hash") + "<span class='mono'>" + esc(j.channel) +
        "</span>", false) +
      cell("Last run", j.lastRunRel ? esc(j.lastRunRel) : "—", true) +
      cell("Next run", j.nextRunRel ? esc(j.nextRunRel) : "—", true) +
    "</div>" +
    (j.repeatLabel ? '<div class="cron-tools"><span class="pill-tag">' +
      esc(j.repeatLabel) + "</span>" + tools + "</div>"
      : (tools ? '<div class="cron-tools">' + tools + "</div>" : "")) +
    "</div>";
}

function employerCard(e, idx) {
  var roles = (e.typicalRoles || []).slice(0, 5).map(function (r) {
    return '<span class="pill-tag">' + esc(r) + "</span>";
  }).join("");
  var foot = e.trackerCount
    ? '<span class="emp-count"><b>' + e.trackerCount + "</b> in tracker" +
      (e.openCount ? " · <b>" + e.openCount + "</b> open" : "") + "</span>" +
      '<button class="qa" data-act="emp-roles" data-company="' + esc(e.name) +
        '" style="margin-left:auto">' + svg("arrowR") + "View roles</button>"
    : '<span class="emp-count muted">No matching roles in the tracker yet</span>';
  return '<div class="emp card stagger" style="--i:' + idx + '">' +
    '<div class="emp-head"><div class="emp-pri"><b>' + e.priority +
      "</b><small>priority</small></div>" +
      '<div style="flex:1;min-width:0"><div class="emp-name">' + esc(e.name) + "</div>" +
      '<div class="emp-sub"><span>' + esc(e.sector || "—") + "</span><span>" +
      esc(e.province || "") + "</span></div></div></div>" +
    (e.quickTip ? '<p class="emp-tip">' + svg("bulb") + "<span>" +
      esc(e.quickTip) + "</span></p>" : "") +
    (roles ? '<div class="emp-roles">' + roles + "</div>" : "") +
    '<div class="emp-foot">' + foot + "</div></div>";
}

function showMore(label) {
  return '<button class="showmore" data-act="more">' + esc(label) + "</button>";
}
function emptyState(title, msg, icon) {
  return '<div class="empty">' + svg(icon || "inbox") +
    "<b>" + esc(title) + "</b><p>" + esc(msg) + "</p></div>";
}
function sec(title, meta, link) {
  return '<div class="sec"><h2>' + esc(title) + "</h2>" +
    (link ? '<button class="sec-link" data-act="nav" data-view="' + link.view +
      '"' + (link.filter ? ' data-filter="' + link.filter + '"' : "") +
      (link.status ? ' data-status="' + link.status + '"' : "") + ">" +
      esc(link.label) + "</button>"
      : (meta ? '<span class="sec-meta">' + esc(meta) + "</span>" : "")) +
    "</div>";
}

/* ============================================================
   View: Today
   ============================================================ */
function viewToday() {
  var now = new Date();
  var hr = now.getHours();
  var greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  var dateLine = now.toLocaleDateString("en-CA",
    { weekday: "long", month: "long", day: "numeric" });

  var q = liveQueue();
  var hero = q[0];
  var k = D.kpis;
  var cs = D.cronSummary;
  var extra = extraAppliedCount();

  /* ---- hero ---- */
  var heroHTML;
  if (hero) {
    var flag = recFlag(hero.recommendation);
    var hm = [];
    if (hero.location) hm.push("<span>" + svg("pin") + esc(hero.location) + "</span>");
    if (hero.workModel) hm.push("<span>" + esc(hero.workModel) + "</span>");
    if (hero.ats) hm.push("<span>" + esc(hero.ats) + "</span>");
    if (hero.source) hm.push("<span>via " + esc(hero.source) + "</span>");
    heroHTML =
      '<section class="hero stagger" style="--i:0">' +
      '<div class="hero-eyebrow"><span class="hero-pulse"></span>' +
        '<span class="eyebrow">Next best action</span></div>' +
      '<div class="hero-body">' + ring(hero.applyScore, "lg") +
        '<div class="hero-main">' +
          '<div class="hero-co">' + esc(hero.company) + statusPill(hero.status) +
            (flag ? '<span class="flag ' + flag.cls + '">' + esc(flag.t) +
              "</span>" : "") + "</div>" +
          '<h2 class="hero-role">' + esc(hero.role) + "</h2>" +
          '<div class="hero-meta">' + hm.join("") +
            (dlChip(hero.deadline) ? "<span>" + dlChip(hero.deadline) + "</span>" : "") +
          "</div></div></div>" +
      '<div class="hero-step">' + svg("target") + "<span>" + esc(hero.nextStep) +
        "</span></div>" +
      '<div class="hero-cta">' +
        (hero.url
          ? '<a class="btn btn-primary" href="' + esc(hero.url) +
            '" target="_blank" rel="noopener">' + svg("send") + "Open application</a>"
          : '<span class="btn btn-primary" style="opacity:.6">No application link</span>') +
        '<button class="btn btn-ghost" data-act="detail" data-id="' + esc(hero.id) +
          '">Details</button>' +
      "</div></section>";
  } else {
    heroHTML = '<section class="hero stagger" style="--i:0">' +
      '<div class="hero-eyebrow"><span class="eyebrow" style="color:var(--accent)">' +
      "Queue clear</span></div>" +
      '<h2 class="hero-role">You’ve cleared the queue.</h2>' +
      '<p class="muted" style="font-size:13.5px">Every ready lead is marked ' +
      "applied or snoozed. Browse the full inventory under Roles, or rebuild " +
      "the data to pull in new postings.</p></section>";
  }

  /* ---- KPI tiles ---- */
  function kpi(i, label, val, foot, icon, act, accent) {
    return '<button class="kpi stagger' + (accent ? " kpi-accent" : "") +
      '" style="--i:' + i + '" data-act="' + act.a + '"' +
      (act.view ? ' data-view="' + act.view + '"' : "") +
      (act.filter ? ' data-filter="' + act.filter + '"' : "") +
      (act.status ? ' data-status="' + act.status + '"' : "") + ">" +
      (accent ? '<span class="kpi-tint" style="background:var(--accent)"></span>' : "") +
      '<div class="kpi-top">' + svg(icon, "kpi-ico") +
        '<span class="kpi-label">' + label + "</span></div>" +
      '<div class="kpi-val">' + val + "</div>" +
      '<div class="kpi-foot">' + foot + "</div></button>";
  }
  var kpisHTML = '<div class="kpis">' +
    kpi(1, "Apply-ready", k.applyReady, "Qualified + new leads", "apply",
        { a:"nav", view:"apply", filter:"all" }, true) +
    kpi(2, "Closing soon", k.dueSoon, "Deadline within 14 days", "clock",
        { a:"nav", view:"apply", filter:"closing" }) +
    kpi(3, "Applied", k.applied + extra,
        extra ? k.applied + " logged · +" + extra + " by you" : "Submitted so far",
        "check", { a:"nav", view:"roles", status:"applied" }) +
    kpi(4, "Eligibility", k.needsReview, "Need a quick check first", "alert",
        { a:"nav", view:"apply", filter:"checks" }) +
    "</div>";

  /* ---- pipeline status bar ---- */
  var total = k.total;
  var segs = D.statusOrder.map(function (s) {
    var n = D.statusCounts[s] || 0;
    if (!n) return "";
    return '<span style="flex:' + n + ';background:var(' + STATUS[s].c +
      ')" title="' + esc(STATUS[s].label + ": " + n) + '"></span>';
  }).join("");
  var legend = D.statusOrder.map(function (s) {
    var n = D.statusCounts[s] || 0;
    if (!n) return "";
    return '<li><button class="pipe-leg" data-act="nav" data-view="roles" ' +
      'data-status="' + s + '" style="display:flex;align-items:center;gap:7px">' +
      '<span class="dot" style="background:var(' + STATUS[s].c + ')"></span>' +
      esc(STATUS[s].label) + " <b>" + n + "</b></button></li>";
  }).join("");
  var pipeHTML = '<div class="card stagger" style="--i:5;padding:15px 14px">' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;' +
    'margin-bottom:11px"><span class="eyebrow">Pipeline</span>' +
    '<span class="sec-meta mono">' + total + " tracked</span></div>" +
    '<div class="pipeline-bar">' + segs + "</div>" +
    '<ul class="pipe-legend">' + legend + "</ul></div>";

  /* ---- closing soon ---- */
  var closing = D.internships.filter(function (i) {
    return (i.deadline.cls === "urgent" || i.deadline.cls === "soon") &&
      i.status !== "applied" && i.status !== "closed" && !isApplied(i.id);
  }).sort(function (a, b) { return (a.deadline.days || 0) - (b.deadline.days || 0); });
  var closingHTML = closing.length
    ? sec("Closing soon", null, { view:"apply", filter:"closing",
        label:"All " + closing.length }) +
      closing.slice(0, 3).map(function (i, x) { return offerCard(i, x); }).join("")
    : "";

  /* ---- up next ---- */
  var upNext = q.slice(1, 5);
  var upHTML = upNext.length
    ? sec("Up next", null, { view:"apply", filter:"all", label:"Full queue" }) +
      upNext.map(function (i, x) { return offerCard(i, x, x + 2); }).join("")
    : "";

  /* ---- eligibility ---- */
  var elig = D.internships.filter(function (i) { return i.needsEligibilityCheck; });
  var eligHTML = elig.length
    ? sec("Needs your decision", null,
        elig.length > 3 ? { view:"apply", filter:"checks",
          label:"All " + elig.length } : null) +
      '<p class="muted" style="font-size:12.5px;margin:-4px 2px 10px">' +
      "An eligibility check stands between you and these — confirm, then apply." +
      "</p>" +
      elig.slice(0, 3).map(function (i, x) { return eligibilityRow(i, x); }).join("")
    : "";

  /* ---- automation strip ---- */
  var errJob = D.crons.filter(function (j) { return j.health === "error"; })[0];
  var autoTone = cs.error ? "banner-warn" : cs.lagging ? "banner-warn" : "banner-info";
  var autoMsg = cs.needsAttention
    ? "<b>" + cs.needsAttention + " of " + cs.total + " automations need a look.</b> "
      + (cs.error ? plural(cs.error, "job") + " errored" : "")
      + (cs.error && cs.lagging ? " · " : "")
      + (cs.lagging ? plural(cs.lagging, "job") + " behind schedule" : "")
      + (errJob ? " — latest: " + esc(errJob.name) + "." : ".")
    : "<b>All automations are running.</b> The pipeline is feeding leads normally.";
  var autoHTML = sec("Automation", null, { view:"automation", label:"Open" }) +
    '<div class="banner ' + autoTone + ' stagger" style="--i:0">' +
    svg(cs.needsAttention ? "alert" : "check") +
    '<span class="bx">' + autoMsg + "</span>" +
    '<button class="btn btn-ghost btn-sm banner-act" data-act="nav" ' +
    'data-view="automation">View</button></div>';

  /* ---- footer ---- */
  var footHTML = '<div class="foot stagger" style="--i:1">' +
    '<div class="foot-row">' + svg("info", "kpi-ico") +
    "<span>Runway reads three local files — nothing leaves this machine.</span>" +
    "</div>" +
    '<div class="foot-row">Snapshot <code>' + esc(D.meta.snapshotLabel) +
    "</code> · refresh with <code>python3 build.py</code></div>" +
    '<div class="foot-row"><span>Personal marks (starred / applied / snoozed) ' +
    'are saved in this browser only.</span><button data-act="reset">Reset marks' +
    "</button></div></div>";

  return '<header class="view-head">' +
    '<div class="eyebrow">' + esc(dateLine) + "</div>" +
    "<h1>" + greet + ",<br>here’s what <em>moves the needle</em>.</h1>" +
    '<p class="sub">' + k.queueSize + " leads in the queue · " +
      k.dueSoon + " closing within two weeks · " +
      (cs.needsAttention ? cs.needsAttention + " automations to check" :
        "automations healthy") + ".</p></header>" +
    heroHTML + kpisHTML + pipeHTML +
    '<div class="cols"><div>' + closingHTML + upHTML + "</div>" +
    "<div>" + eligHTML + autoHTML + footHTML + "</div></div>";
}

/* ============================================================
   View: Apply
   ============================================================ */
function viewApply() {
  var f = state.apply;
  var checks = D.internships.filter(function (i) {
    return i.needsEligibilityCheck;
  });
  var snoozed = D.internships.filter(function (i) { return isSnoozed(i.id); });
  var base = liveQueue();

  var CHIPS = [
    { k:"all",     label:"All ready",  n:base.length },
    { k:"now",     label:"Apply now",  n:base.filter(isNow).length },
    { k:"closing", label:"Closing soon", n:base.filter(isClosing).length },
    { k:"easy",    label:"Easy apply", n:base.filter(isEasy).length },
    { k:"starred", label:"Starred",    n:base.filter(function (i) {
        return isStarred(i.id); }).length },
    { k:"checks",  label:"Eligibility", n:checks.length },
    { k:"snoozed", label:"Snoozed",    n:snoozed.length }
  ];

  function isNow(i) {
    var r = (i.recommendation || "").toUpperCase();
    return r.indexOf("APPLY NOW") === 0 || r === "APPLY TODAY" ||
      i.applyScore >= 85;
  }
  function isClosing(i) {
    return i.deadline.cls === "urgent" || i.deadline.cls === "soon";
  }
  function isEasy(i) { return (i.scoreParts.ease || 0) >= 7; }

  /* resolve the active list */
  var list;
  if (f.filter === "checks") list = checks.slice();
  else if (f.filter === "snoozed") list = snoozed.slice();
  else {
    list = base.slice();
    if (f.filter === "now") list = list.filter(isNow);
    if (f.filter === "closing") list = list.filter(isClosing);
    if (f.filter === "easy") list = list.filter(isEasy);
    if (f.filter === "starred") list = list.filter(function (i) {
      return isStarred(i.id); });
  }
  /* search */
  var query = f.q.trim().toLowerCase();
  if (query) list = list.filter(function (i) {
    return (i.company + " " + i.role + " " + i.location + " " + i.ats)
      .toLowerCase().indexOf(query) >= 0;
  });
  /* starred float to the top within the queue filters */
  if (f.filter !== "checks" && f.filter !== "snoozed") {
    list.sort(function (a, b) {
      var sa = isStarred(a.id) ? 1 : 0, sb = isStarred(b.id) ? 1 : 0;
      if (sa !== sb) return sb - sa;
      return b.applyScore - a.applyScore;
    });
  }

  var shown = list.slice(0, f.page * APPLY_PAGE);
  var chipsHTML = CHIPS.map(function (c) {
    return '<button class="chip' + (f.filter === c.k ? " on" : "") +
      '" data-act="chip" data-filter="' + c.k + '">' + esc(c.label) +
      '<span class="ct">' + c.n + "</span></button>";
  }).join("");

  var banner = "";
  if (f.filter === "all" && checks.length) {
    banner = '<div class="banner banner-warn" style="margin-bottom:12px">' +
      svg("alert") + '<span class="bx"><b>' + plural(checks.length, "offer") +
      " need an eligibility check</b> before you can apply.</span>" +
      '<button class="btn btn-ghost btn-sm banner-act" data-act="chip" ' +
      'data-filter="checks">Review</button></div>';
  }

  var listHTML;
  if (!shown.length) {
    listHTML = emptyState(
      query ? "No matches" : "Nothing here",
      query ? "No offers match “" + f.q + "”." :
        f.filter === "snoozed" ? "You haven’t snoozed anything." :
        "This filter is empty right now.",
      "search");
  } else {
    listHTML = '<div class="grid-cards">' +
      shown.map(function (i, x) {
        return offerCard(i, x, f.filter === "all" && !query ? x + 1 : null);
      }).join("") + "</div>" +
      (list.length > shown.length
        ? showMore("Show " + Math.min(APPLY_PAGE, list.length - shown.length) +
            " more · " + (list.length - shown.length) + " remaining")
        : "");
  }

  var subN = base.length;
  return '<header class="view-head">' +
    '<div class="eyebrow">Apply queue</div>' +
    "<h1>What to apply to <em>next</em>.</h1>" +
    '<p class="sub">' + subN + " leads ready, ranked by an apply-readiness " +
    "score. Work top-down — starred offers float up.</p></header>" +
    '<div class="search"><label for="searchInput" class="muted" ' +
    'style="display:flex">' + svg("search") + "</label>" +
    '<input id="searchInput" data-search="apply" placeholder="Search company, ' +
    'role, location…" value="' + esc(f.q) + '" autocomplete="off">' +
    (f.q ? '<button data-act="clearsearch" aria-label="Clear">×</button>' : "") +
    "</div>" +
    '<div class="chips">' + chipsHTML + "</div>" +
    banner + listHTML;
}

/* ============================================================
   View: Roles (full inventory)
   ============================================================ */
function viewRoles() {
  var r = state.roles;
  var list = D.internships.slice();

  if (r.company) list = list.filter(function (i) {
    var c = i.company.toLowerCase(), e = r.company.toLowerCase();
    return c === e || c.indexOf(e) === 0;
  });
  if (r.status === "active") list = list.filter(function (i) {
    return ["new", "qualified", "manual_review", "wishlist"].indexOf(i.status) >= 0;
  });
  else if (r.status !== "all") list = list.filter(function (i) {
    return i.status === r.status;
  });
  var query = r.q.trim().toLowerCase();
  if (query) list = list.filter(function (i) {
    return (i.company + " " + i.role + " " + i.location + " " + i.ats + " " +
      i.source).toLowerCase().indexOf(query) >= 0;
  });

  if (r.sort === "fit")
    list.sort(function (a, b) { return (b.fit || 0) - (a.fit || 0); });
  else if (r.sort === "new")
    list.sort(function (a, b) {
      return (b.dateFound || "").localeCompare(a.dateFound || ""); });
  else if (r.sort === "az")
    list.sort(function (a, b) { return a.company.localeCompare(b.company); });
  else
    list.sort(function (a, b) { return b.applyScore - a.applyScore; });

  var shown = list.slice(0, r.page * ROLES_PAGE);

  /* status filter chips with counts */
  var sChips = [
    { k:"active", label:"Active only", n:D.kpis.activeLeads },
    { k:"all", label:"All", n:D.kpis.total }
  ].concat(
    D.statusOrder.map(function (s) {
      return { k:s, label:STATUS[s].label, n:D.statusCounts[s] || 0 };
    })).filter(function (c) { return c.n > 0 || c.k === "all"; });
  var chipsHTML = sChips.map(function (c) {
    return '<button class="chip' + (r.status === c.k ? " on" : "") +
      '" data-act="rstatus" data-status="' + c.k + '">' + esc(c.label) +
      '<span class="ct">' + c.n + "</span></button>";
  }).join("");

  var companyChip = r.company
    ? '<button class="chip on" data-act="rclear-co">' + esc(r.company) +
      " ×</button> "
    : "";

  var sortHTML = '<div class="select"><select data-sort name="roleSort" ' +
    'aria-label="Sort roles">' +
    [["score","Readiness"],["fit","Highest fit"],["new","Newest found"],
     ["az","Company A–Z"]].map(function (o) {
      return '<option value="' + o[0] + '"' +
        (r.sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("") + "</select></div>";

  var listHTML = shown.length
    ? '<div class="grid-cards">' +
      shown.map(function (i, x) { return offerCard(i, x); }).join("") + "</div>" +
      (list.length > shown.length
        ? showMore("Show " + Math.min(ROLES_PAGE, list.length - shown.length) +
            " more · " + (list.length - shown.length) + " remaining")
        : "")
    : emptyState("No roles match", "Try a different status or search term.",
        "search");

  return '<header class="view-head">' +
    '<div class="eyebrow">Inventory</div>' +
    "<h1>Every role, <em>one place</em>.</h1>" +
    '<p class="sub">Showing active postings first; closed/dead links stay hidden unless you tap All/Closed. Filter by status, ' +
    "sort, and tap any card for the full picture.</p></header>" +
    '<div class="search"><label for="searchInput" style="display:flex">' +
    svg("search") + "</label>" +
    '<input id="searchInput" data-search="roles" placeholder="Search roles…" value="' + esc(r.q) + '" autocomplete="off">' +
    (r.q ? '<button data-act="clearsearch" aria-label="Clear">×</button>' : "") +
    "</div>" +
    '<div class="chips">' + companyChip + chipsHTML + "</div>" +
    '<div class="toolrow"><span class="sec-meta" style="flex:1">' +
    list.length + " result" + (list.length === 1 ? "" : "s") + "</span>" +
    sortHTML + "</div>" + listHTML;
}

/* ============================================================
   View: Employers
   ============================================================ */
function viewEmployers() {
  var e = state.employers;
  var sectors = [];
  D.employers.forEach(function (x) {
    if (x.sector && sectors.indexOf(x.sector) < 0) sectors.push(x.sector);
  });
  sectors.sort();

  var list = D.employers.slice();
  if (e.sector !== "all") list = list.filter(function (x) {
    return x.sector === e.sector;
  });
  var query = e.q.trim().toLowerCase();
  if (query) list = list.filter(function (x) {
    return (x.name + " " + x.sector + " " + (x.typicalRoles || []).join(" "))
      .toLowerCase().indexOf(query) >= 0;
  });

  var chips = [{ k:"all", label:"All sectors" }].concat(
    sectors.map(function (s) { return { k:s, label:s }; }));
  var chipsHTML = chips.map(function (c) {
    return '<button class="chip' + (e.sector === c.k ? " on" : "") +
      '" data-act="esector" data-sector="' + esc(c.k) + '">' +
      esc(c.label) + "</button>";
  }).join("");

  var withRoles = D.employers.filter(function (x) {
    return x.trackerCount; }).length;

  var listHTML = list.length
    ? '<div class="grid-3">' +
      list.map(function (x, i) { return employerCard(x, i); }).join("") + "</div>"
    : emptyState("No companies match", "Try another sector or search.", "search");

  return '<header class="view-head">' +
    '<div class="eyebrow">Target companies</div>' +
    "<h1>50 priority <em>employers</em>.</h1>" +
    '<p class="sub">Tier-A Canadian co-op employers, ranked by priority. ' +
    withRoles + " have live roles in your tracker right now.</p></header>" +
    '<div class="search"><label for="searchInput" style="display:flex">' +
    svg("search") + "</label>" +
    '<input id="searchInput" data-search="employers" placeholder="Search ' +
    'companies…" value="' + esc(e.q) + '" autocomplete="off">' +
    (e.q ? '<button data-act="clearsearch" aria-label="Clear">×</button>' : "") +
    "</div>" +
    '<div class="chips">' + chipsHTML + "</div>" + listHTML;
}

/* ============================================================
   View: Automation
   ============================================================ */
function viewAutomation() {
  var cs = D.cronSummary;
  var stats = [
    { n:cs.healthy, l:"On track", c:"--st-qualified" },
    { n:cs.lagging, l:"Behind",   c:"--st-manual_review" },
    { n:cs.error,   l:"Errored",  c:"--st-blocked" },
    { n:cs.waiting, l:"Waiting",  c:"--st-new" }
  ];
  var statHTML = stats.map(function (s, x) {
    var col = s.n ? "var(" + s.c + ")" : "var(--text-3)";
    return '<div class="auto-stat stagger" style="--i:' + x + '">' +
      '<div class="n" style="color:' + col + '">' + s.n + "</div>" +
      '<div class="l"><span class="dot" style="background:' + col +
      '"></span>' + s.l + "</div></div>";
  }).join("");

  var banner = cs.needsAttention
    ? '<div class="banner banner-warn" style="margin:14px 0 4px">' + svg("alert") +
      '<span class="bx"><b>' + cs.needsAttention + " of " + cs.total +
      " jobs need attention.</b> Behind-schedule jobs still run — they’re " +
      "just slower than their cadence. An errored job has stopped producing " +
      "until its next clean run.</span></div>"
    : '<div class="banner banner-info" style="margin:14px 0 4px">' + svg("check") +
      '<span class="bx"><b>All jobs healthy.</b> Leads are flowing through ' +
      "every stage.</span></div>";

  /* pipeline flow */
  var flow = D.crons.map(function (j, x) {
    return '<div class="flow-node is-set h-' + j.health + ' stagger" ' +
      'style="--i:' + x + '">' +
      '<div class="flow-rail"><div class="flow-dot">' + (j.order + 1) + "</div>" +
      '<div class="flow-line"></div></div>' +
      '<div class="flow-body"><div class="flow-stage">' + esc(j.stage) + "</div>" +
      '<div class="flow-name">' + esc(STAGE_LABEL[j.stage] || j.name) + "</div>" +
      '<div class="flow-desc">' + esc(j.summary) + "</div>" +
      '<div class="flow-tag"><span>' + esc(j.scheduleLabel) + "</span>" +
      '<span class="cron-health" style="padding:1px 8px"><span class="dot">' +
      "</span>" + esc(j.healthLabel) + "</span></div></div></div>";
  }).join("");

  var cards = D.crons.map(function (j, x) { return cronCard(j, x); }).join("");

  return '<header class="view-head">' +
    '<div class="eyebrow">Automation</div>' +
    "<h1>The <em>pipeline</em> behind your leads.</h1>" +
    '<p class="sub">Six scheduled agents discover, inspect, and prep ' +
    "internship offers — then hand them to you.</p></header>" +
    '<div class="auto-summary">' + statHTML + "</div>" + banner +
    sec("How a lead flows", null, null) +
    '<div class="card" style="padding:16px 14px"><div class="flow flow-h">' +
    flow + "</div></div>" +
    sec("Jobs", D.crons.length + " scheduled", null) +
    '<div class="grid-cards">' + cards + "</div>";
}

/* ============================================================
   Detail — full-screen offer view
   ============================================================ */
function buildDetail(id) {
  var i = BY_ID[id];
  if (!i) return '<div class="dt-wrap"><button class="dt-back" data-act="back">' +
    svg("arrowL") + "Back</button><p style=\"padding:20px\">Offer not found.</p></div>";

  var t = tier(i.applyScore);
  var flag = recFlag(i.recommendation);
  var applied = isApplied(i.id) || i.status === "applied";

  var facts = [
    ["Status", STATUS[i.status] ? STATUS[i.status].label : i.status],
    ["Location", i.location],
    ["Work model", i.workModel],
    ["ATS", i.ats],
    ["Source", i.source],
    ["Deadline", i.deadline.label],
    ["Found", i.dateFound],
    ["Applied on", i.status === "applied" ? i.dateApplied : ""],
    ["Account needed", i.accountRequired && i.accountRequired !== "no"
      ? i.accountRequired : ""],
    ["Captcha risk", i.captchaRisk]
  ].filter(function (f) { return f[1]; });
  var factsHTML = facts.map(function (f) {
    return '<div class="dt-fact"><div class="k">' + esc(f[0]) + "</div>" +
      '<div class="v">' + esc(f[1]) + "</div></div>";
  }).join("");

  var parts = [
    ["Role fit", i.scoreParts.fit],
    ["Urgency", i.scoreParts.urgency],
    ["Ease of apply", i.scoreParts.ease],
    ["Interview odds", i.scoreParts.interview]
  ];
  var brkHTML = parts.map(function (p) {
    var has = p[1] != null;
    return '<div class="brk-row' + (has ? "" : " is-empty") + '">' +
      '<span class="bl">' + esc(p[0]) + "</span>" +
      '<span class="brk-track"><span class="brk-fill" style="width:' +
      (has ? p[1] * 10 : 0) + '%"></span></span>' +
      '<span class="bv">' + (has ? p[1] : "—") + "</span></div>";
  }).join("");
  var brkNote = i.triaged
    ? "Scored from the pipeline’s triage signals (fit, urgency, ease and " +
      "interview odds) on a 0–100 scale."
    : "Not yet triaged by the pipeline — this score leans on role fit alone, " +
      "so treat it as a conservative estimate.";

  var callouts = "";
  if (i.needsEligibilityCheck) callouts +=
    '<div class="dt-callout warn">' + svg("alert") +
    "<span><b>Eligibility check &mdash; </b>" + esc(i.humanAction || i.nextStep) +
    "</span></div>";
  if (i.blockedReason) callouts +=
    '<div class="dt-callout warn">' + svg("alert") +
    "<span><b>Blocked &mdash; </b>" + esc(i.blockedReason) + "</span></div>";
  if (i.lastStep && i.lastStep.toLowerCase() !== "do not reprocess") callouts +=
    '<div class="dt-callout">' + svg("flow") +
    "<span><b>Pipeline last step &mdash; </b>" + esc(i.lastStep) + "</span></div>";

  var priBadge = i.applyPriority != null
    ? '<span class="pill-tag" style="background:var(--accent-soft);' +
      'color:var(--accent)">Pipeline priority ' + i.applyPriority + "/100</span>"
    : "";

  var skills = (i.skills || []).map(function (s) {
    return '<span class="pill-tag">' + esc(s) + "</span>"; }).join("");
  var tags = (i.tags || []).map(function (s) {
    return '<span class="pill-tag">' + esc(s) + "</span>"; }).join("");

  var primary = i.url
    ? '<a class="btn btn-primary" href="' + esc(i.url) +
      '" target="_blank" rel="noopener">' + svg("send") + "Open application</a>"
    : '<span class="btn btn-primary" style="opacity:.55">No application link</span>';
  var appliedBtn = i.status === "applied"
    ? '<span class="btn btn-ghost" style="opacity:.7">' + svg("check") +
      "Applied" + (i.dateApplied ? " " + esc(i.dateApplied) : "") + "</span>"
    : '<button class="btn btn-ghost' + (applied ? "" : "") +
      '" data-act="applied" data-id="' + esc(i.id) + '">' + svg("check") +
      (applied ? "Applied ✓" : "Mark applied") + "</button>";

  return '<div class="dt-bar">' +
    '<button class="dt-back" data-act="back">' + svg("arrowL") + "Back</button>" +
    '<span class="spacer"></span>' +
    '<button class="qa' + (isStarred(i.id) ? " is-on" : "") + '" data-act="star" ' +
    'data-id="' + esc(i.id) + '">' + svg("star") +
    (isStarred(i.id) ? "Starred" : "Star") + "</button>" +
    '<button class="qa' + (isSnoozed(i.id) ? " is-on" : "") + '" data-act="snooze" ' +
    'data-id="' + esc(i.id) + '">' + svg("moon") +
    (isSnoozed(i.id) ? "Snoozed" : "Snooze") + "</button></div>" +

    '<div class="dt-wrap">' +
    '<div class="dt-co">' + esc(i.company) + statusPill(i.status) +
      (flag ? '<span class="flag ' + flag.cls + '">' + esc(flag.t) + "</span>" : "") +
    "</div>" +
    '<h1 class="dt-role">' + esc(i.role) + "</h1>" +

    '<div class="dt-hero">' + ring(i.applyScore, "lg") +
      '<div class="dt-hero-txt"><div class="tier-name">' + esc(t.name) + "</div>" +
      '<div class="tier-sub">' + esc(t.sub) + " · readiness " +
      i.applyScore + "/100</div>" +
      (priBadge ? '<div style="margin-top:9px">' + priBadge + "</div>" : "") +
      "</div></div>" +

    '<div class="dt-step">' + svg("target") +
      '<div><div class="k">Your next step</div><div class="v">' +
      esc(i.nextStep) + "</div></div></div>" +

    (callouts ? '<div class="dt-sec">' + callouts + "</div>" : "") +

    '<div class="dt-sec"><div class="eyebrow">Snapshot</div>' +
    '<div class="dt-facts">' + factsHTML + "</div></div>" +

    '<div class="dt-sec"><div class="eyebrow">Why this score</div>' +
    '<div class="card" style="padding:15px 14px"><div class="brk">' + brkHTML +
    '</div><p class="brk-note">' + brkNote + "</p></div></div>" +

    (skills ? '<div class="dt-sec"><div class="eyebrow">Skills in focus</div>' +
      '<div class="emp-roles">' + skills + "</div></div>" : "") +
    (tags ? '<div class="dt-sec"><div class="eyebrow">Tags</div>' +
      '<div class="emp-roles">' + tags + "</div></div>" : "") +

    (i.notes ? '<div class="dt-sec"><div class="eyebrow">Notes</div>' +
      '<p class="dt-prose">' + esc(i.notes) + "</p></div>" : "") +

    documentButtons(i) +

    '<div class="dt-actions">' + primary + appliedBtn + "</div>" +
    "</div>";
}

/* ============================================================
   Render + routing
   ============================================================ */
var VIEWS = {
  today: viewToday, apply: viewApply, roles: viewRoles,
  employers: viewEmployers, automation: viewAutomation
};
var NAV = [
  { v:"today",      icon:"today",      label:"Today" },
  { v:"apply",      icon:"apply",      label:"Apply" },
  { v:"roles",      icon:"roles",      label:"Roles" },
  { v:"employers",  icon:"employers",  label:"Companies" },
  { v:"automation", icon:"automation", label:"Automation" }
];

function renderNav() {
  $("#navItems").innerHTML = NAV.map(function (n) {
    return '<button class="nav-item' + (state.view === n.v ? " on" : "") +
      '" data-act="nav" data-view="' + n.v + '" aria-label="' + n.label + '"' +
      (state.view === n.v ? ' aria-current="page"' : "") + ">" +
      svg(n.icon) + "<span>" + n.label + "</span></button>";
  }).join("");
  $("#snapPill").textContent = D.meta.snapshotLabel;
  $("#navSnap").textContent = "snapshot " + D.meta.snapshotLabel;
  $("#navFoot").innerHTML =
    "<div>Built from 3 local files</div>" +
    "<div>Rebuild · <code>python3 build.py</code></div>" +
    '<div style="margin-top:8px"><button data-act="reset">Reset local marks' +
    "</button></div>";
}

function render() {
  renderNav();
  var vp = $("#viewport");
  var prev = document.activeElement;
  var search = prev && prev.id === "searchInput";
  var caret = search ? prev.selectionStart : 0;

  vp.innerHTML = '<div class="view"><div class="view-inner">' +
    VIEWS[state.view]() + "</div></div>";

  if (search) {
    var si = $("#searchInput");
    if (si) { si.focus(); try { si.setSelectionRange(caret, caret); } catch (e) {} }
  } else {
    window.scrollTo(0, 0);
  }
  if (state.detailId) $("#detail").innerHTML = buildDetail(state.detailId);
}

function go(view, opts) {
  opts = opts || {};
  state.view = view;
  if (view === "apply" && opts.filter) {
    state.apply.filter = opts.filter; state.apply.page = 1;
  }
  if (view === "roles" && opts.status) {
    state.roles.status = opts.status; state.roles.page = 1; state.roles.company = "";
  }
  render();
  window.scrollTo(0, 0);
}

/* ---- detail open/close (history-aware) --------------------- */
function openDetail(id) {
  if (!BY_ID[id]) return;
  state.detailId = id;
  try { history.pushState({ rwDetail: id }, ""); } catch (e) {}
  paintDetail();
}
function paintDetail() {
  var el = $("#detail");
  el.innerHTML = buildDetail(state.detailId);
  el.hidden = false;
  el.scrollTop = 0;
  document.body.style.overflow = "hidden";
}
function closeDetail() {
  state.detailId = null;
  var el = $("#detail");
  el.hidden = true;
  el.innerHTML = "";
  document.body.style.overflow = "";
}

/* ---- toast ------------------------------------------------- */
var toastTimer;
function toast(msg) {
  var t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  t.classList.remove("out");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.classList.add("out");
    setTimeout(function () { t.hidden = true; }, 300);
  }, 1900);
}

/* ============================================================
   Events
   ============================================================ */
document.addEventListener("click", function (e) {
  /* let genuine external links behave normally */
  var link = e.target.closest("a[href]");
  if (link && link.getAttribute("href") !== "#") return;

  var node = e.target.closest("[data-act]");
  if (!node) return;
  var act = node.dataset.act;
  var id = node.dataset.id;
  if (link && link.getAttribute("href") === "#") e.preventDefault();

  switch (act) {
    case "nav":
      go(node.dataset.view, {
        filter: node.dataset.filter, status: node.dataset.status });
      break;
    case "detail":
      openDetail(id);
      break;
    case "back":
      if (state.detailId) history.back();
      break;
    case "chip":
      state.apply.filter = node.dataset.filter;
      state.apply.page = 1;
      render();
      break;
    case "rstatus":
      state.roles.status = node.dataset.status;
      state.roles.page = 1;
      render();
      break;
    case "rclear-co":
      state.roles.company = "";
      state.roles.page = 1;
      render();
      break;
    case "esector":
      state.employers.sector = node.dataset.sector;
      render();
      break;
    case "emp-roles":
      state.view = "roles";
      state.roles.company = node.dataset.company;
      state.roles.status = "active";
      state.roles.q = "";
      state.roles.page = 1;
      render();
      window.scrollTo(0, 0);
      break;
    case "more":
      if (state.view === "apply") state.apply.page++;
      else if (state.view === "roles") state.roles.page++;
      render();
      break;
    case "clearsearch":
      state[state.view].q = "";
      if (state.view === "apply") state.apply.page = 1;
      if (state.view === "roles") state.roles.page = 1;
      render();
      break;
    case "star": {
      var on = toggle(store.starred, id); persist();
      toast(on ? "Starred" : "Star removed");
      if (state.detailId) paintDetail();
      render();
      break;
    }
    case "snooze": {
      var sn = toggle(store.snoozed, id); persist();
      toast(sn ? "Snoozed — hidden from the queue" : "Un-snoozed");
      if (sn && state.detailId === id) { history.back(); }
      else { if (state.detailId) paintDetail(); render(); }
      break;
    }
    case "applied": {
      var ap = toggle(store.applied, id); persist();
      toast(ap ? "Marked applied — nice." : "Applied mark removed");
      if (ap && state.detailId === id) { history.back(); }
      else { if (state.detailId) paintDetail(); render(); }
      break;
    }
    case "reset":
      if (window.confirm("Clear all your local stars, snoozes and applied " +
          "marks? The underlying data is not affected.")) {
        store.applied = {}; store.snoozed = {}; store.starred = {};
        persist();
        toast("Local marks cleared");
        if (state.detailId) paintDetail();
        render();
      }
      break;
  }
});

/* search typing */
document.addEventListener("input", function (e) {
  var inp = e.target.closest("[data-search]");
  if (!inp) return;
  var v = inp.value;
  state[inp.dataset.search].q = v;
  if (inp.dataset.search === "apply") state.apply.page = 1;
  if (inp.dataset.search === "roles") state.roles.page = 1;
  render();
});

/* sort select */
document.addEventListener("change", function (e) {
  var sel = e.target.closest("[data-sort]");
  if (!sel) return;
  state.roles.sort = sel.value;
  state.roles.page = 1;
  render();
});

/* keyboard: activate cards, escape detail */
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && state.detailId) { history.back(); return; }
  if ((e.key === "Enter" || e.key === " ") &&
      e.target.classList && e.target.classList.contains("offer")) {
    e.preventDefault();
    openDetail(e.target.dataset.id);
  }
});

/* browser / phone back closes the detail */
window.addEventListener("popstate", function () {
  if (state.detailId) closeDetail();
});

/* ============================================================
   Boot
   ============================================================ */
render();

})();
