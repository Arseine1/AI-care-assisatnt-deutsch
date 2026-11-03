// Sitzungsprüfung – die Sitzung ist gültig: Die ursprüngliche Anfrage (Header, Body) wird unverändert an die folgenden Knoten zurückgegeben.
return [{ json: $('__WEBHOOK__').first().json }];