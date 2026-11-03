// Contrôle de session – résultat : un soignant identifié (session ouverte, non expirée, compte actif) ou rien.
const r = $input.first().json ?? {};
if (!r.identifiant) return [{ json: { ok: false } }];
return [{ json: { ok: true, soignant: { identifiant: r.identifiant, nom: r.nom }, jeton_hash: r.jeton_hash } }];