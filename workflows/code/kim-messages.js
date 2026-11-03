// Connecteur « KIM » (boîte simulée par Mailpit) : ne garder que les messages qui ont une pièce jointe.
const liste = $input.first().json.messages ?? [];
return liste.filter((m) => m.Attachments > 0).map((m) => ({ json: { id: m.ID } }));
