// Dokument prüfen – Ausgabe: die Antwort an die Oberfläche, ohne das Protokollereignis.
const { evenement_journal, ...reponse } = $('Réponse vérification').first().json;
return [{ json: reponse }];
