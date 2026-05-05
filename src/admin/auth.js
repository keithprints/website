// Admin authentication wrapper around Supabase Auth + TOTP MFA.
// Exposes a small surface the admin UI can use without touching
// the Supabase client directly for auth concerns.

import { supabase } from '../lib/supabase.js';

export async function signInWithPassword({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// Returns one of: 'unauthenticated' | 'needs-enrollment' | 'needs-challenge' | 'ready'
//
// - unauthenticated: no session at all
// - needs-enrollment: signed in with password, no TOTP factor enrolled yet
// - needs-challenge: signed in with password, TOTP factor exists, but session is still aal1
// - ready: session is aal2, full access
export async function getAdminAuthStatus() {
  const session = await getSession();
  if (!session) return 'unauthenticated';

  const { data: aalData, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalErr) throw aalErr;

  if (aalData.currentLevel === 'aal2') return 'ready';

  // currentLevel is aal1. Check if a verified TOTP factor exists.
  const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
  if (factorsErr) throw factorsErr;

  const verifiedTotp = (factorsData.totp || []).find(f => f.status === 'verified');
  return verifiedTotp ? 'needs-challenge' : 'needs-enrollment';
}

// MFA enrollment flow — call once on first login, after password.
// Returns { factorId, qrSvg, secret } so the UI can render the QR code.
export async function enrollTotp({ friendlyName = 'Authenticator' } = {}) {
  // Clean up any partial unverified enrollment from a previous attempt.
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const stale = (factorsData?.all || []).filter(f => f.factor_type === 'totp' && f.status !== 'verified');
  for (const s of stale) {
    await supabase.auth.mfa.unenroll({ factorId: s.id }).catch(() => {});
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qrSvg: data.totp.qr_code,   // SVG data URI
    secret: data.totp.secret,    // shown as fallback for manual entry
    uri: data.totp.uri,
  };
}

export async function verifyEnrollment({ factorId, code }) {
  // Issue a challenge, then verify the user-entered code against it.
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
  if (chErr) throw chErr;
  const { error: verErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: ch.id,
    code,
  });
  if (verErr) throw verErr;
}

// Returning-user MFA challenge flow.
export async function challengeTotp() {
  const { data: factorsData, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const factor = (factorsData.totp || []).find(f => f.status === 'verified');
  if (!factor) throw new Error('No verified TOTP factor — try enrolling again.');
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (chErr) throw chErr;
  return { factorId: factor.id, challengeId: ch.id };
}

export async function verifyChallenge({ factorId, challengeId, code }) {
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
  if (error) throw error;
}

// Subscribe to auth-state changes; the wrapper rebroadcasts so the admin
// app can react when sessions expire or the user signs out elsewhere.
export function onAuthChange(handler) {
  return supabase.auth.onAuthStateChange((event, session) => {
    handler({ event, session });
  });
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}
