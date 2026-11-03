// Rentenbeiträge, Agent – Schritt 3: die Felder prüfen (Pflichtfelder, Daten, Versicherungsnummer und ihre Prüfziffer).
// Schritte 3 bis 7: ALLES erledigt die Engine regles.js (weiter oben kopiert), ein Schritt pro Knoten; Protokoll und Fortschritt werden nach jedem Schritt geschrieben.
// Anzeigetempo: eine kurze Pause vor jedem Schritt, damit die Seite den Fortschritt des Agenten zeigt (die Oberfläche fragt n8n jede Sekunde ab).
const PAUSE_ETAPE_MS = 1100;
await new Promise((resolu) => setTimeout(resolu, PAUSE_ETAPE_MS));
const texte = $('Akte').first().json.questionnaire;
const id = $('Eingang').first().json.dossier_id;
const x = $($('Eingang').first().json.lecture_ia === true ? "KI-Antwort lesen" : 'Extraktion durch Regeln').first().json;
const etat = etapeControler(demarrerTraitement(texte, { annee: new Date().getFullYear(), id, lu: x.lu }));
return [{ json: { fait: 3, etat, journal: etat.journal.at(-1) } }];
