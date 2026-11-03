// Rapport de garde d'un résident – la tâche n'est plus « en cours » (annulée ou interrompue) : ce résident est ignoré,
// aucune recherche et aucune génération ne sont lancées.
return [{ json: { ignore: true, task_id: $('Entrée').first().json.task_id, patient_id: $('Entrée').first().json.patient_id } }];