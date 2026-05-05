// Admin panel entry — separate Vite entry from the public site.
//
// Runs through an auth state machine:
//   unauthenticated → password login
//   needs-enrollment → MFA TOTP enrollment (first login)
//   needs-challenge  → MFA TOTP challenge (returning login)
//   ready            → product list & editor
//
// All write paths go through Supabase, gated by RLS that requires
// AAL2 (MFA-verified session). See migration 004_admin_rls_aal2.sql.

import {
  signInWithPassword,
  signOut,
  getAdminAuthStatus,
  enrollTotp,
  verifyEnrollment,
  challengeTotp,
  verifyChallenge,
  getCurrentUser,
  onAuthChange,
} from './admin/auth.js';
import { mountProductList, refreshList } from './admin/productList.js';
import { openProductForm } from './admin/productForm.js';
import { deleteProduct } from './admin/products.js';

const root = () => document.getElementById('admin-app');

async function route() {
  const status = await getAdminAuthStatus();
  switch (status) {
    case 'unauthenticated':   return renderLogin();
    case 'needs-enrollment':  return renderEnroll();
    case 'needs-challenge':   return renderChallenge();
    case 'ready':             return renderAdminShell();
  }
}

// ============ TOAST ============
// Build via createElement + textContent so messages from Supabase /
// server errors can't inject HTML if they ever carry untrusted text.
let toastTimeout;
function showToast(msg, emoji = '✓') {
  const r = document.getElementById('toast-root');
  if (!r) return;
  r.innerHTML = '';

  const toast = document.createElement('div');
  toast.className = 'toast show';

  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'toast-emoji';
  emojiSpan.textContent = emoji;
  toast.appendChild(emojiSpan);

  const msgSpan = document.createElement('span');
  msgSpan.textContent = msg;
  toast.appendChild(msgSpan);

  r.appendChild(toast);

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { r.innerHTML = ''; }, 400);
  }, 2800);
}

// ============ LOGIN ============
function renderLogin() {
  root().innerHTML = `
    <div class="admin-auth-shell">
      <div class="admin-auth-card">
        <div class="admin-auth-head">
          <div class="admin-auth-mark">🖨</div>
          <h1>Keith Prints — Admin</h1>
          <p>Sign in to manage the catalog.</p>
        </div>
        <form id="loginForm" class="admin-auth-form" novalidate>
          <div class="field">
            <label for="login_email">Email</label>
            <input id="login_email" name="email" type="email" required autocomplete="username" />
          </div>
          <div class="field">
            <label for="login_password">Password</label>
            <input id="login_password" name="password" type="password" required autocomplete="current-password" />
          </div>
          <div class="admin-auth-error" id="loginError" hidden></div>
          <button type="submit" class="btn-primary admin-auth-submit" id="loginSubmit">Sign in</button>
        </form>
      </div>
    </div>
  `;
  const form = document.getElementById('loginForm');
  const errEl = document.getElementById('loginError');
  const submit = document.getElementById('loginSubmit');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    try {
      const email = document.getElementById('login_email').value.trim();
      const password = document.getElementById('login_password').value;
      await signInWithPassword({ email, password });
      route();
    } catch (err) {
      console.error(err);
      errEl.textContent = err.message || 'Sign in failed';
      errEl.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });
}

// ============ MFA ENROLLMENT ============
async function renderEnroll() {
  root().innerHTML = `
    <div class="admin-auth-shell">
      <div class="admin-auth-card admin-auth-card-wide">
        <div class="admin-auth-head">
          <div class="admin-auth-mark">🔐</div>
          <h1>Set up two-factor</h1>
          <p>Open your authenticator app (Authy, 1Password, Google Authenticator) and scan the QR below.</p>
        </div>
        <div id="enrollContent" class="admin-auth-form">
          <div class="admin-loading">Generating secret…</div>
        </div>
      </div>
    </div>
  `;

  const content = document.getElementById('enrollContent');

  let factorId = null;
  try {
    const enrollment = await enrollTotp();
    factorId = enrollment.factorId;
    content.innerHTML = `
      <div class="enroll-qr-wrap">
        <div class="enroll-qr">${extractSvgMarkup(enrollment.qrSvg)}</div>
        <div class="enroll-secret">
          <div class="field-hint">Can't scan? Enter this secret manually:</div>
          <code>${enrollment.secret}</code>
        </div>
      </div>
      <form id="enrollForm" novalidate>
        <div class="field">
          <label for="enroll_code">6-digit code from your app</label>
          <input id="enroll_code" name="code" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" required />
        </div>
        <div class="admin-auth-error" id="enrollError" hidden></div>
        <button type="submit" class="btn-primary admin-auth-submit" id="enrollSubmit">Verify & enable</button>
        <button type="button" class="admin-link admin-auth-secondary" id="enrollSignOut">Sign out instead</button>
      </form>
    `;

    document.getElementById('enrollSignOut').addEventListener('click', async () => {
      await signOut();
      route();
    });

    const form = document.getElementById('enrollForm');
    const errEl = document.getElementById('enrollError');
    const submit = document.getElementById('enrollSubmit');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.hidden = true;
      submit.disabled = true;
      submit.textContent = 'Verifying…';
      try {
        const code = document.getElementById('enroll_code').value.trim();
        await verifyEnrollment({ factorId, code });
        showToast('Two-factor enabled', '🔐');
        route();
      } catch (err) {
        console.error(err);
        errEl.textContent = err.message || 'Verification failed. Try again.';
        errEl.hidden = false;
        submit.disabled = false;
        submit.textContent = 'Verify & enable';
      }
    });
  } catch (err) {
    console.error(err);
    content.innerHTML = `<div class="admin-error">Could not start MFA enrollment: ${err.message}</div>`;
  }
}

// ============ MFA CHALLENGE ============
async function renderChallenge() {
  root().innerHTML = `
    <div class="admin-auth-shell">
      <div class="admin-auth-card">
        <div class="admin-auth-head">
          <div class="admin-auth-mark">🔐</div>
          <h1>Two-factor</h1>
          <p>Enter the 6-digit code from your authenticator app.</p>
        </div>
        <form id="challengeForm" class="admin-auth-form" novalidate>
          <div class="field">
            <label for="challenge_code">Code</label>
            <input id="challenge_code" name="code" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" required autofocus />
          </div>
          <div class="admin-auth-error" id="challengeError" hidden></div>
          <button type="submit" class="btn-primary admin-auth-submit" id="challengeSubmit">Verify</button>
          <button type="button" class="admin-link admin-auth-secondary" id="challengeSignOut">Sign out</button>
        </form>
      </div>
    </div>
  `;

  let factorId, challengeId;
  try {
    const ch = await challengeTotp();
    factorId = ch.factorId;
    challengeId = ch.challengeId;
  } catch (err) {
    console.error(err);
    document.getElementById('challengeError').textContent = err.message || 'Could not issue challenge.';
    document.getElementById('challengeError').hidden = false;
  }

  document.getElementById('challengeSignOut').addEventListener('click', async () => {
    await signOut();
    route();
  });

  const form = document.getElementById('challengeForm');
  const errEl = document.getElementById('challengeError');
  const submit = document.getElementById('challengeSubmit');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Verifying…';
    try {
      const code = document.getElementById('challenge_code').value.trim();
      await verifyChallenge({ factorId, challengeId, code });
      route();
    } catch (err) {
      console.error(err);
      // Re-issue the challenge so the user can try again with a fresh challengeId.
      try {
        const ch = await challengeTotp();
        challengeId = ch.id || ch.challengeId;
      } catch (_) { /* swallow — primary error is above */ }
      errEl.textContent = err.message || 'Verification failed. Try again.';
      errEl.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Verify';
    }
  });
}

// ============ ADMIN SHELL ============
async function renderAdminShell() {
  const user = await getCurrentUser();
  root().innerHTML = `
    <header class="admin-header">
      <div class="admin-header-inner">
        <div class="admin-brand">
          <span class="admin-brand-mark">🖨</span>
          <span class="admin-brand-text">Keith Prints — Admin</span>
        </div>
        <div class="admin-header-right">
          <a href="/" class="admin-link" target="_blank" rel="noopener">View site ↗</a>
          <span class="admin-user">${escapeHtml(user?.email || '')}</span>
          <button id="signOutBtn" class="admin-btn admin-btn-ghost">Sign out</button>
        </div>
      </div>
    </header>
    <main class="admin-main">
      <div class="admin-section-head">
        <h2>Products</h2>
        <p class="admin-sub">Add, edit, hide, or remove items in the catalog.</p>
      </div>
      <div id="productListRoot"></div>
    </main>
  `;

  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await signOut();
    route();
  });

  await mountProductList(document.getElementById('productListRoot'), {
    onCreate: () => {
      openProductForm(null, {
        onSaved: async () => {
          await refreshList();
          showToast('Product created', '✨');
        },
      });
    },
    onEdit: (product) => {
      openProductForm(product, {
        onSaved: async () => {
          await refreshList();
          showToast('Saved', '✓');
        },
      });
    },
    onDelete: async (product) => {
      const ok = confirm(`Delete "${product.name}"? This cannot be undone.\n\nIf you just want to hide it from the shop, toggle "Active" off instead.`);
      if (!ok) return;
      try {
        await deleteProduct(product.id);
        await refreshList();
        showToast('Product deleted', '🗑');
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
      }
    },
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Supabase returns totp.qr_code as a data:image/svg+xml URL with raw
// (unencoded) SVG markup containing double quotes. That can't be used
// as an <img src> directly because the inner quotes break the attribute.
// Strip the data-URI prefix and inline the SVG markup instead.
function extractSvgMarkup(dataUri) {
  if (typeof dataUri !== 'string') return '';
  const commaIdx = dataUri.indexOf(',');
  if (commaIdx < 0) return dataUri;
  const header = dataUri.slice(0, commaIdx);
  const after = dataUri.slice(commaIdx + 1);
  if (header.includes(';base64')) {
    try { return atob(after); } catch { return after; }
  }
  // Some encoders URL-encode the SVG body; most don't. Try to decode
  // only when the body actually looks percent-encoded.
  if (after.startsWith('%')) {
    try { return decodeURIComponent(after); } catch { return after; }
  }
  return after;
}

// React to sign-outs from other tabs / token expiry.
onAuthChange(({ event }) => {
  if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
    route();
  }
});

route();
