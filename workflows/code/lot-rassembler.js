// Stapel einer Etage bestätigen – fasst die erfolgreichen Bestätigungen zusammen; die Ablehnungen (bereits bestätigt, nicht gefunden, leerer Text) werden aufgelistet.
const etage = $('Inhalt des Stapels').first().json.etage;
const sorties = $input.all().map((i) => i.json);
const valides = sorties.filter((s) => s.ok === true && s.action === 'generer_sbar');
const refuses = sorties
  .filter((s) => !(s.ok === true && s.action === 'generer_sbar'))
  .map((s) => ({ brouillon_id: s.brouillon_id ?? null, erreur: String(s.erreur ?? s.error?.message ?? s.error ?? 'Bestätigung abgelehnt').slice(0, 200) }));
return [{ json: { portee: 'etage', etage, validation_ids: valides.map((s) => s.validation_id), nb_valides: valides.length, refuses } }];
