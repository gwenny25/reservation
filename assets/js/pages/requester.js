// ============================================================
// Requester dashboard
// ============================================================
window.FRS = window.FRS || {};
window.FRS.requester = {};

(function () {
  'use strict';

  let profile;
  let facilities = [];
  let myReservations = [];

  async function setup() {
    const ctx = await FRS.auth.requireRole(['requester']);
    if (!ctx) return;
    profile = ctx.profile;
    FRS.auth.renderShell(profile, 'requester');

    await Promise.all([loadFacilities(), loadMyReservations()]);
    bindForms();
  }

  function facSelectOptions() {
    const active = facilities.filter(f => f.status === 'Active');
    if (!active.length) return '<option value="">No active facilities</option>';
    return active.map(f =>
      '<option value="' + f.id + '">' + FRS.ui.esc(f.name) + ' (' + (f.capacity || '?') + ' pax)</option>').join('');
  }

  async function loadFacilities() {
    const { data, error } = await FRS.api.facilities.list();
    if (error) { FRS.ui.toast(error.message, 'danger'); return; }
    facilities = data || [];
    renderFacilities();
    document.getElementById('s-facility').innerHTML = facSelectOptions();
  }

  function renderFacilities() {
    const grid = document.getElementById('facility-grid');
    if (!facilities.length) {
      grid.innerHTML = '<p class="muted">No facilities yet.</p>';
      return;
    }
    grid.innerHTML = facilities.map(f => {
      const booked = f.status !== 'Active';
      return (
        '<div class="card facility-card">' +
          '<div class="facility-top">' +
            '<div><div class="facility-name">' + FRS.ui.esc(f.name) + '</div>' +
            '<div class="facility-meta">' + FRS.ui.esc(f.location || '&ndash;') + '</div></div>' +
            FRS.ui.statusBadge(f.status, FRS.ui.FAC_COLORS || undefined) +
          '</div>' +
          '<p class="muted" style="font-size:.84rem">' + FRS.ui.esc(f.description || '') + '</p>' +
          '<div class="facility-meta">Capacity: <strong>' + (f.capacity || '&ndash;') + '</strong> &middot; Condition: <strong>' + FRS.ui.esc(f.condition) + '</strong></div>' +
          '<div class="facility-actions">' +
            '<button class="btn btn-primary btn-sm" ' + (booked ? 'disabled title="Only active facilities may be reserved"' : '') +
              ' onclick="FRS.requester.openSubmit(' + f.id + ')">Reserve</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  async function loadMyReservations() {
    const { data, error } = await FRS.api.reservations.list({ byRequester: profile.id });
    if (error) { FRS.ui.toast(error.message, 'danger'); return; }
    myReservations = data || [];
    renderMyReservations();
  }

  function reservationActions(r) {
    const acts = [];
    if (r.status === 'Pending') {
      acts.push('<button class="btn btn-sm" onclick="FRS.requester.openEdit(' + r.id + ')">Edit</button>');
      acts.push('<button class="btn btn-sm btn-danger" onclick="FRS.requester.cancel(' + r.id + ')">Cancel</button>');
    } else if (r.status === 'Approved' || r.status === 'Scheduled') {
      // BR-B4-09 + eligible: non-terminal, not yet started
      acts.push('<button class="btn btn-sm btn-danger" onclick="FRS.requester.cancel(' + r.id + ')">Cancel</button>');
    }
    if (!acts.length) acts.push('<span class="muted" style="font-size:.78rem">None</span>');
    return '<div class="row-actions">' + acts.join('') + '</div>';
  }

  function renderMyReservations() {
    const tbody = document.querySelector('#my-reservations tbody');
    if (!myReservations.length) {
      tbody.innerHTML = FRS.ui.emptyRow(6, 'You have not submitted any reservations yet.');
      return;
    }
    tbody.innerHTML = myReservations.map(r =>
      '<tr>' +
        '<td><strong>' + FRS.ui.esc(r.title) + '</strong>' +
          (r.reject_reason ? '<div class="muted" style="font-size:.76rem">Reason: ' + FRS.ui.esc(r.reject_reason) + '</div>' : '') +
        '</td>' +
        '<td>' + FRS.ui.esc(r.facility && r.facility.name || '&ndash;') + '</td>' +
        '<td>' + FRS.ui.fmt(r.start_time) + '</td>' +
        '<td>' + FRS.ui.fmt(r.end_time) + '</td>' +
        '<td>' + FRS.ui.statusBadge(r.status) + '</td>' +
        '<td>' + reservationActions(r) + '</td>' +
      '</tr>'
    ).join('');
  }

  // ---- submit ----
  function openSubmit(presetFacilityId) {
    document.getElementById('submit-form').reset();
    if (presetFacilityId) document.getElementById('s-facility').value = presetFacilityId;
    FRS.ui.openModal('modal-submit');
    window.setTimeout(() => document.getElementById('s-title').focus(), 50);
  }

  async function submit(e) {
    e.preventDefault();
    const start = FRS.ui.toISO(document.getElementById('s-start').value);
    const end = FRS.ui.toISO(document.getElementById('s-end').value);
    if (!start || !end) { FRS.ui.toast('Pick valid start and end times.', 'warn'); return; }
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await FRS.api.reservations.submit(
        Number(document.getElementById('s-facility').value),
        document.getElementById('s-title').value.trim(),
        start, end,
        document.getElementById('s-notes').value.trim()
      );
      FRS.ui.toast('Request submitted. Saved as Pending.', 'success');
      FRS.ui.closeModal('modal-submit');
      loadMyReservations();
    } catch (err) {
      FRS.ui.toast(err.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  }

  // ---- edit own pending (BR-B4-09) ----
  function openEdit(id) {
    const r = myReservations.find(x => x.id === id);
    if (!r) return;
    document.getElementById('e-id').value = r.id;
    document.getElementById('e-title').value = r.title;
    document.getElementById('e-start').value = new Date(r.start_time).toLocaleString('sv-SE').slice(0, 16);
    document.getElementById('e-end').value = new Date(r.end_time).toLocaleString('sv-SE').slice(0, 16);
    document.getElementById('e-notes').value = r.notes || '';
    FRS.ui.openModal('modal-edit');
  }

  async function edit(e) {
    e.preventDefault();
    const id = Number(document.getElementById('e-id').value);
    const start = FRS.ui.toISO(document.getElementById('e-start').value);
    const end = FRS.ui.toISO(document.getElementById('e-end').value);
    if (!start || !end) { FRS.ui.toast('Pick valid start and end times.', 'warn'); return; }
    try {
      await FRS.api.reservations.updatePending(id, {
        title: document.getElementById('e-title').value.trim(),
        start, end,
        notes: document.getElementById('e-notes').value.trim()
      });
      FRS.ui.toast('Pending request updated.', 'success');
      FRS.ui.closeModal('modal-edit');
      loadMyReservations();
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  async function cancel(id) {
    const ok = await FRS.ui.confirmDialog('Cancel request?',
      'This will move the reservation to Cancelled and log the action.', 'Cancel request');
    if (!ok) return;
    try {
      await FRS.api.reservations.cancel(id);
      FRS.ui.toast('Reservation cancelled.', 'success');
      loadMyReservations();
    } catch (err) { FRS.ui.toast(err.message, 'danger'); }
  }

  function bindForms() {
    document.getElementById('submit-form').addEventListener('submit', submit);
    document.getElementById('edit-form').addEventListener('submit', edit);
    document.querySelectorAll('.modal').forEach(m =>
      m.addEventListener('click', ev => { if (ev.target === m) FRS.ui.closeModal(m.id); }));
  }

  window.FRS.requester = { openSubmit, openEdit, cancel };

  document.addEventListener('DOMContentLoaded', setup);
})();