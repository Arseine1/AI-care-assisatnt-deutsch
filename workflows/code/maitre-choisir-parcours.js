// Mode A – associe la demande au résident de la chambre (table soins.residents).
const d = $('Contrôler la demande').first().json;
const r = $('Résident de la chambre').first().json;
if (!r?.patient_id) throw new Error(`Aucun résident dans la chambre ${d.chambre}`);
return [{ json: { ...d, patient_id: r.patient_id } }];
