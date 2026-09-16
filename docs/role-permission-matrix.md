# Role–Permission Matrix

Legend: **R** = read/view, **C** = create, **U** = update, **D** = delete, **S** = shared RPC

| Resource / action                       | Requester | Facility Staff | Administrator |
|-----------------------------------------|:--------:|:--------------:|:-------------:|
| **Facilities**                          |          |                |               |
| View facilities                         | R        | R              | R             |
| Add / edit / delete facility            | –        | –              | C / U / D     |
| Update facility condition (Good→Under Maintenance) | – | U        | U             |
| **Reservations**                        |          |                |               |
| Submit reservation request (Pending)    | C        | –              | –             |
| View reservations                       | R (own history) | R     | R             |
| Edit own *Pending* request              | U        | –              | –             |
| Cancel own eligible (Pending/Approved/Scheduled) | U | –       | U (any)       |
| Approve / reject (Pending)              | –        | –              | U             |
| Schedule (Approved → Scheduled)         | –        | –              | U             |
| Mark In Use (Scheduled)                 | –        | U              | U             |
| Mark Completed (In Use)                 | –        | U              | U             |
| Edit / delete Completed reservation     | –        | –              | – *(blocked)* |
| **Service requests**                    |          |                |               |
| Create service concern                  | –        | C              | –             |
| Update service request status           | –        | U              | U             |
| **Users**                               |          |                |               |
| View profiles                           | R        | R              | R             |
| Change role (admin/staff/requester)     | –        | –              | U             |
| **Audit logs**                          | –        | –              | R             |
| **Reports**                             | –        | – (stats only) | R             |

## Overlay of business rules applicable per role
- **Requester** — only `requester_id = own` + status `Pending` rows are writable (BR-B4-09).
- **Staff** — can advance `Scheduled→In Use→Completed` and manage condition/service requests.
- **Administrator** — owns approval/rejection (BR-B4-04), facility CRUD and role assignment.
- System role (triggers) — blocks overlaps (BR-B4-03), non-active facilities (BR-B4-01/08),
  invalid transitions (BR-B4-05/07) and logs every change (BR-B4-10).