// ============================================================
// Facility Staff dashboard
// ============================================================
window.FRS = window.FRS || {};
window.FRS.staff = {};

(function () {
  'use strict';

  let profile;
  let facilities = [];
  let upcoming = [];
  let serviceRequests = [];
  let allReservations = [];

  async function setup() {
    const ctx = await FRS.auth.requireRole(['staff']);
    if (!ctx) return;
    profile = ctx.profile;
    FRS.auth.renderShell(profile, 'staff');
    await Promise.all([loadFacilities(), loadReservations(), loadServiceRequests()]);
    bindForms();
    computeStats();
  }

  function facilityOptions() {
    return facilities.map(f =>
      '<option value="' + f.id + '">' + FRS.ui.esc(f.name) + ' (' + FRS.ui.esc(f.condition) + ')</option>').join('');
  }

  async function loadFacilities() {
    document.getElementById('sv-facility').innerHTML = '<option value="">Loading…</option>';
    const { data, error } = await FRS.api.facilities.list();
    if (error) { FRS.ui.toast(error.message, 'danger'); return; }
    facilities = data || [];
    const opts = facilityOptions();
    document.getElementById('sv-facility').innerHTML = opts;
    document.getElementById('co-facility').innerHTML = opts;
    renderFacilities();
  }

  async function loadReservations() {
    const { data, error } = await FRS.api.reservations.list();
    if (error) { FRS.ui.toast(error.message, 'danger'); return; }
    allReservations = data || [];
    upcoming = allReservations.filter(r =>
      ['Scheduled', 'In Use', 'Approved', 'Pending'].indexOf(r.status) !== -1
    ).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    renderUpcoming();
    computeStats();
  }

  function reservationActions(r) {
    const acts = [];
    if (r.status === 'Scheduled')
      acts.push('<button class="btn btn-success btn-sm" onclick="FRS.staff.markInUse(' + r.id + ')">Mark In Use</button>');
    if (r.status === 'In Use')
      acts.push('<button class="btn btn-primary btn-sm" onclick="FRS.staff.complete(' + r.id + ')">Mark Completed</button>');
    if (!acts.length) acts.push('<span class="muted" style="font-size:.78rem">None</span>');
    return '<div class="row-actions">' + acts.join('') + '</div>';
  }

  function renderUpcoming() {
    const tbody = document.querySelector('#upcoming-table tbody');
    if (!upcoming.length) {
      tbody.innerHTML = FRS.ui.emptyRow(7, 'No upcoming or active reservations.');
      return;
    }
    tbody.innerHTML = upcoming.map(r =>
      '<tr>' +
        '<td><strong>' + FRS.ui.esc(r.title) + '</strong></td>' +
        '<td>' + FRS.ui.esc(r.facility && r.facility.name || '&ndash;') + '</td>' +
        '<td>' + FRS.ui.esc(r.requester && (r.requester.full_name || r.requester.email) || '&ndash;') + '</td>' +
        '<td>' + FRS.ui.fmt(r.start_time) + '</td>' +
        '<td>' + FRS.ui.fmt(r.end_time) + '</td>' +
        '<td>' + FRS.ui.statusBadge(r.status) + '</td>' +
        '<td>' + reservationActions(r) + '</td>' +
      '</tr>'
    ).join('');
  }

  // ---- service requests ----
  async function loadServiceRequests() {
    const { data, error } = await FRS.api.serviceRequests.list();
    if (error) { FRS.ui.toast(error.message, 'danger'); return; }
    serviceRequests = data || [];
    renderServiceRequests();
    computeStats();
  }

  function srActions(s) {
    const acts = [];
    if (s.status === 'Open')
      acts.push('<button class="btn btn-sm" onclick="FRS.staff.setSrStatus(' + s.id + ', \'In Progress\')">Start</button>');
    if (s.status === 'Open' || s.status === 'In Progress')
      acts.push('<button class="btn btn-success btn-sm" onclick="FRS.staff.setSrStatus(' + s.id + ', \'Resolved\')">Resolve</button>');
    if (!acts.length) acts.push('<span class="muted" style="font-size:.78rem">None</span>');
    return '<div class="row-actions">' + acts.join('') + '</div>';
  }

  function renderServiceRequests() {
    const tbody = document.querySelector('#sr-table tbody');
    if (!serviceRequests.length) {
      tbody.innerHTML = FRS.ui.emptyRow(6, 'No service requests yet.');
      return;
    }
    tbody.innerHTML = serviceRequests.map(s =>
      '<tr>' +
        '<td><strong>' + FRS.ui.esc(s.title) + '</strong>' +
          '<div class="muted" style="font-size:.76rem">' + FRS.ui.esc(s.description || '') + '</div></td>' +
        '<td>' + FRS.ui.esc(s.facility && s.facility.name || '&ndash;') + '</td>' +
        '<td><span class="badge badge-warn">' + FRS.ui.esc(s.priority) + '</span></td>' +
        '<td>' + FRS.ui.statusBadge(s.status, FRS.ui.SVC_COLORS) + '</td>' +
        '<td>' + FRS.ui.fmt(s.reported_at) + '</td>' +
        '<td>' + srActions(s) + '</td>' +
      '</tr>'
    ).join('');
  }

  // ---- facilities condition table ----
  function renderFacilities() {
    const tbody = document.querySelector('#facility-table tbody');
    if (!facilities.length) {
      tbody.innerHTML = FRS.ui.emptyRow(5, 'No facilities.');
      return;
    }
    tbody.innerHTML = facilities.map(f =>
      '<tr>' +
        '<td><strong>' + FRS.ui.esc(f.name) + '</strong></td>' +
        '<td>' + FRS.ui.esc(f.location || '&ndash;') + '</td>' +
        '<td>' + FRS.ui.statusBadge(f.status, FRS.ui.FAC_COLORS) + '</td>' +
        '<td>' + FRS.ui.esc(f.condition) + '</td>' +
        '<td><button class="btn btn-sm" onclick="FRS.staff.openCondition(' + f.id + ')">Update condition</button></td>' +
      '</tr>'
    ).join('');
  }

  function computeStats() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('st-scheduled').textContent =
      allReservations.filter(r => r.status === 'Scheduled' &&
        new Date(r.start_time) >= today && new Date(r.start_time) < tomorrow).length;
    document.getElementById('st-inuse').textContent =
      allReservations.filter(r => r.status === 'In Use').length;
    document.getElementById('st-open-sr').textContent =
      serviceRequests.filter(s => s.status !== 'Resolved').length;
  }

  // ---- actions ----
  function openService() {
    document.getElementById('service-form').reset();
    FRS.ui.openModal('modal-service');
  }

  async function createService(e) {
    e.preventDefault();
    try {
      await FRS.api.serviceRequests.create({
        facility_id: Number(document.getElementById('sv-facility').value),
        title: document.getElementById('sv-title').value.trim(),
        description: document.getElementById('sv-desc').value.trim(),
        priority: document.getElementById('sv-priority').value
      });
      FRS.ui.toast('Service request created.', 'success');
      FRS.ui.closeModal('modal-service');
      loadServiceRequests();
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  function openCondition(preset) {
    document.getElementById('condition-form').reset();
    if (preset) document.getElementById('co-facility').value = preset;
    FRS.ui.openModal('modal-condition');
  }

  async function saveCondition(e) {
    e.preventDefault();
    try {
      const fac = await FRS.api.facilities.setCondition(
        Number(document.getElementById('co-facility').value),
        document.getElementById('co-condition').value
      );
      FRS.ui.toast('Facility condition updated to ' + fac.condition + '.', 'success');
      FRS.ui.closeModal('modal-condition');
      loadFacilities();
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  async function markInUse(id) {
    try {
      await FRS.api.reservations.markInUse(id);
      FRS.ui.toast('Facility marked In Use.', 'success');
      loadReservations();
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  async function complete(id) {
    const ok = await FRS.ui.confirmDialog('Record completion?',
      'Status will become Completed. Completed reservations can no longer be edited (BR-B4-07).', 'Complete');
    if (!ok) return;
    try {
      await FRS.api.reservations.markCompleted(id);
      FRS.ui.toast('Reservation completed.', 'success');
      loadReservations();
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  async function setSrStatus(id, status) {
    try {
      await FRS.api.serviceRequests.setStatus(id, status);
      FRS.ui.toast('Service request → ' + status, 'success');
      loadServiceRequests();
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  function bindForms() {
    document.getElementById('service-form').addEventListener('submit', createService);
    document.getElementById('condition-form').addEventListener('submit', saveCondition);
    document.querySelectorAll('.modal').forEach(m =>
      m.addEventListener('click', ev => { if (ev.target === m) FRS.ui.closeModal(m.id); }));
  }

  window.FRS.staff = { openService, openCondition, markInUse, complete, setSrStatus };

  document.addEventListener('DOMContentLoaded', setup);
})();