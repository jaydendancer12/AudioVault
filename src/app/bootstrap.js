import { getAppConfig } from '../lib/config.js';
import { exportEncryptedBackup } from '../lib/backupExporter.js';
import {
  beginSpotifyLogin,
  handleOAuthCallbackFromUrl,
  isAuthenticated,
  logout
} from '../lib/spotifyAuth.js';
import {
  getAllLikedTrackIds,
  getAllPlaylists,
  getCurrentUser,
  getPlaylistTrackIds
} from '../lib/spotifyApi.js';

function renderShell(appName) {
  return `
    <main class="layout">
      <header class="hero">
        <p class="kicker">AUDIO VAULT</p>
        <h1>${appName}</h1>
        <p class="subtitle">Secure, encrypted Spotify backup saved directly to your device.</p>
      </header>

      <section class="card stack">
        <h2>Backup Center</h2>
        <p class="muted">No backend storage. Your data stays client-side.</p>

        <label class="field">
          <span>Backup passphrase (min 8 chars)</span>
          <input id="passphrase" type="password" placeholder="Enter a strong passphrase" minlength="8" />
        </label>

        <div class="actions">
          <button id="connectBtn" class="cta">Connect Spotify</button>
          <button id="backupBtn" class="cta ghost" disabled>Create Encrypted Backup</button>
          <button id="logoutBtn" class="cta muted-btn" disabled>Logout</button>
        </div>

        <pre id="status" class="status">Ready.</pre>
      </section>
    </main>
  `;
}

function setStatus(el, message) {
  el.textContent = message;
}

async function gatherFullBackupData(statusEl) {
  setStatus(statusEl, 'Loading profile...');
  const user = await getCurrentUser();

  setStatus(statusEl, 'Fetching liked songs...');
  const likedTrackIds = await getAllLikedTrackIds();

  setStatus(statusEl, 'Fetching playlists...');
  const playlists = await getAllPlaylists();

  const enrichedPlaylists = [];
  for (let i = 0; i < playlists.length; i += 1) {
    const playlist = playlists[i];
    setStatus(statusEl, `Fetching playlist tracks ${i + 1}/${playlists.length}: ${playlist.name}`);

    const tracks = await getPlaylistTrackIds(playlist.id);
    enrichedPlaylists.push({ ...playlist, tracks });
  }

  return { user, likedTrackIds, playlists: enrichedPlaylists };
}

export async function bootstrap() {
  const cfg = getAppConfig();
  const root = document.getElementById('app');
  root.innerHTML = renderShell(cfg.appName);

  const connectBtn = document.getElementById('connectBtn');
  const backupBtn = document.getElementById('backupBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const passphraseInput = document.getElementById('passphrase');
  const statusEl = document.getElementById('status');

  if (!cfg.spotifyClientId || !cfg.spotifyRedirectUri) {
    setStatus(statusEl, 'Missing env configuration. Set VITE_SPOTIFY_CLIENT_ID and VITE_SPOTIFY_REDIRECT_URI.');
    connectBtn.disabled = true;
    return;
  }

  try {
    const usedCallback = await handleOAuthCallbackFromUrl();
    if (usedCallback) {
      setStatus(statusEl, 'Spotify connected. Ready to create encrypted backup.');
    }
  } catch (error) {
    setStatus(statusEl, error.message);
  }

  const updateAuthState = () => {
    const authed = isAuthenticated();
    connectBtn.disabled = authed;
    backupBtn.disabled = !authed;
    logoutBtn.disabled = !authed;
    if (authed && statusEl.textContent === 'Ready.') {
      setStatus(statusEl, 'Connected. Enter passphrase to export encrypted backup.');
    }
  };

  connectBtn.addEventListener('click', async () => {
    setStatus(statusEl, 'Redirecting to Spotify login...');
    try {
      await beginSpotifyLogin();
    } catch (error) {
      setStatus(statusEl, error.message);
    }
  });

  logoutBtn.addEventListener('click', () => {
    logout();
    updateAuthState();
    setStatus(statusEl, 'Logged out.');
  });

  backupBtn.addEventListener('click', async () => {
    const passphrase = passphraseInput.value.trim();
    if (passphrase.length < 8) {
      setStatus(statusEl, 'Passphrase too short. Use at least 8 characters.');
      return;
    }

    try {
      const snapshot = await gatherFullBackupData(statusEl);
      setStatus(statusEl, 'Encrypting backup...');

      const stats = await exportEncryptedBackup({
        user: snapshot.user,
        likedTrackIds: snapshot.likedTrackIds,
        playlists: snapshot.playlists,
        passphrase
      });

      setStatus(
        statusEl,
        `Backup saved. Liked songs: ${stats.likedCount}, playlists: ${stats.playlistCount}, playlist tracks: ${stats.playlistTrackCount}.`
      );
    } catch (error) {
      setStatus(statusEl, `Backup failed: ${error.message}`);
    }
  });

  updateAuthState();
}
