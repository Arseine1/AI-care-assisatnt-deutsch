// Sensoralarm – Kontext der KI: die Zeile « [Sensoren] », die der Prompt contexte_alarme erwartet. Sie wird vom
// CODE aus dem MQTT-Topic (Typ, Zimmer, Uhrzeit) gebaut; der Inhalt der Sensornachricht wird nie verwendet.
const a = $('Alarm erstellen').first().json;
const c = $('Suchen').first().json;
const fmt = (d) => {
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('day')}.${g('month')}. ${g('hour')}:${g('minute')} Uhr`;
};
const alarme = {
  label: 'Sensoren',
  texte: `Alarm ${a.type} (${a.libelle}), Zimmer ${a.chambre}`,
  date: a.recue_le,
  date_affichee: fmt(a.recue_le),
  type: 'alarme',
  groupe: 'periode',
  ref: `alarme-${a.id}`,
};
// Der Alarm ist auch im RAG indexiert (alarme-document-rag.js): « Suchen » kann ihn also wiederfinden; er wird nur einmal gezählt.
const dejaLa = (f) => String(f.ref ?? '').startsWith(`alarme-${a.id}`) || f.ref === 'alarmes-capteurs';
const faits = [alarme, ...c.faits.filter((f) => !dejaLa(f))].map((f, i) => ({ ...f, id: `F${i + 1}` }));
return [{ json: { ...c, faits, prompt_id: 'contexte_alarme' } }];
