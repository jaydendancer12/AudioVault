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

---
