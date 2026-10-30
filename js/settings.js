(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let accountUser = null;
  let toastTimer;

  function toast(message, error = false) {
    const el = $('settingsToast');
    el.textContent = message;
    el.classList.toggle('is-error', error);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }

  function syncTheme() {
    const theme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light';
    $('settingsThemeLight').setAttribute('aria-pressed', String(theme === 'light'));
    $('settingsThemeDark').setAttribute('aria-pressed', String(theme === 'dark'));
    $('settingsThemeDescription').textContent = theme === 'dark' ? 'Dark workspace is on' : 'Light workspace is on';
  }

  function chooseTheme(theme) {
    if (typeof window.setTheme === 'function') window.setTheme(theme);
    else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
    document.body.classList.toggle('tr-dark', theme === 'dark');
    localStorage.setItem('thinkright_theme', theme);
    syncTheme();
  }

  async function loadIdentity() {
    const identity = typeof window.resolveWorkspaceIdentity === 'function'
      ? await window.resolveWorkspaceIdentity()
      : { role: 'guest', user: null };
    if (identity.role === 'teacher' || identity.role === 'admin') {
      window.location.replace(identity.role === 'teacher' ? 'tutor-dashboard.html' : 'admin.html');
      return;
    }
    accountUser = identity.user || null;
    if (!accountUser) {
      $('settingsGuest').hidden = false;
      $('settingsName').textContent = 'Guest student';
      $('settingsEmail').textContent = 'Sign in to save your progress';
      $('settingsResetPassword').disabled = true;
      $('settingsSignOut').hidden = true;
      return;
    }
    const email = accountUser.email || '';
    let name = accountUser.user_metadata?.full_name || accountUser.user_metadata?.name || '';
    try {
      const { data } = await window.supabase.from('user_profiles')
        .select('username,full_name')
        .eq('id', accountUser.id)
        .maybeSingle();
      name = data?.full_name || data?.username || name;
    } catch (_) { /* The auth identity remains usable if profile data is unavailable. */ }
    name = name || email.split('@')[0] || 'Student';
    $('settingsName').textContent = name;
    $('settingsEmail').textContent = email || 'Your account';
    $('settingsAccountEmail').textContent = email || 'No email available';
    $('settingsAvatar').textContent = name.trim().charAt(0).toUpperCase() || 'S';
    $('settingsResetPassword').disabled = !email;
  }

  document.addEventListener('DOMContentLoaded', () => {
    syncTheme();
    $('settingsThemeLight').addEventListener('click', () => chooseTheme('light'));
    $('settingsThemeDark').addEventListener('click', () => chooseTheme('dark'));
    document.getElementById('tr-theme-toggle')?.addEventListener('click', () => setTimeout(syncTheme, 0));
    document.getElementById('tr-theme-toggle-mobile')?.addEventListener('click', () => setTimeout(syncTheme, 0));

    $('settingsResetPassword').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (!accountUser?.email || !window.supabase?.auth) return toast('Sign in to reset your password.', true);
      button.disabled = true;
      try {
        const { error } = await window.supabase.auth.resetPasswordForEmail(accountUser.email, {
          redirectTo: new URL('reset-password.html', window.location.href).href
        });
        if (error) throw error;
        toast(`A password reset link was sent to ${accountUser.email}.`);
      } catch (error) {
        toast(error?.message || 'Could not send the reset link. Please try again.', true);
      } finally {
        button.disabled = false;
      }
    });

    $('settingsSignOut').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (!window.supabase?.auth) throw new Error('Sign out is unavailable right now.');
        const { error } = await window.supabase.auth.signOut();
        if (error) throw error;
        localStorage.removeItem('thinkright_auth_role');
        localStorage.removeItem('thinkright_username');
        window.location.assign('login.html');
      } catch (error) {
        toast(error?.message || 'Could not sign out. Please try again.', true);
        button.disabled = false;
      }
    });
    loadIdentity().catch(() => toast('Account details are unavailable right now.', true));
  });
})();
