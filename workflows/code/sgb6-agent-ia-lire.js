// Rentenbeiträge, Agent – Schritt 2 (Lesen durch die KI): Kontrolle der Antwort des Modells.
// Jeder gelesene Wert muss im Fragebogen stehen (sonst wird er verworfen). Scheitert die KI, antwortet sie leer oder braucht sie länger als 5 Minuten:
// Rückfall auf die Extraktion durch Regeln, im Ergebnis vermerkt. Die KI berechnet und entscheidet nichts.
const prep = $("Lesen durch die KI vorbereiten").first().json;
const texte = $('Akte').first().json.questionnaire;
const r = $input.first().json ?? {};
const duree_ms = Date.now() - prep.debut;
let lu;
let lecture;
let resultat;
try {
  if (r.error || typeof r.response !== 'string') throw new Error(/timeout|ETIMEDOUT|aborted|ECONN/i.test(String(r.error?.message ?? r.error?.description ?? '')) ? 'Zeitüberschreitung' : 'KI nicht verfügbar');
  let ia;
  try {
    ia = JSON.parse(r.response);
  } catch {
    throw new Error('Antwort nicht lesbar');
  }
  const lue = champsDepuisIA(ia, texte);
  if (lue.lus < 3) throw new Error('Lesen nicht verwertbar');
  lu = lue.lu;
  const reperes = extraireChamps(texte).donnees;
  const differences = Object.keys(reperes).filter((k) => !['sources', 'autres_aidants', 'recu_le'].includes(k) && JSON.stringify(reperes[k]) !== JSON.stringify(lu.donnees[k]));
  lecture = { demande: true, utilise: true, repli: false, mode: 'ia', modele: prep.modele, lus: lue.lus, ecartes: lue.ecartes, differences, duree_ms };
  resultat = `Lesen durch die KI: ${lue.lus} Feld(er) übernommen, ${lue.ecartes.length} verworfen, da im Text nicht vorhanden`;
} catch (e) {
  lu = extraireChamps(texte);
  const motif = String(e.message).slice(0, 60);
  lecture = { demande: true, utilise: false, repli: true, mode: 'regles', motif, duree_ms };
  resultat = `Rückfall auf die Regeln: ${motif}`;
}
return [{ json: { fait: 2, lu, lecture, journal: { etape: 'extraire', outil: lecture.utilise ? `KI-Lesen (${prep.modele})` : 'extraireChamps (Rückfall)', resultat, duree_ms } } }];
