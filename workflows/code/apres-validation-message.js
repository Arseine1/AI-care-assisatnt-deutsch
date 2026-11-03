// Nach der Bestätigung – Übergabenachricht an das nächste Team: die BESTÄTIGTEN Texte (gelesen in der Tabelle der
// Bestätigungen), mit ihren Quellen und dem Namen der Pflegekraft, die sie bestätigt hat.
const DESTINATAIRE = 'equipe-suivante@sonnenhof.example.test';
const entree = $('Eingang').first().json;
const rapports = $('Bestätigte Berichte').all().map((i) => i.json).filter((r) => r.validation_id);
if (!rapports.length) throw new Error('Kein bestätigter Bericht zur Weitergabe.');

const fmt = (d) => {
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return { jour: `${g('day')}.${g('month')}.${g('year')}`, heure: `${g('hour')}:${g('minute')} Uhr` };
};
const portee = entree.portee === 'etage' ? 'etage' : 'resident';
const etage = portee === 'etage' ? Number(entree.etage) : null;
const maintenant = fmt(new Date());
const sujet = portee === 'etage'
  ? `Dienstübergabe – Etage ${etage} – ${maintenant.jour} ${maintenant.heure}`
  : `Dienstübergabe – Zimmer ${rapports[0].chambre} (${rapports[0].civilite} ${rapports[0].nom}) – ${maintenant.jour} ${maintenant.heure}`;

const blocs = rapports.map((r) => {
  const v = fmt(r.valide_le);
  const sources = (Array.isArray(r.sources) ? r.sources : []).map((s) => `[${s}]`).join(' ');
  return [
    `=== Zimmer ${r.chambre} – ${r.civilite} ${r.prenom} ${r.nom} (Etage ${r.etage}) ===`,
    r.texte.trim(),
    `Quellen: ${sources || 'keine'}`,
    `Bestätigt von ${r.valide_par} am ${v.jour} um ${v.heure}.`,
  ].join('\n');
});
const texte = [
  sujet,
  '',
  'Diese Nachricht enthält die Dienstberichte der letzten 12 Stunden, die von einer Pflegekraft gelesen und bestätigt wurden. Sie wurden mit Hilfe eines KI-Assistenten für Pflegeteams verfasst; im Zweifelsfall ist die Pflegedokumentation maßgeblich.',
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
        From: { Email: 'transmission@sonnenhof.example.test', Name: 'AI-Care – Dienstübergabe' },
        To: [{ Email: DESTINATAIRE, Name: 'Nächstes Team' }],
        Subject: sujet,
        Text: texte,
      },
    },
  },
];
