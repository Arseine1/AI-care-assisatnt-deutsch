// Après validation – message de transmission à l'équipe suivante : les textes VALIDÉS (lus dans la table des
// validations), avec leurs sources et le nom du soignant qui les a validés.
const DESTINATAIRE = 'equipe-suivante@sonnenhof.example.test';
const entree = $('Entrée').first().json;
const rapports = $('Rapports validés').all().map((i) => i.json).filter((r) => r.validation_id);
if (!rapports.length) throw new Error('Aucun rapport validé à transmettre.');

const fmt = (d) => {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return { jour: `${g('day')}.${g('month')}.${g('year')}`, heure: `${g('hour')}h${g('minute')}` };
};
const portee = entree.portee === 'etage' ? 'etage' : 'resident';
const etage = portee === 'etage' ? Number(entree.etage) : null;
const maintenant = fmt(new Date());
const sujet = portee === 'etage'
  ? `Transmission de garde – étage ${etage} – ${maintenant.jour} ${maintenant.heure}`
  : `Transmission de garde – chambre ${rapports[0].chambre} (${rapports[0].civilite} ${rapports[0].nom}) – ${maintenant.jour} ${maintenant.heure}`;

const blocs = rapports.map((r) => {
  const v = fmt(r.valide_le);
  const sources = (Array.isArray(r.sources) ? r.sources : []).map((s) => `[${s}]`).join(' ');
  return [
    `=== Chambre ${r.chambre} – ${r.civilite} ${r.prenom} ${r.nom} (étage ${r.etage}) ===`,
    r.texte.trim(),
    `Sources : ${sources || 'aucune'}`,
    `Validé par ${r.valide_par} le ${v.jour} à ${v.heure}.`,
  ].join('\n');
});
const texte = [
  sujet,
  '',
  'Ce message reprend les rapports de garde des 12 dernières heures, relus et validés par un soignant. Ils ont été rédigés avec l\'aide d\'un assistant IA pour les équipes soignantes ; en cas de doute, se reporter au dossier de soins.',
  '',
  blocs.join('\n\n'),
].join('\n');

return [
  {
    json: {
      sujet,
      texte,
      destinataire: DESTINATAIRE,
      portee,
      etage,
      patient_ids: rapports.map((r) => r.patient_id),
      validation_ids: rapports.map((r) => r.validation_id),
      mailpit: {
        From: { Email: 'transmission@sonnenhof.example.test', Name: 'AI-Care – Transmission de garde' },
        To: [{ Email: DESTINATAIRE, Name: 'Équipe suivante' }],
        Subject: sujet,
        Text: texte,
      },
    },
  },
];
