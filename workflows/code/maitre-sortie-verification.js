// Vérifier le document – sortie : la réponse au front, sans l'événement de journal.
const { evenement_journal, ...reponse } = $('Réponse vérification').first().json;
return [{ json: reponse }];
