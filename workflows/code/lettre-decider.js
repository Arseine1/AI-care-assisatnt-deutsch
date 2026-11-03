// Bestätigter Arztbrief – Entscheidung: Der Brief gelangt nur dann in das RAG (verlässlich), wenn die Kontrollregeln darin KEINEN Widerspruch gefunden haben.
// Ein Brief mit Widerspruch bleibt „zu prüfen“, bis der Arzt ihn geklärt hat; die Bestätigung des Berichts wird nur festgehalten.
const v = $input.first().json ?? {};
if (!v.validation_id) return [{ json: { ajouter: false, motif: 'Bestätigung nicht gefunden oder ohne Prüfbericht' } }];
if (!/^kim\/[^\s]{1,200}$/.test(String(v.lettre_ref ?? ''))) return [{ json: { ajouter: false, motif: 'Kein Schreiben mit diesem Bericht verknüpft', patient_id: v.patient_id } }];
if (v.sans_contradiction !== true) return [{ json: { ajouter: false, motif: 'Widerspruch mit dem Arzt zu klären: Das Schreiben bleibt zu prüfen', patient_id: v.patient_id, lettre_ref: v.lettre_ref } }];
return [{ json: { ajouter: true, patient_id: v.patient_id, lettre_ref: v.lettre_ref, validation_id: v.validation_id } }];