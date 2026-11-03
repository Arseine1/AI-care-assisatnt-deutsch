// Rentenbeiträge – den Agenten starten: Existiert die Akte, ist sie nicht schon entschieden, läuft nicht schon eine Bearbeitung?
const d = $('Start prüfen').first().json;
const r = $input.first().json ?? {};
const refus = (reponse) => [{ json: { ok: false, reponse } }];
if (!r.id) return refus({ ok: false, erreur: 'inconnu', message: 'Unbekannte Akte.' });
if (['valide', 'refuse'].includes(r.statut)) return refus({ ok: false, erreur: 'decide', message: 'Diese Akte ist bereits entschieden: Sie kann nicht mehr bearbeitet werden.' });
if (r.tache_en_cours) return refus({ ok: true, tache_id: r.tache_en_cours, id: r.id, deja: true, etapes: ['lire', 'extraire', 'controler', 'caisse', 'regles', 'calculer', 'declaration'] });
return [{ json: { ok: true, id: r.id, lecture_ia: d.lecture_ia, pilote: d.pilote, modele: d.modele, soignant: $('Sitzung').first().json.soignant.identifiant } }];
