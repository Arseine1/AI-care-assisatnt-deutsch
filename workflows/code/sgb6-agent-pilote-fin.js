// Cotisations retraite, agent piloté – fin du pilotage (compte rendu donné, limite atteinte ou abandon). Tâche annulée ou interrompue : on s'arrête là.
const r = $input.first().json;
if (r.statut !== 'en_cours') return [];
return [{ json: { sess: r.sess } }];