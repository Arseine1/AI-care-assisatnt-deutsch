// Sitzungsprüfung – Ergebnis: eine identifizierte Pflegekraft (Sitzung offen, nicht abgelaufen, Konto aktiv) oder nichts.
const r = $input.first().json ?? {};
if (!r.identifiant) return [{ json: { ok: false } }];
return [{ json: { ok: true, soignant: { identifiant: r.identifiant, nom: r.nom }, jeton_hash: r.jeton_hash } }];