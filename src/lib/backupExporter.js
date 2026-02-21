import JSZip from 'jszip';

function byNameAsc(a, b) {
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
}

function byArtistThenTitleAsc(a, b) {
  const artistA = a.artists?.[0] || '';
  const artistB = b.artists?.[0] || '';
  const artistCmp = artistA.localeCompare(artistB, undefined, { sensitivity: 'base' });
  if (artistCmp !== 0) return artistCmp;
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
}

function escapeCsv(value) {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csv(rows) {
  return rows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')).join('\n');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function msToMinSec(ms) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

async function sha256Hex(text) {
  const input = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', input);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildLikedSongsCsv(likedSongs) {
  const rows = [
    ['track_id', 'track_uri', 'name', 'artists', 'album', 'release_date', 'duration_ms', 'duration', 'explicit', 'is_local', 'added_at', 'spotify_url']
  ];

  for (const track of likedSongs) {
    rows.push([
      track.id,
      track.uri || '',
      track.name,
      (track.artists || []).join('; '),
      track.album,
      track.releaseDate,
      track.durationMs,
      msToMinSec(track.durationMs),
      track.explicit ? 'true' : 'false',
      track.isLocal ? 'true' : 'false',
      track.addedAt,
      track.spotifyUrl
    ]);
  }

  return csv(rows);
}

function buildFollowedArtistsCsv(followedArtists) {
  const rows = [['artist_id', 'name', 'genres', 'popularity', 'spotify_url']];

  for (const artist of followedArtists) {
    rows.push([
      artist.id,
      artist.name,
      (artist.genres || []).join('; '),
      artist.popularity,
      artist.spotifyUrl
    ]);
  }

  return csv(rows);
}

function buildPlaylistsCsv(playlists) {
  const rows = [['playlist_id', 'name', 'description', 'owner', 'public', 'collaborative', 'track_count']];

  for (const playlist of playlists) {
    rows.push([
      playlist.id,
      playlist.name,
      playlist.description,
      playlist.owner,
      playlist.public ? 'true' : 'false',
      playlist.collaborative ? 'true' : 'false',
      playlist.tracks?.length || 0
    ]);
  }

  return csv(rows);
}

function buildPlaylistTracksCsv(playlists) {
  const rows = [
    [
      'playlist_id',
      'playlist_name',
      'track_position',
      'track_key',
      'track_id',
      'track_uri',
      'track_name',
      'artists',
      'album',
      'release_date',
      'duration_ms',
      'duration',
      'explicit',
      'is_local',
      'added_at',
      'spotify_url'
    ]
  ];

  for (const playlist of playlists) {
    (playlist.tracks || []).forEach((track, index) => {
      rows.push([
        playlist.id,
        playlist.name,
        index + 1,
        track.key || track.id || track.uri || '',
        track.id,
        track.uri || '',
        track.name,
        (track.artists || []).join('; '),
        track.album,
        track.releaseDate,
        track.durationMs,
        msToMinSec(track.durationMs),
        track.explicit ? 'true' : 'false',
        track.isLocal ? 'true' : 'false',
        track.addedAt,
        track.spotifyUrl
      ]);
    });
  }

  return csv(rows);
}

function buildPlaylistBlocks(payload) {
  return payload.playlists
    .map((playlist) => {
      const tracksRows = (playlist.tracks || [])
        .map(
          (track, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(track.name)}</td>
              <td>${escapeHtml((track.artists || []).join(', '))}</td>
              <td>${escapeHtml(track.album)}</td>
              <td>${escapeHtml(track.releaseDate)}</td>
              <td>${msToMinSec(track.durationMs)}</td>
              <td>${track.isLocal ? 'Local' : 'Spotify'}</td>
            </tr>`
        )
        .join('');

      return `
        <section class="playlist-block">
          <div class="playlist-meta">
            <h3>${escapeHtml(playlist.name)}</h3>
            <div class="meta-grid">
              <span><strong>Owner:</strong> ${escapeHtml(playlist.owner)}</span>
              <span><strong>Visibility:</strong> ${playlist.public ? 'Public' : 'Private'}</span>
              <span><strong>Collaborative:</strong> ${playlist.collaborative ? 'Yes' : 'No'}</span>
              <span><strong>Track count:</strong> ${playlist.tracks?.length || 0}</span>
            </div>
            <p class="desc">${escapeHtml(playlist.description || 'No description')}</p>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Track</th><th>Artists</th><th>Album</th><th>Release</th><th>Length</th><th>Type</th></tr>
              </thead>
              <tbody>${tracksRows || '<tr><td colspan="7">No tracks captured.</td></tr>'}</tbody>
            </table>
          </div>
        </section>`;
    })
    .join('');
}

function buildReportHtml(payload) {
  const playlistRows = payload.playlists
    .map(
      (playlist) => `
      <tr>
        <td>${escapeHtml(playlist.name)}</td>
        <td>${escapeHtml(playlist.owner)}</td>
        <td>${playlist.tracks?.length || 0}</td>
        <td>${playlist.public ? 'Public' : 'Private'}</td>
      </tr>`
    )
    .join('');

  const likedRows = payload.likedSongs
    .slice(0, 250)
    .map(
      (track) => `
      <tr>
        <td>${escapeHtml(track.name)}</td>
        <td>${escapeHtml((track.artists || []).join(', '))}</td>
        <td>${escapeHtml(track.album)}</td>
        <td>${escapeHtml(track.releaseDate)}</td>
        <td>${msToMinSec(track.durationMs)}</td>
      </tr>`
    )
    .join('');

  const artistRows = payload.followedArtists
    .slice(0, 200)
    .map(
      (artist) => `
      <tr>
        <td>${escapeHtml(artist.name)}</td>
        <td>${escapeHtml((artist.genres || []).join(', '))}</td>
        <td>${artist.popularity || 0}</td>
      </tr>`
    )
    .join('');

  const playlistBlocks = buildPlaylistBlocks(payload);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Audio Vault Report</title>
    <style>
      :root { --green: #1db954; --bg: #121212; --card: #181818; --text: #ffffff; --muted: #b3b3b3; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: linear-gradient(160deg, #101010, #161616); color: var(--text); }
      main { max-width: 1120px; margin: 0 auto; padding: 28px 18px 48px; }
      .hero { padding: 18px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); background: radial-gradient(circle at right top, rgba(29,185,84,.2), transparent 45%), var(--card); }
      .kicker { color: var(--green); font-size: 12px; letter-spacing: 0.16em; margin: 0; font-weight: 700; }
      h1 { margin: 6px 0; }
      p { color: var(--muted); margin: 0; }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 14px; }
      .stat { padding: 14px; border-radius: 12px; background: #101010; border: 1px solid rgba(255,255,255,.08); }
      .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
      .value { font-size: 26px; font-weight: 700; margin-top: 4px; }
      section { margin-top: 18px; border-radius: 14px; border: 1px solid rgba(255,255,255,.1); background: var(--card); overflow: hidden; }
      h2 { margin: 0; padding: 14px 14px 0; }
      h3 { margin: 0; font-size: 1.1rem; }
      .hint { padding: 0 14px 14px; color: var(--muted); font-size: 13px; }
      .table-wrap { overflow: auto; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 10px 12px; border-top: 1px solid rgba(255,255,255,.08); text-align: left; font-size: 14px; }
      th { position: sticky; top: 0; background: #131313; font-size: 12px; color: var(--muted); letter-spacing: .05em; text-transform: uppercase; }
      .playlist-block { margin-top: 16px; }
      .playlist-meta { padding: 14px; border-bottom: 1px solid rgba(255,255,255,.08); background: #141414; }
      .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; margin-top: 10px; color: var(--muted); font-size: 13px; }
      .desc { margin-top: 10px; color: var(--muted); font-size: 13px; }
      footer { margin-top: 16px; color: var(--muted); font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <header class="hero">
        <p class="kicker">AUDIO VAULT LIBRARY REPORT</p>
        <h1>${escapeHtml(payload.account.displayName || payload.account.id)}</h1>
        <p>Snapshot generated ${escapeHtml(payload.createdAt)}</p>
        <div class="stats">
          <div class="stat"><div class="label">Liked Songs</div><div class="value">${payload.summary.likedSongs}</div></div>
          <div class="stat"><div class="label">Playlists</div><div class="value">${payload.summary.playlists}</div></div>
          <div class="stat"><div class="label">Playlist Tracks</div><div class="value">${payload.summary.playlistTracks}</div></div>
          <div class="stat"><div class="label">Followed Artists</div><div class="value">${payload.summary.followedArtists}</div></div>
        </div>
      </header>

      <section>
        <h2>Playlist Directory</h2>
        <p class="hint">Quick overview of all playlists in this snapshot.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Owner</th><th>Tracks</th><th>Visibility</th></tr></thead>
            <tbody>${playlistRows}</tbody>
          </table>
        </div>
      </section>

      ${playlistBlocks}

      <section>
        <h2>Liked Songs (Preview)</h2>
        <p class="hint">Showing first 250 tracks. Full data is in CSV and JSON files.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Track</th><th>Artists</th><th>Album</th><th>Release</th><th>Length</th></tr></thead>
            <tbody>${likedRows}</tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Followed Artists (Preview)</h2>
        <p class="hint">Showing first 200 artists. Full data is in CSV and JSON files.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Artist</th><th>Genres</th><th>Popularity</th></tr></thead>
            <tbody>${artistRows}</tbody>
          </table>
        </div>
      </section>

      <footer>Generated by Audio Vault</footer>
    </main>
  </body>
</html>`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildLibrarySnapshotPayload({ user, likedSongs, playlists, followedArtists }) {
  const sortedLikedSongs = [...likedSongs].sort(byArtistThenTitleAsc);
  const sortedArtists = [...followedArtists].sort(byNameAsc);
  const sortedPlaylists = [...playlists]
    .map((playlist) => ({ ...playlist, tracks: [...(playlist.tracks || [])] }))
    .sort(byNameAsc);

  return {
    schemaVersion: 3,
    createdAt: new Date().toISOString(),
    source: 'spotify',
    account: {
      id: user.id,
      displayName: user.display_name || '',
      country: user.country || ''
    },
    summary: {
      likedSongs: sortedLikedSongs.length,
      playlists: sortedPlaylists.length,
      followedArtists: sortedArtists.length,
      playlistTracks: sortedPlaylists.reduce((sum, playlist) => sum + (playlist.tracks?.length || 0), 0)
    },
    followedArtists: sortedArtists,
    likedSongs: sortedLikedSongs,
    playlists: sortedPlaylists
  };
}

export async function exportLibrarySnapshot({ user, likedSongs, playlists, followedArtists }) {
  const payload = buildLibrarySnapshotPayload({ user, likedSongs, playlists, followedArtists });

  const libraryJson = JSON.stringify(payload, null, 2);
  const likedSongsCsv = buildLikedSongsCsv(payload.likedSongs);
  const followedArtistsCsv = buildFollowedArtistsCsv(payload.followedArtists);
  const playlistsCsv = buildPlaylistsCsv(payload.playlists);
  const playlistTracksCsv = buildPlaylistTracksCsv(payload.playlists);
  const reportHtml = buildReportHtml(payload);

  const hash = await sha256Hex(libraryJson);

  const manifest = {
    format: 'audio-vault-package',
    packageVersion: 1,
    generatedAt: payload.createdAt,
    app: 'Audio Vault',
    accountId: payload.account.id,
    files: {
      reportHtml: 'index.html',
      libraryJson: 'library.json',
      likedSongsCsv: 'liked_songs.csv',
      followedArtistsCsv: 'followed_artists.csv',
      playlistsCsv: 'playlists.csv',
      playlistTracksCsv: 'playlist_tracks.csv'
    },
    summary: payload.summary,
    checksums: {
      libraryJsonSha256: hash
    }
  };

  const zip = new JSZip();
  zip.file('index.html', reportHtml);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('library.json', libraryJson);
  zip.file('liked_songs.csv', likedSongsCsv);
  zip.file('followed_artists.csv', followedArtistsCsv);
  zip.file('playlists.csv', playlistsCsv);
  zip.file('playlist_tracks.csv', playlistTracksCsv);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeUser = (user.id || 'spotify-user').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `audio-vault-package-${safeUser}-${stamp}.avault.zip`;

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(filename, blob);

  return {
    filename,
    summary: payload.summary
  };
}
