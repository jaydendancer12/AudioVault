# Audio Vault

Audio Vault is a local-first web app that lets users securely back up and restore their Spotify liked songs and playlists.

## Core Principles
- Local-first: music metadata is exported to the user's device.
- Privacy-first: encrypted backups using Web Crypto AES-GCM.
- No backend required for MVP.
- Spotify-only in v1, cross-platform connectors in v2+.

## MVP Features
1. Spotify OAuth (Authorization Code + PKCE)
2. Fetch liked songs + playlists
3. Export encrypted backup file (`.json.enc`)
4. Restore flow to re-like songs and recreate playlists
5. Spotify-themed dashboard with backup status and history

## Security Note
Do **not** place Spotify `client_secret` in this frontend app. For a public SPA using PKCE, only `client_id` is used in browser.

## Local Setup
1. `npm install`
2. Copy `.env.example` to `.env`
3. Fill required values
4. `npm run dev`

## Environment Variables
- `VITE_SPOTIFY_CLIENT_ID`
- `VITE_SPOTIFY_REDIRECT_URI`
- `VITE_APP_NAME`

## Next Build Targets
- Implement `src/lib/spotifyAuth.js`
- Implement `src/lib/spotifyApi.js`
- Implement encryption in `src/lib/cryptoVault.js`
- Implement export/import in `src/lib/backupExporter.js` and `src/lib/restore.js`
