// Essai RÉEL de bout en bout (n8n + modèle de langue + Qdrant + Mailpit) : rapport de garde d'un étage,
import { appelN8n } from './lib/n8n.mjs';
// validation du lot, ajout au RAG, transmission. Long (plusieurs minutes par résident sur un poste sans carte graphique).
// Lancer : node tests/etage-live.mjs [étage]   (n8n, Qdrant, Mailpit et Ollama démarrés)
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
console.log(`tâche ${tache_id} : ${total} résident(s) à l'étage ${etage}`);
let t;
let vu = -1;
for (;;) {
  await pause(10000);
  t = await post('aicare-tache', { tache_id });
  if (t.fait !== vu) { vu = t.fait; console.log(`[${minutes()} min] ${t.fait}/${t.total} – ${t.statut}`); }
  if (t.statut !== 'en_cours') break;
}
for (const r of t.resultat) {
  console.log(`\n--- chambre ${r.chambre} – ${r.resident}`);
  if (r.erreur) { console.log(`ERREUR : ${r.erreur}`); continue; }
  console.log(r.texte);
  console.log(`sources : ${r.sources.join(', ')}`);
  console.log(`avertissements : ${r.avertissements.map((a) => a.type).join(', ') || 'aucun'}`);
}
const rapports = t.resultat.filter((r) => r.brouillon_id).map((r) => ({ brouillon_id: r.brouillon_id, texte: r.texte }));
if (!rapports.length) { console.log('\nAucun rapport à valider.'); process.exit(1); }

console.log(`\nValidation du lot (${rapports.length} rapports)…`);
const lot = await post('aicare-valider-lot', { etage, rapports, valide_par: 'IDE Essai (test)' });
console.log(JSON.stringify(lot, null, 2));

console.log('\nSeconde validation du même lot (doit être refusée) :');
const encore = await post('aicare-valider-lot', { etage, rapports, valide_par: 'IDE Essai (test)' });
console.log(JSON.stringify({ ok: encore.ok, nb_valides: encore.nb_valides, refuses: encore.refuses.length }));

const mails = await (await fetch('http://localhost:8025/api/v1/messages?limit=5')).json();
console.log('\nMailpit (derniers messages) :');
for (const m of mails.messages) console.log(`- ${m.Subject} -> ${m.To.map((x) => x.Address).join(', ')}`);
const q = await (await fetch('http://localhost:6335/collections/patients/points/count', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ exact: true, filter: { must: [{ key: 'type', match: { value: 'rapport_valide' } }] } }),
})).json();
console.log(`\nQdrant : ${q.result?.count} point(s) de type rapport_valide`);
console.log(`\nTerminé en ${minutes()} min.`);
