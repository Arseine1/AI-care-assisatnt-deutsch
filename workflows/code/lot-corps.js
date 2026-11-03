// Stapel einer Etage bestätigen – Prüfung des Anfragekörpers. Jeder Bericht muss an seinen ENTWURF gebunden bleiben
// (anschließend vom Baustein « enregistrer » geprüft): Nichts anderes als diese Texte wird gespeichert.
const b = $input.first().json?.body ?? {};
const etage = Number(b.etage);
if (!Number.isInteger(etage) || etage < 0 || etage > 20) throw new Error('Ungültige Etage');
if (!Array.isArray(b.rapports) || b.rapports.length === 0 || b.rapports.length > 60) throw new Error('Berichte: 1 bis 60 erwartet');
// Der Name der bestätigenden Pflegekraft stammt aus ihrer SITZUNG (Token), nie aus dem Anfragekörper: Man kann nicht „im Namen von“ jemand anderem bestätigen.
const s = $('Sitzung').first().json.soignant;
return b.rapports.map((r) => ({ json: { brouillon_id: r?.brouillon_id, texte: r?.texte, valide_par: s.nom, soignant_id: s.identifiant, etage } }));
