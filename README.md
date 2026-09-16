# Facility Reservation & Service Request Management System

**Systems Analysis and Design — Laboratory 4, Section B**
*Role-Based Facility Reservation and Approval System*

Platform: **GitHub Pages (static frontend) + Supabase (Postgres, Auth, Row Level Security)**
Approach: Incremental / Iterative Development

---

## 1. Features

- **Three roles with role-based dashboards**
  - **Administrator** — manage facilities & users, approve/reject reservations, view service
    concerns, reports and audit logs.
  - **Facility Staff** — view reservations, mark facility In Use, record completion, create
    service requests, update facility condition.
  - **Requester** — view facilities, submit reservation requests, view status, cancel own
    eligible requests, view history.
- **Reservation workflow**: `Submitted → Pending → Approved / Rejected → Scheduled → In Use → Completed`
  with `Cancelled` at eligible stages.
- **Business rules (BR-B4-01…10)** enforced **server-side**: conflict checks, maintenance blocks,
  transition guards, ownership rules and immutable Completed reservations.
- **Audit trail (BR-B4-10)**: every submission, approval, rejection, cancellation, status change,
  facility update/delete and role change is logged to `audit_logs`.
- **Automated functional test page** (`tests.html`) that runs TC-B4-01…TC-B4-10 against the live
  backend and marks pass/fail — ready to screenshot for the report.

## 2. Project layout

```
facility-reservation-system/
├── index.html            Landing/portal
├── login.html            Sign in / register (demo account quick-fill)
├── requester.html        Requester dashboard (Reserved for role)
├── staff.html            Facility Staff dashboard
├── admin.html            Administrator dashboard
├── tests.html            Automated functional tests TC-B4-01..10
├── assets/
│   ├── css/styles.css
│   └── js/
│       ├── config.js        <-- PASTE YOUR SUPABASE URL + ANON KEY
│       ├── supabase.js
│       ├── auth.js          session, role guard, shell
│       ├── api.js           RPC + query layer
│       ├── ui.js            badges, toasts, modals, datetime helpers
│       └── pages/           login, requester, staff, admin, tests
├── supabase/
│   └── schema.sql           tables · RLS · triggers · RPC functions · seed data
└── docs/                    ERD, use-case, role matrix, workflow, rules, test results
```

## 3. Supabase setup

1. Create a free project at <https://supabase.com>.
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql`, run it.
3. **Auth → URL Configuration** → set **Site URL** to your GitHub Pages URL (or `http://localhost:5500` while developing).
4. **Auth → Providers**: keep Email enabled; in **Auth → Settings** set
   **"Confirm email" → OFF** (so the demo accounts created in the browser are usable immediately).
5. **Project Settings → API**: copy the **Project URL** and **anon public key** into
   `assets/js/config.js`.

### Demo accounts

The first account you register on the login page automatically becomes the **Administrator**
(`handle_new_user()` bootstrap trigger). Either register `admin@campus.edu` first, or run the
test page once — it creates all four demo accounts and fixes their roles automatically:

| Email                | Password     | Role          |
|----------------------|--------------|---------------|
| admin@campus.edu     | password123  | Administrator |
| staff@campus.edu     | password123  | Facility Staff|
| requester@campus.edu | password123  | Requester     |
| requester2@campus.edu| password123  | Requester     |

## 4. Run locally

```bash
# static site - just open index.html, or serve it:
python -m http.server 5500    # then open http://localhost:5500
```
The Supabase JS client is loaded from the CDN, so no `npm install` or build is required.

## 5. Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g. `facility-reservation-system`).
2. Push the project to it:
   ```bash
   git init
   git add .
   git commit -m "Lab 4 Section B - Role-Based Facility Reservation and Approval System"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. **Repository → Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   select branch `main` / folder `/ (root)`, **Save**.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.
5. Update the Supabase **Site URL** with that Pages URL.

## 6. Submission checklist

| # | Deliverable                                   | Where |
|---|----------------------------------------------|-------|
| 1 | GitHub repository URL                        | your repo |
| 2 | Live GitHub Pages URL                        | Settings → Pages |
| 3 | Updated ERD and Use Case Diagram            | `docs/ERD.md`, `docs/use-case.md` |
| 4 | Role–permission matrix                       | `docs/role-permission-matrix.md` |
| 5 | Reservation workflow                         | `docs/workflow.md` |
| 6 | Business rules (BR-B4-01…10)                 | `docs/business-rules.md` |
| 7 | Audit-log screenshot                         | Admin → **Audit log** (or `tests.html` output) |
| 8 | Functional test results                      | `docs/test-results.md` + screenshot of `tests.html` |

## 7. Business rules quick reference

| ID | Rule | Enforcement |
|----|------|-------------|
| BR-B4-01 / BR-B4-08 | Only active facilities may be reserved; maintenance blocks | trigger `check_reservation_conflict()` |
| BR-B4-02 | start < end | same trigger |
| BR-B4-03 | no overlapping approved schedules | same trigger (Approved/Scheduled/In Use) |
| BR-B4-04 | only Admin approves/rejects | `approve_reservation`/`reject_reservation` |
| BR-B4-05 | Rejected cannot be Scheduled | `validate_reservation_transition()` |
| BR-B4-06 | Approved reserves slot | conflict set includes Approved |
| BR-B4-07 | Completed immutable | `validate_reservation_transition()` |
| BR-B4-09 | own-Pending-only for requesters | RPC functions + RLS |
| BR-B4-10 | status changes logged | `add_log()` on every critical action |