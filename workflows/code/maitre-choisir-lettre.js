// Vérifier le document – choisit la lettre la plus récente en attente de contrôle (collection « a_verifier »).
// Sans lettre, le parcours s'arrête là : aucun appel à l'IA.
const c = $input.first().json;
const ref = $('Contrôler la demande').first().json.ref ?? '';
// un courrier précis demandé (ex. celui qui vient d'arriver) passe avant le « plus récent »
const lettres = [...(c.lettres ?? [])].sort((a, b) => (b.ref === ref) - (a.ref === ref) || String(b.date).localeCompare(String(a.date)));
if (!lettres.length) return [{ json: { aucune: true, patient: c.patient } }];
return [{ json: { ...c, lettre: lettres[0], nb_lettres: lettres.length } }];
