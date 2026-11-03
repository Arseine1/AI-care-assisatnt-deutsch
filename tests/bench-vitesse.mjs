// Mesure de vitesse du rapport de garde (n8n + Ollama réels), pour comparer avant / après un réglage.
// Lancer : node tests/bench-vitesse.mjs [nombre d'essais] [chambre] [étiquette]
// Chaque essai appelle le webhook (Mode A, rapport de garde), puis lit au journal d'audit la durée du modèle, le nombre
// de faits envoyés et les mots générés. Le premier essai est « à froid » si le modèle n'est pas chargé.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appelN8n } from './lib/n8n.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const essais = Number(process.argv[2] ?? 2);
const chambre = process.argv[3] ?? '12';
const etiquette = process.argv[4] ?? 'essai';

const sql = (requete) => {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -t -A -F "|" -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { cwd: join(racine, 'compose'), input: requete, encoding: 'utf8' });
  return r.stdout.trim();
};

const lignes = [];
for (let i = 1; i <= essais; i++) {
  const t0 = Date.now();
  const rep = await appelN8n('http://localhost:5679/webhook/aicare-action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rapport_garde', chambre }),
  }).then((r) => r.json());
  const total = (Date.now() - t0) / 1000;
  const [duree, tokens, faits, retirees] = sql("select duree_ms, details->>'tokens', details->>'nb_faits', details->>'nb_phrases_retirees' from soins.journal_ia where evenement = 'generation' order by id desc limit 1;").split('|');
  const ligne = { etiquette, essai: i, chambre, total_s: Number(total.toFixed(1)), modele_s: Number((duree / 1000).toFixed(1)), n8n_hors_modele_s: Number((total - duree / 1000).toFixed(1)), tokens: Number(tokens), faits: Number(faits), phrases_retirees: Number(retirees ?? 0), mots_texte: rep.texte.split(/\s+/).length };
  lignes.push(ligne);
  console.log(JSON.stringify(ligne));
}
mkdirSync(join(racine, 'tests', 'resultats'), { recursive: true });
appendFileSync(join(racine, 'tests', 'resultats', 'vitesse.jsonl'), lignes.map((l) => JSON.stringify({ date: new Date().toISOString(), ...l })).join('\n') + '\n');
