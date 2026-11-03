// Dokument prüfen – wählt das neueste Schreiben, das auf Prüfung wartet (Sammlung « a_verifier »).
// Ohne Schreiben endet der Ablauf hier: kein Aufruf der KI.
const c = $input.first().json;
const ref = $('Anfrage prüfen').first().json.ref ?? '';
// ein bestimmtes angefordertes Schreiben (z. B. das gerade eingegangene) geht dem « neuesten » vor
const lettres = [...(c.lettres ?? [])].sort((a, b) => (b.ref === ref) - (a.ref === ref) || String(b.date).localeCompare(String(a.date)));
if (!lettres.length) return [{ json: { aucune: true, patient: c.patient } }];
return [{ json: { ...c, lettre: lettres[0], nb_lettres: lettres.length } }];
