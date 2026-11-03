// Brique « enregistrer » – contrôle de la demande de validation.
// On n'enregistre que le texte d'un BROUILLON existant (créé par « rédiger ») : le texte validé est celui que
// le soignant a relu et éventuellement corrigé, rattaché à ce brouillon.
const e = $input.first().json ?? {};
const id = String(e.brouillon_id ?? '');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('brouillon_id invalide');
const texte = String(e.texte ?? '').trim();
if (!texte || texte.length > 20000) throw new Error('texte vide ou trop long (20 000 caractères au maximum)');
return [{ json: { brouillon_id: id, texte, valide_par: String(e.valide_par ?? 'soignant (non identifié)').slice(0, 80), soignant_id: String(e.soignant_id ?? '').slice(0, 40) } }];
