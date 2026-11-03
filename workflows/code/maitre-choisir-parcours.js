// Modus A – ordnet die Anfrage dem Bewohner des Zimmers zu (Tabelle soins.residents).
const d = $('Anfrage prüfen').first().json;
const r = $('Bewohner des Zimmers').first().json;
if (!r?.patient_id) throw new Error(`Kein Bewohner im Zimmer ${d.chambre}`);
return [{ json: { ...d, patient_id: r.patient_id } }];
