# Audio Vault Project Outline

## Product Goal
Provide a near-zero-cost, secure, local-first Spotify backup and restore web app.

## Non-Negotiables
1. No server-side data storage in MVP.
2. Encryption before writing backup files.
3. Clear user messaging about backup limitations.
4. Spotify design language (dark UI + green accent).

## Scope (MVP)
1. Login with Spotify (PKCE)
2. Read liked songs and playlists (with pagination)
3. Serialize backup payload
4. Encrypt payload with passphrase
5. Download encrypted file + metadata checksum
6. Restore by decrypting file and replaying API writes

## Data Model (backup payload)
- `version`
- `createdAt`
- `account`: `id`, `displayName`
- `likedTracks`: array of track IDs
- `playlists`: array
  - `name`
  - `description`
  - `public`
  - `tracks`: ordered track IDs
- `stats`
  - `likedCount`
  - `playlistCount`
  - `trackCount`

## Architecture
- Frontend: Vite + vanilla JS + CSS
- OAuth: Spotify Authorization Code with PKCE
- Storage: local file download (`.json.enc`)
- Crypto: Web Crypto API AES-GCM + PBKDF2

## User Flow
1. Connect Spotify
2. Review account and library counts
3. Enter passphrase and generate encrypted backup
4. Save file locally
5. Later: upload file + passphrase to restore

## Milestones
1. Auth and token lifecycle
2. Fetch + pagination utilities
3. Encryption/decryption module
4. Backup file generator and downloader
5. Restore engine + progress tracker
6. UI polish + PWA basics

## Risks / Constraints
1. Spotify Development Mode user cap limits distribution.
2. Restore can be slow for large libraries due to rate limits.
3. Exact historical listening minutes are out of scope for this product.

## Out of Scope (MVP)
1. YouTube Music migration connector
2. Automatic scheduled backups when app is closed
3. Cloud storage sync
