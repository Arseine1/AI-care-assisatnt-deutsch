// Prüfbericht bestätigen – nur die Bestätigung eines Berichts « Dokument prüfen » kann das Schreiben in das RAG aufnehmen.
return [{ json: { validation_id: $input.first().json.validation_id } }];