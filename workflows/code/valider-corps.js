// Valider & Enregistrer – le texte relu et le brouillon viennent de la requête ; le nom du soignant vient de sa SESSION (jeton), jamais du corps.
const b = $input.first().json?.body ?? {};
const s = $('Session').first().json.soignant;
return [{ json: { brouillon_id: b.brouillon_id, texte: b.texte, valide_par: s.nom, soignant_id: s.identifiant } }];