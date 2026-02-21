export function getAppConfig() {
  return {
    appName: import.meta.env.VITE_APP_NAME || 'Audio Vault',
    spotifyClientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID || '',
    spotifyRedirectUri: import.meta.env.VITE_SPOTIFY_REDIRECT_URI || ''
  };
}
