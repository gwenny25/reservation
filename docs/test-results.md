# Functional Test Results (TC-B4-01 … TC-B4-10)

> Generated live by the in-app runner at **`tests.html`**. Screenshot the page after
> clicking **Run all tests** and paste it here for submission item #8.

| Test ID | Scenario | Expected result | Actual result | Status |
|---------|----------|-----------------|---------------|:------:|
| TC-B4-01 | Requester submits reservation | Saved as Pending | — | PENDING |
| TC-B4-02 | Submit overlapping schedule | Conflict detected and blocked | — | PENDING |
| TC-B4-03 | Administrator approves request | Status becomes Approved/Scheduled | — | PENDING |
| TC-B4-04 | Administrator rejects request | Status becomes Rejected (cannot be Scheduled) | — | PENDING |
| TC-B4-05 | Staff marks facility In Use | Status updated | — | PENDING |
| TC-B4-06 | Staff completes reservation | Status becomes Completed | — | PENDING |
| TC-B4-07 | Requester edits another user request | Blocked | — | PENDING |
| TC-B4-08 | Reserve facility under maintenance | Blocked | — | PENDING |
| TC-B4-09 | Check audit log | Approval/status log visible | — | PENDING |
| TC-B4-10 | Open protected page without login | Access denied | — | PENDING |

## Audit log screenshot
Paste the **Audit log** section screenshot from the Administrator dashboard here
(submission item #7) — it must show entries such as `RESERVATION_SUBMITTED`,
`RESERVATION_APPROVED`, `RESERVATION_REJECTED`, `RESERVATION_CANCELLED`,
`RESERVATION_COMPLETED`, `FACILITY_UPDATED`, `USER_ROLE_CHANGED`.

## Test accounts
| Email | Password | Role |
|-------|----------|------|
| admin@campus.edu | password123 | Administrator |
| staff@campus.edu | password123 | Facility Staff |
| requester@campus.edu | password123 | Requester |
| requester2@campus.edu | password123 | Requester |