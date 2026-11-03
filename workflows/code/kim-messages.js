// KIM-Konnektor (von Mailpit simuliertes Postfach): nur Nachrichten mit Anhang behalten.
const liste = $input.first().json.messages ?? [];
return liste.filter((m) => m.Attachments > 0).map((m) => ({ json: { id: m.ID } }));
