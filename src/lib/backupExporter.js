import { encryptJsonPayload } from './cryptoVault.js';

export function buildBackupPayload({ user, likedTrackIds, playlists }) {
  const playlistSummaries = playlists.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    description: playlist.description || '',
    public: Boolean(playlist.public),
    collaborative: Boolean(playlist.collaborative),
    ownerId: playlist.owner?.id || null,
    tracks: playlist.tracks || []
  }));

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    account: {
      id: user.id,
      displayName: user.display_name || '',
      country: user.country || ''
    },
    likedTracks: likedTrackIds,
    playlists: playlistSummaries,
    stats: {
      likedCount: likedTrackIds.length,
      playlistCount: playlistSummaries.length,
      playlistTrackCount: playlistSummaries.reduce((sum, p) => sum + p.tracks.length, 0)
    }
  };
}

function downloadBlob(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportEncryptedBackup({ user, likedTrackIds, playlists, passphrase }) {
  const payload = buildBackupPayload({ user, likedTrackIds, playlists });
  const encrypted = await encryptJsonPayload(payload, passphrase);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeUser = (user.id || 'spotify-user').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `audio-vault-${safeUser}-${stamp}.json.enc`;

  downloadBlob(filename, JSON.stringify(encrypted, null, 2));
  return payload.stats;
}
