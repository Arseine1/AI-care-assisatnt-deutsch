// Cotisations retraite – lancer l'agent : le dossier existe-t-il, n'est-il pas déjà décidé, un traitement n'est-il pas déjà en cours ?
const d = $('Contrôler le lancement').first().json;
const r = $input.first().json ?? {};
const refus = (reponse) => [{ json: { ok: false, reponse } }];
if (!r.id) return refus({ ok: false, erreur: 'inconnu', message: 'Dossier inconnu.' });
if (['valide', 'refuse'].includes(r.statut)) return refus({ ok: false, erreur: 'decide', message: 'Ce dossier est déjà décidé : il ne peut plus être traité.' });
if (r.tache_en_cours) return refus({ ok: true, tache_id: r.tache_en_cours, id: r.id, deja: true, etapes: ['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration'] });
return [{ json: { ok: true, id: r.id, lecture_ia: d.lecture_ia, pilote: d.pilote, modele: d.modele, soignant: $('Session').first().json.soignant.identifiant } }];