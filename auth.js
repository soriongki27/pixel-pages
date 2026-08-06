/* ===========================================================
   Pixel Pages — authentication + auth UI
   - Email/password via Supabase (email confirmation is OFF)
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

  signupForm:     document.getElementById('signup-form'),
  signupEmail:    document.getElementById('signup-email'),
  signupPassword: document.getElementById('signup-password'),
  signupError:    document.getElementById('signup-error'),
  signupSubmit:   document.getElementById('signup-submit'),
  signupCancel:   document.getElementById('signup-cancel'),
  goSignin:       document.getElementById('go-signin'),
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
function leaveAuth() {
  a.signinForm.reset();
  a.signupForm.reset();
  a.signinError.textContent = '';
  a.signupError.textContent = '';
  a.signinEmail.classList.remove('invalid');
  a.signinPassword.classList.remove('invalid');
  a.signupEmail.classList.remove('invalid');
  a.signupPassword.classList.remove('invalid');
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

async function handleLogout() {
  await supabaseClient.auth.signOut();
  await applySession(null);
}

async function initAuth() {
  a.open.addEventListener('click', showSignin);
  a.signinCancel.addEventListener('click', leaveAuth);
  a.signupCancel.addEventListener('click', leaveAuth);
  a.goSignup.addEventListener('click', showSignup);
  a.goSignin.addEventListener('click', showSignin);
  a.signinForm.addEventListener('submit', handleLogin);
  a.signupForm.addEventListener('submit', handleSignup);
  a.logout.addEventListener('click', handleLogout);

  // Clear a field's error styling (and the shared message) as it's corrected.
  [[a.signinEmail, a.signinPassword, a.signinError],
   [a.signupEmail, a.signupPassword, a.signupError]].forEach(([email, pw, err]) => {
    [email, pw].forEach((field) => field.addEventListener('input', () => {
      field.classList.remove('invalid');
      err.textContent = '';
    }));
  });

  const { data } = await supabaseClient.auth.getSession();
  await applySession(data.session);
}

initAuth();
