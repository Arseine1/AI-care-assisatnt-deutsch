// Rentenbeiträge, Agent – Schritt 5: die Regeln R1 bis R6 und die Abweichungen zwischen Fragebogen und Akte der Kasse prüfen.
// Anzeigetempo: eine kurze Pause vor jedem Schritt, damit die Seite den Fortschritt des Agenten zeigt (die Oberfläche fragt n8n jede Sekunde ab).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const etat = etapeRegles($('Kassenakte lesen').first().json.etat);
return [{ json: { fait: 5, etat, journal: etat.journal.at(-1) } }];
