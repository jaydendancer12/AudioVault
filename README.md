# Audio Vault

Audio Vault exports your Spotify library into a clean, local backup package so you can keep a readable record of your music data.

It currently exports 3 collections:
- Followed Artists
- Saved Albums
- Liked Songs

[insert screenshot of main app page showing Connect Spotify + Download buttons here]

## What Audio Vault does
1. You connect your Spotify account with OAuth (PKCE).
2. Audio Vault reads your library data from Spotify.
3. It downloads a ZIP package to your device.
4. You open `index.html` in that ZIP for a visual report, or use the CSV files for spreadsheets/analysis.

[insert screenshot of connected state and terminal status output here]

## What gets downloaded
The app downloads a ZIP named like:
- `AudioVault_Backup_<username>_<YYYY-MM-DD>.zip`

Inside that ZIP:
- `index.html` (visual report with all extracted records)
- `Lists/followed_artists.csv`
- `Lists/albums.csv`
- `Lists/liked_songs.csv`
- `ignore/manifest.json`
- `ignore/library.json`
- `ignore/favicon.ico`
- `ignore/favicon-32x32.png`
- `ignore/android-chrome-192x192.png`

`index.html` is meant for normal users.
CSV files are for Excel/Google Sheets.
JSON files are for technical/reference use.

[insert screenshot of unzipped folder structure here]

## How to use the downloaded ZIP
1. Unzip the downloaded file.
2. Open `index.html` in your browser.
3. Scroll the three full sections:
- Followed Artists
- Saved Albums
- Liked Songs
4. If you need spreadsheet workflows, open files in `Lists/`.

[insert screenshot of index.html report header + stats cards here]
[insert screenshot of one full table (liked songs) showing images + columns here]

## Local development setup
1. Install dependencies:
- `npm install`
2. Create `.env` in the project root:
- `VITE_APP_NAME=Audio Vault`
- `VITE_SPOTIFY_CLIENT_ID=YOUR_SPOTIFY_CLIENT_ID`
- `VITE_SPOTIFY_REDIRECT_URI=http://localhost:5173/callback`
3. Run locally:
- `npm run dev`
4. Open:
- `http://localhost:5173`

Important:
- Do not put `client_secret` in this frontend app.
- `VITE_` values are public in the browser bundle by design.

[insert screenshot of Spotify Developer Dashboard redirect URI settings here]

## Spotify app settings (required)
In Spotify Developer Dashboard for your app, add redirect URIs you actually use:
- `http://localhost:5173/callback`
- `http://127.0.0.1:5173/callback` (optional, only if you run this host)
- `https://YOUR_DOMAIN/callback` (for production)

If you get `INVALID_CLIENT: Invalid redirect URI`, your redirect URI does not exactly match your Spotify app settings.

## Deploy (free) with Vercel
1. Push this repo to GitHub.
2. Import repo in Vercel.
3. Add environment variables in Vercel project settings:
- `VITE_APP_NAME`
- `VITE_SPOTIFY_CLIENT_ID`
- `VITE_SPOTIFY_REDIRECT_URI` (your production callback URL)
4. Deploy.
5. Add the deployed callback URL in Spotify Dashboard redirect URIs.

[insert screenshot of Vercel environment variables page here]

## Troubleshooting
- `Missing Spotify env values`: your env vars are missing/misnamed.
- `INVALID_CLIENT`: callback URL mismatch in Spotify Dashboard.
- `403 Forbidden`: re-login and re-approve scopes; in Spotify Dev Mode, ensure your account is allowed for the app.
- Connected on Spotify but app still shows disconnected: check callback path (`/callback`) and deploy rewrites for SPA routing.

## Privacy model
- Audio Vault is local-first.
- Exports are downloaded directly to the user's device.
- No app database is required for this flow.

