// Rentenbeiträge, Agent – Schritt 7: den Entwurf der Meldung vorbereiten (die 8 Angaben nach § 44 Abs. 3 SGB XI).
// Anzeigetempo: eine kurze Pause vor jedem Schritt, damit die Seite den Fortschritt des Agenten zeigt (die Oberfläche fragt n8n jede Sekunde ab).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const etat = etapeDeclaration($('Beitrag berechnen').first().json.etat);
return [{ json: { fait: 7, etat, journal: etat.journal.at(-1) } }];
