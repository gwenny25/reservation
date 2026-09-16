// ============================================================
// Administrator dashboard
// ============================================================
window.FRS = window.FRS || {};
window.FRS.admin = {};

(function () {
  'use strict';

  let profile;
  let facilities = [];
  let reservations = [];
  let serviceRequests = [];
  let auditLogs = [];
  let users = [];

  async function setup() {
    const ctx = await FRS.auth.requireRole(['administrator']);
    if (!ctx) return;
    profile = ctx.profile;
    FRS.auth.renderShell(profile, 'admin');
    bindForms();
    await loadAll();
  }

  async function loadAll() {
    await Promise.all([loadReservations(), loadFacilities(), loadServiceRequests(), loadUsers(), loadAudit()]);
  }

  async function loadReservations() {
    const { data, error } = await FRS.api.reservations.list();
    if (error) { FRS.ui.toast(error.message, 'danger'); return; }
    reservations = data || [];
    renderApprovalQueue();
    renderAllReservations();
    computeStats();
  }

  async function loadFacilities() {
    const { data, error } = await FRS.api.facilities.list();
    if (error) { FRS.ui.toast(error.message, 'danger'); return; }
    facilities = data || [];
    renderFacilities();
    computeStats();
  }

  async function loadServiceRequests() {
    const { data, error } = await FRS.api.serviceRequests.list();
    if (error) { FRS.ui.toast(error.message, 'danger'); return; }
    serviceRequests = data || [];
    renderServiceRequests();
    computeStats();
  }

  async function loadUsers() {
    const { data, error } = await FRS.api.users.list();
    if (error) { FRS.ui.toast(error.message, 'danger'); return; }
    users = data || [];
    renderUsers();
  }

  async function loadAudit() {
    document.querySelector('#audit-table tbody').innerHTML =
      '<tr><td colspan="6" class="empty">Loading audit trail…</td></tr>';
    try {
      auditLogs = await FRS.api.auditLogs.list(300) || [];
      renderAudit();
    } catch (err) {
      document.querySelector('#audit-table tbody').innerHTML =
        FRS.ui.emptyRow(6, 'Audit access denied (' + err.message + ')');
    }
  }

  function computeStats() {
    document.getElementById('st-pending').textContent =
      reservations.filter(r => r.status === 'Pending').length;
    document.getElementById('st-active-fac').textContent =
      facilities.filter(f => f.status === 'Active').length;
    document.getElementById('st-scheduled').textContent =
      reservations.filter(r => r.status === 'Scheduled' || r.status === 'In Use').length;
    document.getElementById('st-requests').textContent =
      serviceRequests.filter(s => s.status !== 'Resolved').length;

    const rows = [
      ['Total facilities', facilities.length],
      ['Facilities under maintenance', facilities.filter(f => f.status === 'Maintenance').length],
      ['Total reservations', reservations.length],
      ['Pending / Approved / Rejected',
        ['Pending', 'Approved', 'Rejected'].map(s =>
          s + '=' + reservations.filter(r => r.status === s).length).join(' · ')],
      ['Scheduled / In Use / Completed',
        ['Scheduled', 'In Use', 'Completed'].map(s =>
          s + '=' + reservations.filter(r => r.status === s).length).join(' · ')],
      ['Cancelled reservations', reservations.filter(r => r.status === 'Cancelled').length],
      ['Open service concerns', serviceRequests.filter(s => s.status !== 'Resolved').length],
      ['Registered users', users.length]
    ];
    document.querySelector('#reports-table tbody').innerHTML = rows.map(r =>
      '<tr><td>' + FRS.ui.esc(r[0]) + '</td><td>' + FRS.ui.esc(r[1]) + '</td></tr>').join('');
  }

  // ---- approval queue ----
  function renderApprovalQueue() {
    const pending = reservations.filter(r => r.status === 'Pending');
    const tbody = document.querySelector('#approval-table tbody');
    if (!pending.length) {
      tbody.innerHTML = FRS.ui.emptyRow(6, 'No reservations awaiting approval.');
      return;
    }
    tbody.innerHTML = pending.map(r =>
      '<tr>' +
        '<td><strong>' + FRS.ui.esc(r.title) + '</strong>' +
          (r.notes ? '<div class="muted" style="font-size:.76rem">' + FRS.ui.esc(r.notes) + '</div>' : '') + '</td>' +
        '<td>' + FRS.ui.esc(r.facility && r.facility.name || '&ndash;') + '</td>' +
        '<td>' + FRS.ui.esc(r.requester && (r.requester.full_name || r.requester.email) || '&ndash;') + '</td>' +
        '<td>' + FRS.ui.fmt(r.start_time) + '</td>' +
        '<td>' + FRS.ui.fmt(r.end_time) + '</td>' +
        '<td><div class="row-actions">' +
          '<button class="btn btn-success btn-sm" onclick="FRS.admin.approve(' + r.id + ')">Approve</button>' +
          '<button class="btn btn-danger btn-sm" onclick="FRS.admin.openReject(' + r.id + ')">Reject</button>' +
        '</div></td>' +
      '</tr>'
    ).join('');
  }

  function renderAllReservations() {
    const tbody = document.querySelector('#all-reservations tbody');
    if (!reservations.length) {
      tbody.innerHTML = FRS.ui.emptyRow(7, 'No reservations yet.');
      return;
    }
    tbody.innerHTML = reservations.map(r => {
      const acts = [];
      if (r.status === 'Approved')
        acts.push('<button class="btn btn-sm" onclick="FRS.admin.schedule(' + r.id + ')">Schedule</button>');
      if (['Pending', 'Approved', 'Scheduled'].indexOf(r.status) !== -1)
        acts.push('<button class="btn btn-sm btn-danger" onclick="FRS.admin.cancel(' + r.id + ')">Cancel</button>');
      const actionCell = acts.length
        ? '<div class="row-actions">' + acts.join('') + '</div>'
        : '<span class="muted" style="font-size:.78rem">None</span>';
      return (
        '<tr>' +
          '<td><strong>' + FRS.ui.esc(r.title) + '</strong>' +
            (r.reject_reason ? '<div class="muted" style="font-size:.76rem">Reason: ' + FRS.ui.esc(r.reject_reason) + '</div>' : '') + '</td>' +
          '<td>' + FRS.ui.esc(r.facility && r.facility.name || '&ndash;') + '</td>' +
          '<td>' + FRS.ui.esc(r.requester && (r.requester.full_name || r.requester.email) || '&ndash;') + '</td>' +
          '<td>' + FRS.ui.fmt(r.start_time) + '</td>' +
          '<td>' + FRS.ui.fmt(r.end_time) + '</td>' +
          '<td>' + FRS.ui.statusBadge(r.status) + '</td>' +
          '<td>' + actionCell + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  // ---- facilities ----
  function renderFacilities() {
    const tbody = document.querySelector('#admin-facilities tbody');
    if (!facilities.length) {
      tbody.innerHTML = FRS.ui.emptyRow(6, 'No facilities.');
      return;
    }
    tbody.innerHTML = facilities.map(f =>
      '<tr>' +
        '<td><strong>' + FRS.ui.esc(f.name) + '</strong></td>' +
        '<td>' + FRS.ui.esc(f.location || '&ndash;') + '</td>' +
        '<td>' + (f.capacity || '&ndash;') + '</td>' +
        '<td>' + FRS.ui.statusBadge(f.status, FRS.ui.FAC_COLORS) + '</td>' +
        '<td>' + FRS.ui.esc(f.condition) + '</td>' +
        '<td><div class="row-actions">' +
          '<button class="btn btn-sm" onclick="FRS.admin.openFacility(' + f.id + ')">Edit</button>' +
          '<button class="btn btn-sm btn-danger" onclick="FRS.admin.deleteFacility(' + f.id + ')">Delete</button>' +
        '</div></td>' +
      '</tr>'
    ).join('');
  }

  function renderServiceRequests() {
    const tbody = document.querySelector('#admin-svc tbody');
    if (!serviceRequests.length) {
      tbody.innerHTML = FRS.ui.emptyRow(6, 'No service concerns.');
      return;
    }
    tbody.innerHTML = serviceRequests.map(s =>
      '<tr>' +
        '<td><strong>' + FRS.ui.esc(s.title) + '</strong>' +
          '<div class="muted" style="font-size:.76rem">' + FRS.ui.esc(s.description || '') + '</div></td>' +
        '<td>' + FRS.ui.esc(s.facility && s.facility.name || '&ndash;') + '</td>' +
        '<td>' + FRS.ui.esc(s.reporter && s.reporter.email || '&ndash;') + '</td>' +
        '<td><span class="badge badge-warn">' + FRS.ui.esc(s.priority) + '</span></td>' +
        '<td>' + FRS.ui.statusBadge(s.status, FRS.ui.SVC_COLORS) + '</td>' +
        '<td>' + FRS.ui.fmt(s.reported_at) + '</td>' +
      '</tr>'
    ).join('');
  }

  // ---- users ----
  function roleSelect(user) {
    const opts = ['administrator', 'staff', 'requester']
      .map(r => '<option value="' + r + '"' + (user.role === r ? ' selected' : '') + '>' + r + '</option>');
    return '<select onchange="FRS.admin.setRole(' + user.id + ', this.value)" style="padding:4px 6px;border:1px solid #e2e8f0;border-radius:6px">' +
      opts.join('') + '</select>';
  }

  function renderUsers() {
    const tbody = document.querySelector('#admin-users tbody');
    if (!users.length) {
      tbody.innerHTML = FRS.ui.emptyRow(4, 'No registered users.');
      return;
    }
    tbody.innerHTML = users.map(u =>
      '<tr>' +
        '<td><span class="avatar">' + FRS.ui.initials(u.full_name || u.email) + '</span> ' +
          '<strong>' + FRS.ui.esc(u.full_name || '&ndash;') + '</strong></td>' +
        '<td>' + FRS.ui.esc(u.email) + '</td>' +
        '<td>' + roleSelect(u) + '</td>' +
        '<td><span class="muted" style="font-size:.76rem">' + FRS.ui.fmt(u.created_at) + '</span></td>' +
      '</tr>'
    ).join('');
  }

  // ---- audit ----
  function renderAudit() {
    const tbody = document.querySelector('#audit-table tbody');
    if (!auditLogs.length) {
      tbody.innerHTML = FRS.ui.emptyRow(6, 'No audit entries yet.');
      return;
    }
    tbody.innerHTML = auditLogs.map(a =>
      '<tr>' +
        '<td>' + FRS.ui.fmt(a.created_at) + '</td>' +
        '<td>' + FRS.ui.esc(a.actor_email || 'system') + '</td>' +
        '<td>' + FRS.ui.esc(a.actor_role || '&ndash;') + '</td>' +
        '<td><span class="badge badge-info">' + FRS.ui.esc(a.action) + '</span></td>' +
        '<td>' + FRS.ui.esc(a.entity_type) + ' #' + FRS.ui.esc(a.entity_id || '&ndash;') + '</td>' +
        '<td style="font-size:.76rem">' + FRS.ui.esc(JSON.stringify(a.details || {})) + '</td>' +
      '</tr>'
    ).join('');
  }

  // ---- actions ----
  async function approve(id) {
    try {
      await FRS.api.reservations.approve(id);
      FRS.ui.toast('Reservation approved (slot is now reserved).', 'success');
      await Promise.all([loadReservations(), loadAudit()]);
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  function openReject(id) {
    document.getElementById('r-id').value = id;
    document.getElementById('r-reason').value = '';
    FRS.ui.openModal('modal-reject');
    document.getElementById('r-reason').focus();
  }

  async function reject(e) {
    e.preventDefault();
    try {
      await FRS.api.reservations.reject(
        Number(document.getElementById('r-id').value),
        document.getElementById('r-reason').value.trim()
      );
      FRS.ui.toast('Reservation rejected.', 'success');
      FRS.ui.closeModal('modal-reject');
      await Promise.all([loadReservations(), loadAudit()]);
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  async function schedule(id) {
    try {
      await FRS.api.reservations.schedule(id);
      FRS.ui.toast('Reservation scheduled.', 'success');
      await Promise.all([loadReservations(), loadAudit()]);
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  async function cancel(id) {
    const ok = await FRS.ui.confirmDialog('Cancel reservation #' + id + '?',
      'Admin cancel is allowed for Pending, Approved and Scheduled reservations. It will be logged.', 'Cancel');
    if (!ok) return;
    try {
      await FRS.api.reservations.cancel(id);
      FRS.ui.toast('Reservation cancelled.', 'success');
      await Promise.all([loadReservations(), loadAudit()]);
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  function openFacility(id) {
    document.getElementById('facility-form').reset();
    let f = null;
    if (id) f = facilities.find(x => x.id === id);
    document.getElementById('facility-modal-title').textContent = f ? 'Edit facility' : 'New facility';
    document.getElementById('f-id').value = f ? f.id : '';
    document.getElementById('f-name').value = f ? f.name : '';
    document.getElementById('f-location').value = f ? (f.location || '') : '';
    document.getElementById('f-capacity').value = f ? (f.capacity || '') : '';
    document.getElementById('f-status').value = f ? f.status : 'Active';
    document.getElementById('f-description').value = f ? (f.description || '') : '';
    FRS.ui.openModal('modal-facility');
  }

  async function saveFacility(e) {
    e.preventDefault();
    const f = {
      name: document.getElementById('f-name').value.trim(),
      location: document.getElementById('f-location').value.trim(),
      capacity: Number(document.getElementById('f-capacity').value) || null,
      status: document.getElementById('f-status').value,
      description: document.getElementById('f-description').value.trim()
    };
    const id = document.getElementById('f-id').value;
    try {
      if (id) await FRS.api.facilities.update(Number(id), f);
      else await FRS.api.facilities.create(f);
      FRS.ui.toast('Facility saved.', 'success');
      FRS.ui.closeModal('modal-facility');
      await Promise.all([loadFacilities(), loadAudit()]);
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  async function deleteFacility(id) {
    const f = facilities.find(x => x.id === id);
    const ok = await FRS.ui.confirmDialog('Delete ' + (f ? f.name : 'facility') + '?',
      'If the facility has reservation/service history it is soft-deleted (status → Inactive). Otherwise it is hard-deleted. Logged.',
      'Delete');
    if (!ok) return;
    try {
      await FRS.api.facilities.remove(id);
      FRS.ui.toast('Facility deleted.', 'success');
      await Promise.all([loadFacilities(), loadAudit()]);
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  async function setRole(userId, role) {
    try {
      await FRS.api.users.setRole(userId, role);
      FRS.ui.toast('Role updated to ' + role + '.', 'success');
      await Promise.all([loadUsers(), loadAudit()]);
    } catch (err) { FRS.ui.toast(err.message, 'danger'); loadUsers(); }
  }

  function refresh() { loadAll(); }

  function bindForms() {
    document.getElementById('facility-form').addEventListener('submit', saveFacility);
    document.getElementById('reject-form').addEventListener('submit', reject);
    document.querySelectorAll('.modal').forEach(m =>
      m.addEventListener('click', ev => { if (ev.target === m) FRS.ui.closeModal(m.id); }));
  }

  window.FRS.admin = {
    approve, openReject, reject, schedule, cancel,
    openFacility, saveFacility, deleteFacility,
    setRole, refresh
  };

  document.addEventListener('DOMContentLoaded', setup);
})();