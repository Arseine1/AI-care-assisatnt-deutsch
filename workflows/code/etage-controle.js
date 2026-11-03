// Dienstbericht einer Etage – Prüfung der Anfrage {etage}. Kein Freitext: nur eine Etagennummer.
const e = $input.first().json?.body ?? {};
const etage = Number(e.etage);
if (!Number.isInteger(etage) || etage < 0 || etage > 20) throw new Error(`Ungültige Etage: „${e.etage}“`);
return [{ json: { etage } }];
