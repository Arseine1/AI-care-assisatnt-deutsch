// Rentenbeiträge – was an den Unterworkflow des Agenten geht: die Aufgabe, die Akte, der Steuerer, das Lesen durch die KI, die Pflegekraft der Sitzung.
const v = $('Start überprüfen').first().json;
return [{ json: { task_id: $('Aufgabe erstellen').first().json.id, dossier_id: v.id, lecture_ia: v.lecture_ia, pilote: v.pilote, modele: v.modele, soignant: v.soignant } }];
