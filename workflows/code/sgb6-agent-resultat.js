// Cotisations retraite, agent – assemblage du résultat final de la MISSION GUIDÉE (tout est déjà journalisé étape par étape ; reste la ligne « enregistrer »).
// Si le pilotage par le modèle a été abandonné, la mention est ajoutée : « pilotage par le modèle abandonné : <raison> ».
const x = $($('Entrée').first().json.lecture_ia === true ? "Lire la réponse de l'IA" : 'Extraction par règles').first().json;
const { journal, ...resultat } = finaliserTraitement($('Préparer la déclaration').first().json.etat);
resultat.lecture_ia = x.lecture;
resultat.traite_le = new Date().toISOString();
resultat.pilote = { mode: 'mission_guidee', abandon: null, mention: null, compte_rendu: null, contradictions: [] };
try {
  const f = $('Fin du pilotage').first().json.sess; // n'existe que si le pilotage par le modèle a été essayé
  resultat.pilote = { mode: 'mission_guidee', modele: f.modele, tours: f.tours, refus: f.refus, abandon: f.abandon, mention: `pilotage par le modèle abandonné : ${f.abandon}`, compte_rendu: null, contradictions: [] };
} catch {
  /* mission guidée demandée directement */
}
return [{ json: { journal: [{ etape: 'enregistrer', outil: 'enregistrer', resultat: `résultat enregistré (statut : ${resultat.statut})`, duree_ms: 0 }], resultat } }];