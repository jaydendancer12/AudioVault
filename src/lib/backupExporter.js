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

function imgTag(src, alt) {
  const safeAlt = escapeHtml(alt || 'image');
  if (!src) return '<div class="img-empty">-</div>';
  return `<img class="media" src="${escapeHtml(src)}" alt="${safeAlt}" loading="lazy" />`;
}

function buildLikedSongsCsv(likedSongs) {
  const rows = [
    ['track_id', 'track_uri', 'name', 'artists', 'album', 'cover_image', 'release_date', 'duration_ms', 'duration', 'explicit', 'is_local', 'added_at', 'spotify_url']
  ];

  for (const track of likedSongs) {
    rows.push([
      track.id,
      track.uri || '',
      track.name,
      (track.artists || []).join('; '),
      track.album,
      track.coverImage || '',
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

function buildSavedAlbumsCsv(savedAlbums) {
  const rows = [
    ['album_id', 'name', 'artists', 'cover_image', 'release_date', 'total_tracks', 'album_type', 'added_at', 'spotify_url']
  ];

  for (const album of savedAlbums) {
    rows.push([
      album.id,
      album.name,
      (album.artists || []).join('; '),
      album.coverImage || '',
      album.releaseDate,
      album.totalTracks,
      album.albumType,
      album.addedAt,
      album.spotifyUrl
    ]);
  }

  return csv(rows);
}

function buildFollowedArtistsCsv(followedArtists) {
  const rows = [['artist_id', 'name', 'profile_image', 'spotify_url']];

  for (const artist of followedArtists) {
    rows.push([artist.id, artist.name, artist.profileImage || '', artist.spotifyUrl]);
  }

  return csv(rows);
}

function buildReportHtml(payload) {
  const likedRows = payload.likedSongs
    .map(
      (track) => `
      <tr>
        <td>${imgTag(track.coverImage, track.name)}</td>
        <td>${escapeHtml(track.name)}</td>
        <td>${escapeHtml((track.artists || []).join(', '))}</td>
        <td>${escapeHtml(track.album)}</td>
        <td>${escapeHtml(track.releaseDate)}</td>
        <td>${msToMinSec(track.durationMs)}</td>
      </tr>`
    )
    .join('');

  const albumRows = payload.savedAlbums
    .map(
      (album) => `
      <tr>
        <td>${imgTag(album.coverImage, album.name)}</td>
        <td>${escapeHtml(album.name)}</td>
        <td>${escapeHtml((album.artists || []).join(', '))}</td>
        <td>${escapeHtml(album.releaseDate)}</td>
        <td>${album.totalTracks || 0}</td>
        <td>${escapeHtml(album.albumType)}</td>
      </tr>`
    )
    .join('');

  const artistRows = payload.followedArtists
    .map(
      (artist) => `
      <tr>
        <td>${imgTag(artist.profileImage, artist.name)}</td>
        <td>${escapeHtml(artist.name)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Audio Vault Report</title>
    <style>
      :root { --green: #1db954; --card: #181818; --text: #ffffff; --muted: #b3b3b3; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, system-ui, sans-serif; background: linear-gradient(160deg, #101010, #161616); color: var(--text); }
      main { max-width: 1120px; margin: 0 auto; padding: 28px 18px 48px; }
      .hero { padding: 18px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); background: radial-gradient(circle at right top, rgba(29,185,84,.2), transparent 45%), var(--card); }
      .kicker { color: var(--green); font-size: 12px; letter-spacing: 0.16em; margin: 0; font-weight: 700; }
      h1 { margin: 6px 0; }
      p { color: var(--muted); margin: 0; }
      .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
      .stat { padding: 14px; border-radius: 12px; background: #101010; border: 1px solid rgba(255,255,255,.08); }
      .stat.wide { grid-column: 1 / span 2; }
      .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
      .value { font-size: 26px; font-weight: 700; margin-top: 4px; }
      section { margin-top: 18px; border-radius: 14px; border: 1px solid rgba(255,255,255,.1); background: var(--card); overflow: hidden; }
      h2 { margin: 0; padding: 14px 14px 0; }
      .hint { padding: 0 14px 14px; color: var(--muted); font-size: 13px; }
      .table-wrap { overflow: auto; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 10px 12px; border-top: 1px solid rgba(255,255,255,.08); text-align: left; font-size: 14px; vertical-align: middle; }
      th { position: sticky; top: 0; background: #131313; font-size: 12px; color: var(--muted); letter-spacing: .05em; text-transform: uppercase; }
      .media { width: 42px; height: 42px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); display: block; }
      .img-empty { width: 42px; height: 42px; border-radius: 8px; background: #202020; color: #8a8a8a; display: grid; place-items: center; }
      footer { margin-top: 16px; color: var(--muted); font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <header class="hero">
        <p class="kicker">AUDIO VAULT LIBRARY REPORT</p>
        <h1>${escapeHtml(payload.account.displayName || payload.account.id)}</h1>
        <div class="stats">
          <div class="stat"><div class="label">Followed Artists</div><div class="value">${payload.summary.followedArtists}</div></div>
          <div class="stat"><div class="label">Saved Albums</div><div class="value">${payload.summary.savedAlbums}</div></div>
          <div class="stat wide"><div class="label">Liked Songs</div><div class="value">${payload.summary.likedSongs}</div></div>
        </div>
      </header>

      <section>
        <h2>Followed Artists</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Image</th><th>Artist</th></tr></thead>
            <tbody>${artistRows}</tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Saved Albums</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cover</th><th>Album</th><th>Artists</th><th>Release</th><th>Tracks</th><th>Type</th></tr></thead>
            <tbody>${albumRows}</tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Liked Songs</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cover</th><th>Track</th><th>Artists</th><th>Album</th><th>Release</th><th>Length</th></tr></thead>
            <tbody>${likedRows}</tbody>
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

export function buildLibrarySnapshotPayload({ user, likedSongs, savedAlbums, followedArtists }) {
  const sortedLikedSongs = [...likedSongs].sort(byArtistThenTitleAsc);
  const sortedSavedAlbums = [...savedAlbums].sort(byNameAsc);
  const sortedArtists = [...followedArtists].sort(byNameAsc);

  return {
    schemaVersion: 5,
    createdAt: new Date().toISOString(),
    source: 'spotify',
    account: {
      id: user.id,
      displayName: user.display_name || '',
      country: user.country || ''
    },
    summary: {
      followedArtists: sortedArtists.length,
      savedAlbums: sortedSavedAlbums.length,
      likedSongs: sortedLikedSongs.length
    },
    followedArtists: sortedArtists,
    savedAlbums: sortedSavedAlbums,
    likedSongs: sortedLikedSongs
  };
}

export async function exportLibrarySnapshot({ user, likedSongs, savedAlbums, followedArtists }) {
  const payload = buildLibrarySnapshotPayload({ user, likedSongs, savedAlbums, followedArtists });

  const libraryJson = JSON.stringify(payload, null, 2);
  const likedSongsCsv = buildLikedSongsCsv(payload.likedSongs);
  const savedAlbumsCsv = buildSavedAlbumsCsv(payload.savedAlbums);
  const followedArtistsCsv = buildFollowedArtistsCsv(payload.followedArtists);
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
      followedArtistsCsv: 'followed_artists.csv',
      savedAlbumsCsv: 'saved_albums.csv',
      likedSongsCsv: 'liked_songs.csv'
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
  zip.file('followed_artists.csv', followedArtistsCsv);
  zip.file('saved_albums.csv', savedAlbumsCsv);
  zip.file('liked_songs.csv', likedSongsCsv);

  const cleanName = (user.display_name || user.id || 'spotify-user').replace(/[^a-zA-Z0-9_-]/g, '_');
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `AudioVault_Backup_${cleanName}_${stamp}.zip`;

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(filename, blob);

  return {
    filename,
    summary: payload.summary
  };
}
