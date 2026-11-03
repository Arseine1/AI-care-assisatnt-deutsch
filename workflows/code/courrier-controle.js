// Eingegangene Post – Prüfung der Mailpit-Benachrichtigung. Nur die Nachrichtenkennung wird gelesen; der Inhalt der Benachrichtigung wird
// ignoriert: Die Nachricht wird erneut über die Mailpit-API gelesen (dieselbe Quelle wie der KIM-Konnektor).
const b = $input.first().json?.body ?? {};
const id = String(b.ID ?? '');
if (!/^[A-Za-z0-9]{6,40}$/.test(id)) throw new Error('Ungültige Nachrichtenkennung');
return [{ json: { id } }];