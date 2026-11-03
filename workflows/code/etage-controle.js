// Rapport de garde d'un étage – contrôle de la demande {etage}. Aucun texte libre : un numéro d'étage seulement.
const e = $input.first().json?.body ?? {};
const etage = Number(e.etage);
if (!Number.isInteger(etage) || etage < 0 || etage > 20) throw new Error(`Étage invalide : « ${e.etage} »`);
return [{ json: { etage } }];
