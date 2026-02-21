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
  if (!track) return null;
  const key = track.id || track.uri;
  if (!key) return null;
  return {
    id: track.id || '',
    uri: track.uri || '',
    key,
    name: track.name || (track.is_local ? 'Local File' : 'Unavailable Track'),
    artists: (track.artists || []).map((artist) => artist.name).filter(Boolean),
    album: track.album?.name || '',
    coverImage: track.album?.images?.[0]?.url || '',
    releaseDate: track.album?.release_date || '',
    durationMs: track.duration_ms || 0,
    explicit: Boolean(track.explicit),
    spotifyUrl: track.external_urls?.spotify || '',
    isLocal: Boolean(track.is_local)
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

export async function getAllSavedAlbumsDetailed() {
  const albums = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const page = await spotifyFetch(`/me/albums?limit=${limit}&offset=${offset}`);
    for (const item of page.items || []) {
      const album = item?.album;
      if (!album?.id) continue;

      albums.push({
        id: album.id,
        name: album.name || '',
        artists: (album.artists || []).map((artist) => artist.name).filter(Boolean),
        coverImage: album.images?.[0]?.url || '',
        releaseDate: album.release_date || '',
        totalTracks: album.total_tracks || 0,
        albumType: album.album_type || '',
        addedAt: item.added_at || '',
        spotifyUrl: album.external_urls?.spotify || ''
      });
    }

    if (!page.next) break;
    offset += limit;
  }

  return albums;
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
        profileImage: artist.images?.[0]?.url || '',
        spotifyUrl: artist.external_urls?.spotify || ''
      });
    }

    if (!page?.next || items.length === 0) break;
    after = items[items.length - 1].id;
  }

  return artists;
}

// Legacy exports kept for compatibility with previous code paths.
export async function getAllLikedTrackIds() {
  const tracks = await getAllLikedTracksDetailed();
  return tracks.map((track) => track.id);
}

export async function getPlaylistTrackIds() {
  return [];
}

export async function saveLikedTracks() {
  return null;
}

export async function createPlaylist() {
  return null;
}

export async function addTracksToPlaylist() {
  return null;
}
