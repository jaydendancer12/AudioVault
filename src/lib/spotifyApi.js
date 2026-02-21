import { SPOTIFY_API_BASE } from './config.js';
import { getValidAccessToken, logout } from './spotifyAuth.js';

async function spotifyFetch(path, options = {}) {
  const token = await getValidAccessToken();
  const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    logout();
    throw new Error('Spotify session expired. Please sign in again.');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify API error ${response.status}: ${text}`);
  }

  return response.json();
}

export async function getCurrentUser() {
  return spotifyFetch('/me');
}

export async function getAllLikedTrackIds() {
  const trackIds = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const page = await spotifyFetch(`/me/tracks?limit=${limit}&offset=${offset}`);
    for (const item of page.items || []) {
      if (item?.track?.id) trackIds.push(item.track.id);
    }

    if (!page.next) break;
    offset += limit;
  }

  return trackIds;
}

export async function getAllPlaylists() {
  const playlists = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const page = await spotifyFetch(`/me/playlists?limit=${limit}&offset=${offset}`);
    playlists.push(...(page.items || []));

    if (!page.next) break;
    offset += limit;
  }

  return playlists;
}

export async function getPlaylistTrackIds(playlistId) {
  const ids = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const page = await spotifyFetch(`/playlists/${playlistId}/tracks?fields=items(track(id)),next&limit=${limit}&offset=${offset}`);

    for (const item of page.items || []) {
      if (item?.track?.id) ids.push(item.track.id);
    }

    if (!page.next) break;
    offset += limit;
  }

  return ids;
}
