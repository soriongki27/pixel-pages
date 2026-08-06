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
  signinCancel:   document.getElementById('signin-cancel'),
  goSignup:       document.getElementById('go-signup'),

  signupForm:     document.getElementById('signup-form'),
  signupEmail:    document.getElementById('signup-email'),
  signupPassword: document.getElementById('signup-password'),
  signupError:    document.getElementById('signup-error'),
  signupCancel:   document.getElementById('signup-cancel'),
  goSignin:       document.getElementById('go-signin'),
};

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
  const email = a.signinEmail.value.trim();
  const password = a.signinPassword.value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { a.signinError.textContent = error.message; return; }
  leaveAuth();
  await applySession(data.session);
}

async function handleSignup(event) {
  event.preventDefault();
  a.signupError.textContent = '';
  const email = a.signupEmail.value.trim();
  const password = a.signupPassword.value;

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
  if (importFailed) {
    flash("Signed in, but importing your previous entries failed — they're still saved on this device.");
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

  const { data } = await supabaseClient.auth.getSession();
  await applySession(data.session);
}

initAuth();
