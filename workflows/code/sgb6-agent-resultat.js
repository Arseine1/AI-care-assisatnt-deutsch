// Rentenbeiträge, Agent – Zusammenstellung des Endergebnisses der GEFÜHRTEN MISSION (alles ist schon Schritt für Schritt protokolliert; es fehlt die Zeile « enregistrer »).
// Wurde die Steuerung durch das Modell abgebrochen, wird der Vermerk ergänzt: « Steuerung durch das Modell abgebrochen: <Grund> ».
const x = $($('Eingang').first().json.lecture_ia === true ? "KI-Antwort lesen" : 'Extraktion durch Regeln').first().json;
const { journal, ...resultat } = finaliserTraitement($('Meldung vorbereiten').first().json.etat);
resultat.lecture_ia = x.lecture;
resultat.traite_le = new Date().toISOString();
resultat.pilote = { mode: 'mission_guidee', abandon: null, mention: null, compte_rendu: null, contradictions: [] };
try {
  const f = $('Ende der Steuerung').first().json.sess; // existiert nur, wenn die Steuerung durch das Modell versucht wurde
  resultat.pilote = { mode: 'mission_guidee', modele: f.modele, tours: f.tours, refus: f.refus, abandon: f.abandon, mention: `Steuerung durch das Modell abgebrochen: ${f.abandon}`, compte_rendu: null, contradictions: [] };
} catch {
  /* geführte Mission direkt angefordert */
}
return [{ json: { journal: [{ etape: 'enregistrer', outil: 'enregistrer', resultat: `Ergebnis gespeichert (Status: ${resultat.statut})`, duree_ms: 0 }], resultat } }];
