// Sensoralarm – CODIERTE FAKTEN: der Bewohner, seine Risiken, seine Allergien und seine Risikomedikation, gelesen in der
// Pflegesoftware. Keine KI: Das zeigt das rote Banner sofort an.
const a = $('Alarm prüfen').first().json;
const r = $input.first().json ?? {};
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const FAMILLES = [
  { cle: 'anticoagulant', libelle: 'Gerinnungshemmer: Blutungsrisiko', noms: ['marcumar', 'phenprocoumon', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin'] },
  { cle: 'insuline', libelle: 'Insulin oder Antidiabetikum: Risiko einer Unterzuckerung', noms: ['insulin', 'glimepirid', 'glibenclamid', 'glipizid'] },
  { cle: 'sedatif', libelle: 'Beruhigungsmittel oder Neuroleptikum: Schläfrigkeit, Sturz', noms: ['lorazepam', 'diazepam', 'zolpidem', 'zopiclon', 'haloperidol', 'quetiapin', 'risperidon', 'mirtazapin'] },
  { cle: 'tension', libelle: 'Blutdrucksenker oder Diuretikum: Sturzrisiko', noms: ['ramipril', 'bisoprolol', 'amlodipin', 'candesartan', 'furosemid', 'torasemid', 'metoprolol', 'valsartan'] },
];
if (!r.patient_id) {
  return [{ json: { ...a, patient_id: null, contexte_statut: 'aucun', faits: { resident: null, avertissement: `Für Zimmer ${a.chambre} ist kein Bewohner erfasst.` } } }];
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
        source: 'Pflegesoftware',
      },
    },
  },
];
