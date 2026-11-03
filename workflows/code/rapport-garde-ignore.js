// Dienstbericht eines Bewohners – die Aufgabe ist nicht mehr « en_cours » (abgebrochen oder unterbrochen): Dieser Bewohner wird übersprungen,
// es werden weder Suche noch Erstellung gestartet.
return [{ json: { ignore: true, task_id: $('Eingang').first().json.task_id, patient_id: $('Eingang').first().json.patient_id } }];