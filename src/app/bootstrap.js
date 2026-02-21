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

const HISTORY_KEY = 'audio_vault_backup_history';

function renderShell(appName) {
  return `
    <main class="layout">
      <header class="hero">
        <p class="kicker">AUDIO VAULT</p>
        <h1>${appName}</h1>
        <p class="subtitle">Export only: Followed Artists, Saved Albums, and Liked Songs.</p>
        <span id="authBadge" class="badge offline">Disconnected</span>
      </header>

      <section class="grid">
        <article class="card stack">
          <h2>Library Package Export</h2>
          <p class="muted">Creates .avault.zip with Followed Artists (1), Saved Albums (2), Liked Songs (3).</p>

          <div class="actions sticky-actions">
            <button id="connectBtn" class="cta">Connect Spotify</button>
            <button id="exportBtn" class="cta ghost" disabled>Export Pro Package</button>
            <button id="logoutBtn" class="cta muted-btn" disabled>Logout</button>
          </div>

          <div class="progress-wrap">
            <div class="progress-track"><div id="exportProgress" class="progress-fill"></div></div>
            <p id="exportProgressText" class="progress-text">0%</p>
          </div>

          <pre id="status" class="status">Ready.</pre>
        </article>
      </section>

      <section class="card stack">
        <div class="row-between">
          <h2>Local Export History</h2>
          <button id="clearHistoryBtn" class="small-btn">Clear</button>
        </div>
        <p class="muted">History stored in your browser only.</p>
        <ul id="historyList" class="history-list"></ul>
      </section>
    </main>
  `;
}

function setStatus(el, message) {
  el.textContent = message;
}

function setProgress(barEl, textEl, percent) {
  const bounded = Math.max(0, Math.min(100, percent));
  barEl.style.width = `${bounded}%`;
  textEl.textContent = `${Math.round(bounded)}%`;
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => {
      const summary = entry?.summary || entry?.stats || {};
      return {
        createdAt: entry?.createdAt || new Date().toISOString(),
        fileName: entry?.fileName || 'audio-vault-export',
        summary: {
          followedArtists: Number(summary.followedArtists ?? 0),
          savedAlbums: Number(summary.savedAlbums ?? 0),
          likedSongs: Number(summary.likedSongs ?? summary.likedCount ?? 0)
        }
      };
    });
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

function renderHistory(listEl, entries) {
  if (entries.length === 0) {
    listEl.innerHTML = '<li class="history-empty">No exports yet.</li>';
    return;
  }

  listEl.innerHTML = entries
    .map((entry) => {
      const date = new Date(entry.createdAt).toLocaleString();
      return `<li class="history-item"><strong>${entry.fileName}</strong><span>${date} • artists ${entry.summary.followedArtists}, albums ${entry.summary.savedAlbums}, liked songs ${entry.summary.likedSongs}</span></li>`;
    })
    .join('');
}

function pushHistoryEntry(entry) {
  const current = loadHistory();
  const next = [entry, ...current].slice(0, 20);
  saveHistory(next);
  return next;
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
  onStatus('Loading profile...');
  onProgress(8);
  const user = await getCurrentUser();

  onStatus('Fetching followed artists...');
  const followedArtists = await getAllFollowedArtists();
  onProgress(35);

  onStatus('Fetching saved albums...');
  const savedAlbums = await getAllSavedAlbumsDetailed();
  onProgress(68);

  onStatus('Fetching liked songs...');
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
  const historyListEl = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const authBadgeEl = document.getElementById('authBadge');

  let exportInFlight = false;

  const refreshButtons = () => {
    const authed = isAuthenticated();
    connectBtn.disabled = authed || exportInFlight;
    logoutBtn.disabled = !authed || exportInFlight;
    exportBtn.disabled = !authed || exportInFlight;
    updateAuthBadge(authBadgeEl, authed);
  };

  renderHistory(historyListEl, loadHistory());

  if (!cfg.spotifyClientId) {
    setStatus(statusEl, 'Missing env configuration. Set VITE_SPOTIFY_CLIENT_ID.');
    connectBtn.disabled = true;
    return;
  }

  try {
    const usedCallback = await handleOAuthCallbackFromUrl();
    if (usedCallback) {
      setStatus(statusEl, 'Spotify connected. Ready to export package.');
    }
  } catch (error) {
    setStatus(statusEl, explainSpotifyError(error));
  }

  if (isAuthenticated() && statusEl.textContent === 'Ready.') {
    setStatus(statusEl, 'Spotify connected. Ready to export package.');
  }

  connectBtn.addEventListener('click', async () => {
    setStatus(statusEl, 'Redirecting to Spotify login...');
    try {
      await beginSpotifyLogin();
    } catch (error) {
      setStatus(statusEl, explainSpotifyError(error));
    }
  });

  logoutBtn.addEventListener('click', () => {
    logout();
    setStatus(statusEl, 'Logged out.');
    refreshButtons();
  });

  clearHistoryBtn.addEventListener('click', () => {
    saveHistory([]);
    renderHistory(historyListEl, []);
  });

  exportBtn.addEventListener('click', async () => {
    exportInFlight = true;
    refreshButtons();
    setProgress(exportProgressEl, exportProgressTextEl, 2);

    try {
      const snapshot = await gatherLibrarySnapshot(
        (message) => setStatus(statusEl, message),
        (percent) => setProgress(exportProgressEl, exportProgressTextEl, percent)
      );

      setStatus(statusEl, 'Building professional export package...');
      setProgress(exportProgressEl, exportProgressTextEl, 97);

      const result = await exportLibrarySnapshot({
        user: snapshot.user,
        followedArtists: snapshot.followedArtists,
        savedAlbums: snapshot.savedAlbums,
        likedSongs: snapshot.likedSongs
      });

      const history = pushHistoryEntry({
        createdAt: new Date().toISOString(),
        fileName: result.filename,
        summary: result.summary
      });

      renderHistory(historyListEl, history);
      setProgress(exportProgressEl, exportProgressTextEl, 100);

      setStatus(
        statusEl,
        `Export complete: ${result.filename}. Followed artists: ${result.summary.followedArtists}, saved albums: ${result.summary.savedAlbums}, liked songs: ${result.summary.likedSongs}.`
      );
    } catch (error) {
      setStatus(statusEl, `Export failed: ${explainSpotifyError(error)}`);
    } finally {
      exportInFlight = false;
      refreshButtons();
    }
  });

  refreshButtons();
}
