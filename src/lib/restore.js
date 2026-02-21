import {
  addTracksToPlaylist,
  createPlaylist,
  getAllPlaylists,
  getCurrentUser,
  saveLikedTracks
} from './spotifyApi.js';
import { decryptJsonPayload } from './cryptoVault.js';

function normalizeText(value) {
  return (value || '').trim().toLowerCase();
}

function playlistSignature(playlist) {
  return [
    normalizeText(playlist.name),
    normalizeText(playlist.description),
    String(Boolean(playlist.public))
  ].join('|');
}

export async function parseAndDecryptBackupFile(file, passphrase) {
  const text = await file.text();
  const bundle = JSON.parse(text);
  return decryptJsonPayload(bundle, passphrase);
}

export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid backup payload.');
  }

  if (!Array.isArray(payload.likedTracks)) {
    throw new Error('Backup payload missing likedTracks.');
  }

  if (!Array.isArray(payload.playlists)) {
    throw new Error('Backup payload missing playlists.');
  }

  return true;
}

export async function restoreFromPayload(payload, options = {}) {
  const {
    onProgress = () => {},
    onCounts = () => {},
    reuseExistingPlaylists = true
  } = options;

  validateBackupPayload(payload);

  const user = await getCurrentUser();
  let likedDone = 0;
  let playlistsDone = 0;

  onCounts({
    likedDone,
    likedTotal: payload.likedTracks.length,
    playlistsDone,
    playlistsTotal: payload.playlists.length
  });

  onProgress('Restoring liked songs...');
  await saveLikedTracks(payload.likedTracks, ({ completed, total }) => {
    likedDone = completed;
    onCounts({
      likedDone,
      likedTotal: total,
      playlistsDone,
      playlistsTotal: payload.playlists.length
    });
  });

  let existingBySignature = new Map();
  if (reuseExistingPlaylists) {
    onProgress('Checking existing playlists for duplicates...');
    const existingPlaylists = await getAllPlaylists();

    existingBySignature = new Map(
      existingPlaylists
        .filter((playlist) => playlist.owner?.id === user.id)
        .map((playlist) => [playlistSignature(playlist), playlist])
    );
  }

  const summary = {
    createdPlaylists: 0,
    reusedPlaylists: 0,
    tracksAdded: 0,
    likedRestored: payload.likedTracks.length
  };

  for (const playlist of payload.playlists) {
    const sig = playlistSignature(playlist);
    let targetPlaylist = null;

    if (reuseExistingPlaylists && existingBySignature.has(sig)) {
      targetPlaylist = existingBySignature.get(sig);
      summary.reusedPlaylists += 1;
      onProgress(`Reusing playlist: ${playlist.name}`);
    } else {
      onProgress(`Creating playlist: ${playlist.name}`);
      targetPlaylist = await createPlaylist({
        userId: user.id,
        name: playlist.name,
        description: playlist.description || '',
        isPublic: Boolean(playlist.public)
      });
      summary.createdPlaylists += 1;
      if (reuseExistingPlaylists) {
        existingBySignature.set(sig, targetPlaylist);
      }
    }

    const trackIds = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    if (trackIds.length > 0) {
      onProgress(`Adding tracks: ${playlist.name}`);
      await addTracksToPlaylist(targetPlaylist.id, trackIds, ({ completed, total }) => {
        onProgress(`Adding tracks: ${playlist.name} (${completed}/${total})`);
      });
      summary.tracksAdded += trackIds.length;
    }

    playlistsDone += 1;
    onCounts({
      likedDone,
      likedTotal: payload.likedTracks.length,
      playlistsDone,
      playlistsTotal: payload.playlists.length
    });
  }

  onProgress('Restore complete.');
  return summary;
}
