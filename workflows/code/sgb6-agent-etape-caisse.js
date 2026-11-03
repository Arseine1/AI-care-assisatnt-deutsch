// Rentenbeiträge, Agent – Schritt 4: die Akte der Kasse (simuliert) und das Gutachten des Medizinischen Dienstes lesen.
const CAISSE = __CAISSE__;
// Anzeigetempo: eine kurze Pause vor jedem Schritt, damit die Seite den Fortschritt des Agenten zeigt (die Oberfläche fragt n8n jede Sekunde ab).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const etat = etapeCaisse($('Felder prüfen').first().json.etat, CAISSE);
return [{ json: { fait: 4, etat, journal: etat.journal.at(-1) } }];
