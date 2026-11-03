// Rentenbeiträge, Agent – Schritt 6: berechnen (§ 166 Abs. 2 SGB VI). Von der KI gelesene Werte: kein Betrag, solange etwas zu prüfen bleibt.
// Anzeigetempo: eine kurze Pause vor jedem Schritt, damit die Seite den Fortschritt des Agenten zeigt (die Oberfläche fragt n8n jede Sekunde ab).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const etat = etapeCalculer($('Regeln überprüfen').first().json.etat);
return [{ json: { fait: 6, etat, journal: etat.journal.at(-1) } }];
