/* ===========================================================
   Pixel Pages — authentication + auth UI
   - Email/password via Supabase. Whether signup requires email
     confirmation is controlled in the Supabase dashboard
     (Authentication -> Providers -> Email -> "Confirm email").
   - Screens: sign in, sign up, request password reset, set new
     password (reached by clicking the emailed reset link).
   - Chooses the active store based on the session:
       signed in -> cloud store ; guest -> LocalStore
   - On new signup, offers to import local guest entries
   =========================================================== */

const supabaseClient = window.supabase.createClient(
  window.PIXEL_PAGES_CONFIG.SUPABASE_URL,
  window.PIXEL_PAGES_CONFIG.SUPABASE_ANON_KEY
);

const a = {
  open:      document.getElementById('auth-open'),
  userBox:   document.getElementById('auth-user'),
  userEmail: document.getElementById('auth-user-email'),
  logout:    document.getElementById('auth-logout'),

  signinForm:     document.getElementById('signin-form'),
  signinEmail:    document.getElementById('signin-email'),
  signinPassword: document.getElementById('signin-password'),
  signinError:    document.getElementById('signin-error'),
  signinSubmit:   document.getElementById('signin-submit'),
  signinCancel:   document.getElementById('signin-cancel'),
  goSignup:       document.getElementById('go-signup'),

  signupForm:      document.getElementById('signup-form'),
  signupEmail:     document.getElementById('signup-email'),
  signupPassword:  document.getElementById('signup-password'),
  signupPassword2: document.getElementById('signup-password2'),
  signupError:     document.getElementById('signup-error'),
  signupSubmit:    document.getElementById('signup-submit'),
  signupCancel:    document.getElementById('signup-cancel'),
  goSignin:        document.getElementById('go-signin'),
  goReset:         document.getElementById('go-reset'),

  resetForm:      document.getElementById('reset-form'),
  resetEmail:     document.getElementById('reset-email'),
  resetError:     document.getElementById('reset-error'),
  resetNote:      document.getElementById('reset-note'),
  resetSubmit:    document.getElementById('reset-submit'),
  resetCancel:    document.getElementById('reset-cancel'),
  resetGoSignin:  document.getElementById('reset-go-signin'),

  newpwForm:      document.getElementById('newpw-form'),
  newpwPassword:  document.getElementById('newpw-password'),
  newpwPassword2: document.getElementById('newpw-password2'),
  newpwError:     document.getElementById('newpw-error'),
  newpwSubmit:    document.getElementById('newpw-submit'),
};

// Basic client-side check so we give friendly feedback before hitting the
// network. Returns { field, msg } for the first problem, or null if all good.
function validateCredentials(emailField, passwordField) {
  const email = emailField.value.trim();
  const password = passwordField.value;
  if (!email) return { field: emailField, msg: 'Enter your email address.' };
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { field: emailField, msg: 'Enter a valid email address.' };
  }
  if (!password) return { field: passwordField, msg: 'Enter your password.' };
  if (password.length < 6) {
    return { field: passwordField, msg: 'Your password needs at least 6 characters.' };
  }
  return null;
}

// Flag a field as failing validation, surface the message, and focus it.
function failValidation(errorEl, field, msg) {
  errorEl.textContent = msg;
  field.classList.add('invalid');
  field.focus();
}

function showSignin() {
  a.signinError.textContent = '';
  window.App.showScreen('signin');
  a.signinEmail.focus();
}
function showSignup() {
  a.signupError.textContent = '';
  window.App.showScreen('signup');
  a.signupEmail.focus();
}
function showReset() {
  a.resetError.textContent = '';
  a.resetNote.textContent = '';
  window.App.showScreen('reset');
  a.resetEmail.focus();
}
function showNewPassword() {
  a.newpwError.textContent = '';
  window.App.showScreen('newpassword');
  a.newpwPassword.focus();
}

// Reset every auth form to a clean slate and return to the journal.
function leaveAuth() {
  [a.signinForm, a.signupForm, a.resetForm, a.newpwForm].forEach((f) => f.reset());
  [a.signinError, a.signupError, a.resetError, a.resetNote, a.newpwError]
    .forEach((el) => { el.textContent = ''; });
  [a.signinEmail, a.signinPassword, a.signupEmail, a.signupPassword,
   a.signupPassword2, a.resetEmail, a.newpwPassword, a.newpwPassword2]
    .forEach((f) => f.classList.remove('invalid'));
  window.App.showScreen('write');
}

// Point the app at the right backend for this session and re-render.
async function applySession(session) {
  if (session) {
    const cloud = window.createCloudStore(supabaseClient, session.user.id);
    window.App.setStore(cloud);
    a.userEmail.textContent = session.user.email;
    a.userBox.classList.remove('hidden');
    a.open.classList.add('hidden');
  } else {
    window.App.setStore(window.LocalStore);
    a.userBox.classList.add('hidden');
    a.open.classList.remove('hidden');
  }
  await window.App.refresh();
}

// On new signup, offer to bring guest entries along; clear them after import.
async function maybeImportGuestEntries(userId) {
  const local = await window.LocalStore.getEntries();
  if (!local.length) return;
  const noun = local.length === 1 ? 'entry' : 'entries';
  if (!confirm(`Import your ${local.length} existing ${noun} into your account?`)) return;
  const cloud = window.createCloudStore(supabaseClient, userId);
  await cloud.importEntries(local);
  await window.LocalStore.clear();
}

async function handleLogin(event) {
  event.preventDefault();
  a.signinError.textContent = '';

  const bad = validateCredentials(a.signinEmail, a.signinPassword);
  if (bad) { failValidation(a.signinError, bad.field, bad.msg); return; }

  const email = a.signinEmail.value.trim();
  const password = a.signinPassword.value;

  window.setBtnLoading(a.signinSubmit, true, 'Logging in…');
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { a.signinError.textContent = error.message; return; }
    leaveAuth();
    await applySession(data.session);
    flash('Welcome back.');
  } finally {
    window.setBtnLoading(a.signinSubmit, false);
  }
}

async function handleSignup(event) {
  event.preventDefault();
  a.signupError.textContent = '';

  const bad = validateCredentials(a.signupEmail, a.signupPassword);
  if (bad) { failValidation(a.signupError, bad.field, bad.msg); return; }
  if (a.signupPassword.value !== a.signupPassword2.value) {
    failValidation(a.signupError, a.signupPassword2, "Passwords don't match.");
    return;
  }

  const email = a.signupEmail.value.trim();
  const password = a.signupPassword.value;

  window.setBtnLoading(a.signupSubmit, true, 'Signing up…');
  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) { a.signupError.textContent = error.message; return; }
    if (!data.session) {
      // Only happens if email confirmation is on in Supabase.
      a.signupError.textContent = 'Check your email to confirm your account, then log in.';
      return;
    }
    let importFailed = false;
    try {
      await maybeImportGuestEntries(data.session.user.id);
    } catch (e) {
      importFailed = true;
    }
    leaveAuth();
    await applySession(data.session);
    flash(importFailed
      ? "Account created, but importing your previous entries failed — they're still saved on this device."
      : 'Account created — welcome to Pixel Pages.');
  } finally {
    window.setBtnLoading(a.signupSubmit, false);
  }
}

async function handleReset(event) {
  event.preventDefault();
  a.resetError.textContent = '';
  a.resetNote.textContent = '';

  const email = a.resetEmail.value.trim();
  if (!email) { failValidation(a.resetError, a.resetEmail, 'Enter your email address.'); return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    failValidation(a.resetError, a.resetEmail, 'Enter a valid email address.');
    return;
  }

  window.setBtnLoading(a.resetSubmit, true, 'Sending…');
  try {
    // The link in the email returns here; this origin must be allow-listed in
    // Supabase (Authentication -> URL Configuration -> Redirect URLs).
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) { a.resetError.textContent = error.message; return; }
    a.resetNote.textContent = 'Check your email for a link to reset your password.';
  } finally {
    window.setBtnLoading(a.resetSubmit, false);
  }
}

async function handleNewPassword(event) {
  event.preventDefault();
  a.newpwError.textContent = '';

  const password = a.newpwPassword.value;
  if (!password) { failValidation(a.newpwError, a.newpwPassword, 'Enter a new password.'); return; }
  if (password.length < 6) {
    failValidation(a.newpwError, a.newpwPassword, 'Your password needs at least 6 characters.');
    return;
  }
  if (password !== a.newpwPassword2.value) {
    failValidation(a.newpwError, a.newpwPassword2, "Passwords don't match.");
    return;
  }

  window.setBtnLoading(a.newpwSubmit, true, 'Updating…');
  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) { a.newpwError.textContent = error.message; return; }
    // The recovery session is now a normal signed-in session.
    const { data } = await supabaseClient.auth.getSession();
    leaveAuth();
    await applySession(data.session);
    flash('Password updated — you’re all set.');
  } finally {
    window.setBtnLoading(a.newpwSubmit, false);
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  await applySession(null);
}

// If the reset/confirmation link failed (expired, already used), the provider
// sends us back with an error in the URL hash. Surface it kindly on Sign In.
function handleUrlAuthError() {
  const hash = window.location.hash || '';
  if (hash.indexOf('error') === -1) return false;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const desc = params.get('error_description');
  if (!desc) return false;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  showSignin();
  a.signinError.textContent = desc + '. Please request a new link.';
  return true;
}

async function initAuth() {
  a.open.addEventListener('click', showSignin);
  a.signinCancel.addEventListener('click', leaveAuth);
  a.signupCancel.addEventListener('click', leaveAuth);
  a.resetCancel.addEventListener('click', leaveAuth);
  a.goSignup.addEventListener('click', showSignup);
  a.goSignin.addEventListener('click', showSignin);
  a.goReset.addEventListener('click', showReset);
  a.resetGoSignin.addEventListener('click', showSignin);
  a.signinForm.addEventListener('submit', handleLogin);
  a.signupForm.addEventListener('submit', handleSignup);
  a.resetForm.addEventListener('submit', handleReset);
  a.newpwForm.addEventListener('submit', handleNewPassword);
  a.logout.addEventListener('click', handleLogout);

  // Clear a field's error styling (and its screen's message) as it's corrected.
  const clearGroups = [
    { fields: [a.signinEmail, a.signinPassword], errs: [a.signinError] },
    { fields: [a.signupEmail, a.signupPassword, a.signupPassword2], errs: [a.signupError] },
    { fields: [a.resetEmail], errs: [a.resetError, a.resetNote] },
    { fields: [a.newpwPassword, a.newpwPassword2], errs: [a.newpwError] },
  ];
  clearGroups.forEach(({ fields, errs }) => {
    fields.forEach((field) => field.addEventListener('input', () => {
      field.classList.remove('invalid');
      errs.forEach((e) => { e.textContent = ''; });
    }));
  });

  // Clicking the emailed reset link brings the user back with a recovery
  // session; show the "set a new password" screen when that happens.
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showNewPassword();
  });

  // A failed/expired link comes back with an error in the URL hash.
  handleUrlAuthError();

  const { data } = await supabaseClient.auth.getSession();
  await applySession(data.session);
}

initAuth();
