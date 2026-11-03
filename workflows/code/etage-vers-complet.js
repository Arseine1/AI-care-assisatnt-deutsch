// Rapport de garde d'un étage – ce qui part vers le sous-workflow « étage complet » : l'étage et la tâche déjà créée.
const etage = $('Contrôler l\'étage').first().json.etage;
const task_id = $('Créer la tâche').first().json.id;
return [{ json: { etage, task_id } }];
