// Lettre validée – décision : la lettre n'entre dans le RAG (fiable) que si les règles de contrôle n'y ont trouvé AUCUNE contradiction.
// Une lettre avec contradiction reste « à vérifier » tant que le médecin ne l'a pas clarifiée ; la validation du rapport est seulement enregistrée.
const v = $input.first().json ?? {};
if (!v.validation_id) return [{ json: { ajouter: false, motif: 'validation introuvable ou sans rapport de vérification' } }];
if (!/^kim\/[^\s]{1,200}$/.test(String(v.lettre_ref ?? ''))) return [{ json: { ajouter: false, motif: 'aucun courrier lié à ce rapport', patient_id: v.patient_id } }];
if (v.sans_contradiction !== true) return [{ json: { ajouter: false, motif: 'contradiction à clarifier avec le médecin : le courrier reste à vérifier', patient_id: v.patient_id, lettre_ref: v.lettre_ref } }];
return [{ json: { ajouter: true, patient_id: v.patient_id, lettre_ref: v.lettre_ref, validation_id: v.validation_id } }];