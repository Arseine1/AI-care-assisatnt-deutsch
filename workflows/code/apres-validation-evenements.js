// Nach der Bestätigung – ein Element pro Prüfereignis, das ins Protokoll zu schreiben ist.
return $input.first().json.evenements_journal.map((e) => ({ json: e }));
