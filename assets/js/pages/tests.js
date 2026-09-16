// ============================================================
// Functional test runner - TC-B4-01 .. TC-B4-10
// Executes role-based workflow + business rules against the
// live Supabase backend and prints pass/fail for each case.
// ============================================================
window.FRS = window.FRS || {};
window.FRS.tests = {};

(function () {
  'use strict';

  const DEMO_PASSWORD = 'password123';
  const DEMO = {
    admin: 'admin@campus.edu',
    staff: 'staff@campus.edu',
    requester: 'requester@campus.edu',
    requester2: 'requester2@campus.edu'
  };

  let results = [];
  let ctx = null;

  // ------------------------------------------------ running status cards
  function renderList() {
    const host = document.getElementById('test-list');
    host.innerHTML = [
      ['TC-B4-01', 'Requester submits reservation', 'Saved as Pending.'],
      ['TC-B4-02', 'Submit overlapping schedule', 'Conflict detected and blocked.'],
      ['TC-B4-03', 'Administrator approves request', 'Status becomes Approved/Scheduled.'],
      ['TC-B4-04', 'Administrator rejects request', 'Status becomes Rejected; cannot be scheduled.'],
      ['TC-B4-05', 'Staff marks facility In Use', 'Status updated.'],
      ['TC-B4-06', 'Staff completes reservation', 'Status becomes Completed.'],
      ['TC-B4-07', 'Requester edits another user request', 'Blocked (BR-B4-09).'],
      ['TC-B4-08', 'Reserve facility under maintenance', 'Blocked (BR-B4-08).'],
      ['TC-B4-09', 'Check audit log', 'Approval/status log visible for admin.'],
      ['TC-B4-10', 'Open protected page without login', 'Access denied (RLS).']
    ].map(t =>
      '<div class="test-card">' +
        '<div class="test-head">' +
          '<span class="test-id">' + t[0] + '</span>' +
          '<span class="test-title">' + t[1] + '</span>' +
          '<span class="test-result"><span class="result-chip pending" id="chip-' + t[0] + '">PENDING</span></span>' +
        '</div>' +
        '<div class="test-desc">Expected: ' + t[2] + '</div>' +
        '<pre class="test-lines" id="lines-' + t[0] + '">Waiting…</pre>' +
      '</div>'
    ).join('');
  }

  function setResult(id, ok, lines) {
    const chip = document.getElementById('chip-' + id);
    chip.textContent = ok ? 'PASS' : 'FAIL';
    chip.className = 'result-chip ' + (ok ? 'pass' : 'fail');
    document.getElementById('lines-' + id).textContent = lines.join('\n');
  }

  function updateSummary() {
    const done = results.filter(r => r.result);
    const time = document.getElementById('run-summary');
    time.textContent = done.length
      ? done.filter(r => r.result === true).length + '/' + done.length + ' tests passed · ' +
        ctx.runtimeMs + ' ms' + (results.some(r => r.result === false) ? ' · SOME FAILED' : '')
      : '';
  }

  // ------------------------------------------------ helpers
  const sleep = ms => new Promise(res => setTimeout(res, ms));

  async function loginAs(email) {
    const { error } = await FRS.client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
    if (error) throw error;
    return FRS.client.auth.getUser();
  }

  async function currentEmail() {
    const { data } = await FRS.client.auth.getUser();
    return data.user.email;
  }

  function slot(days, hhmm, hours) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setDate(d.getDate() + days + (ctx.i % 20));
    d.setHours(h, m, 0, 0);
    const end = new Date(d.getTime() + hours * 3600 * 1000);
    return { start: d.toISOString(), end: end.toISOString() };
  }

  async function firstActiveFacility() {
    const { data, error } = await FRS.api.facilities.list();
    if (error) throw error;
    const act = (data || []).filter(f => f.status === 'Active');
    if (act.length < 2) throw new Error('Need at least 2 Active facilities (see seed data).');
    return act;
  }

  // Clean all reservations the runner created (title prefix [TEST])
  async function resetTestData(adminStaff) {
    await loginAs(DEMO.admin);
    const { data, error } = await FRS.api.reservations.list();
    if (error) throw error;
    for (const r of (data || [])) {
      if (String(r.title).indexOf('[TEST]') === 0 &&
          ['Pending', 'Approved', 'Scheduled'].indexOf(r.status) !== -1) {
        try { await FRS.api.reservations.cancel(r.id); } catch (e) { /* ignore */ }
      }
    }
  }

  async function recoverMaintenanceFacility() {
    if (!ctx.maintenanceRestored) {
      ctx.maintenanceRestored = true;
      try {
        await loginAs(DEMO.admin);
        await FRS.api.facilities.update(ctx.facB.id, { status: 'Active' });
      } catch (e) { /* ignore */ }
    }
  }

  // ------------------------------------------------ bootstrap demo users
  async function ensureDemoAccounts() {
    if (!window.FRS.configured) throw new Error('Supabase not configured (assets/js/config.js).');

    const tmp = window.supabase.createClient(window.FRS_CONFIG.SUPABASE_URL, window.FRS_CONFIG.SUPABASE_ANON_KEY);
    const exists = {};
    for (const key of ['admin', 'staff', 'requester', 'requester2']) {
      const { error } = await tmp.auth.signInWithPassword({ email: DEMO[key], password: DEMO_PASSWORD });
      exists[key] = !error;
      if (!error) await tmp.auth.signOut();
    }

    // Admin is created FIRST so the bootstrap trigger promotes it to Administrator.
    if (!exists.admin) {
      const { error } = await tmp.auth.signUp({ email: DEMO.admin, password: DEMO_PASSWORD });
      if (error) throw error;
    }
    if (!exists.staff) await tmp.auth.signUp({ email: DEMO.staff, password: DEMO_PASSWORD });
    if (!exists.requester) await tmp.auth.signUp({ email: DEMO.requester, password: DEMO_PASSWORD });
    if (!exists.requester2) await tmp.auth.signUp({ email: DEMO.requester2, password: DEMO_PASSWORD });

    // Discover whichever demo account actually holds the Administrator role
    // (the first account ever registered is promoted by handle_new_user()).
    let adminEmail = null;
    for (const key of ['admin', 'staff', 'requester', 'requester2']) {
      try {
        await loginAs(DEMO[key]);
        const p = await FRS.auth.getProfile();
        if (p && p.role === 'administrator') { adminEmail = DEMO[key]; break; }
      } catch (e) { /* account may not exist yet */ }
    }
    if (!adminEmail) {
      throw new Error('No Administrator found. Register any account first - the first registrant becomes Administrator.');
    }
    await loginAs(adminEmail);

    const { data: users, error: ue } = await FRS.api.users.list();
    if (ue) throw ue;
    const wantRole = { [DEMO.admin]: 'administrator', [DEMO.staff]: 'staff',
                       [DEMO.requester]: 'requester', [DEMO.requester2]: 'requester' };
    for (const u of users) {
      if (wantRole[u.email] && u.role !== wantRole[u.email]) {
        await FRS.api.users.setRole(u.id, wantRole[u.email]);
      }
    }
  }

  // ------------------------------------------------ context seeding
  async function prepare() {
    const act = await firstActiveFacility();
    ctx.facA = act[0];
    ctx.facB = act[1];
    ctx.i = Math.floor(Date.now() / 60000) % 200; // unique slot offsets per minute
  }

  // ================================================ THE TESTS
  async function tc01() {
    const lines = ['Login as requester@campus.edu'];
    await loginAs(DEMO.requester);
    const s = slot(1, '09:00', 2);
    const r = await FRS.api.reservations.submit(ctx.facA.id, '[TEST] TC-B4-01 request', s.start, s.end, 'auto-test');
    lines.push('submitted id=' + r.id + ' status=' + r.status);
    const ok = r.status === 'Pending';
    if (ok) { await FRS.api.reservations.cancel(r.id); lines.push('cleaned up (cancelled).'); }
    return [ok, lines];
  }

  async function tc02() {
    const lines = ['Approved slot on facility B is the "blocker" (BR-B4-06).'];
    await loginAs(DEMO.requester);
    const s = slot(1, '09:00', 2);
    const blocker = await FRS.api.reservations.submit(ctx.facB.id, '[TEST] TC-B4-02 approved blocker', s.start, s.end, null);
    lines.push('blocker submitted (Pending, id=' + blocker.id + ')');
    await loginAs(DEMO.admin);
    await FRS.api.reservations.approve(blocker.id);
    lines.push('admin approved blocker → Approved');

    await loginAs(DEMO.requester);
    const overlap = slot(1, '10:00', 2); // 10:00-12:00 overlaps 09:00-11:00
    try {
      await FRS.api.reservations.submit(ctx.facB.id, '[TEST] TC-B4-02 overlapping', overlap.start, overlap.end, null);
      lines.push('overlapping submit: NOT blocked  ✗');
      // create "ok" so cleanup works if it does get created
      return [false, lines];
    } catch (e) {
      const blocked = FRS.api.hasError(e, 'BR-B4-03');
      lines.push('overlapping submit blocked: ' + (blocked ? 'yes' : 'no (' + e.message + ')'));
      const ok = blocked;

      // non-overlapping slot on same facility must still be allowed
      const free = slot(1, '14:00', 1);
      try {
        const r = await FRS.api.reservations.submit(ctx.facB.id, '[TEST] TC-B4-02 non-overlap', free.start, free.end, null);
        lines.push('non-overlapping submit allowed (id=' + r.id + ') ✓');
        await FRS.api.reservations.cancel(r.id);
      } catch (e2) { lines.push('non-overlapping submit failed ✗ ' + e2.message); }
      return [ok, lines];
    }
  }

  async function tc03() {
    const lines = [];
    await loginAs(DEMO.requester);
    const s = slot(2, '09:00', 1);
    const r = await FRS.api.reservations.submit(ctx.facA.id, '[TEST] TC-B4-03 approve', s.start, s.end, null);
    lines.push('requester submitted (Pending id=' + r.id + ')');

    await loginAs(DEMO.admin);
    const after = await FRS.api.reservations.approve(r.id);
    lines.push('admin approved → status=' + after.status);
    const ok = after.status === 'Approved';
    if (ok) { await FRS.api.reservations.schedule(r.id); lines.push('scheduled → status=Scheduled ✓'); }
    return [ok, lines];
  }

  async function tc04() {
    const lines = [];
    await loginAs(DEMO.requester);
    const s = slot(2, '13:00', 1);
    const r = await FRS.api.reservations.submit(ctx.facA.id, '[TEST] TC-B4-04 reject', s.start, s.end, null);

    await loginAs(DEMO.admin);
    const after = await FRS.api.reservations.reject(r.id, 'Auto-test rejection');
    lines.push('admin rejected → status=' + after.status);
    const ok = after.status === 'Rejected';

    // BR-B4-05: rejected cannot become Scheduled
    try {
      await FRS.api.reservations.schedule(r.id);
      lines.push('schedule(rejected): NOT blocked ✗ (BR-B4-05 breach)');
      return [false, lines];
    } catch (e) {
      lines.push('schedule(rejected) blocked: ' + e.message);
    }
    return [ok, lines];
  }

  async function tc05() {
    const lines = [];
    await loginAs(DEMO.requester);
    const s = slot(3, '09:00', 2);
    const r = await FRS.api.reservations.submit(ctx.facA.id, '[TEST] TC-B4-05 in use', s.start, s.end, null);
    await loginAs(DEMO.admin);
    await FRS.api.reservations.approve(r.id);
    await FRS.api.reservations.schedule(r.id);
    lines.push('requester→admin: submitted→Approved→Scheduled');

    await loginAs(DEMO.staff);
    const after = await FRS.api.reservations.markInUse(r.id);
    lines.push('staff markInUse → status=' + after.status);
    return [after.status === 'In Use', lines];
  }

  async function tc06() {
    const lines = [];
    await loginAs(DEMO.requester);
    const s = slot(3, '13:00', 2);
    const r = await FRS.api.reservations.submit(ctx.facB.id, '[TEST] TC-B4-06 complete', s.start, s.end, null);
    await loginAs(DEMO.admin);
    await FRS.api.reservations.approve(r.id);
    await FRS.api.reservations.schedule(r.id);
    await loginAs(DEMO.staff);
    await FRS.api.reservations.markInUse(r.id);
    const after = await FRS.api.reservations.markCompleted(r.id);
    lines.push('status after complete=' + after.status);
    const ok = after.status === 'Completed';

    // BR-B4-07: Completed cannot be edited
    try {
      await FRS.api.reservations.cancel(r.id);
      lines.push('cancel(completed): NOT blocked ✗ (BR-B4-07 breach)');
      return [false, lines];
    } catch (e) {
      lines.push('cancel(completed) blocked: ' + e.message);
    }
    return [ok, lines];
  }

  async function tc07() {
    const lines = [];
    // create a Pending request owned by requester2
    await loginAs(DEMO.requester2);
    const s = slot(4, '09:00', 1);
    const other = await FRS.api.reservations.submit(ctx.facA.id, '[TEST] TC-B4-07 other user pending', s.start, s.end, null);
    lines.push('requester2 submitted pending id=' + other.id);

    // requester tries to edit / cancel it (BR-B4-09)
    await loginAs(DEMO.requester);
    let editBlocked = false, cancelBlocked = false;
    try {
      await FRS.api.reservations.updatePending(other.id, { title: 'hacked', start: s.start, end: s.end });
      lines.push('edit: allowed ✗');
    } catch (e) {
      editBlocked = FRS.api.hasError(e, 'BR-B4-09');
      lines.push('edit blocked: ' + (editBlocked ? 'yes' : 'no'));
    }
    try {
      await FRS.api.reservations.cancel(other.id);
      lines.push('cancel: allowed ✗');
    } catch (e) {
      cancelBlocked = true;
      lines.push('cancel blocked: yes');
    }
    return [editBlocked && cancelBlocked, lines];
  }

  async function tc08() {
    const lines = [];
    await loginAs(DEMO.admin);
    const fac = ctx.facB;
    const set = await FRS.api.facilities.update(fac.id, { status: 'Maintenance' });
    lines.push('admin set facility "' + set.name + '" → Maintenance');

    await loginAs(DEMO.requester);
    const s = slot(5, '10:00', 1);
    try {
      await FRS.api.reservations.submit(fac.id, '[TEST] TC-B4-08 maintenance', s.start, s.end, null);
      lines.push('submit on maintenance facility: NOT blocked ✗ (BR-B4-08 breach)');
      return [false, lines];
    } catch (e) {
      const blocked = FRS.api.hasError(e, 'BR-B4-08');
      lines.push('submit blocked: ' + (blocked ? 'yes' : 'no (' + e.message + ')'));
      await recoverMaintenanceFacility();
      return [blocked, lines];
    }
  }

  async function tc09() {
    const lines = [];
    await loginAs(DEMO.admin);
    const logs = await FRS.api.auditLogs.list(500) || [];
    lines.push('admin read ' + logs.length + ' audit entries');
    const actions = new Set(logs.map(l => l.action));
    const expected = ['RESERVATION_SUBMITTED', 'RESERVATION_APPROVED', 'RESERVATION_REJECTED',
      'RESERVATION_CANCELLED', 'RESERVATION_COMPLETED'];
    const found = expected.filter(a => actions.has(a));
    lines.push('actions found: ' + found.join(', '));
    return [found.length === expected.length, lines];
  }

  async function tc10() {
    const lines = [];
    await loginAs(DEMO.admin); // leave system logged in afterwards if possible
    // anonymous client - no session
    const anon = window.supabase.createClient(window.FRS_CONFIG.SUPABASE_URL, window.FRS_CONFIG.SUPABASE_ANON_KEY);
    const { data, error } = await anon.from('profiles').select('*');
    lines.push('anon select profiles: ' +
      (error ? 'error (' + error.message + ')' : (data && data.length) + ' rows returned'));

    const { error: err2 } = await anon.rpc('get_audit_logs', { p_limit: 10 });
    lines.push('anon rpc get_audit_logs: ' + (err2 ? 'denied (' + err2.message + ')' : 'ALLOWED ✗'));

    // client-side guard: no valid session => protected page routes to login
    const sess = await anon.auth.getSession();
    lines.push('anon session present: ' + (sess && sess.session ? 'yes' : 'no'));
    const denied = !(sess && sess.session) && !!(err2 || (data && data.length === 0));
    return [denied, lines];
  }

  // ------------------------------------------------ orchestrator
  const TESTS = [
    ['TC-B4-01', tc01], ['TC-B4-02', tc02], ['TC-B4-03', tc03], ['TC-B4-04', tc04],
    ['TC-B4-05', tc05], ['TC-B4-06', tc06], ['TC-B4-07', tc07], ['TC-B4-08', tc08],
    ['TC-B4-09', tc09], ['TC-B4-10', tc10]
  ];

  async function runAll() {
    renderList();
    results = [];
    ctx = { runtimeMs: 0 };
    const t0 = performance.now();
    try {
      await ensureDemoAccounts();
      await resetTestData();
      await prepare();
    } catch (e) {
      const chip = document.getElementById('chip-TC-B4-01');
      if (chip) { chip.textContent = 'SETUP ERROR'; chip.className = 'result-chip fail'; }
      document.getElementById('run-summary').textContent = 'Setup error: ' + e.message;
      FRS.ui.toast('Setup failed: ' + e.message, 'danger');
      return;
    }

    for (const [id, fn] of TESTS) {
      try {
        const [ok, lines] = await fn();
        setResult(id, ok, lines);
        results.push({ id, result: ok });
      } catch (e) {
        setResult(id, false, ['EXCEPTION: ' + e.message]);
        results.push({ id, result: false });
      }
      // restore facility status if any test left one in Maintenance
      if (id === 'TC-B4-08') await recoverMaintenanceFacility();
    }
    ctx.runtimeMs = Math.round(performance.now() - t0);
    updateSummary();
  }

  async function resetData() {
    try {
      await ensureDemoAccounts();
      await resetTestData();
      FRS.ui.toast('Test data reset (cancelled pending/approved [TEST] reservations).', 'success');
    } catch (e) {
      FRS.ui.toast('Reset failed: ' + e.message, 'danger');
    }
  }

  window.FRS.tests = { runAll, resetData };
  document.addEventListener('DOMContentLoaded', renderList);
})();