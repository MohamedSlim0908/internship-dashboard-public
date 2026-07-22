#!/usr/bin/env python3
"""
Runway — data pipeline.

Reads the three source files in this workspace and emits `data.js`, a single
`window.__DATA__` blob the static dashboard renders. Run it any time the source
data changes:

    python3 build.py

Sources (read-only):
    data/internships.csv
    data/employers.csv
    state/cronjobs.json

Output:
    data.js   (generated — overwritten on every run)

Nothing here talks to the network or mutates the source files.
"""

import csv
import json
import re
import shutil
import sys
from datetime import datetime, date, timedelta
from pathlib import Path
from collections import Counter

APP_DIR = Path(__file__).resolve().parent
REPO_ROOT = APP_DIR.parents[1]
INTERNSHIPS = REPO_ROOT / "data" / "internships.csv"
EMPLOYERS = REPO_ROOT / "data" / "employers.csv"
CRONJOBS = REPO_ROOT / "state" / "cronjobs.json"
OUT = APP_DIR / "data.js"
DOWNLOADS = APP_DIR / "downloads"

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
ISO_RE = re.compile(r"\b(20\d\d)-(\d{2})-(\d{2})\b")
MDY_RE = re.compile(
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+"
    r"(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b",
    re.I,
)
RANGE_RE = re.compile(r"\d\s*[–—-]\s*[A-Za-z0-9]")


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------
def clean(value):
    return (value or "").strip()


def to_int(value):
    value = clean(value)
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def split_list(value):
    return [p.strip() for p in re.split(r"[;,]", clean(value)) if p.strip()]


def safe_rel(path):
    """Browser-friendly relative URL for files served by the static dashboard."""
    return path.relative_to(APP_DIR).as_posix()


def packet_downloads(row, item_id):
    """Copy packet PDFs/notes into the dashboard so helpers can download them.

    Source rows carry an absolute `application_pack` folder path. Static
    browsers cannot reliably fetch arbitrary local absolute paths from a page,
    so the build step mirrors the useful packet files under
    dashboard/runway/downloads/<row-id>/ and emits relative links.
    """
    pack = Path(clean(row.get("application_pack"))).expanduser()
    if not pack.is_dir():
        return {}

    dest_dir = DOWNLOADS / (item_id or slug(clean(row.get("company")) + "-" + clean(row.get("role"))))
    wanted = {
        "tailoredCv": "tailored-cv.pdf",
        "coverLetter": "cover-letter.pdf",
        "packetNote": "application-packet-note.md",
        "answers": "application-answers.md",
        "postingEvidence": "posting-evidence.md",
    }
    links = {}
    for key, filename in wanted.items():
        src = pack / filename
        if not src.is_file() or src.stat().st_size <= 0:
            continue
        dest_dir.mkdir(parents=True, exist_ok=True)
        dst = dest_dir / filename
        shutil.copy2(src, dst)
        links[key] = safe_rel(dst)
    return links


def find_date(text):
    """Return the first concrete calendar date mentioned in `text`, or None."""
    m = ISO_RE.search(text)
    if m:
        try:
            return date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return None
    m = MDY_RE.search(text)
    if m:
        try:
            return date(int(m[3]), MONTHS[m[1][:3].lower()], int(m[2]))
        except ValueError:
            return None
    return None


# --------------------------------------------------------------------------
# cron jobs — schedule, health, pipeline position
# --------------------------------------------------------------------------
# Pipeline order + a plain-language description of what each automation does.
# Keyed by job_id so a renamed job still lands in the right stage.
CRON_META = {
    "dbd054a62f75": {
        "order": 0, "stage": "Discover",
        "summary": "Aggressive LinkedIn + public-web sweep for fresh Canadian "
                   "internship postings. This is the top of the funnel — every "
                   "lead in the tracker starts here.",
    },
    "8b79346c4127": {
        "order": 1, "stage": "Scan",
        "summary": "Opens one live posting per run and captures the exact "
                   "application questions the employer asks.",
    },
    "e642e9bd07b2": {
        "order": 2, "stage": "Inventory",
        "summary": "Consolidates captured questions into a reusable inventory so "
                   "repeated questions are answered once.",
    },
    "36c24108485c": {
        "order": 3, "stage": "Map",
        "summary": "Maps each ATS form's fields so an application can be filled "
                   "quickly and consistently.",
    },
    "c427a0dbc47f": {
        "order": 4, "stage": "Draft",
        "summary": "Drafts a tailored resume + cover-letter packet for one offer "
                   "per run — the last step before you hit submit.",
    },
    "5c0f94452a1a": {
        "order": 5, "stage": "Brief",
        "summary": "Posts a 9:00 AM digest of pipeline status and the day's "
                   "priorities.",
    },
}


def parse_schedule(raw):
    """(interval_seconds | None, human label) for a cron schedule string."""
    raw = clean(raw)
    m = re.match(r"every\s+(\d+)\s*m", raw, re.I)
    if m:
        n = int(m[1])
        return n * 60, f"Every {n} minute" + ("s" if n != 1 else "")
    m = re.match(r"every\s+(\d+)\s*h", raw, re.I)
    if m:
        n = int(m[1])
        return n * 3600, f"Every {n} hour" + ("s" if n != 1 else "")
    parts = raw.split()
    if len(parts) == 5 and parts[2:] == ["*", "*", "*"]:
        mi, hh = parts[0], parts[1]
        if mi.isdigit() and hh.isdigit():
            h = int(hh)
            ampm = "AM" if h < 12 else "PM"
            return None, f"Daily at {h % 12 or 12}:{int(mi):02d} {ampm}"
    return None, raw


def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def humanize_delta(then, now):
    """Relative time string for a fixed snapshot — never ticks live."""
    if then is None:
        return None
    secs = (now - then).total_seconds()
    future = secs < 0
    secs = abs(secs)
    if secs < 90:
        chunk = f"{int(secs)}s"
    elif secs < 5400:
        chunk = f"{int(secs // 60)}m"
    elif secs < 172800:
        chunk = f"{int(secs // 3600)}h"
    else:
        chunk = f"{int(secs // 86400)}d"
    return f"in {chunk}" if future else f"{chunk} ago"


def build_crons(raw):
    snapshot = parse_dt(raw.get("generated_at"))
    jobs = []
    for job in raw.get("jobs", []):
        interval, sched_label = parse_schedule(job.get("schedule", ""))
        last_run = parse_dt(job.get("last_run_at"))
        next_run = parse_dt(job.get("next_run_at"))
        meta = CRON_META.get(job["job_id"], {"order": 99, "stage": "Other",
                                             "summary": ""})

        if not job.get("enabled", True):
            health, health_label = "paused", "Paused"
        elif job.get("last_status") == "error":
            health, health_label = "error", "Errored last run"
        elif last_run is None:
            health, health_label = "waiting", "Waiting for first run"
        elif interval and snapshot and (snapshot - last_run).total_seconds() > interval * 3:
            health, health_label = "lagging", "Behind schedule"
        else:
            health, health_label = "healthy", "On track"

        deliver = clean(job.get("deliver"))
        channel = deliver.split(":", 1)[1] if ":" in deliver else deliver

        repeat = clean(job.get("repeat"))
        repeat_label = ""
        if "/" in repeat:
            done, total = repeat.split("/", 1)
            repeat_label = f"Run {done} of {total}"
        elif repeat == "forever":
            repeat_label = "Runs continuously"

        jobs.append({
            "id": job["job_id"],
            "name": job.get("name", job["job_id"]),
            "stage": meta["stage"],
            "order": meta["order"],
            "summary": meta["summary"],
            "schedule": clean(job.get("schedule")),
            "scheduleLabel": sched_label,
            "deliver": deliver,
            "channel": channel,
            "lastStatus": job.get("last_status"),
            "health": health,
            "healthLabel": health_label,
            "lastRunRel": humanize_delta(last_run, snapshot) if snapshot else None,
            "nextRunRel": humanize_delta(next_run, snapshot) if snapshot else None,
            "enabled": bool(job.get("enabled", True)),
            "toolsets": job.get("enabled_toolsets", []),
            "repeatLabel": repeat_label,
            "promptPreview": clean(job.get("prompt_preview")),
        })

    jobs.sort(key=lambda j: j["order"])
    summary = Counter(j["health"] for j in jobs)
    return jobs, snapshot, {
        "total": len(jobs),
        "healthy": summary.get("healthy", 0),
        "lagging": summary.get("lagging", 0),
        "error": summary.get("error", 0),
        "waiting": summary.get("waiting", 0),
        "paused": summary.get("paused", 0),
        "needsAttention": summary.get("error", 0) + summary.get("lagging", 0),
    }


# --------------------------------------------------------------------------
# internships — deadlines, apply score, next step
# --------------------------------------------------------------------------
ATS_LABELS = {
    "linkedin": "LinkedIn", "workday": "Workday", "greenhouse": "Greenhouse",
    "lever": "Lever", "ashby": "Ashby", "smartrecruiters": "SmartRecruiters",
    "oracle": "Oracle", "indeed": "Indeed", "successfactors": "SuccessFactors",
    "icims": "iCIMS", "phenom": "Phenom", "breezy": "Breezy HR",
    "teamtailor": "Teamtailor", "workable": "Workable", "unknown": "Unknown ATS",
}

STATUS_ORDER = ["new", "qualified", "manual_review", "applied",
                "wishlist", "blocked", "closed"]
APPLY_QUEUE_STATUSES = {"new", "qualified", "wishlist"}


def ats_label(value):
    value = clean(value).lower()
    return ATS_LABELS.get(value, value.title() if value else "")


def classify_deadline(row, today):
    """Resolve a hard application deadline from the messy free-text fields."""
    raw = clean(row.get("deadline"))
    human = clean(row.get("human_action"))
    rolling = "rolling" in raw.lower()

    hard, source = None, None
    if raw and not rolling and not RANGE_RE.search(raw):
        hard = find_date(raw)
        if hard:
            source = "deadline"
    if hard is None and "deadline" in human.lower():
        hard = find_date(human)
        if hard:
            source = "human_action"

    if hard:
        days = (hard - today).days
        if days < 0:
            cls = "expired"
        elif days <= 7:
            cls = "urgent"
        elif days <= 14:
            cls = "soon"
        else:
            cls = "scheduled"
        nice = hard.strftime("%b %-d, %Y")
        if cls == "expired":
            label = f"Closed {nice}"
        elif days == 0:
            label = f"Due today ({nice})"
        elif days == 1:
            label = f"Due tomorrow ({nice})"
        else:
            label = f"Due {nice} · {days}d left"
        return {"cls": cls, "label": label, "date": hard.isoformat(),
                "days": days, "rolling": rolling, "source": source,
                "raw": raw or human}
    if rolling:
        return {"cls": "rolling", "label": "Rolling — apply early",
                "date": None, "days": None, "rolling": True,
                "source": "deadline", "raw": raw}
    if raw:
        return {"cls": "other", "label": raw, "date": None, "days": None,
                "rolling": False, "source": "deadline", "raw": raw}
    return {"cls": "none", "label": "", "date": None, "days": None,
            "rolling": False, "source": None, "raw": ""}


def apply_score(row, deadline, triaged):
    """
    Transparent 0-100 readiness score. Same formula for every row so the
    Apply queue sorts cleanly:
      - blend of fit / urgency / ease / interview odds (missing -> fit anchor)
      - explicit recommendations set a floor or cap
      - deadline pressure and known friction nudge it
    `apply_priority` is intentionally NOT folded in (its 68-84 range would
    distort the scale) — it rides along as a separate badge.
    """
    fit = to_int(row.get("fit_score"))
    urg = to_int(row.get("urgency"))
    ease = to_int(row.get("ease_of_apply"))
    iprob = to_int(row.get("interview_prob"))
    rec = clean(row.get("recommendation")).upper()
    status = clean(row.get("status"))

    anchor = fit if fit is not None else 6
    f = fit if fit is not None else 6
    u = urg if urg is not None else anchor
    e = ease if ease is not None else anchor
    p = iprob if iprob is not None else anchor

    base = (f * 0.35 + u * 0.30 + e * 0.15 + p * 0.20) * 10

    # Untriaged rows are educated guesses — damp them so a reviewed
    # "apply today" always outranks an unreviewed high fit score.
    if not triaged:
        base = min(base * 0.85, 78)

    score = base
    if rec == "APPLY NOW":
        score = max(score, 90)
    elif rec == "APPLY TODAY":
        score = max(score, 84)
    elif rec == "APPLY TODAY IF TIME":
        score = max(score, 73)
    elif rec in ("REVIEW FIT AND APPLY", "REVIEW"):
        score = max(score, 60)
    elif rec == "SAVE FOR LATER":
        score = min(score, 52)

    if deadline["cls"] == "urgent":
        score += 10
    elif deadline["cls"] == "soon":
        score += 5
    elif deadline["cls"] == "expired":
        score -= 14

    if clean(row.get("account_required")).lower() == "yes":
        score -= 4
    if clean(row.get("captcha_risk")).lower() == "high":
        score -= 5

    score = max(0, min(100, round(score)))
    # Readiness must reflect actionability: a closed posting or a row flagged
    # REMOVE can't be applied to, and a blocked one has a barrier in the way.
    if rec == "REMOVE" or status == "closed":
        return min(score, 6)
    if status == "blocked":
        return min(score, 42)
    return score


def next_step(row, deadline):
    """One short imperative line: what to actually do with this offer."""
    status = clean(row.get("status"))
    human = clean(row.get("human_action"))
    if status == "applied":
        return "Submitted — await a reply"
    if status == "closed":
        return "Posting closed — no action"
    if status == "blocked":
        reason = clean(row.get("blocked_reason"))
        return f"Blocked: {reason}" if reason else "Blocked — needs a working link"
    if status == "manual_review":
        return human or "Verify eligibility before applying"
    if human:
        return human[0].upper() + human[1:]
    if deadline["cls"] in ("urgent", "soon"):
        return "Apply before the deadline"
    if status == "new":
        return "Review the live posting and apply"
    return "Open the posting and apply"


def build_internships(today):
    with INTERNSHIPS.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    out = []
    deadline_sources = Counter()
    notes_with_deadline = 0
    for row in rows:
        status = clean(row.get("status"))
        # Link-audit and import helpers may use more specific closed labels
        # (closed_dead_link, closed_expired, unavailable).  Collapse them for
        # scoring/filtering so unavailable roles never surface as active.
        if status.startswith("closed") or status in {"dead", "inactive", "unavailable", "expired"}:
            status = "closed"
        rec = clean(row.get("recommendation"))
        triaged = bool(rec) or to_int(row.get("urgency")) is not None
        deadline = classify_deadline(row, today)
        deadline_sources[deadline["source"] or "none"] += 1
        if (deadline["cls"] in ("none", "rolling", "other")
                and "deadline" in clean(row.get("notes")).lower()
                and find_date(clean(row.get("notes")))):
            notes_with_deadline += 1

        score = apply_score(row, deadline, triaged)
        fit = to_int(row.get("fit_score"))
        in_queue = status in APPLY_QUEUE_STATUSES and rec.upper() != "REMOVE"

        item_id = clean(row.get("id"))
        out.append({
            "id": item_id,
            "company": clean(row.get("company")),
            "role": clean(row.get("role")),
            "location": clean(row.get("location")),
            "status": status,
            "ats": ats_label(row.get("ats_type")),
            "source": clean(row.get("source")),
            "url": clean(row.get("url")),
            "workModel": clean(row.get("work_model")),
            "fit": fit,
            "applyScore": score,
            "scoreParts": {
                "fit": fit,
                "urgency": to_int(row.get("urgency")),
                "ease": to_int(row.get("ease_of_apply")),
                "interview": to_int(row.get("interview_prob")),
            },
            "triaged": triaged,
            "recommendation": rec,
            "applyPriority": to_int(row.get("apply_priority")),
            "deadline": deadline,
            "tags": split_list(row.get("tags")),
            "skills": split_list(row.get("skills")),
            "nextStep": next_step(row, deadline),
            "humanAction": clean(row.get("human_action")),
            "lastStep": clean(row.get("last_step")),
            "blockedReason": clean(row.get("blocked_reason")),
            "notes": clean(row.get("notes")),
            "accountRequired": clean(row.get("account_required")),
            "captchaRisk": clean(row.get("captcha_risk")),
            "dateFound": clean(row.get("date_found")),
            "dateApplied": clean(row.get("date_applied")),
            "lastUpdate": clean(row.get("last_update")),
            "applicationPack": clean(row.get("application_pack")),
            "downloads": packet_downloads(row, item_id),
            "inQueue": in_queue,
            "needsEligibilityCheck": status == "manual_review",
        })

    out.sort(key=lambda r: (r["applyScore"], r["fit"] or 0), reverse=True)
    return out, deadline_sources, notes_with_deadline


# --------------------------------------------------------------------------
# employers
# --------------------------------------------------------------------------
def build_employers(internships):
    with EMPLOYERS.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    tracker = Counter()
    open_tracker = Counter()
    for it in internships:
        key = it["company"].lower()
        tracker[key] += 1
        if it["inQueue"]:
            open_tracker[key] += 1

    def matches(employer):
        e = employer.lower()
        total = open_total = 0
        for it in internships:
            c = it["company"].lower()
            if c == e or c.startswith(e + " ") or c.startswith(e + ","):
                total += 1
                if it["inQueue"]:
                    open_total += 1
        return total, open_total

    out = []
    for row in rows:
        name = clean(row.get("employer"))
        total, open_total = matches(name)
        out.append({
            "name": name,
            "priority": to_int(row.get("priority")) or 0,
            "sector": clean(row.get("sector")),
            "province": clean(row.get("province")),
            "linkType": clean(row.get("application_link_type")),
            "link": clean(row.get("application_link")),
            "typicalRoles": split_list(row.get("typical_roles")),
            "quickTip": clean(row.get("quick_tip")),
            "trackerCount": total,
            "openCount": open_total,
            "lastChecked": clean(row.get("last_checked")),
        })
    out.sort(key=lambda r: (r["priority"], r["trackerCount"]), reverse=True)
    return out


# --------------------------------------------------------------------------
# assemble
# --------------------------------------------------------------------------
def main():
    for path in (INTERNSHIPS, EMPLOYERS, CRONJOBS):
        if not path.exists():
            sys.exit(f"missing source file: {path}")

    cron_raw = json.loads(CRONJOBS.read_text(encoding="utf-8"))
    crons, snapshot, cron_summary = build_crons(cron_raw)
    today = snapshot.date() if snapshot else date.today()

    internships, dl_sources, notes_dl = build_internships(today)
    employers = build_employers(internships)

    by_status = Counter(i["status"] for i in internships)
    queue = [i for i in internships if i["inQueue"]]
    eligibility = [i for i in internships if i["needsEligibilityCheck"]]
    due_soon = [i for i in internships
                if i["deadline"]["cls"] in ("urgent", "soon")
                and i["status"] not in ("applied", "closed")]
    expired = [i for i in internships
               if i["deadline"]["cls"] == "expired"
               and i["status"] not in ("applied", "closed")]

    apply_ready = by_status["new"] + by_status["qualified"]
    active = apply_ready + by_status["wishlist"] + by_status["manual_review"]

    def facet(key):
        c = Counter(i[key] for i in internships if i[key])
        return [{"value": v, "count": n} for v, n in c.most_common()]

    data = {
        "meta": {
            "snapshot": snapshot.isoformat() if snapshot else None,
            "snapshotLabel": snapshot.strftime("%b %-d, %Y · %-I:%M %p")
                             if snapshot else "",
            "builtFrom": ["data/internships.csv", "data/employers.csv",
                          "state/cronjobs.json"],
        },
        "kpis": {
            "total": len(internships),
            "applyReady": apply_ready,
            "activeLeads": active,
            "applied": by_status["applied"],
            "dueSoon": len(due_soon),
            "expired": len(expired),
            "needsReview": len(eligibility),
            "queueSize": len(queue),
        },
        "statusOrder": STATUS_ORDER,
        "statusCounts": {s: by_status.get(s, 0) for s in STATUS_ORDER},
        "internships": internships,
        "employers": employers,
        "crons": crons,
        "cronSummary": cron_summary,
        "facets": {
            "companies": facet("company"),
            "ats": facet("ats"),
            "sources": facet("source"),
            "workModels": facet("workModel"),
        },
    }

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "/* GENERATED by build.py — do not edit by hand. */\n"
        "window.__DATA__ = " + payload + ";\n",
        encoding="utf-8",
    )

    # ---- build report (sanity check, advisor-requested) -------------------
    print("Runway data build")
    print("-" * 56)
    print(f"  internships      {len(internships)}")
    print(f"  employers        {len(employers)}")
    print(f"  cron jobs        {len(crons)}")
    print(f"  snapshot         {data['meta']['snapshotLabel']}")
    print(f"  output           {OUT.name}  ({OUT.stat().st_size // 1024} KB)")
    print("  status           " + ", ".join(
        f"{s}:{by_status.get(s, 0)}" for s in STATUS_ORDER))
    print(f"  apply-ready {apply_ready}   active {active}   "
          f"queue {len(queue)}   eligibility checks {len(eligibility)}")
    print("  deadlines        "
          f"from deadline col: {dl_sources['deadline']}  "
          f"from human_action: {dl_sources['human_action']}  "
          f"none: {dl_sources['none']}")
    print(f"  due <=14d {len(due_soon)}   expired (open) {len(expired)}")
    if notes_dl:
        print(f"  note: {notes_dl} row(s) mention a date in `notes` only "
              f"(not used as a hard deadline)")
    print("  cron health      " + ", ".join(
        f"{k}:{v}" for k, v in cron_summary.items() if k != "total"))
    print("-" * 56)
    print("ok")


if __name__ == "__main__":
    main()
