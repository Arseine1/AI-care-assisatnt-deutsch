// Essais des prompts avec le VRAI modèle (Ollama) : lent (3 à 6 minutes par cas avec Llama 3.2 sur un petit poste).
// Chaque cas de prompts/tests/*.json passe par le même template et les mêmes contrôles que la production ;
// le texte est généré avec les mêmes réglages que le nœud « rédiger » (température 0,1, graine fixe, pénalité de répétition).
//
// Usage : node tests/prompts-live.mjs [prompt_id] [numéro de cas 1-3]
//         node tests/prompts-live.mjs generer_sbar 1        un seul cas
//         node tests/prompts-live.mjs                       les 18 cas (très long)
// Modèle : AICARE_MODELE (défaut : celui intégré aux workflows).
// Verdict : le cas est RÉUSSI si le texte contient ce qu'il doit, ne contient pas ce qu'il ne doit pas, et
// (pour les JSON) respecte les chemins attendus. Les avertissements des contrôles sont rapportés, sans faire échouer.
import http from 'node:http';
import { IDS_PROMPTS, chargerCas, assembler, controler, verifierAttendu, lancer, jsCode, entreeTemplate } from './lib/prompts-harness.mjs';

const OLLAMA = process.env.OLLAMA_URL_HOTE || 'http://localhost:11434';
const [idDemande, numero] = process.argv.slice(2);

// Requête POST sans délai d'attente : le fetch de Node abandonne après 5 minutes, ce que Llama 3 (8 milliards) dépasse sur un petit poste.
function postJson(url, corps) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 0 }, (res) => {
      const morceaux = [];
      res.on('data', (m) => morceaux.push(m));
      res.on('end', () => {
        const texte = Buffer.concat(morceaux).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error(`Ollama : HTTP ${res.statusCode} ${texte.slice(0, 200)}`));
        resolve(JSON.parse(texte));
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(corps));
  });
}
const ids = idDemande ? [idDemande] : IDS_PROMPTS;

let reussis = 0;
let total = 0;
for (const id of ids) {
  const { cas } = chargerCas(id);
  for (let i = 0; i < cas.length; i++) {
    if (numero && Number(numero) !== i + 1) continue;
    const c = cas[i];
    const t = assembler(c, id);
    // même corps de requête que le nœud « Préparer appel »
    const e = entreeTemplate(c, id);
    const appel = lancer(jsCode('62-brique-rediger.json', 'Préparer appel'), { entree: { ...t, faits: e.faits, patient: e.patient, autres: e.autres } })[0];
    if (process.env.AICARE_MODELE) appel.body.model = process.env.AICARE_MODELE; // essai avec un autre modèle
    const debut = Date.now();
    const rep = await postJson(`${OLLAMA}/api/generate`, appel.body);
    const texte = String(rep.response ?? '').trim();
    const controle = controler(texte, c, t, id, { done_reason: rep.done_reason, total_duration: rep.total_duration, eval_count: rep.eval_count });
    const echecs = verifierAttendu(texte, c.attendu, controle, { strictAvertissements: false });
    total++;
    if (!echecs.length) reussis++;
    console.log(`\n=== ${id} v${t.prompt_version} / ${c.type} : ${c.nom}`);
    console.log(`    modèle ${appel.body.model} | ${Math.round((Date.now() - debut) / 1000)} s | ${rep.eval_count} tokens`);
    console.log(`    verdict : ${echecs.length ? 'ÉCHEC – ' + echecs.join(' | ') : 'RÉUSSI'}`);
    console.log(`    avertissements des contrôles : ${controle.avertissements.length ? controle.avertissements.map((a) => a.type).join(', ') : 'aucun'}`);
    console.log(texte.split('\n').map((l) => `    | ${l}`).join('\n'));
  }
}
console.log(`\n${reussis}/${total} cas réussis avec le modèle.`);
process.exit(reussis === total ? 0 : 1);
