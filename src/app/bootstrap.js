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
import {
  parseAndDecryptBackupFile,
  restoreFromPayload,
  validateBackupPayload
} from '../lib/restore.js';

const HISTORY_KEY = 'audio_vault_backup_history';

function renderShell(appName) {
  return `
    <main class="layout">
      <header class="hero">
        <p class="kicker">AUDIO VAULT</p>
        <h1>${appName}</h1>
        <p class="subtitle">Local-first encrypted Spotify backups with secure restore.</p>
        <span id="authBadge" class="badge offline">Disconnected</span>
      </header>

      <section class="grid">
        <article class="card stack">
          <h2>Backup</h2>
          <p class="muted">Export liked songs and playlists to an encrypted local file.</p>

          <label class="field">
            <span>Backup passphrase (min 8 chars)</span>
            <input id="backupPassphrase" type="password" minlength="8" placeholder="Strong passphrase" />
          </label>

          <div class="actions sticky-actions">
            <button id="connectBtn" class="cta">Connect Spotify</button>
            <button id="backupBtn" class="cta ghost" disabled>Create Backup</button>
            <button id="logoutBtn" class="cta muted-btn" disabled>Logout</button>
          </div>

          <div class="progress-wrap">
            <div class="progress-track"><div id="backupProgress" class="progress-fill"></div></div>
            <p id="backupProgressText" class="progress-text">0%</p>
          </div>

          <pre id="backupStatus" class="status">Ready.</pre>
        </article>

        <article class="card stack">
          <h2>Restore</h2>
          <p class="muted">Decrypt a backup and replay likes/playlists into your Spotify account.</p>

          <label class="field">
            <span>Encrypted backup file</span>
            <input id="restoreFile" type="file" accept=".enc,.json,.json.enc" />
          </label>

          <label class="field">
            <span>Restore passphrase</span>
            <input id="restorePassphrase" type="password" minlength="8" placeholder="Passphrase used for backup" />
          </label>

          <label class="check-row">
            <input id="reusePlaylists" type="checkbox" checked />
            <span>Reuse matching playlists (avoid duplicates)</span>
          </label>

          <label class="check-row">
            <input id="confirmRestore" type="checkbox" />
            <span>I understand this can create or modify library content.</span>
          </label>

          <div class="actions sticky-actions">
            <button id="restoreBtn" class="cta ghost" disabled>Restore Backup</button>
          </div>

          <div class="progress-wrap">
            <div class="progress-track"><div id="restoreProgress" class="progress-fill"></div></div>
            <p id="restoreProgressText" class="progress-text">0%</p>
          </div>

          <pre id="restoreStatus" class="status">Ready.</pre>
        </article>
      </section>

      <section class="card stack">
        <div class="row-between">
          <h2>Local Backup History</h2>
          <button id="clearHistoryBtn" class="small-btn">Clear</button>
        </div>
        <p class="muted">Stored in your browser only. No server copies.</p>
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
    listEl.innerHTML = '<li class="history-empty">No backups yet.</li>';
    return;
  }

  listEl.innerHTML = entries
    .map((entry) => {
      const date = new Date(entry.createdAt).toLocaleString();
      return `<li class="history-item"><strong>${entry.fileName}</strong><span>${date} • liked ${entry.stats.likedCount}, playlists ${entry.stats.playlistCount}</span></li>`;
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

async function gatherFullBackupData(onStatus, onProgress) {
  onStatus('Loading profile...');
  onProgress(6);
  const user = await getCurrentUser();

  onStatus('Fetching liked songs...');
  const likedTrackIds = await getAllLikedTrackIds();
  onProgress(32);

  onStatus('Fetching playlists...');
  const playlists = await getAllPlaylists();
  onProgress(45);

  const enrichedPlaylists = [];
  const total = playlists.length || 1;
  for (let i = 0; i < playlists.length; i += 1) {
    const playlist = playlists[i];
    onStatus(`Fetching playlist tracks ${i + 1}/${playlists.length}: ${playlist.name}`);

    const tracks = await getPlaylistTrackIds(playlist.id);
    enrichedPlaylists.push({ ...playlist, tracks });

    const pct = 45 + ((i + 1) / total) * 45;
    onProgress(pct);
  }

  return { user, likedTrackIds, playlists: enrichedPlaylists };
}

function computeRestoreProgress(counts) {
  const likedPortion = counts.likedTotal > 0 ? counts.likedDone / counts.likedTotal : 1;
  const playlistPortion = counts.playlistsTotal > 0 ? counts.playlistsDone / counts.playlistsTotal : 1;
  return (likedPortion * 0.5 + playlistPortion * 0.5) * 100;
}

export async function bootstrap() {
  const cfg = getAppConfig();
  const root = document.getElementById('app');
  root.innerHTML = renderShell(cfg.appName);

  const connectBtn = document.getElementById('connectBtn');
  const backupBtn = document.getElementById('backupBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const backupPassphraseInput = document.getElementById('backupPassphrase');
  const backupStatusEl = document.getElementById('backupStatus');
  const backupProgressEl = document.getElementById('backupProgress');
  const backupProgressTextEl = document.getElementById('backupProgressText');

  const restoreBtn = document.getElementById('restoreBtn');
  const restoreFileInput = document.getElementById('restoreFile');
  const restorePassphraseInput = document.getElementById('restorePassphrase');
  const restoreAckInput = document.getElementById('confirmRestore');
  const reusePlaylistsInput = document.getElementById('reusePlaylists');
  const restoreStatusEl = document.getElementById('restoreStatus');
  const restoreProgressEl = document.getElementById('restoreProgress');
  const restoreProgressTextEl = document.getElementById('restoreProgressText');

  const historyListEl = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const authBadgeEl = document.getElementById('authBadge');

  let backupInFlight = false;
  let restoreInFlight = false;

  const refreshButtons = () => {
    const authed = isAuthenticated();

    connectBtn.disabled = authed || backupInFlight || restoreInFlight;
    logoutBtn.disabled = !authed || backupInFlight || restoreInFlight;
    backupBtn.disabled = !authed || backupInFlight || restoreInFlight;

    const hasFile = Boolean(restoreFileInput.files && restoreFileInput.files[0]);
    restoreBtn.disabled = !authed || !hasFile || restoreInFlight || backupInFlight;

    updateAuthBadge(authBadgeEl, authed);
  };

  renderHistory(historyListEl, loadHistory());

  if (!cfg.spotifyClientId || !cfg.spotifyRedirectUri) {
    setStatus(
      backupStatusEl,
      'Missing env configuration. Set VITE_SPOTIFY_CLIENT_ID and VITE_SPOTIFY_REDIRECT_URI.'
    );
    connectBtn.disabled = true;
    restoreBtn.disabled = true;
    return;
  }

  try {
    const usedCallback = await handleOAuthCallbackFromUrl();
    if (usedCallback) {
      setStatus(backupStatusEl, 'Spotify connected. Ready to create backup.');
      setStatus(restoreStatusEl, 'Spotify connected. Ready to restore.');
    }
  } catch (error) {
    setStatus(backupStatusEl, error.message);
  }

  connectBtn.addEventListener('click', async () => {
    setStatus(backupStatusEl, 'Redirecting to Spotify login...');
    try {
      await beginSpotifyLogin();
    } catch (error) {
      setStatus(backupStatusEl, error.message);
    }
  });

  logoutBtn.addEventListener('click', () => {
    logout();
    setStatus(backupStatusEl, 'Logged out.');
    setStatus(restoreStatusEl, 'Logged out.');
    refreshButtons();
  });

  restoreFileInput.addEventListener('change', refreshButtons);

  clearHistoryBtn.addEventListener('click', () => {
    saveHistory([]);
    renderHistory(historyListEl, []);
  });

  backupBtn.addEventListener('click', async () => {
    const passphrase = backupPassphraseInput.value.trim();
    if (passphrase.length < 8) {
      setStatus(backupStatusEl, 'Passphrase too short. Use at least 8 characters.');
      return;
    }

    backupInFlight = true;
    refreshButtons();
    setProgress(backupProgressEl, backupProgressTextEl, 2);

    try {
      const snapshot = await gatherFullBackupData(
        (message) => setStatus(backupStatusEl, message),
        (percent) => setProgress(backupProgressEl, backupProgressTextEl, percent)
      );

      setStatus(backupStatusEl, 'Encrypting backup...');
      setProgress(backupProgressEl, backupProgressTextEl, 95);

      const result = await exportEncryptedBackup({
        user: snapshot.user,
        likedTrackIds: snapshot.likedTrackIds,
        playlists: snapshot.playlists,
        passphrase
      });

      const history = pushHistoryEntry({
        createdAt: new Date().toISOString(),
        fileName: result.filename,
        stats: result.stats
      });

      renderHistory(historyListEl, history);
      setProgress(backupProgressEl, backupProgressTextEl, 100);
      setStatus(
        backupStatusEl,
        `Backup saved as ${result.filename}. Liked songs: ${result.stats.likedCount}, playlists: ${result.stats.playlistCount}, playlist tracks: ${result.stats.playlistTrackCount}.`
      );
    } catch (error) {
      setStatus(backupStatusEl, `Backup failed: ${error.message}`);
    } finally {
      backupInFlight = false;
      refreshButtons();
    }
  });

  restoreBtn.addEventListener('click', async () => {
    const file = restoreFileInput.files?.[0];
    const passphrase = restorePassphraseInput.value.trim();

    if (!file) {
      setStatus(restoreStatusEl, 'Choose an encrypted backup file first.');
      return;
    }

    if (passphrase.length < 8) {
      setStatus(restoreStatusEl, 'Restore passphrase must be at least 8 characters.');
      return;
    }

    if (!restoreAckInput.checked) {
      setStatus(restoreStatusEl, 'Check the confirmation box before restore.');
      return;
    }

    restoreInFlight = true;
    refreshButtons();
    setProgress(restoreProgressEl, restoreProgressTextEl, 4);

    try {
      setStatus(restoreStatusEl, 'Decrypting backup...');
      const payload = await parseAndDecryptBackupFile(file, passphrase);
      validateBackupPayload(payload);
      setProgress(restoreProgressEl, restoreProgressTextEl, 14);

      const summary = await restoreFromPayload(payload, {
        reuseExistingPlaylists: reusePlaylistsInput.checked,
        onProgress: (message) => setStatus(restoreStatusEl, message),
        onCounts: (counts) => {
          const pct = 14 + computeRestoreProgress(counts) * 0.86;
          setProgress(restoreProgressEl, restoreProgressTextEl, pct);
        }
      });

      setProgress(restoreProgressEl, restoreProgressTextEl, 100);
      setStatus(
        restoreStatusEl,
        `Restore complete. Liked restored: ${summary.likedRestored}, playlists created: ${summary.createdPlaylists}, playlists reused: ${summary.reusedPlaylists}, tracks added: ${summary.tracksAdded}.`
      );
    } catch (error) {
      setStatus(restoreStatusEl, `Restore failed: ${error.message}`);
    } finally {
      restoreInFlight = false;
      refreshButtons();
    }
  });

  refreshButtons();
}
