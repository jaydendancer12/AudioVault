import { SPOTIFY_API_BASE } from './config.js';
import { getValidAccessToken, logout } from './spotifyAuth.js';

const MAX_RETRIES = 5;

export class SpotifyHttpError extends Error {
  constructor({ status, path, body }) {
    super(`Spotify API ${status} at ${path}: ${body || 'No body'}`);
    this.name = 'SpotifyHttpError';
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

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
    throw new SpotifyHttpError({ status: response.status, path, body: text });
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

function mapTrack(track) {
  if (!track?.id) return null;
  return {
    id: track.id,
    name: track.name || '',
    artists: (track.artists || []).map((artist) => artist.name).filter(Boolean),
    album: track.album?.name || '',
    releaseDate: track.album?.release_date || '',
    durationMs: track.duration_ms || 0,
    explicit: Boolean(track.explicit),
    spotifyUrl: track.external_urls?.spotify || ''
  };
}

export async function getCurrentUser() {
  return spotifyFetch('/me');
}

export async function getAllLikedTracksDetailed() {
  const tracks = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const page = await spotifyFetch(`/me/tracks?limit=${limit}&offset=${offset}`);
    for (const item of page.items || []) {
      const mapped = mapTrack(item?.track);
      if (mapped) {
        tracks.push({ ...mapped, addedAt: item.added_at || '' });
      }
    }

    if (!page.next) break;
    offset += limit;
  }

  return tracks;
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

export async function getPlaylistTracksDetailed(playlistId) {
  const tracks = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const page = await spotifyFetch(
      `/playlists/${playlistId}/tracks?fields=items(added_at,track(id,name,artists(name),album(name,release_date),duration_ms,explicit,external_urls(spotify))),next&limit=${limit}&offset=${offset}`
    );

    for (const item of page.items || []) {
      const mapped = mapTrack(item?.track);
      if (mapped) {
        tracks.push({ ...mapped, addedAt: item.added_at || '' });
      }
    }

    if (!page.next) break;
    offset += limit;
  }

  return tracks;
}

export async function getAllFollowedArtists() {
  const artists = [];
  let after = null;
  const limit = 50;

  while (true) {
    const query = after
      ? `/me/following?type=artist&limit=${limit}&after=${encodeURIComponent(after)}`
      : `/me/following?type=artist&limit=${limit}`;

    const payload = await spotifyFetch(query);
    const page = payload?.artists;
    const items = page?.items || [];

    for (const artist of items) {
      if (!artist?.id) continue;
      artists.push({
        id: artist.id,
        name: artist.name || '',
        genres: artist.genres || [],
        popularity: artist.popularity || 0,
        followers: artist.followers?.total || 0,
        spotifyUrl: artist.external_urls?.spotify || ''
      });
    }

    if (!page?.next || items.length === 0) break;
    after = items[items.length - 1].id;
  }

  return artists;
}

export async function getAllLikedTrackIds() {
  const tracks = await getAllLikedTracksDetailed();
  return tracks.map((track) => track.id);
}

export async function getPlaylistTrackIds(playlistId) {
  const tracks = await getPlaylistTracksDetailed(playlistId);
  return tracks.map((track) => track.id);
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
      onProgress({ completed, total: validTrackIds.length, batchSize: group.length });
    }
  }
}

export async function createPlaylist({ userId, name, description = '', isPublic = false }) {
  return spotifyFetch(`/users/${encodeURIComponent(userId)}/playlists`, {
    method: 'POST',
    body: JSON.stringify({ name, description, public: isPublic })
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
      onProgress({ completed, total: uris.length, batchSize: group.length });
    }
  }
}
