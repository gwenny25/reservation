# Use Case Diagram

```mermaid
flowchart LR
  A[Administrator] --> UA1(Manage facilities)
  A --> UA2(Approve / reject reservations)
  A --> UA3(Manage user roles)
  A --> UA4(View service concerns)
  A --> UA5(View reports)
  A --> UA6(View audit logs)

  S[Facility Staff] --> US1(View reservations)
  S --> US2(Mark facility In Use)
  S --> US3(Record completion)
  S --> US4(Create service requests)
  S --> US5(Update facility condition)

  R[Requester] --> UR1(View facilities)
  R --> UR2(Submit reservation request)
  R --> UR3(View reservation status)
  R --> UR4(Cancel own eligible request)
  R --> UR5(View history)

  UR2 <.include.> UC1(Conflict check)
  UR2 <.include.> UC2(Facility active check)
  UA2 <.include.> UC3(Status change logging)
```

## Actors
| Actor        | Description |
|--------------|-------------|
| Administrator| Owns configuration: facilities, users, approvals, reports and audit trail. |
| Facility Staff | Operational role that confirms usage, records completion, raises service concerns and updates facility condition. |
| Requester    | End user who books facilities and tracks his/her own requests. |
| System       | Enforces business rules (conflict detection, status transitions, audit logging). |