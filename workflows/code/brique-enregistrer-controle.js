// Baustein « Speichern » – Prüfung der Bestätigungsanfrage.
// Gespeichert wird nur der Text eines bestehenden ENTWURFS (von « Verfassen » erstellt): Der bestätigte Text ist der, den
// die Pflegekraft gelesen und gegebenenfalls korrigiert hat, zugeordnet zu diesem Entwurf.
const e = $input.first().json ?? {};
const id = String(e.brouillon_id ?? '');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Ungültige brouillon_id');
const texte = String(e.texte ?? '').trim();
if (!texte || texte.length > 20000) throw new Error('Text leer oder zu lang (höchstens 20 000 Zeichen)');
return [{ json: { brouillon_id: id, texte, valide_par: String(e.valide_par ?? 'Pflegekraft (nicht identifiziert)').slice(0, 80), soignant_id: String(e.soignant_id ?? '').slice(0, 40) } }];
