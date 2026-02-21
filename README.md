# Audio Vault

Audio Vault exports your Spotify library into a clean, local backup package so you can keep a readable record of your music data.

It currently exports 3 collections:
- Followed Artists
- Saved Albums
- Liked Songs

<img width="1470" height="812" alt="App" src="https://github.com/user-attachments/assets/c4bd9a77-f1a1-4a8a-b50c-421c74c72fd6" />

## What Audio Vault does
1. You connect your Spotify account with OAuth (PKCE).
2. Audio Vault reads your library data from Spotify.
3. It downloads a ZIP package to your device.
4. You open `index.html` in that ZIP for a visual report, or use the CSV files for spreadsheets/analysis.

<img width="782" height="74" alt="Output" src="https://github.com/user-attachments/assets/d6578a7d-feb7-445c-b276-bb5de1ceb722" />

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

<img width="532" height="172" alt="Structure" src="https://github.com/user-attachments/assets/5369e538-fbdd-4927-bd33-1b672fb88e85" />

## How to use the downloaded ZIP
1. Unzip the downloaded file.
2. Open `index.html` in your browser.
3. Scroll the three full sections:
- Followed Artists
- Saved Albums
- Liked Songs
4. If you need spreadsheet workflows, open files in `Lists/`.

<img width="1105" height="313" alt="Header" src="https://github.com/user-attachments/assets/e4ded049-846a-4f7e-8c93-eb6bcec9144a" />

<img width="1080" height="754" alt="Liked" src="https://github.com/user-attachments/assets/52ad9bf4-ecf3-4e1d-8605-0ac0728bc5b4" />

---
