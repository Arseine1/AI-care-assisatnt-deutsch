// Automatischer Etagenbericht (5:30 Uhr) – ein Element je Etage, deren Aufgabe soeben erstellt wurde.
// Keine Etage wird innerhalb von 3 Stunden zweimal angelegt (Neustart von n8n, manuelle Auslösung): Die Abfrage schließt sie bereits aus.
return $input.all().map((i) => i.json).filter((r) => r.id).map((r) => ({ json: { etage: Number(r.etage), task_id: r.id } }));
