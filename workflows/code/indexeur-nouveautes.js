// Indexer – Duplikatschutz: Es werden nur Abschnitte behalten, deren SHA-256-Fingerabdruck noch nicht im Protokoll steht.
// Ein unveränderter Abschnitt wird weder vektorisiert noch erneut an Qdrant gesendet; ein geänderter Abschnitt hat einen neuen Fingerabdruck
// und ersetzt den vorhandenen Punkt (gleiche stabile Kennung).
const morceaux = $('Zerlegen und Hashen').all().filter((m) => m.json.payload);
const connus = new Set($('Bereits importiert').all().map((i) => `${i.json.source}|${i.json.empreinte}`));

const nouveaux = morceaux.filter((m) => !connus.has(`${m.json.payload.source}|${m.json.payload.empreinte}`));

// Immer mindestens ein Element: Der Marker « rien » wird auf den Zweig „Nichts Neues“ geleitet.
if (nouveaux.length === 0) return [{ json: { rien: true, total: morceaux.length } }];
return nouveaux;
