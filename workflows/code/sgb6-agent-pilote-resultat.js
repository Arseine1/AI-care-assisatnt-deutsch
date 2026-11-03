// Rentenbeiträge, gesteuerter Agent – Ergebnis: der STATUS und die BETRÄGE stammen vom Code (regles.js), nie vom Text des Modells.
// Die Schritte, die das Modell nicht ausgeführt hat, ergänzt der Code; ein Bericht, der den Regeln widerspricht, wird gemeldet.
const CAISSE = __CAISSE__;
const sess = $('Ende der Steuerung').first().json.sess;
const { resultat, journal } = resultatPilote(sess, { caisse: CAISSE });
const parIA = sess.faits.extraire_champs_par_ia === true;
resultat.lecture_ia = parIA ? { demande: true, utilise: true, mode: 'ia', modele: __MODELE__ } : { demande: false, utilise: false, repli: false, mode: 'regles' };
resultat.traite_le = new Date().toISOString();
const lignes = [...journal, { etape: 'enregistrer', outil: 'enregistrer', resultat: `Ergebnis gespeichert (Status: ${resultat.statut})`, duree_ms: 0 }];
return [{ json: { journal: lignes, resultat } }];
