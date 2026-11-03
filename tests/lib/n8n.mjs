// Appels de test vers les webhooks n8n protégés (étape 7 du jour 4) : clé secrète + session d'un compte de démonstration.
// Les valeurs viennent de .env (jamais écrites dans le dépôt) : AICARE_CLE_WEBHOOK et DEMO_PIN_<COMPTE>.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(racine, '.env'), 'utf8');
export const lireEnv = (cle) => new RegExp(`^${cle}=(.*)$`, 'm').exec(env)?.[1]?.trim();

export const N8N = 'http://localhost:5679/webhook';
export const CLE = lireEnv('AICARE_CLE_WEBHOOK');
export const CLE_INTERNE = lireEnv('AICARE_CLE_INTERNE');

// Compte utilisé par les essais réels : `arsene` (compte de test de l'utilisateur) ; AICARE_COMPTE_TEST=martin pour en changer.
export const COMPTE_TEST = process.env.AICARE_COMPTE_TEST || 'arsene';

// Ouvre une session avec un compte de test ; renvoie { jeton, soignant }.
export async function ouvrirSession(identifiant = COMPTE_TEST, pin = lireEnv(`DEMO_PIN_${identifiant.toUpperCase()}`)) {
  const res = await fetch(`${N8N}/aicare-connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AICare-Cle': CLE }, body: JSON.stringify({ identifiant, pin }) });
  const r = await res.json();
  if (!r.jeton) throw new Error(`connexion refusée pour « ${identifiant} » : ${r.erreur ?? res.status}`);
  return r;
}

let session = null;
// fetch avec la clé et la session (ouverte une fois, puis réutilisée). Même signature que fetch.
export async function appelN8n(url, init = {}) {
  session ??= await ouvrirSession();
  return fetch(url, { ...init, headers: { 'X-AICare-Cle': CLE, Authorization: `Bearer ${session.jeton}`, ...(init.headers ?? {}) } });
}
export const soignantDeTest = async () => (session ??= await ouvrirSession()).soignant;
