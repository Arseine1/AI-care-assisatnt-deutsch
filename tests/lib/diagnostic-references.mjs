// Outil de mise au point : liste, pour chaque réponse de référence des prompts « phrases », les phrases que le filtre retire.
// Lancer : node tests/lib/diagnostic-references.mjs
import { prompts, chargerCas, assembler, controler, referenceVersPhrases } from './prompts-harness.mjs';

const P = prompts();
for (const [id, p] of Object.entries(P)) {
  if (p.sortie !== 'phrases') continue;
  for (const c of chargerCas(id).cas) {
    const t = assembler(c, id);
    const r = controler(referenceVersPhrases(c, p), c, t, id);
    console.log(`${id} / ${c.type} : ${r.retirees.length} retirée(s), avertissements : ${r.avertissements.map((a) => a.type).join(',') || 'aucun'}`);
    for (const x of r.retirees) console.log(`   - [${x.source_id}] ${x.phrase}  => ${x.detail}`);
  }
}
