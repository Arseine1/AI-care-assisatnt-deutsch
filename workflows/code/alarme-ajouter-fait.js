// Alarme de capteur – contexte de l'IA : la ligne « [Capteurs] » que le prompt contexte_alarme attend. Elle est construite
// par le CODE à partir du sujet MQTT (type, chambre, heure) ; le contenu du message du capteur n'est jamais utilisé.
const a = $('Créer l\'alarme').first().json;
const c = $('Chercher').first().json;
const fmt = (d) => {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('day')}.${g('month')}. ${g('hour')}h${g('minute')}`;
};
const alarme = {
  label: 'Capteurs',
  texte: `alarme ${a.type} (${a.libelle}), chambre ${a.chambre}`,
  date: a.recue_le,
  date_affichee: fmt(a.recue_le),
  type: 'alarme',
  groupe: 'periode',
  ref: `alarme-${a.id}`,
};
// L'alarme est aussi indexée dans le RAG (alarme-document-rag.js) : « chercher » peut donc la retrouver ; on ne la compte qu'une fois.
const dejaLa = (f) => String(f.ref ?? '').startsWith(`alarme-${a.id}`) || f.ref === 'alarmes-capteurs';
const faits = [alarme, ...c.faits.filter((f) => !dejaLa(f))].map((f, i) => ({ ...f, id: `F${i + 1}` }));
return [{ json: { ...c, faits, prompt_id: 'contexte_alarme' } }];