// Bericht bestätigen – nur die Bestätigung eines DIENSTBERICHTS wird dem RAG hinzugefügt und an das nächste Team weitergegeben.
const v = $input.first().json;
return [{ json: { portee: 'resident', validation_ids: [v.validation_id] } }];
