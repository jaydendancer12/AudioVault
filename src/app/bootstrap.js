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
  getAllPlaylists,
  getCurrentUser,
  getPlaylistTracksDetailed
} from '../lib/spotifyApi.js';

const HISTORY_KEY = 'audio_vault_backup_history';

function renderShell(appName) {
  return `
    <main class="layout">
      <header class="hero">
        <p class="kicker">AUDIO VAULT</p>
        <h1>${appName}</h1>
        <p class="subtitle">Download a professional backup package of your Spotify library data.</p>
        <span id="authBadge" class="badge offline">Disconnected</span>
      </header>

      <section class="grid">
        <article class="card stack">
          <h2>Library Package Export</h2>
          <p class="muted">Exports a Spotify-themed package (.avault.zip) with HTML report, CSVs, and JSON.</p>

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
    return Array.isArray(parsed) ? parsed : [];
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
      return `<li class="history-item"><strong>${entry.fileName}</strong><span>${date} • liked ${entry.summary.likedSongs}, playlists ${entry.summary.playlists}, artists ${entry.summary.followedArtists}</span></li>`;
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
  onProgress(7);
  const user = await getCurrentUser();

  onStatus('Fetching liked songs...');
  const likedSongs = await getAllLikedTracksDetailed();
  onProgress(35);

  onStatus('Fetching followed artists...');
  let followedArtists = [];
  let followedArtistsUnavailable = false;
  try {
    followedArtists = await getAllFollowedArtists();
  } catch (error) {
    if (error instanceof SpotifyHttpError && error.status === 403) {
      followedArtistsUnavailable = true;
      onStatus('Followed artists not accessible for this app/user. Continuing export...');
    } else {
      throw error;
    }
  }
  onProgress(52);

  onStatus('Fetching playlists...');
  const playlists = await getAllPlaylists();
  onProgress(62);

  const enrichedPlaylists = [];
  const skippedPlaylists = [];
  const total = playlists.length || 1;

  for (let i = 0; i < playlists.length; i += 1) {
    const playlist = playlists[i];
    onStatus(`Fetching playlist tracks ${i + 1}/${playlists.length}: ${playlist.name}`);

    try {
      const tracks = await getPlaylistTracksDetailed(playlist.id);
      enrichedPlaylists.push({
        id: playlist.id,
        name: playlist.name || 'Untitled Playlist',
        description: playlist.description || '',
        public: Boolean(playlist.public),
        collaborative: Boolean(playlist.collaborative),
        owner: playlist.owner?.display_name || playlist.owner?.id || '',
        tracks
      });
    } catch (error) {
      if (error instanceof SpotifyHttpError && error.status === 403) {
        skippedPlaylists.push({ id: playlist.id, name: playlist.name || 'Unknown Playlist' });
      } else {
        throw error;
      }
    }

    const pct = 62 + ((i + 1) / total) * 32;
    onProgress(pct);
  }

  return {
    user,
    likedSongs,
    followedArtists,
    followedArtistsUnavailable,
    playlists: enrichedPlaylists,
    skippedPlaylists
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

  if (!cfg.spotifyClientId || !cfg.spotifyRedirectUri) {
    setStatus(statusEl, 'Missing env configuration. Set VITE_SPOTIFY_CLIENT_ID and VITE_SPOTIFY_REDIRECT_URI.');
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
        likedSongs: snapshot.likedSongs,
        playlists: snapshot.playlists,
        followedArtists: snapshot.followedArtists
      });

      const history = pushHistoryEntry({
        createdAt: new Date().toISOString(),
        fileName: result.filename,
        summary: result.summary
      });

      renderHistory(historyListEl, history);
      setProgress(exportProgressEl, exportProgressTextEl, 100);

      const skippedText =
        snapshot.skippedPlaylists.length > 0
          ? ` Skipped restricted playlists: ${snapshot.skippedPlaylists.length}.`
          : '';
      const artistsText = snapshot.followedArtistsUnavailable
        ? ' Followed artists were unavailable for this account/app and were omitted.'
        : '';

      setStatus(
        statusEl,
        `Export complete: ${result.filename}. Liked songs: ${result.summary.likedSongs}, playlists: ${result.summary.playlists}, followed artists: ${result.summary.followedArtists}.${skippedText}${artistsText}`
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
