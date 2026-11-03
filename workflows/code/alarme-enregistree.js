// Alarme de capteur – retour à l'alarme enregistrée après l'indexation dans le RAG (le nœud « Indexer » renvoie son propre résumé).
// Le reste du workflow (décision de générer un contexte) travaille sur l'alarme, pas sur le résumé de l'indexation.
return [{ json: $('Créer l\'alarme').first().json }];
