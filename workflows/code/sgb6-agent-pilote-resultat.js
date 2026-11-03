// Cotisations retraite, agent piloté – résultat : le STATUT et les MONTANTS viennent du code (regles.js), jamais du texte du modèle.
// Les étapes que le modèle n'a pas faites sont complétées par le code ; un compte rendu qui contredit les règles est signalé.
const CAISSE = __CAISSE__;
const sess = $('Fin du pilotage').first().json.sess;
const { resultat, journal } = resultatPilote(sess, { caisse: CAISSE });
const parIA = sess.faits.extraire_champs_par_ia === true;
resultat.lecture_ia = parIA ? { demande: true, utilise: true, mode: 'ia', modele: __MODELE__ } : { demande: false, utilise: false, repli: false, mode: 'regles' };
resultat.traite_le = new Date().toISOString();
const lignes = [...journal, { etape: 'enregistrer', outil: 'enregistrer', resultat: `résultat enregistré (statut : ${resultat.statut})`, duree_ms: 0 }];
return [{ json: { journal: lignes, resultat } }];