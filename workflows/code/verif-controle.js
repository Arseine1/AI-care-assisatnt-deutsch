// Dokument prüfen – Prüfung der Anfrage {chambre}. Kein Freitext: Nur das Zimmer wird gelesen, die Aktion wird hier festgelegt.
const e = $input.first().json?.body ?? {};
const chambre = String(e.chambre ?? '');
if (!/^\d{1,3}$/.test(chambre)) throw new Error(`Ungültiges Zimmer: „${chambre}“`);
// ref (optional): das genau zu prüfende Schreiben (kim/<Absender>/<Datei>); ohne ref das neueste wartende.
const ref = e.ref === undefined ? '' : String(e.ref);
if (ref && !/^kim\/[^\s]{1,200}$/.test(ref)) throw new Error('Ungültige ref');
return [{ json: { action: 'verifier_document', chambre, prompt_id: 'comparer', verification: true, ref } }];