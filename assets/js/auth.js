// ============================================================
// Authentication + role guard helpers
// ============================================================
window.FRS = window.FRS || {};

(function () {
  'use strict';

  const client = () => window.FRS.client;

  async function getSession() {
    if (!window.FRS.configured) return null;
    const { data, error } = await client().auth.getSession();
    if (error) return null;
    return data.session;
  }

  // Load the current user's profile (role, name) from the profiles table
  async function getProfile() {
    const session = await getSession();
    if (!session) return null;
    const { data, error } = await client()
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // ---- Login / Signup --------------------------------------------------
  async function login(email, password) {
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signup(email, password, fullName) {
    const { data, error } = await client().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
    if (error) throw error;
    return data;
  }

  async function logout() {
    await client().auth.signOut();
  }

  // Redirect by role after login
  function roleHome(role) {
    const map = {
      administrator: 'admin.html',
      staff: 'staff.html',
      requester: 'requester.html'
    };
    return map[role] || 'login.html';
  }

  // ---- Page guard -------------------------------------------------------
  // TC-B4-10: opening a protected page without a session is denied.
  async function requireRole(allowedRoles) {
    const session = await getSession();
    if (!session) {
      window.location.href =
        'login.html?denied=1&next=' + encodeURIComponent(window.location.pathname.split('/').pop());
      return null;
    }
    let profile = JSON.parse(sessionStorage.getItem('frs_profile') || 'null');
    if (!profile) {
      profile = await getProfile();
      sessionStorage.setItem('frs_profile', JSON.stringify(profile));
    }
    if (allowedRoles && allowedRoles.indexOf(profile.role) === -1) {
      window.location.href = roleHome(profile.role);
      return null;
    }
    return { session, profile };
  }

  // ---- Shared navbar ----------------------------------------------------
  function renderShell(profile, active) {
    const items = [
      { key: 'requester', label: 'Requester', href: 'requester.html' },
      { key: 'staff', label: 'Facility Staff', href: 'staff.html' },
      { key: 'admin', label: 'Administrator', href: 'admin.html' },
      { key: 'tests', label: 'Function Tests', href: 'tests.html' }
    ];

    const nav = items
      .map(i =>
        '<a class="nav-link' + (i.key === active ? ' active' : '') + '" href="' + i.href + '">' +
        i.label + '</a>')
      .join('');

    document.getElementById('app-header').innerHTML =
      '<div class="brand"><span class="brand-dot"></span>Facility Reservations</div>' +
      '<nav class="nav">' + nav + '</nav>' +
      '<div class="userbox">' +
        '<span class="user-email">' + FRS.ui.esc(profile.email) + '</span>' +
        '<span class="badge badge-role">' + profile.role + '</span>' +
        '<button class="btn btn-ghost" onclick="FRS.auth.handleLogout()">Sign out</button>' +
      '</div>';
  }

  async function handleLogout() {
    await logout();
    sessionStorage.removeItem('frs_profile');
    window.location.href = 'login.html';
  }

  // readable helpers -------------------------------------------------------
  function roleLabel(role) {
    return {
      administrator: 'Administrator',
      staff: 'Facility Staff',
      requester: 'Requester'
    }[role] || role;
  }

  window.FRS.auth = {
    client,
    getSession,
    getProfile,
    login,
    signup,
    logout,
    roleHome,
    requireRole,
    renderShell,
    handleLogout,
    roleLabel
  };
})();