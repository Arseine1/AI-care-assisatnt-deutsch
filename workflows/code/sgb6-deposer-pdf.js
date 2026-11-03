// Rentenbeiträge – Upload eines PDFs: Nur ein PDF, das bereits Text enthält, wird akzeptiert. Ein Scan (der Extraktionsdienst
// musste OCR einsetzen) wird abgelehnt: Ein Bild wird nicht gelesen.
const r = $input.first().json ?? {};
if (r.error || typeof r.texte !== 'string') return [{ json: { refus: 'lecture', message: 'Der Text des PDFs konnte nicht gelesen werden.' } }];
if (r.methode !== 'texte') return [{ json: { refus: 'scan', message: 'Dieses PDF ist ein Scan (Bild ohne Text) und wird abgelehnt. Laden Sie ein PDF mit Text hoch.' } }];
return [{ json: { nom: $('Upload prüfen').first().json.nom, texte: r.texte } }];
