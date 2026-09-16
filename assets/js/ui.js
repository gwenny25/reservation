// ============================================================
// Small UI helpers: toast, badges, datetime, modal, table rows
// ============================================================
window.FRS = window.FRS || {};

(function () {
  'use strict';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  // ---- Toast ---------------------------------------------------------------
  function toast(message, type) {
    const box = document.getElementById('toast-box');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.innerHTML = esc(message);
    box.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // ---- Status badges -----------------------------------------------------------
  const RES_COLORS = {
    'Pending': 'badge-warn', 'Approved': 'badge-ok', 'Rejected': 'badge-danger',
    'Scheduled': 'badge-info', 'In Use': 'badge-info', 'Completed': 'badge-muted',
    'Cancelled': 'badge-muted'
  };
  const FAC_COLORS = { 'Active': 'badge-ok', 'Maintenance': 'badge-warn', 'Inactive': 'badge-muted' };
  const SVC_COLORS = { 'Open': 'badge-warn', 'In Progress': 'badge-info', 'Resolved': 'badge-ok' };

  function statusBadge(st, table) {
    const map = table || RES_COLORS;
    return '<span class="badge ' + (map[st] || 'badge-muted') + '">' + esc(st) + '</span>';
  }

  // ---- Datetime ----------------------------------------------------------------
  function toISO(localValue) {
    if (!localValue) return null;
    const d = new Date(localValue);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function fmt(dt) {
    if (!dt) return '\u2013';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return esc(dt);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  // ---------------------------------------------------------------- modal
  function openModal(id) { const m = document.getElementById(id); if (m) m.classList.add('open'); }
  function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('open'); }
  function closeModals() { document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')); }

  function confirmDialog(title, body, actionLabel) {
    return new Promise(resolve => {
      const host = document.getElementById('confirm-host');
      const wrap = document.createElement('div');
      wrap.className = 'modal modal-confirm open';
      wrap.id = 'confirm-modal';
      wrap.innerHTML =
        '<div class="modal-card modal-sm">' +
          '<h3>' + esc(title) + '</h3>' +
          '<p class="muted">' + esc(body) + '</p>' +
          '<div class="modal-actions">' +
            '<button class="btn" data-act="cancel">Cancel</button>' +
            '<button class="btn btn-danger" data-act="ok">' + esc(actionLabel || 'Confirm') + '</button>' +
          '</div>' +
        '</div>';
      host.appendChild(wrap);
      const done = (ok) => { wrap.remove(); resolve(ok); };
      wrap.querySelector('[data-act="ok"]').onclick = () => done(true);
      wrap.querySelector('[data-act="cancel"]').onclick = () => done(false);
      wrap.onclick = (e) => { if (e.target === wrap) done(false); };
    });
  }

  // ------------------------------------------------------------ rows
  function emptyRow(colspan, msg) {
    return '<tr><td class="empty" colspan="' + colspan + '">' + esc(msg || 'No records.') + '</td></tr>';
  }

  function initials(name) {
    const s = String(name || '?').trim();
    return s.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  }

  window.FRS.ui = {
    esc, toast, statusBadge, toISO, fmt,
    openModal, closeModal, closeModals, confirmDialog,
    emptyRow, initials,
    RES_COLORS, FAC_COLORS, SVC_COLORS
  };
})();