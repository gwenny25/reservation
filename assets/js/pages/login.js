// ============================================================
// Login / register page
// ============================================================
(function () {
  'use strict';

  if (!window.FRS || !window.FRS.configured) {
    document.getElementById('err-box').style.display = 'block';
    document.getElementById('err-box').textContent =
      'Supabase is not configured. Open assets/js/config.js and paste your Project URL + anon key.';
    return;
  }

  const errBox = document.getElementById('err-box');
  const denyBox = document.getElementById('deny-box');

  // TC-B4-10: protected page without login -> redirect + message
  const qs = new URLSearchParams(window.location.search);
  if (qs.get('denied')) denyBox.style.display = 'block';

  function redirectToRole(profile) {
    window.location.href = FRS.auth.roleHome(profile.role);
  }

  function showError(msg) { errBox.textContent = msg; errBox.style.display = 'block'; }

  // Sign in
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';
    try {
      await FRS.auth.login(document.getElementById('email').value.trim(),
        document.getElementById('password').value);
      const profile = await FRS.auth.getProfile();
      sessionStorage.setItem('frs_profile', JSON.stringify(profile));
      redirectToRole(profile);
    } catch (err) {
      showError(err.message || 'Sign in failed.');
    }
  });

  // Register (creates account; first account is promoted to Administrator automatically)
  document.getElementById('btn-signup').addEventListener('click', async () => {
    errBox.style.display = 'none';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || password.length < 6) {
      showError('Enter an email and a password of at least 6 characters.');
      return;
    }
    try {
      await FRS.auth.signup(email, password);
      const profile = await FRS.auth.getProfile();
      if (profile) {
        sessionStorage.setItem('frs_profile', JSON.stringify(profile));
        redirectToRole(profile);
      } else {
        showError('Account created. Please confirm your email, then sign in.');
      }
    } catch (err) {
      showError(err.message || 'Registration failed.');
    }
  });

  // one-click demo fill
  document.querySelectorAll('.quick-accounts .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('email').value = btn.dataset.a;
      document.getElementById('password').value = 'password123';
      document.getElementById('password').focus();
    });
  });
})();