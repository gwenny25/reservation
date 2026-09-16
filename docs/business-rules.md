# Business Rules (BR-B4-01 … BR-B4-10)

| ID | Rule | Enforcement point in `supabase/schema.sql` |
|----|------|----------------------------------------------|
| BR-B4-01 | Only **active** facilities may be reserved. | `check_reservation_conflict()` requires `facilities.status = 'Active'`; UI disables the *Reserve* button otherwise. |
| BR-B4-02 | Reservation **start must precede end time**. | `check_reservation_conflict()` raises if `start_time >= end_time`. |
| BR-B4-03 | **Overlapping approved schedules are prohibited.** | Conflict trigger tests new slot against rows in `Approved / Scheduled / In Use` for the same facility. |
| BR-B4-04 | **Only Administrator** may approve reservations. | `approve_reservation()` / `reject_reservation()` check `is_admin()` (security definer). |
| BR-B4-05 | **Rejected reservations cannot become Scheduled.** | Transition guard: `Rejected` is terminal and Pending→Scheduled is not allowed. |
| BR-B4-06 | **Approved reservations reserve the time slot.** | `Approved` is included in the active-status set of the conflict trigger. |
| BR-B4-07 | **Completed reservations cannot be edited.** | Transition guard raises on any UPDATE/DELETE of a `Completed` row. |
| BR-B4-08 | Facilities **under Maintenance cannot be reserved.** | Facility-status check in the trigger; setting condition to *Under Maintenance* flips status via `update_facility_condition()`. |
| BR-B4-09 | Requesters may modify **only their own Pending** requests. | `update_pending_request()` / `cancel_reservation()` filter `requester_id = auth.uid() AND status='Pending'` (or eligible); RLS update policy mirrors this. |
| BR-B4-10 | **Approval and status changes must be logged.** | `add_log()` writes `audit_logs` rows on submit, approve, reject, cancel, schedule, in-use, complete, facility updates/deletes and role changes. |

## Role-based access control summary
- **RLS policies** gate reads/writes per role at the row level (`reservations`, `facilities`,
  `service_requests`, `profiles`, `audit_logs`).
- **Security-definer RPC functions** (`approve_reservation`, `mark_in_use`, …) verify the caller's
  role *inside* the function, so rules hold even when a client bypasses the UI.
- **BEFORE-triggers** protect the tables from direct SQL edits that violate schedule/transition rules.