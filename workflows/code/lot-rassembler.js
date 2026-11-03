// Valider le lot d'un étage – rassemble les validations réussies ; les refus (déjà validé, introuvable, texte vide) sont listés.
const etage = $('Corps du lot').first().json.etage;
const sorties = $input.all().map((i) => i.json);
const valides = sorties.filter((s) => s.ok === true && s.action === 'generer_sbar');
const refuses = sorties
  .filter((s) => !(s.ok === true && s.action === 'generer_sbar'))
  .map((s) => ({ brouillon_id: s.brouillon_id ?? null, erreur: String(s.erreur ?? s.error?.message ?? s.error ?? 'Validation refusée').slice(0, 200) }));
return [{ json: { portee: 'etage', etage, validation_ids: valides.map((s) => s.validation_id), nb_valides: valides.length, refuses } }];
