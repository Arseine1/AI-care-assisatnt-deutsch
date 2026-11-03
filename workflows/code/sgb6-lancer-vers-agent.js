// Cotisations retraite – ce qui part vers le sous-workflow de l'agent : la tâche, le dossier, le pilote, la lecture par l'IA, le soignant de la session.
const v = $('Vérifier le lancement').first().json;
return [{ json: { task_id: $('Créer la tâche').first().json.id, dossier_id: v.id, lecture_ia: v.lecture_ia, pilote: v.pilote, modele: v.modele, soignant: v.soignant } }];