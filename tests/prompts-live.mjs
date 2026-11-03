// Versuche der Prompts mit dem ECHTEN Modell (Ollama): langsam (3 bis 6 Minuten pro Fall mit Llama 3.2 auf einem kleinen Rechner).
// Jeder Fall aus prompts/tests/*.json durchläuft dieselbe Vorlage und dieselben Kontrollen wie die Produktion;
// der Text wird mit denselben Einstellungen erzeugt wie der Knoten « Verfassen » (Temperatur 0,1, feste Zufallszahl, Wiederholungsstrafe).
//
// Aufruf: node tests/prompts-live.mjs [prompt_id] [Fallnummer 1-3]
//         node tests/prompts-live.mjs generer_sbar 1        nur ein Fall
//         node tests/prompts-live.mjs                       alle 18 Fälle (sehr lang)
// Modell: AICARE_MODELE (Standard: das in die Workflows eingebettete).
// Urteil: Der Fall ist BESTANDEN, wenn der Text enthält, was er enthalten muss, nicht enthält, was er nicht enthalten darf, und
// (bei JSON) die erwarteten Pfade einhält. Die Warnungen der Kontrollen werden berichtet, ohne den Fall scheitern zu lassen.
import http from 'node:http';
import { IDS_PROMPTS, chargerCas, assembler, controler, verifierAttendu, lancer, jsCode, entreeTemplate } from './lib/prompts-harness.mjs';

const OLLAMA = process.env.OLLAMA_URL_HOTE || 'http://localhost:11434';
const [idDemande, numero] = process.argv.slice(2);

// POST-Anfrage ohne Zeitlimit: Das fetch von Node bricht nach 5 Minuten ab, was Llama 3 (8 Milliarden) auf einem kleinen Rechner überschreitet.
function postJson(url, corps) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 0 }, (res) => {
      const morceaux = [];
      res.on('data', (m) => morceaux.push(m));
      res.on('end', () => {
        const texte = Buffer.concat(morceaux).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error(`Ollama: HTTP ${res.statusCode} ${texte.slice(0, 200)}`));
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
    // derselbe Anfragerumpf wie im Knoten « Aufruf vorbereiten »
    const e = entreeTemplate(c, id);
    const appel = lancer(jsCode('62-brique-rediger.json', 'Aufruf vorbereiten'), { entree: { ...t, faits: e.faits, patient: e.patient, autres: e.autres } })[0];
    if (process.env.AICARE_MODELE) appel.body.model = process.env.AICARE_MODELE; // Versuch mit einem anderen Modell
    const debut = Date.now();
    const rep = await postJson(`${OLLAMA}/api/generate`, appel.body);
    const texte = String(rep.response ?? '').trim();
    const controle = controler(texte, c, t, id, { done_reason: rep.done_reason, total_duration: rep.total_duration, eval_count: rep.eval_count });
    const echecs = verifierAttendu(texte, c.attendu, controle, { strictAvertissements: false });
    total++;
    if (!echecs.length) reussis++;
    console.log(`\n=== ${id} v${t.prompt_version} / ${c.type} : ${c.nom}`);
    console.log(`    Modell ${appel.body.model} | ${Math.round((Date.now() - debut) / 1000)} s | ${rep.eval_count} Tokens`);
    console.log(`    Urteil: ${echecs.length ? 'FEHLGESCHLAGEN – ' + echecs.join(' | ') : 'BESTANDEN'}`);
    console.log(`    Warnungen der Kontrollen: ${controle.avertissements.length ? controle.avertissements.map((a) => a.type).join(', ') : 'keine'}`);
    console.log(texte.split('\n').map((l) => `    | ${l}`).join('\n'));
  }
}
console.log(`\n${reussis}/${total} Fälle mit dem Modell bestanden.`);
process.exit(reussis === total ? 0 : 1);
