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

export function buildLibrarySnapshotPayload({ user, likedSongs, playlists, followedArtists }) {
  const sortedLikedSongs = [...likedSongs].sort(byArtistThenTitleAsc);
  const sortedArtists = [...followedArtists].sort(byNameAsc);
  const sortedPlaylists = [...playlists]
    .map((playlist) => ({
      ...playlist,
      tracks: [...(playlist.tracks || [])]
    }))
    .sort(byNameAsc);

  return {
    version: 1,
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

function downloadBlob(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportLibrarySnapshot({ user, likedSongs, playlists, followedArtists }) {
  const payload = buildLibrarySnapshotPayload({
    user,
    likedSongs,
    playlists,
    followedArtists
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeUser = (user.id || 'spotify-user').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `audio-vault-library-${safeUser}-${stamp}.json`;

  downloadBlob(filename, JSON.stringify(payload, null, 2));
  return {
    filename,
    summary: payload.summary
  };
}
