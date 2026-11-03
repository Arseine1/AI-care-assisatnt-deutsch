// Bestätigen & Speichern – der gelesene Text und der Entwurf stammen aus der Anfrage; der Name der Pflegekraft stammt aus ihrer SITZUNG (Token), nie aus dem Body.
const b = $input.first().json?.body ?? {};
const s = $('Sitzung').first().json.soignant;
return [{ json: { brouillon_id: b.brouillon_id, texte: b.texte, valide_par: s.nom, soignant_id: s.identifiant } }];