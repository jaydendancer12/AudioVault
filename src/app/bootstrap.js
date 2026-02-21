import { getAppConfig } from '../lib/config.js';
import { exportLibrarySnapshot } from '../lib/backupExporter.js';
import {
  beginSpotifyLogin,
  handleOAuthCallbackFromUrl,
  isAuthenticated,
  logout
} from '../lib/spotifyAuth.js';
import {
  SpotifyHttpError,
  getAllFollowedArtists,
  getAllLikedTracksDetailed,
  getAllSavedAlbumsDetailed,
  getCurrentUser
} from '../lib/spotifyApi.js';

function renderShell(appName) {
  return `
    <main class="layout">
      <article class="card stack">
        <header class="hero">
          <p class="kicker">AUDIO VAULT</p>
          <h1>${appName}</h1>
          <p class="subtitle">Export Spotify data into a professional package with Followed Artists, Saved Albums, and Liked Songs.</p>
          <span id="authBadge" class="badge offline">Disconnected</span>
        </header>

        <section class="stack">
          <h2>Export Package</h2>
          <p class="muted">Generates an `audiovault-username.zip` with CSV files, JSON, and a full HTML report.</p>

          <div class="actions sticky-actions">
            <button id="connectBtn" class="cta">Connect Spotify</button>
            <button id="exportBtn" class="cta ghost" disabled>Download</button>
            <button id="logoutBtn" class="cta muted-btn" disabled>Disconnect Spotify</button>
          </div>

          <div class="progress-wrap">
            <div class="progress-track"><div id="exportProgress" class="progress-fill"></div></div>
            <p id="exportProgressText" class="progress-text">0%</p>
          </div>

          <pre id="status" class="status terminal">[idle] waiting for command...</pre>
        </section>
      </article>
    </main>
  `;
}

function formatLogLine(level, message) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `[${hh}:${mm}:${ss}] ${level} ${message}`;
}

function setStatus(el, message, level = 'INFO') {
  el.textContent = formatLogLine(level, message);
}

function setProgress(barEl, textEl, percent) {
  const bounded = Math.max(0, Math.min(100, percent));
  barEl.style.width = `${bounded}%`;
  textEl.textContent = `${Math.round(bounded)}%`;
}

function updateAuthBadge(authBadgeEl, authed) {
  authBadgeEl.textContent = authed ? 'Connected' : 'Disconnected';
  authBadgeEl.className = `badge ${authed ? 'online' : 'offline'}`;
}

function explainSpotifyError(error) {
  if (!(error instanceof SpotifyHttpError)) {
    return error.message;
  }

  if (error.status === 403) {
    return `Spotify denied access at ${error.path}. Re-login and accept all scopes. If it still fails, your app/user access may be restricted in Spotify Dev Mode.`;
  }

  return error.message;
}

async function gatherLibrarySnapshot(onStatus, onProgress) {
  onStatus('Loading profile...', 'STEP');
  onProgress(8);
  const user = await getCurrentUser();

  onStatus('Fetching followed artists...', 'STEP');
  const followedArtists = await getAllFollowedArtists();
  onProgress(35);

  onStatus('Fetching saved albums...', 'STEP');
  const savedAlbums = await getAllSavedAlbumsDetailed();
  onProgress(68);

  onStatus('Fetching liked songs...', 'STEP');
  const likedSongs = await getAllLikedTracksDetailed();
  onProgress(95);

  return {
    user,
    followedArtists,
    savedAlbums,
    likedSongs
  };
}

export async function bootstrap() {
  const cfg = getAppConfig();
  const root = document.getElementById('app');
  root.innerHTML = renderShell(cfg.appName);

  const connectBtn = document.getElementById('connectBtn');
  const exportBtn = document.getElementById('exportBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const statusEl = document.getElementById('status');
  const exportProgressEl = document.getElementById('exportProgress');
  const exportProgressTextEl = document.getElementById('exportProgressText');
  const authBadgeEl = document.getElementById('authBadge');

  let exportInFlight = false;

  const refreshButtons = () => {
    const authed = isAuthenticated();
    connectBtn.disabled = authed || exportInFlight;
    logoutBtn.disabled = !authed || exportInFlight;
    exportBtn.disabled = !authed || exportInFlight;
    updateAuthBadge(authBadgeEl, authed);
  };

  if (!cfg.spotifyClientId) {
    setStatus(statusEl, 'Missing env configuration. Set VITE_SPOTIFY_CLIENT_ID.', 'ERROR');
    connectBtn.disabled = true;
    return;
  }

  try {
    const usedCallback = await handleOAuthCallbackFromUrl();
    if (usedCallback) {
      setStatus(statusEl, 'Spotify connected. Ready to download package.', 'OK');
    }
  } catch (error) {
    setStatus(statusEl, explainSpotifyError(error), 'ERROR');
  }

  if (isAuthenticated() && statusEl.textContent.includes('idle')) {
    setStatus(statusEl, 'Spotify connected. Ready to download package.', 'OK');
  }

  connectBtn.addEventListener('click', async () => {
    setStatus(statusEl, 'Opening Spotify authorization...', 'STEP');
    try {
      await beginSpotifyLogin();
    } catch (error) {
      setStatus(statusEl, explainSpotifyError(error), 'ERROR');
    }
  });

  logoutBtn.addEventListener('click', () => {
    logout();
    setStatus(statusEl, 'Spotify disconnected.', 'OK');
    refreshButtons();
  });

  exportBtn.addEventListener('click', async () => {
    exportInFlight = true;
    refreshButtons();
    setProgress(exportProgressEl, exportProgressTextEl, 2);

    try {
      const snapshot = await gatherLibrarySnapshot(
        (message, level) => setStatus(statusEl, message, level),
        (percent) => setProgress(exportProgressEl, exportProgressTextEl, percent)
      );

      setStatus(statusEl, 'Building package artifacts...', 'STEP');
      setProgress(exportProgressEl, exportProgressTextEl, 97);

      const result = await exportLibrarySnapshot({
        user: snapshot.user,
        followedArtists: snapshot.followedArtists,
        savedAlbums: snapshot.savedAlbums,
        likedSongs: snapshot.likedSongs
      });

      setProgress(exportProgressEl, exportProgressTextEl, 100);
      setStatus(
        statusEl,
        `Download ready: ${result.filename} | artists=${result.summary.followedArtists} albums=${result.summary.savedAlbums} liked_songs=${result.summary.likedSongs}`,
        'OK'
      );
    } catch (error) {
      setStatus(statusEl, `Export failed: ${explainSpotifyError(error)}`, 'ERROR');
    } finally {
      exportInFlight = false;
      refreshButtons();
    }
  });

  refreshButtons();
}
