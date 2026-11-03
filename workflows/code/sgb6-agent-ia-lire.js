// Cotisations retraite, agent – étape 2 (lecture par l'IA) : contrôle de la réponse du modèle.
// Chaque valeur lue doit figurer dans le questionnaire (sinon écartée). Si l'IA échoue, répond vide ou dépasse 5 minutes :
// repli sur l'extraction par règles, signalé dans le résultat. L'IA ne calcule ni ne décide rien.
const prep = $("Préparer la lecture par l'IA").first().json;
const texte = $('Dossier').first().json.questionnaire;
const r = $input.first().json ?? {};
const duree_ms = Date.now() - prep.debut;
let lu;
let lecture;
let resultat;
try {
  if (r.error || typeof r.response !== 'string') throw new Error(/timeout|ETIMEDOUT|aborted|ECONN/i.test(String(r.error?.message ?? r.error?.description ?? '')) ? 'délai dépassé' : 'IA indisponible');
  let ia;
  try {
    ia = JSON.parse(r.response);
  } catch {
    throw new Error('réponse illisible');
  }
  const lue = champsDepuisIA(ia, texte);
  if (lue.lus < 3) throw new Error('lecture inexploitable');
  lu = lue.lu;
  const reperes = extraireChamps(texte).donnees;
  const differences = Object.keys(reperes).filter((k) => !['sources', 'autres_aidants', 'recu_le'].includes(k) && JSON.stringify(reperes[k]) !== JSON.stringify(lu.donnees[k]));
  lecture = { demande: true, utilise: true, repli: false, mode: 'ia', modele: prep.modele, lus: lue.lus, ecartes: lue.ecartes, differences, duree_ms };
  resultat = `lecture par l'IA : ${lue.lus} champ(s) gardé(s), ${lue.ecartes.length} écarté(s) car absent(s) du texte`;
} catch (e) {
  lu = extraireChamps(texte);
  const motif = String(e.message).slice(0, 60);
  lecture = { demande: true, utilise: false, repli: true, mode: 'regles', motif, duree_ms };
  resultat = `repli sur les règles : ${motif}`;
}
return [{ json: { fait: 2, lu, lecture, journal: { etape: 'extraire', outil: lecture.utilise ? `lecture IA (${prep.modele})` : 'extraireChamps (repli)', resultat, duree_ms } } }];