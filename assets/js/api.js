// ============================================================
// Data access layer - all mutation of protected data goes
// through Supabase RPC functions where the business rules live.
// ============================================================
window.FRS = window.FRS || {};

(function () {
  'use strict';

  const c = () => window.FRS.client;

  async function rpc(name, args) {
    const { data, error } = await c().rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  // ---- Facilities --------------------------------------------------------
  const facilities = {
    list: () => c().from('facilities').select('*').order('name'),
    create: (f) => rpc('create_facility', f),
    update: (id, patch) =>
      rpc('update_facility', Object.assign({ p_id: id }, patchToNulls(patch))),
    remove: (id) => rpc('delete_facility', { p_id: id }),
    setCondition: (id, condition) =>
      rpc('update_facility_condition', { p_id: id, p_condition: condition })
  };

  // update_facility uses coalesce() so only non-null fields change
  function patchToNulls(patch) {
    return {
      p_name: patch.name || null,
      p_location: patch.location || null,
      p_description: patch.description || null,
      p_capacity: patch.capacity || null,
      p_status: patch.status || null
    };
  }

  // ---- Reservations --------------------------------------------------------
  const reservations = {
    list: (opts) => {
      let q = c().from('reservations').select(
        '*, facility:facilities(name), requester:profiles(email, full_name)'
      );
      if (opts && opts.byRequester) q = q.eq('requester_id', opts.byRequester);
      if (opts && opts.status) q = q.eq('status', opts.status);
      return q.order('start_time', { ascending: false });
    },
    pending: () => c().from('reservations')
      .select('*, facility:facilities(name), requester:profiles(email, full_name)')
      .eq('status', 'Pending').order('start_time'),
    submit: (facilityId, title, start, end, notes) =>
      rpc('submit_reservation', {
        p_facility_id: facilityId, p_title: title,
        p_start: start, p_end: end, p_notes: notes || null
      }),
    approve: (id) => rpc('approve_reservation', { p_id: id }),
    reject: (id, reason) => rpc('reject_reservation', { p_id: id, p_reason: reason || 'Not specified' }),
    schedule: (id) => rpc('schedule_reservation', { p_id: id }),
    markInUse: (id) => rpc('mark_in_use', { p_id: id }),
    markCompleted: (id) => rpc('mark_completed', { p_id: id }),
    cancel: (id) => rpc('cancel_reservation', { p_id: id }),
    updatePending: (id, patch) =>
      rpc('update_pending_request', {
        p_id: id, p_title: patch.title,
        p_start: patch.start, p_end: patch.end, p_notes: patch.notes || null
      })
  };

  // ---- Service requests -----------------------------------------------------
  const serviceRequests = {
    list: () => c().from('service_requests')
      .select('*, facility:facilities(name), reporter:profiles(email)')
      .order('reported_at', { ascending: false }),
    create: (f) => rpc('create_service_request', {
      p_facility_id: f.facility_id, p_title: f.title,
      p_description: f.description || null, p_priority: f.priority || 'Normal'
    }),
    setStatus: (id, status) => rpc('update_service_request_status', { p_id: id, p_status: status })
  };

  // ---- Profiles / users -------------------------------------------------------
  const users = {
    list: () => c().from('profiles').select('*').order('role').order('email'),
    setRole: (id, role) => rpc('set_user_role', { p_user_id: id, p_role: role })
  };

  // ---- Audit ---------------------------------------------------------------
  const auditLogs = {
    list: (limit) => rpc('get_audit_logs', { p_limit: limit || 250 })
  };

  window.FRS.api = { facilities, reservations, serviceRequests, users, auditLogs };

  // helper used by the functional test suite
  const hasError = (e, text) => (e && (e.message || '').indexOf(text) !== -1);
  window.FRS.api.hasError = hasError;
})();