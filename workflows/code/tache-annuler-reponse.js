// Annuler une tâche – réponse à l'interface. L'annulation est prise en compte AVANT le prochain résident (ou la prochaine
// étape) : la génération déjà en cours chez Ollama se termine, son résultat est abandonné.
const r = $input.first().json ?? {};
return [{ json: { annulee: r.annulee === true, statut: r.statut ?? 'inconnue' } }];