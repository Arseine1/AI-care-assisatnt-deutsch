// Testaufrufe an die geschützten n8n-Webhooks (Schritt 7 von Tag 4): geheimer Schlüssel + Sitzung eines Demokontos.
// Die Werte stammen aus .env (nie im Repository gespeichert): AICARE_CLE_WEBHOOK und DEMO_PIN_<KONTO>.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(racine, '.env'), 'utf8');
export const lireEnv = (cle) => new RegExp(`^${cle}=(.*)$`, 'm').exec(env)?.[1]?.trim();

export const N8N = 'http://localhost:5679/webhook';
export const CLE = lireEnv('AICARE_CLE_WEBHOOK');
export const CLE_INTERNE = lireEnv('AICARE_CLE_INTERNE');

// Konto für die echten Versuche: `arsene` (Testkonto des Benutzers); mit AICARE_COMPTE_TEST=martin ändern.
export const COMPTE_TEST = process.env.AICARE_COMPTE_TEST || 'arsene';

// Öffnet eine Sitzung mit einem Testkonto; liefert { jeton, soignant }.
export async function ouvrirSession(identifiant = COMPTE_TEST, pin = lireEnv(`DEMO_PIN_${identifiant.toUpperCase()}`)) {
  const res = await fetch(`${N8N}/aicare-connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': CLE }, body: JSON.stringify({ identifiant, pin }) });
  const r = await res.json();
  if (!r.jeton) throw new Error(`Anmeldung abgelehnt für « ${identifiant} »: ${r.erreur ?? res.status}`);
  return r;
}

let session = null;
// fetch mit Schlüssel und Sitzung (einmal geöffnet, dann wiederverwendet). Gleiche Signatur wie fetch.
export async function appelN8n(url, init = {}) {
  session ??= await ouvrirSession();
  return fetch(url, { ...init, headers: { 'X-AICare-Cle': CLE, Authorization: `Bearer ${session.jeton}`, ...(init.headers ?? {}) } });
}
export const soignantDeTest = async () => (session ??= await ouvrirSession()).soignant;
