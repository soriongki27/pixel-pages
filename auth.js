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
  panel:     document.getElementById('auth-panel'),
  form:      document.getElementById('auth-form'),
  email:     document.getElementById('auth-email'),
  password:  document.getElementById('auth-password'),
  submit:    document.getElementById('auth-submit'),
  cancel:    document.getElementById('auth-cancel'),
  error:     document.getElementById('auth-error'),
  title:     document.getElementById('auth-title'),
  toggle:    document.getElementById('auth-toggle'),
  switchTxt: document.getElementById('auth-switch-text'),
  userBox:   document.getElementById('auth-user'),
  userEmail: document.getElementById('auth-user-email'),
  logout:    document.getElementById('auth-logout'),
};

let mode = 'login'; // 'login' | 'signup'

function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  a.title.textContent = signup ? 'Create your account' : 'Log in';
  a.submit.textContent = signup ? 'Sign up' : 'Log in';
  a.switchTxt.textContent = signup ? 'Already have an account?' : 'New here?';
  a.toggle.textContent = signup ? 'Log in instead' : 'Create an account';
  a.password.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  a.error.textContent = '';
}

function openPanel() { a.panel.classList.remove('hidden'); a.email.focus(); }
function closePanel() {
  a.panel.classList.add('hidden');
  a.form.reset();
  a.error.textContent = '';
}
function showError(msg) { a.error.textContent = msg; }

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

async function handleSubmit(event) {
  event.preventDefault();
  showError('');
  const email = a.email.value.trim();
  const password = a.password.value;

  if (mode === 'signup') {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) { showError(error.message); return; }
    if (!data.session) {
      // Only happens if email confirmation is on in Supabase.
      showError('Check your email to confirm your account, then log in.');
      return;
    }
    await maybeImportGuestEntries(data.session.user.id);
    closePanel();
    await applySession(data.session);
  } else {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { showError(error.message); return; }
    closePanel();
    await applySession(data.session);
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  await applySession(null);
}

async function initAuth() {
  a.open.addEventListener('click', () => { setMode('login'); openPanel(); });
  a.cancel.addEventListener('click', closePanel);
  a.toggle.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
  a.form.addEventListener('submit', handleSubmit);
  a.logout.addEventListener('click', handleLogout);

  const { data } = await supabaseClient.auth.getSession();
  await applySession(data.session);
}

initAuth();
