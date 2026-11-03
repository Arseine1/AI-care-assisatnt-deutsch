// Aufgabe abbrechen – Antwort an die Oberfläche. Der Abbruch wird VOR dem nächsten Bewohner (oder dem nächsten
// Schritt) berücksichtigt: Die bereits laufende Erstellung bei Ollama wird beendet, ihr Ergebnis wird verworfen.
const r = $input.first().json ?? {};
return [{ json: { annulee: r.annulee === true, statut: r.statut ?? 'inconnue' } }];