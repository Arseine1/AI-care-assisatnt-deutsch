// Après validation – un élément par événement d'audit à écrire dans le journal.
return $input.first().json.evenements_journal.map((e) => ({ json: e }));
