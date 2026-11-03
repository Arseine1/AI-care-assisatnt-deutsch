// Nachholen der Post – Mailpit-Nachrichten mit Anhang, die vor mehr als einer Minute eingegangen sind (der Webhook kümmert sich
// vielleicht darum) und weder verarbeitet noch bereits in Bearbeitung sind. Die Sperre (soins.courriers_traites, Status « en_cours » für 15 Minuten) verhindert jede doppelte Verarbeitung.
const traites = new Set($('Bereits verarbeitete Post').all().map((i) => i.json.message_id).filter(Boolean));
const messages = $input.first().json?.messages ?? [];
return messages
  .filter((m) => m.Attachments > 0 && !traites.has(m.ID) && Date.now() - new Date(m.Created).getTime() > 60000)
  .map((m) => ({ json: { id: m.ID } }));