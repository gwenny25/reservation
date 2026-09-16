# Reservation Workflow

Statuses implemented: **Pending, Approved, Rejected, Scheduled, In Use, Completed, Cancelled**.

```mermaid
flowchart TD
  A[Requester submits] --> P[Pending]
  P -->|Administrator approves| AP[Approved]
  P -->|Administrator rejects| RJ[Rejected]
  RJ -->|terminal| RJE((Cannot be Scheduled))
  AP -->|Administrator schedules| SC[Scheduled]
  AP -->|requester/admin cancel| CX[Cancelled]
  SC -->|Staff confirms usage| IU[In Use]
  SC -->|requester/admin cancel| CX
  IU -->|Staff records completion| CO[Completed]
  CO -.->|immutable BR-B4-07| CO
  P -->|owner/admin cancel| CX

  subgraph "Time slot reserved (BR-B4-06)"
    AP
    SC
    IU
  end

  subgraph "Admin decision (BR-B4-04)"
    AP
    RJ
  end

  subgraph "Staff operations"
    IU
    CO
  end
```

## Transition table (enforced by `validate_reservation_transition()`)

| From        | → Allowed                                   | → Blocked                 |
|-------------|---------------------------------------------|---------------------------|
| Pending     | Approved, Rejected, Cancelled               | Scheduled, In Use, Completed |
| Approved    | Scheduled, Cancelled                        | Rejected, Completed       |
| Scheduled   | In Use, Cancelled                           | Approved, Rejected        |
| In Use      | Completed                                   | anything else             |
| Rejected    | (none)                                      | any change, **incl. Scheduled (BR-B4-05)** |
| Completed   | (none)                                      | **any edit/delete (BR-B4-07)** |
| Cancelled   | (none)                                      | any change                |