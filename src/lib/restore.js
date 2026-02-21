import { decryptJsonPayload } from './cryptoVault.js';

export async function parseAndDecryptBackupFile(file, passphrase) {
  const text = await file.text();
  const bundle = JSON.parse(text);
  return decryptJsonPayload(bundle, passphrase);
}
