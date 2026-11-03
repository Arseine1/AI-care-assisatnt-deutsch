// Modus B – Prüfung des Zimmers (der Text der Anweisung wird direkt danach im Knoten « Anweisung prüfen » geprüft).
const e = $input.first().json?.body ?? {};
const chambre = String(e.chambre ?? '');
if (!/^\d{1,3}$/.test(chambre)) throw new Error(`Ungültiges Zimmer: „${chambre}“`);
return [{ json: { chambre } }];
