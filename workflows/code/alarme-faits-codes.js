// Alarme de capteur – FAITS CODÉS : le résident, ses risques, ses allergies et sa médication à risque, lus dans le
// logiciel de soins. Aucune IA : c'est ce que le bandeau rouge affiche tout de suite.
const a = $('Contrôler l\'alarme').first().json;
const r = $input.first().json ?? {};
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const FAMILLES = [
  { cle: 'anticoagulant', libelle: 'anticoagulant : risque de saignement', noms: ['marcumar', 'phenprocoumon', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin'] },
  { cle: 'insuline', libelle: 'insuline ou antidiabétique : risque d\'hypoglycémie', noms: ['insulin', 'glimepirid', 'glibenclamid', 'glipizid'] },
  { cle: 'sedatif', libelle: 'sédatif ou neuroleptique : somnolence, chute', noms: ['lorazepam', 'diazepam', 'zolpidem', 'zopiclon', 'haloperidol', 'quetiapin', 'risperidon', 'mirtazapin'] },
  { cle: 'tension', libelle: 'baisse de tension ou diurétique : risque de chute', noms: ['ramipril', 'bisoprolol', 'amlodipin', 'candesartan', 'furosemid', 'torasemid', 'metoprolol', 'valsartan'] },
];
if (!r.patient_id) {
  return [{ json: { ...a, patient_id: null, contexte_statut: 'aucun', faits: { resident: null, avertissement: `Aucun résident enregistré dans la chambre ${a.chambre}.` } } }];
}
const medication = Array.isArray(r.medication) ? r.medication : [];
const aRisque = [];
for (const f of FAMILLES) {
  const meds = medication.filter((m) => f.noms.some((n) => norm(m.medicament).includes(n)));
  if (meds.length) aRisque.push({ famille: f.cle, libelle: f.libelle, medicaments: meds.map((m) => `${m.medicament} ${m.dosage}`) });
}
return [
  {
    json: {
      ...a,
      patient_id: r.patient_id,
      contexte_statut: 'a_decider',
      faits: {
        resident: `${r.civilite} ${r.prenom} ${r.nom}`,
        chambre: r.chambre,
        etage: r.etage,
        risques: r.risques ?? [],
        allergies: r.allergies ?? [],
        diagnostics: r.diagnostics ?? [],
        medication_a_risque: aRisque,
        source: 'Logiciel de soins',
      },
    },
  },
];