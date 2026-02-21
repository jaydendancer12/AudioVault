import { getAppConfig } from '../lib/config.js';

export function bootstrap() {
  const cfg = getAppConfig();
  const root = document.getElementById('app');

  root.innerHTML = `
    <main class="layout">
      <header class="hero">
        <p class="kicker">LOCAL-FIRST SPOTIFY BACKUP</p>
        <h1>${cfg.appName}</h1>
        <p class="subtitle">Encrypted backups for liked songs and playlists.</p>
      </header>

      <section class="card">
        <h2>Build Status</h2>
        <p>Scaffold complete. Next: Spotify auth + backup engine.</p>
        <button class="cta" disabled>Connect Spotify (next)</button>
      </section>
    </main>
  `;
}
