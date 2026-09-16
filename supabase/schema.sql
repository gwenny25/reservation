-- ============================================================================
--  FACILITY RESERVATION AND SERVICE REQUEST MANAGEMENT SYSTEM
--  Systems Analysis and Design - Laboratory 4 - Section B
--  Role-Based Facility Reservation and Approval System
--
--  Run this in: Supabase Dashboard > SQL Editor
--  It creates: tables, RLS policies, business-rule triggers, RPC functions,
--              audit logging and seed data.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. LOOKUP TYPES
-- ----------------------------------------------------------------------------
create type facility_status  as enum ('Active', 'Maintenance', 'Inactive');
create type reservation_status as enum (
  'Pending', 'Approved', 'Rejected', 'Scheduled', 'In Use', 'Completed', 'Cancelled'
);
create type service_status as enum ('Open', 'In Progress', 'Resolved');
create type app_role as enum ('administrator', 'staff', 'requester');
create type facility_condition as enum ('Good', 'Fair', 'Poor', 'Under Maintenance');

-- ----------------------------------------------------------------------------
-- 2. TABLES
-- ----------------------------------------------------------------------------

-- profiles extends auth.users with role information
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       app_role not null default 'requester',
  created_at timestamptz not null default now()
);

create table if not exists public.facilities (
  id          bigint generated always as identity primary key,
  name        text not null,
  location    text,
  description text,
  capacity    integer check (capacity > 0),
  status      facility_status not null default 'Active',        -- BR-B4-01 / BR-B4-08
  condition   facility_condition not null default 'Good',       -- updated by staff
  image_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.reservations (
  id           bigint generated always as identity primary key,
  facility_id  bigint not null references public.facilities (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  title        text not null,
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  status       reservation_status not null default 'Pending',   -- BR-B4-02 via trigger
  notes        text,
  reject_reason text,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_reserv_facility_time on public.reservations (facility_id, start_time, end_time);
create index if not exists idx_reserv_status on public.reservations (status);

create table if not exists public.service_requests (
  id          bigint generated always as identity primary key,
  facility_id bigint not null references public.facilities (id) on delete cascade,
  reported_by uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  description text,
  priority    text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  status      service_status not null default 'Open',
  reported_at timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_email  text,
  actor_role   app_role,
  action       text not null,          -- e.g. RESERVATION_SUBMITTED, RESERVATION_APPROVED
  entity_type  text not null,          -- reservations / facilities / service_requests / profiles
  entity_id    text,
  details      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_audit_created on public.audit_logs (created_at desc);

-- ----------------------------------------------------------------------------
-- 3. ROLE HELPER FUNCTIONS
-- ----------------------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'administrator'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'staff'
  );
$$;

create or replace function public.is_requester()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'requester'
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. AUDIT HELPER (BR-B4-10: approval and status changes MUST be logged)
-- ----------------------------------------------------------------------------
create or replace function public.add_log(
  p_action     text,
  p_entity_type text,
  p_entity_id   text default null,
  p_details     jsonb default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_role   public.app_role;
  v_email  text;
begin
  v_role  := public.current_role();
  v_email := nullif(auth.jwt() ->> 'email', '');
  insert into public.audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, details)
  values (auth.uid(), v_email, v_role, p_action, p_entity_type, p_entity_id, p_details);
end;
$$;

grant execute on function public.add_log to authenticated;

-- ----------------------------------------------------------------------------
-- 5. BUSINESS-RULE TRIGGERS
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 5.1 RESERVATION TRANSITION GUARD
-- Enforces: BR-B4-05 (Rejected cannot become Scheduled),
--           BR-B4-07 (Completed cannot be edited),
--           terminal-status immutability.
-- ----------------------------------------------------------------------------
create or replace function public.validate_reservation_transition()
returns trigger
language plpgsql set search_path = public
as $$
begin
  -- BR-B4-07: Completed is immutable
  if old.status = 'Completed' and tg_op = 'UPDATE' then
    raise exception 'BR-B4-07: Completed reservations cannot be edited.';
  end if;
  if old.status = 'Completed' and tg_op = 'DELETE' then
    raise exception 'BR-B4-07: Completed reservations cannot be deleted.';
  end if;

  -- New rows must start as Pending (submission is always a fresh request)
  if tg_op = 'INSERT' and new.status <> 'Pending' then
    raise exception 'A reservation must be created in status Pending.';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    case old.status
      when 'Pending'   then
        if new.status not in ('Pending', 'Approved', 'Rejected', 'Cancelled') then
          raise exception 'Invalid transition from Pending to %', new.status;
        end if;
      when 'Approved'  then
        -- BR-B4-05 (effectively): rejected rows can never be scheduled; here Approved may be
        -- scheduled, cancelled, or stay approved.
        if new.status not in ('Approved', 'Scheduled', 'Cancelled') then
          raise exception 'Invalid transition from Approved to %', new.status;
        end if;
      when 'Scheduled' then
        if new.status not in ('Scheduled', 'In Use', 'Cancelled') then
          raise exception 'Invalid transition from Scheduled to %', new.status;
        end if;
      when 'In Use'    then
        if new.status not in ('In Use', 'Completed') then
          raise exception 'Invalid transition from In Use to %', new.status;
        end if;
      when 'Rejected', 'Cancelled' then
        raise exception '% reservations are terminal and cannot change status.', old.status;
      else
        null; -- handled above
    end case;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5.2 SCHEDULE CONFLICT + FACILITY GUARD
-- Enforces: BR-B4-01 (only active facilities),
--           BR-B4-02 (start precedes end),
--           BR-B4-03 (overlapping approved schedules prohibited),
--           BR-B4-06 (approved reserves the slot),
--           BR-B4-08 (maintenance cannot be reserved).
-- ----------------------------------------------------------------------------
create or replace function public.check_reservation_conflict()
returns trigger
language plpgsql set search_path = public
as $$
declare
  v_fac_status public.facility_status;
  v_new_active boolean := new.status in ('Approved', 'Scheduled', 'In Use');
begin
  select status into v_fac_status from public.facilities where id = new.facility_id;
  if v_fac_status is null then
    raise exception 'Facility does not exist.';
  end if;

  -- BR-B4-02
  if new.start_time >= new.end_time then
    raise exception 'BR-B4-02: Reservation start must precede end time.';
  end if;

  -- BR-B4-01 / BR-B4-08 : only Active facilities may be reserved
  if v_fac_status <> 'Active' then
    raise exception 'BR-B4-08: Facility is under Maintenance/Inactive and cannot be reserved.'
      using errcode = 'P0001';
  end if;

  -- BR-B4-03 / BR-B4-06 : overlap check against approved/scheduled/in-use slots
  if exists (
    select 1
    from public.reservations r
    where r.facility_id = new.facility_id
      and r.status in ('Approved', 'Scheduled', 'In Use')
      and (tg_op = 'UPDATE' and r.id <> new.id or tg_op = 'INSERT' and true)
      and r.start_time < new.end_time
      and new.start_time < r.end_time
  ) then
    raise exception 'BR-B4-03: Overlapping scheduled reservation detected for the requested time slot.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------
create trigger trg_reservation_transition
  before insert or update or delete on public.reservations
  for each row execute function public.validate_reservation_transition();

create trigger trg_reservation_conflict
  before insert or update on public.reservations
  for each row execute function public.check_reservation_conflict();

-- ---------------------------------------------------------------
-- 5.3 TOUCH UPDATED_AT
-- ---------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_facility_touch  before update on public.facilities
  for each row execute function public.touch_updated_at();
create trigger trg_reservation_touch before update on public.reservations
  for each row execute function public.touch_updated_at();
create trigger trg_service_touch    before update on public.service_requests
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 6. RPC WORKFLOW FUNCTIONS
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 6.1 SUBMIT RESERVATION (Requester) -> Saved as Pending (TC-B4-01)
-- ----------------------------------------------------------------------------
create or replace function public.submit_reservation(
  p_facility_id bigint,
  p_title       text,
  p_start       timestamptz,
  p_end         timestamptz,
  p_notes       text default null
)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.reservations;
begin
  if not public.is_requester() then
    raise exception 'Only Requester role may submit reservation requests.';
  end if;
  insert into public.reservations (facility_id, requester_id, title, start_time, end_time, status, notes)
  values (p_facility_id, auth.uid(), nullif(trim(p_title),''), p_start, p_end, 'Pending', p_notes)
  returning * into v_row;

  perform public.add_log('RESERVATION_SUBMITTED', 'reservations', v_row.id::text,
                         jsonb_build_object('facility_id', p_facility_id, 'title', p_title,
                                            'start', p_start, 'end', p_end));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.2 APPROVE (Admin)  -> Approved  /* TC-B4-03, BR-B4-04, BR-B4-06 */
-- ----------------------------------------------------------------------------
create or replace function public.approve_reservation(p_id bigint)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.reservations;
begin
  if not public.is_admin() then
    raise exception 'BR-B4-04: Only the Administrator may approve reservations.';
  end if;
  update public.reservations set status = 'Approved'
  where id = p_id and status = 'Pending'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Reservation not found or not currently Pending.';
  end if;
  perform public.add_log('RESERVATION_APPROVED', 'reservations', p_id::text,
                         jsonb_build_object('facility_id', v_row.facility_id, 'status', 'Approved'));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.3 REJECT (Admin) -> Rejected  /* TC-B4-04, BR-B4-04 */
-- ----------------------------------------------------------------------------
create or replace function public.reject_reservation(p_id bigint, p_reason text)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.reservations;
begin
  if not public.is_admin() then
    raise exception 'BR-B4-04: Only the Administrator may reject reservations.';
  end if;
  update public.reservations set status = 'Rejected', reject_reason = p_reason
  where id = p_id and status = 'Pending'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Reservation not found or not currently Pending.';
  end if;
  perform public.add_log('RESERVATION_REJECTED', 'reservations', p_id::text,
                         jsonb_build_object('reason', p_reason, 'status', 'Rejected'));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.4 SCHEDULE (Admin)  Approved -> Scheduled
-- ----------------------------------------------------------------------------
create or replace function public.schedule_reservation(p_id bigint)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.reservations;
begin
  if not public.is_admin() then
    raise exception 'Only the Administrator may schedule reservations.';
  end if;
  update public.reservations set status = 'Scheduled'
  where id = p_id and status = 'Approved'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Reservation not found or not currently Approved.';
  end if;
  perform public.add_log('RESERVATION_SCHEDULED', 'reservations', p_id::text,
                         jsonb_build_object('status', 'Scheduled'));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.5 MARK IN USE (Staff)  Scheduled -> In Use  /* TC-B4-05 */
-- ----------------------------------------------------------------------------
create or replace function public.mark_in_use(p_id bigint)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.reservations;
begin
  if not (public.is_staff() or public.is_admin()) then
    raise exception 'Only Facility Staff or Administrator may confirm facility usage.';
  end if;
  update public.reservations set status = 'In Use'
  where id = p_id and status = 'Scheduled'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Reservation not found or not currently Scheduled.';
  end if;
  perform public.add_log('RESERVATION_IN_USE', 'reservations', p_id::text,
                         jsonb_build_object('status', 'In Use'));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.6 MARK COMPLETED (Staff)  In Use -> Completed  /* TC-B4-06 */
-- ----------------------------------------------------------------------------
create or replace function public.mark_completed(p_id bigint)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.reservations;
begin
  if not (public.is_staff() or public.is_admin()) then
    raise exception 'Only Facility Staff or Administrator may complete reservations.';
  end if;
  update public.reservations set status = 'Completed', completed_at = now()
  where id = p_id and status = 'In Use'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Reservation not found or not currently In Use.';
  end if;
  perform public.add_log('RESERVATION_COMPLETED', 'reservations', p_id::text,
                         jsonb_build_object('status', 'Completed'));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.7 CANCEL (Requester own / Admin)  BR-B4-09
-- ----------------------------------------------------------------------------
create or replace function public.cancel_reservation(p_id bigint)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.reservations;
begin
  -- BR-B4-09: requesters may cancel only their own non-terminal requests
  update public.reservations set status = 'Cancelled'
  where id = p_id
    and status in ('Pending', 'Approved', 'Scheduled')
    and (public.is_admin() or requester_id = auth.uid())
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Not allowed: reservation not found, already terminal, or you are not the owner.';
  end if;
  perform public.add_log('RESERVATION_CANCELLED', 'reservations', p_id::text,
                         jsonb_build_object('status', 'Cancelled'));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.8 EDIT OWN PENDING REQUEST (Requester)  BR-B4-09
-- ----------------------------------------------------------------------------
create or replace function public.update_pending_request(
  p_id     bigint,
  p_title  text,
  p_start  timestamptz,
  p_end    timestamptz,
  p_notes  text default null
)
returns public.reservations
language plpgsql security definer set search_path = public
as $$
declare
  v_row public.reservations;
begin
  update public.reservations set title = p_title, start_time = p_start, end_time = p_end, notes = p_notes
  where id = p_id
    and requester_id = auth.uid()
    and status = 'Pending'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'BR-B4-09: You may modify only your own Pending requests.';
  end if;
  perform public.add_log('RESERVATION_UPDATED', 'reservations', p_id::text,
                         jsonb_build_object('title', p_title, 'start', p_start, 'end', p_end));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.9 FACILITY MANAGEMENT (Admin CRUD + Staff condition) - all logged
-- ----------------------------------------------------------------------------
create or replace function public.create_facility(
  p_name text, p_location text default null, p_description text default null,
  p_capacity int default null, p_status text default 'Active'
)
returns public.facilities
language plpgsql security definer set search_path = public
as $$
declare v_row public.facilities;
begin
  if not public.is_admin() then raise exception 'Only Administrator may manage facilities.'; end if;
  insert into public.facilities (name, location, description, capacity, status)
  values (p_name, p_location, p_description, p_capacity, p_status::public.facility_status)
  returning * into v_row;
  perform public.add_log('FACILITY_CREATED', 'facilities', v_row.id::text,
                         jsonb_build_object('name', v_row.name));
  return v_row;
end;
$$;

create or replace function public.update_facility(
  p_id bigint, p_name text default null, p_location text default null,
  p_description text default null, p_capacity int default null, p_status text default null
)
returns public.facilities
language plpgsql security definer set search_path = public
as $$
declare v_row public.facilities;
begin
  if not public.is_admin() then raise exception 'Only Administrator may manage facilities.'; end if;
  update public.facilities set
    name        = coalesce(p_name, name),
    location    = coalesce(p_location, location),
    description = coalesce(p_description, description),
    capacity    = coalesce(p_capacity, capacity),
    status      = coalesce(p_status::public.facility_status, status)
  where id = p_id returning * into v_row;
  if v_row.id is null then raise exception 'Facility not found.'; end if;
  perform public.add_log('FACILITY_UPDATED', 'facilities', p_id::text,
                         jsonb_build_object('name', v_row.name, 'status', v_row.status));
  return v_row;
end;
$$;

create or replace function public.delete_facility(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_name text; v_used int;
begin
  if not public.is_admin() then raise exception 'Only Administrator may manage facilities.'; end if;
  select name into v_name from public.facilities where id = p_id;
  if v_name is null then raise exception 'Facility not found.'; end if;

  select count(*) into v_used from public.reservations where facility_id = p_id;
  if v_used > 0 then
    -- soft delete keeps history intact
    update public.facilities set status = 'Inactive' where id = p_id;
    perform public.add_log('FACILITY_DELETED', 'facilities', p_id::text,
                           jsonb_build_object('name', v_name, 'mode', 'soft'));
  else
    delete from public.facilities where id = p_id;
    perform public.add_log('FACILITY_DELETED', 'facilities', p_id::text,
                           jsonb_build_object('name', v_name, 'mode', 'hard'));
  end if;
end;
$$;

create or replace function public.update_facility_condition(p_id bigint, p_condition text)
returns public.facilities
language plpgsql security definer set search_path = public
as $$
declare v_row public.facilities;
begin
  if not (public.is_staff() or public.is_admin()) then
    raise exception 'Only Facility Staff or Administrator may update facility condition.';
  end if;
  update public.facilities set
    condition = p_condition::public.facility_condition,
    status = case
      when p_condition = 'Under Maintenance' then 'Maintenance'::public.facility_status  -- BR-B4-08
      when status = 'Maintenance' then 'Active'::public.facility_status
      else status end
  where id = p_id returning * into v_row;
  if v_row.id is null then raise exception 'Facility not found.'; end if;
  perform public.add_log('FACILITY_CONDITION_UPDATED', 'facilities', p_id::text,
                         jsonb_build_object('name', v_row.name, 'condition', v_row.condition, 'status', v_row.status));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.10 SERVICE REQUEST MANAGEMENT (Staff)
-- ----------------------------------------------------------------------------
create or replace function public.create_service_request(
  p_facility_id bigint, p_title text, p_description text default null, p_priority text default 'Normal'
)
returns public.service_requests
language plpgsql security definer set search_path = public
as $$
declare v_row public.service_requests;
begin
  if not public.is_staff() then
    raise exception 'Only Facility Staff may create service requests.';
  end if;
  insert into public.service_requests (facility_id, reported_by, title, description, priority)
  values (p_facility_id, auth.uid(), p_title, p_description, p_priority)
  returning * into v_row;
  perform public.add_log('SERVICE_REQUEST_CREATED', 'service_requests', v_row.id::text,
                         jsonb_build_object('facility_id', p_facility_id, 'title', p_title));
  return v_row;
end;
$$;

create or replace function public.update_service_request_status(p_id bigint, p_status text)
returns public.service_requests
language plpgsql security definer set search_path = public
as $$
declare v_row public.service_requests;
begin
  if not (public.is_staff() or public.is_admin()) then
    raise exception 'Only Facility Staff or Administrator may update service requests.';
  end if;
  update public.service_requests set status = p_status::public.service_status
  where id = p_id returning * into v_row;
  if v_row.id is null then raise exception 'Service request not found.'; end if;
  perform public.add_log('SERVICE_REQUEST_STATUS_UPDATED', 'service_requests', p_id::text,
                         jsonb_build_object('status', v_row.status));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.11 USER ROLE MANAGEMENT (Admin)
-- ----------------------------------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only Administrator may manage user roles.';
  end if;
  update public.profiles set role = p_role::public.app_role
  where id = p_user_id returning * into v_row;
  if v_row.id is null then raise exception 'User profile not found.'; end if;
  perform public.add_log('USER_ROLE_CHANGED', 'profiles', p_user_id::text,
                         jsonb_build_object('email', v_row.email, 'role', v_row.role));
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6.12 AUDIT LOG READ (Admin only)
-- ----------------------------------------------------------------------------
create or replace function public.get_audit_logs(p_limit int default 200)
returns setof public.audit_logs
language sql security definer set search_path = public
as $$
  select * from public.audit_logs
  order by created_at desc
  limit greatest(1, least(p_limit, 1000));
$$;

-- restore genuine per-call authorization (function must refuse non-admins)
create or replace function public.get_audit_logs(p_limit int default 200)
returns setof public.audit_logs
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'PRIVILEGE_DENIED: Only Administrator may view audit logs.';
  end if;
  return query
    select * from public.audit_logs
    order by created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. GRANT EXECUTE on RPC functions
-- ----------------------------------------------------------------------------
grant execute on function
  public.submit_reservation, public.approve_reservation, public.reject_reservation,
  public.schedule_reservation, public.mark_in_use, public.mark_completed,
  public.cancel_reservation, public.update_pending_request,
  public.create_facility, public.update_facility, public.delete_facility,
  public.update_facility_condition,
  public.create_service_request, public.update_service_request_status,
  public.set_user_role, public.get_audit_logs
to authenticated;

-- ----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.facilities      enable row level security;
alter table public.reservations    enable row level security;
alter table public.service_requests enable row level security;
alter table public.audit_logs      enable row level security;

-- PROFILES
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (true);  -- role-aware UI needs profile data for all users

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin());

-- FACILITIES
drop policy if exists facilities_select on public.facilities;
create policy facilities_select on public.facilities for select to authenticated
  using (true);

drop policy if exists facilities_admin_write on public.facilities;
create policy facilities_admin_write on public.facilities for insert to authenticated
  with check (public.is_admin());
create policy facilities_admin_update on public.facilities for update to authenticated
  using (public.is_admin());
create policy facilities_admin_delete on public.facilities for delete to authenticated
  using (public.is_admin());

-- RESERVATIONS
drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations for select to authenticated
  using (true);

drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert on public.reservations for insert to authenticated
  with check (requester_id = auth.uid());

drop policy if exists reservations_update on public.reservations;
create policy reservations_update on public.reservations for update to authenticated
  using (
    (requester_id = auth.uid() and status = 'Pending') or
    public.is_admin() or
    public.is_staff()
  )
  with check (public.is_admin() or public.is_staff() or status = 'Pending');

drop policy if exists reservations_delete on public.reservations;
create policy reservations_delete on public.reservations for delete to authenticated
  using (public.is_admin() or (requester_id = auth.uid() and status = 'Pending'));

-- SERVICE REQUESTS
drop policy if exists service_select on public.service_requests;
create policy service_select on public.service_requests for select to authenticated
  using (true);
drop policy if exists service_insert on public.service_requests;
create policy service_insert on public.service_requests for insert to authenticated
  with check (reported_by = auth.uid() and public.is_staff());
drop policy if exists service_update on public.service_requests;
create policy service_update on public.service_requests for update to authenticated
  using (public.is_admin() or public.is_staff());

-- AUDIT LOGS (admin read only)
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. AUTO-CREATE PROFILE ON SIGNUP
-- First account to register becomes the Administrator (bootstrap).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_count int;
begin
  select count(*) into v_count from public.profiles;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when v_count = 0 then 'administrator' else 'requester' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 10. SEED DATA
-- ----------------------------------------------------------------------------
insert into public.facilities (name, location, description, capacity, status, condition) values
  ('Audio Visual Room A', 'Main Building, 2F', 'Multimedia classroom with projector and sound system', 60, 'Active', 'Good'),
  ('Audio Visual Room B', 'Main Building, 3F', 'Seminar room with smart TV and conferencing', 40, 'Active', 'Good'),
  ('Covered Court',       'Ground Floor',    'Multi-purpose covered sports and event court', 500, 'Active', 'Good'),
  ('IT Laboratory 1',     'R&D Building, 2F','Computer laboratory, 40 workstations', 40, 'Active', 'Fair'),
  ('Function Hall',       'Main Building, 4F','Banquet and event hall', 300, 'Active', 'Good'),
  ('Speech Laboratory',   'R&D Building, 3F','Language laboratory', 35, 'Maintenance', 'Under Maintenance')
on conflict do nothing;

commit;