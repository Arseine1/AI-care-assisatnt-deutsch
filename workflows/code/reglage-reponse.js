// Einstellung der zusätzlichen Analyse – Antwort an die Oberfläche.
const r = $input.first().json ?? {};
return [{ json: { cle: 'verification_ia', valeur: r.valeur !== false } }];