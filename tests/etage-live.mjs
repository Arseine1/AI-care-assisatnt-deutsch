// ECHTER Ende-zu-Ende-Test (n8n + Sprachmodell + Qdrant + Mailpit): Dienstbericht einer Etage,
import { appelN8n } from './lib/n8n.mjs';
// Bestätigung des Stapels, Hinzufügen zum RAG, Weitergabe. Lang (mehrere Minuten je Bewohner auf einem Rechner ohne Grafikkarte).
// Start: node tests/etage-live.mjs [Etage]   (n8n, Qdrant, Mailpit und Ollama gestartet)
const etage = Number(process.argv[2] ?? 2);
const N8N = 'http://localhost:5679/webhook';
const post = async (chemin, corps) => {
  const r = await appelN8n(`${N8N}/${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  if (!r.ok) throw new Error(`${chemin} -> HTTP ${r.status}`);
  return r.json();
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const debut = Date.now();
const minutes = () => ((Date.now() - debut) / 60000).toFixed(1);

const { tache_id, total } = await post('aicare-etage', { etage });
console.log(`Aufgabe ${tache_id}: ${total} Bewohner auf Etage ${etage}`);
let t;
let vu = -1;
for (;;) {
  await pause(10000);
  t = await post('aicare-tache', { tache_id });
  if (t.fait !== vu) { vu = t.fait; console.log(`[${minutes()} Min.] ${t.fait}/${t.total} – ${t.statut}`); }
  if (t.statut !== 'en_cours') break;
}
for (const r of t.resultat) {
  console.log(`\n--- Zimmer ${r.chambre} – ${r.resident}`);
  if (r.erreur) { console.log(`FEHLER: ${r.erreur}`); continue; }
  console.log(r.texte);
  console.log(`Quellen: ${r.sources.join(', ')}`);
  console.log(`Warnungen: ${r.avertissements.map((a) => a.type).join(', ') || 'keine'}`);
}
const rapports = t.resultat.filter((r) => r.brouillon_id).map((r) => ({ brouillon_id: r.brouillon_id, texte: r.texte }));
if (!rapports.length) { console.log('\nKein Bericht zu bestätigen.'); process.exit(1); }

console.log(`\nBestätigung des Stapels (${rapports.length} Berichte)…`);
const lot = await post('aicare-valider-lot', { etage, rapports, valide_par: 'Pflegekraft Test' });
console.log(JSON.stringify(lot, null, 2));

console.log('\nZweite Bestätigung desselben Stapels (muss abgelehnt werden):');
const encore = await post('aicare-valider-lot', { etage, rapports, valide_par: 'Pflegekraft Test' });
console.log(JSON.stringify({ ok: encore.ok, nb_valides: encore.nb_valides, refuses: encore.refuses.length }));

const mails = await (await fetch('http://localhost:8025/api/v1/messages?limit=5')).json();
console.log('\nMailpit (letzte Nachrichten):');
for (const m of mails.messages) console.log(`- ${m.Subject} -> ${m.To.map((x) => x.Address).join(', ')}`);
const q = await (await fetch('http://localhost:6335/collections/patients/points/count', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ exact: true, filter: { must: [{ key: 'type', match: { value: 'rapport_valide' } }] } }),
})).json();
console.log(`\nQdrant: ${q.result?.count} Punkt(e) vom Typ rapport_valide`);
console.log(`\nFertig in ${minutes()} Min.`);
