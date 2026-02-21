import { getAppConfig, SPOTIFY_AUTH_BASE } from './config.js';

const TOKEN_STORAGE_KEY = 'audio_vault_spotify_token';
const PKCE_VERIFIER_KEY = 'audio_vault_pkce_verifier';
const OAUTH_STATE_KEY = 'audio_vault_oauth_state';

function randomString(length = 64) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function storeToken(tokenResponse) {
  const expiresIn = tokenResponse.expires_in || 3600;
  const token = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    scope: tokenResponse.scope,
    token_type: tokenResponse.token_type,
    expires_at: Date.now() + expiresIn * 1000
  };
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  return token;
}

export function getStoredToken() {
  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }
}

function clearAuthEphemeralState() {
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  localStorage.removeItem(PKCE_VERIFIER_KEY);
  localStorage.removeItem(OAUTH_STATE_KEY);
}

function setEphemeralState(key, value) {
  sessionStorage.setItem(key, value);
  localStorage.setItem(key, value);
}

function getEphemeralState(key) {
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

export function logout() {
  clearAuthEphemeralState();
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function isAuthenticated() {
  const token = getStoredToken();
  return Boolean(token && token.access_token && token.expires_at > Date.now());
}

export async function beginSpotifyLogin() {
  const cfg = getAppConfig();
  if (!cfg.spotifyClientId || !cfg.spotifyRedirectUri) {
    throw new Error('Missing Spotify env values. Check .env configuration.');
  }

  const codeVerifier = randomString(96);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
  const state = randomString(24);

  setEphemeralState(PKCE_VERIFIER_KEY, codeVerifier);
  setEphemeralState(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.spotifyClientId,
    scope: cfg.spotifyScopes.join(' '),
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: cfg.spotifyRedirectUri,
    state
  });

  window.location.href = `${SPOTIFY_AUTH_BASE}/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code, codeVerifier) {
  const cfg = getAppConfig();

  const body = new URLSearchParams({
    client_id: cfg.spotifyClientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.spotifyRedirectUri,
    code_verifier: codeVerifier
  });

  const response = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify token exchange failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function refreshAccessToken(refreshToken) {
  const cfg = getAppConfig();

  const body = new URLSearchParams({
    client_id: cfg.spotifyClientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch(`${SPOTIFY_AUTH_BASE}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    throw new Error('Spotify token refresh failed');
  }

  const refreshed = await response.json();
  return {
    ...refreshed,
    refresh_token: refreshed.refresh_token || refreshToken
  };
}

export async function getValidAccessToken() {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated with Spotify.');

  const bufferMs = 60_000;
  if (token.expires_at > Date.now() + bufferMs) {
    return token.access_token;
  }

  if (!token.refresh_token) {
    logout();
    throw new Error('Session expired. Please sign in again.');
  }

  const refreshed = await refreshAccessToken(token.refresh_token);
  const stored = storeToken(refreshed);
  return stored.access_token;
}

export async function handleOAuthCallbackFromUrl() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    throw new Error(`Spotify login failed: ${error}`);
  }

  if (!code) {
    return false;
  }

  const storedState = getEphemeralState(OAUTH_STATE_KEY);
  const codeVerifier = getEphemeralState(PKCE_VERIFIER_KEY);

  if (!state || !storedState || state !== storedState || !codeVerifier) {
    clearAuthEphemeralState();
    throw new Error('OAuth state check failed. Please try logging in again.');
  }

  const tokenResponse = await exchangeCodeForToken(code, codeVerifier);
  storeToken(tokenResponse);
  clearAuthEphemeralState();

  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, document.title, url.pathname);
  return true;
}
