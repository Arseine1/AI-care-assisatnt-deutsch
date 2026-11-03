// Boîte KIM simulée : envoie les 5 lettres de médecin (PDF en pièce jointe) dans Mailpit.
// KIM (courrier sécurisé entre soignants, Allemagne) reste simulé par Mailpit.
// Rejouable : supprime d'abord les anciens messages portant les mêmes objets (pas de doublons).
//
// Usage : node scripts/envoyer-kim.mjs [url]   (défaut : http://localhost:8025)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LETTRES, LETTRE_SCAN } from '../source/lettres.mjs';
import { MAISON } from '../source/residents.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAILPIT = (process.argv[2] || 'http://localhost:8025').replace(/\/$/, '');

async function api(chemin, options = {}) {
  const res = await fetch(`${MAILPIT}${chemin}`, options);
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${chemin} -> HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

try {
  await api('/api/v1/info');
} catch (e) {
  console.error(`Mailpit injoignable sur ${MAILPIT} (${e.message}). Lancez « docker compose up -d » dans compose/.`);
  process.exit(1);
}

let envoyees = 0;
for (const l of [...LETTRES, LETTRE_SCAN]) {
  // Nettoyage des envois précédents de la même lettre.
  const recherche = encodeURIComponent(`subject:"${l.objet}"`);
  await api(`/api/v1/search?query=${recherche}`, { method: 'DELETE' });

  const pdf = readFileSync(join(racine, 'lettres', l.fichier)).toString('base64');
  await api('/api/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      From: { Email: l.expediteur.email, Name: l.expediteur.nom },
      To: [{ Email: MAISON.kim, Name: MAISON.nom }],
      Subject: l.objet,
      Text: `Sehr geehrte Damen und Herren,\n\nanbei der Arztbrief zu Ihrem Bewohner (${l.patient}).\n\nMit freundlichen Grüßen\n${l.expediteur.nom}\n\n[KIM simuliert – Testdaten]`,
      Attachments: [{ Content: pdf, Filename: l.fichier }],
    }),
  });
  envoyees++;
  console.log(`envoyée : ${l.fichier}  (${l.attendu})`);
}

const { total } = await (await api('/api/v1/messages?limit=1')).json();
console.log(`${envoyees} lettres envoyées. Messages dans la boîte KIM simulée : ${total}.`);
