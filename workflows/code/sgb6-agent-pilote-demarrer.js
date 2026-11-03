// Rentenbeiträge, vom Modell gesteuerter Agent – Start: die Sitzung (vom Code geführter Zustand) und die Auftragsnachricht.
// Das Modell sieht nie die echte Kennung der Akte (Alias « dossier-1 ») und nie den Text des Fragebogens.
const d = $('Akte').first().json;
if (!d.id) throw new Error('Akte nicht gefunden');
const e = $('Eingang').first().json;
const sess = nouvelleSession({ dossier_id: e.dossier_id, texte: d.questionnaire, annee: new Date().getFullYear(), modele: e.modele });
return [{ json: { sess } }];
