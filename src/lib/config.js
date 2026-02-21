const DEFAULT_SCOPES = [
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private'
];

export function getAppConfig() {
  return {
    appName: import.meta.env.VITE_APP_NAME || 'Audio Vault',
    spotifyClientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID || '',
    spotifyRedirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI || '',
    spotifyScopes: DEFAULT_SCOPES
  };
}

export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
export const SPOTIFY_AUTH_BASE = 'https://accounts.spotify.com';
