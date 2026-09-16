# ERD — Facility Reservation & Service Request Management System

Entity-relationship design implemented in `supabase/schema.sql` (Supabase Postgres).

```mermaid
erDiagram
    USERS ||--o| PROFILES : "extends auth.users"
    PROFILES ||--o{ RESERVATIONS : "requests"
    PROFILES ||--o{ SERVICE_REQUESTS : "reports"
    FACILITIES ||--o{ RESERVATIONS : "schedules"
    FACILITIES ||--o{ SERVICE_REQUESTS : "concerns"
    PROFILES ||--o{ AUDIT_LOGS : "performs (actor)"
    FACILITIES ||--o{ AUDIT_LOGS : "entity"
    RESERVATIONS ||--o{ AUDIT_LOGS : "entity"

    USERS {
      uuid id PK
      text email
      text encrypted_password "Supabase auth"
    }
    PROFILES {
      uuid id PK "= auth.users.id"
      text email
      text full_name
      app_role role "administrator | staff | requester"
    }
    FACILITIES {
      bigint id PK
      text name
      text location
      text description
      int capacity
      facility_status status "Active | Maintenance | Inactive"
      facility_condition condition "Good | Fair | Poor | Under Maintenance"
    }
    RESERVATIONS {
      bigint id PK
      bigint facility_id FK
      uuid requester_id FK
      text title
      timestamptz start_time
      timestamptz end_time
      reservation_status status "Pending|Approved|Rejected|Scheduled|In Use|Completed|Cancelled"
      text reject_reason
      timestamptz completed_at
    }
    SERVICE_REQUESTS {
      bigint id PK
      bigint facility_id FK
      uuid reported_by FK
      text title
      text priority "Low|Normal|High|Urgent"
      service_status status "Open | In Progress | Resolved"
    }
    AUDIT_LOGS {
      bigint id PK
      uuid actor_id FK
      text actor_email
      app_role actor_role
      text action
      text entity_type
      text entity_id
      jsonb details
      timestamptz created_at
    }
```

## Notes
- `reservations.status` implements **BR-B4-05/06/07**: transitions are validated by the trigger
  `validate_reservation_transition()`, overlapping active slots are blocked by
  `check_reservation_conflict()` (BR-B4-03).
- `facilities.status = 'Maintenance'` blocks reservation inserts (BR-B4-08) via the same trigger.
- Every critical action writes an `audit_logs` row (BR-B4-10); admin reads them through
  `get_audit_logs()` which refuses non-admin callers.