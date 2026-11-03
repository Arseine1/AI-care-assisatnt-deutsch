// Prüfbericht bestätigen – Antwort an die Oberfläche: die Bestätigung, dann was aus dem Schreiben geworden ist.
const v = $('Speichern').first().json;
const a = $input.first().json ?? {};
return [{ json: { ...v, apres_validation: a.error ? { erreur: String(a.error.message ?? a.error).slice(0, 200) } : { lettre: a.lettre } } }];