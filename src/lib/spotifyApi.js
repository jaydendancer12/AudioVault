import { SPOTIFY_API_BASE } from './config.js';
import { getValidAccessToken, logout } from './spotifyAuth.js';

const MAX_RETRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelayMs(response) {
  const retryAfter = Number(response.headers.get('Retry-After'));
  if (!Number.isNaN(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return 1250;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function spotifyFetch(path, options = {}, attempt = 0) {
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

  if (response.status === 429 && attempt < MAX_RETRIES) {
    const delay = parseRetryDelayMs(response);
    await sleep(delay);
    return spotifyFetch(path, options, attempt + 1);
  }

  if (response.status >= 500 && response.status <= 599 && attempt < MAX_RETRIES) {
    await sleep(1000 * (attempt + 1));
    return spotifyFetch(path, options, attempt + 1);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify API error ${response.status}: ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
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
    const page = await spotifyFetch(
      `/playlists/${playlistId}/tracks?fields=items(track(id)),next&limit=${limit}&offset=${offset}`
    );

    for (const item of page.items || []) {
      if (item?.track?.id) ids.push(item.track.id);
    }

    if (!page.next) break;
    offset += limit;
  }

  return ids;
}

export async function saveLikedTracks(trackIds, onProgress) {
  const validTrackIds = Array.from(new Set(trackIds.filter(Boolean)));
  const groups = chunk(validTrackIds, 50);
  let completed = 0;

  for (const group of groups) {
    await spotifyFetch('/me/tracks', {
      method: 'PUT',
      body: JSON.stringify({ ids: group })
    });

    completed += group.length;
    if (onProgress) {
      onProgress({
        completed,
        total: validTrackIds.length,
        batchSize: group.length
      });
    }
  }
}

export async function createPlaylist({ userId, name, description = '', isPublic = false }) {
  return spotifyFetch(`/users/${encodeURIComponent(userId)}/playlists`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      description,
      public: isPublic
    })
  });
}

export async function addTracksToPlaylist(playlistId, trackIds, onProgress) {
  const uris = trackIds.filter(Boolean).map((id) => `spotify:track:${id}`);
  const groups = chunk(uris, 100);
  let completed = 0;

  for (const group of groups) {
    await spotifyFetch(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: group })
    });

    completed += group.length;
    if (onProgress) {
      onProgress({
        completed,
        total: uris.length,
        batchSize: group.length
      });
    }
  }
}
