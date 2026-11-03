// Courrier reçu – alerte d'un courrier NON rattaché : nom et date de naissance ne correspondent à aucun résident, ou à plusieurs.
// Le courrier reste dans « à vérifier », sans résident : on ne devine jamais.
const alertes = $input.all().map((i) => i.json).map((l) => ({
  topic: `courrier/${l.source_ref}`,
  chambre: '',
  libelle: 'Courrier non identifié',
  patient_id: '',
  faits: {
    gravite: 'attention',
    courrier: { titre: l.titre, expediteur: l.expediteur, date: l.date, ref: l.source_ref },
    avertissement: l.motif === 'identite_ambigue'
      ? 'Le nom et la date de naissance du courrier correspondent à plusieurs résidents : le courrier n\'est rattaché à personne.'
      : 'Le nom et la date de naissance du courrier ne correspondent à aucun résident : le courrier n\'est rattaché à personne.',
    source: 'KIM (lettre de médecin)',
  },
}));
return [{ json: { alertes } }];