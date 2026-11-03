// Cotisations retraite, agent piloté – début d'un tour : on note l'heure (la durée du tour comprend l'appel au modèle).
const sess = $json.sess;
sess.debut_tour = Date.now();
return [{ json: { sess } }];