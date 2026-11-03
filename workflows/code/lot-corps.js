// Valider le lot d'un étage – contrôle du corps de la requête. Chaque rapport doit rester rattaché à son BROUILLON
// (contrôlé ensuite par la brique « enregistrer ») : rien d'autre que ces textes n'est enregistré.
const b = $input.first().json?.body ?? {};
const etage = Number(b.etage);
if (!Number.isInteger(etage) || etage < 0 || etage > 20) throw new Error('étage invalide');
if (!Array.isArray(b.rapports) || b.rapports.length === 0 || b.rapports.length > 60) throw new Error('rapports : 1 à 60 attendus');
// Le nom du soignant qui valide vient de sa SESSION (jeton), jamais du corps de la requête : on ne peut pas valider « au nom de » quelqu'un d'autre.
const s = $('Session').first().json.soignant;
return b.rapports.map((r) => ({ json: { brouillon_id: r?.brouillon_id, texte: r?.texte, valide_par: s.nom, soignant_id: s.identifiant, etage } }));
