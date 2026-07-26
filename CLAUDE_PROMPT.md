Create a brand-new internship dashboard from scratch in the current directory.

Important constraints:
- Do NOT inspect, reuse, or modify any existing dashboard codebase.
- Treat this workspace as a blank slate.
- Use only the internship data files in this workspace as inputs:
  - `data/internships.csv`
  - `data/employers.csv`
  - `state/cronjobs.json`
- Do not ask for more code. Do not copy the old UI.
- Build your own design and information architecture.
- Make it beautiful, efficient, and genuinely helpful for applying to internships.
- It must be mobile-first and feel good on a phone.
- No forced auto-refresh.
- No cluttered desktop-style tables on the default phone view.
- Use Chrome DevTools / browser inspection to verify desktop and mobile layout quality before finishing.

What I want the dashboard to do:
1. Help me quickly decide what to apply to next.
2. Show a clean home view with the most important KPIs and next actions.
3. Treat every cron job as a first-class dashboard input, not a separate afterthought.
4. Make automation visible and understandable.
5. Support the application workflow: one offer at a time, with clear status and next step.
6. Be polished, readable, and fast on mobile.

Data snapshot you should design around:

Internships tracker:
- Total internships: 353
- Status breakdown:
  - qualified: 240
  - applied: 38
  - closed: 30
  - new: 21
  - blocked: 15
  - manual_review: 6
  - wishlist: 3
- Active leads: 270
- Apply-ready: 261
- Due soon (next 14 days): 4
- Top active companies:
  - Geotab, Nokia, Super.com, Scotiabank, Kinaxis, BCI, IBM, Ciena, BMO, Intact Financial
- Top ATS families in the tracker:
  - LinkedIn, Workday, unknown, Greenhouse, Lever, Ashby, SmartRecruiters, Oracle, SuccessFactors
- Common sources in the tracker:
  - Hermes, Workday, Greenhouse, Ashby, Lever, LinkedIn Easy Apply variants, Breezy HR, Cisco Phenom, Teamtailor

Cron jobs that must appear in the dashboard as inputs:
- dbd054a62f75 — LinkedIn 3-way sweep — every 2m — deliver to discord:#carriere
- 8b79346c4127 — internship-site-question-scan — every 1m — deliver to discord:#internship-scan
- e642e9bd07b2 — internship-question-inventory — every 1m — deliver to discord:#internship-inventory
- 36c24108485c — internship-application-field-mapper — every 1m — deliver to discord:#internship-field-mapping
- 5c0f94452a1a — internship-daily-summary — 0 9 * * * — deliver to discord:#internship-summary
- c427a0dbc47f — internship-application-packet-drafter — every 1m — deliver to discord:#resume-coverletter-creator

User preferences / product goals:
- Phone-first, simple navigation, minimal clutter.
- The dashboard should help me apply, not overwhelm me.
- Separate “automation” from “applications” clearly.
- Surface the next best action instead of forcing the user to hunt.
- I want a dashboard that feels premium and useful, not generic.

Suggested structure, but feel free to improve it:
- Home / Today
- Applications / Apply queue
- Automation / Cron jobs
- Employers / target companies
- Roles / full inventory
- A detail view for a single internship offer

Design guidance:
- Strong visual hierarchy.
- Large tap targets on mobile.
- Compact but readable cards.
- Color should indicate status clearly.
- Default view should answer: what should I do next?
- Avoid dense tables as the primary phone experience.
- Make the automation layer feel actionable.
- Make it look intentional and modern.

Implementation guidance:
- You may choose the simplest reliable stack for a local dashboard.
- Build from scratch.
- Create whatever files you need in this fresh workspace.
- Keep the app runnable locally.
- Validate it with Chrome DevTools / browser inspection.
- Fix any layout issues you find before stopping.

Deliverables:
- A working new dashboard in this workspace.
- A short summary of the design decisions.
- How to run it locally.
- What you verified with Chrome DevTools.

Do the work with max effort and aim for the best possible result.