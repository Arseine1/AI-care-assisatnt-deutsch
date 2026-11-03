// Après validation – documents à ajouter au RAG : le texte VALIDÉ par le soignant (relu, éventuellement corrigé),
// lu dans la table des validations (source de vérité), jamais le texte brut de l'IA ni un texte reçu de l'extérieur.
// Un rapport validé est indexé avec la source « Rapport validé » et le type « rapport_valide » : les nouveaux rapports
// SBAR ne le relisent pas comme un fait (voir « chercher »), il reste consultable par le Mode B.
const fmt = (d) => {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('day')}.${g('month')}. ${g('hour')}h${g('minute')}`;
};
const lignes = $input.all().map((i) => i.json).filter((r) => r.validation_id);
return lignes.map((r) => ({
  json: {
    collection: 'patients',
    texte: r.texte,
    titre: `Rapport de garde validé (SBAR), ${fmt(r.valide_le)}`,
    source: 'validation',
    source_label: 'Rapport validé',
    source_ref: `validation-${r.validation_id}`,
    type: 'rapport_valide',
    patient_id: r.patient_id,
    chambre: r.chambre,
    patient_label: `${r.civilite} ${r.prenom} ${r.nom} (chambre ${r.chambre})`,
    date: new Date(r.valide_le).toISOString(),
  },
}));
