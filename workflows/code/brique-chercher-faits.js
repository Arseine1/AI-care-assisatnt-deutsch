// Baustein « Suchen » – Zusammenstellung der FAKTENLISTE eines einzelnen Bewohners.
//
// Zwei Familien von Quellen:
//   1. DIREKTES Lesen der Pflegesoftware (Notizen, Vitalwerte, Medikationsplan, Stammblatt): immer aktuell, denn
//      das RAG wird nur 4-mal täglich aktualisiert;
//   2. RAG (Qdrant), IMMER nach patient_id gefiltert: ePA, Krankenhausdatenbank, Dateien und die Protokolle.
// Der Inhalt der Sammlung « a_verifier » (ungeprüfte Schreiben) wird NIE mit den Fakten vermischt: Er wird getrennt ausgegeben.
const P = $('Parameter').first().json;
const r = $('Bewohner').first().json;
if (!r || r.patient_id !== P.patient_id) throw new Error(`Unbekannter Bewohner: ${P.patient_id}`);

const lignes = (nom, cle) => $(nom).all().map((i) => i.json).filter((x) => x[cle] !== undefined && x[cle] !== null);
const autres = lignes('Andere Bewohner', 'patient_id');
const notes = lignes('Notizen des Zeitraums', 'id');
const vitaux = lignes('Vitalwerte des Zeitraums', 'type');
const meds = lignes('Medikationsplan', 'medicament');
const resultats = (nom) => $(nom).first().json?.result ?? [];

const fmt = (d) => {
  const p = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('day')}.${g('month')}. ${g('hour')}:${g('minute')} Uhr`;
};
const propre = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 600);

const fond = []; // Hintergrundinformationen (Profil, ePA, Krankenhaus, Protokolle)
const periode = []; // datierte Ereignisse des Zeitraums
const LS = 'Pflegesoftware';
const ajoute = (liste, label, texte, date, type, ref) =>
  liste.push({ label, texte: propre(texte), date: date ? new Date(date).toISOString() : null, type, ref });

// ---- 1. direktes Lesen der Pflegesoftware ----
const liste = (a, vide) => (a && a.length ? a.join(' ; ') : vide);
ajoute(fond, LS, `Diagnosen: ${liste(r.diagnostics, 'keine')}`, null, 'profil', `profil-${r.patient_id}`);
ajoute(fond, LS, `Allergien: ${liste(r.allergies, 'keine bekannt')}`, null, 'profil', `profil-${r.patient_id}`);
ajoute(fond, LS, `Ernährung: ${(r.regime ?? 'nicht angegeben').replace(/\.\s*$/, '')}`, null, 'profil', `profil-${r.patient_id}`);
ajoute(fond, LS, `Risiken: ${liste(r.risques, 'keine gemeldet')}`, null, 'profil', `profil-${r.patient_id}`);
if (meds.length) {
  ajoute(
    fond, LS,
    `Medikationsplan: ${meds.map((m) => `${m.medicament} ${m.dosage} (${m.schema_prise})${m.indication ? ' bei ' + m.indication : ''}`).join(' ; ')}`,
    null, 'medication', `plan-${r.patient_id}`,
  );
}
for (const n of notes) ajoute(periode, LS, `${n.categorie} (${n.auteur}): ${n.texte}`, n.horodatage, 'note', `note-${n.id}`);
const parHeure = new Map();
for (const v of vitaux) {
  const cle = new Date(v.horodatage).toISOString().slice(0, 16);
  if (!parHeure.has(cle)) parHeure.set(cle, { date: v.horodatage, items: [] });
  parHeure.get(cle).items.push(`${v.type} ${v.valeur}${v.unite ? ' ' + v.unite : ''}`);
}
for (const { date, items } of parHeure.values()) ajoute(periode, LS, `Vitalwerte: ${items.join(' ; ')}`, date, 'constantes', `vitaux-${date}`);

// ---- 2. RAG: alles, was nicht direkt gelesen wird (die Pflegesoftware wird schon gelesen) ----
const vus = new Set();
const alarmesRag = [];
const depuisRag =(liste, destination) => {
  for (const x of liste) {
    const p = x.payload ?? {};
    if (p.source === 'logiciel_soins') continue;
    // Ein bereits bestätigter Bericht ist der Text einer Pflegekraft, kein Quellenfakt: Einen früheren SBAR erneut zu lesen, um einen neuen
    // zu schreiben, würde seine eventuellen Fehler übernehmen (und verstärken). Nur die Prompts, die es verlangen (Modus B), sehen ihn.
    if (p.type === 'rapport_valide' && !P.rapports_valides) continue;
    const cle = `${p.source}|${p.source_ref}|${p.chunk_index}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    // Die im RAG indexierten Sensoralarme werden zu EINEM einzigen Fakt ZUSAMMENGEFASST (unten): Ein Alarm wird immer behalten
    // (maximale Wichtigkeit), und mehrere Alarme einer Nacht würden sonst die Hälfte der 8 Plätze belegen, zulasten der Vitalwerte,
    // Allergien und Notizen.
    if (p.type === 'alarme' && p.source === 'capteurs') {
      alarmesRag.push({ date: p.date ?? null, texte: p.texte });
      continue;
    }
    // ein Protokoll erscheint als solches (« Protokoll Stürze »), nicht unter dem Namen des Konnektors (« Dateien »)
    ajoute(destination, p.type === 'protocole' ? `Protokoll ${String(p.theme ?? '').replace(/[-_]/g, ' ')}`.trim() : p.source_label, p.texte, p.date ?? null, p.type, `${p.source_ref}#${p.chunk_index}`);
  }
};
depuisRag(resultats('Qdrant Zeitraum'), periode);
depuisRag(resultats('Qdrant Hintergrund'), fond);
if (P.protocoles) depuisRag(resultats('Qdrant Standards'), fond);
if (alarmesRag.length) {
  const recentes = alarmesRag.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-5);
  // bei der Indexierung vom Code gebauter Text (« Sensoralarm (Sturz) am 27.10. um 13:47 Uhr, Zimmer 12. », früher « Alarme de capteur (chute) le 27.10. à 13h47, chambre 12. »): Typ, Tag und Uhrzeit bleiben
  const court = (t) => String(t).replace(/^(?:Alarme de capteur|Sensoralarm)\s*/i, '').replace(/,?\s*(?:chambre|Zimmer)\s*\d+\.?$/i, '').trim();
  ajoute(periode, 'Sensoren', `Sensoralarme im Zeitraum: ${recentes.map((a) => court(a.texte)).join(' ; ')}`, recentes.at(-1).date, 'alarme', 'alarmes-capteurs');
}

// ---- 3. NICHT geprüfte Schreiben: niemals in den Fakten ----
const lettres = ($('Qdrant Schreiben').first().json?.result?.points ?? []).map((x) => ({
  titre: x.payload.titre, expediteur: x.payload.expediteur, date: x.payload.date, ref: x.payload.source_ref,
  motif: x.payload.motif, texte: x.payload.texte,
}));

// ---- Sortierung, Obergrenze, Nummerierung ----
// Höchstens MAX_FAITS Fakten pro Bewohner (standardmäßig 8): weniger Fakten bedeuten einen kürzeren Prompt (das Modell liest ihn
// schneller) und weniger Stoff für Verwechslungen. Behalten werden die für die Sicherheit wichtigsten Fakten:
// zuerst Vorfälle und Allergien, dann Risiken, Medikation, Vitalwerte, jüngste Beobachtungen, Diagnosen, Ernährung.
const MAX_FAITS = Math.min(Math.max(Number(P.max_faits ?? 8), 3), 40);
const prioritaires = new Set(P.sources_prioritaires ?? []);
periode.sort((a, b) => String(a.date).localeCompare(String(b.date)));
const importance = (f, rangRecent) => {
  const t = String(f.texte).toLowerCase();
  let s = 40;
  if (f.type === 'note') s = /^(incident|vorfall|zwischenfall)/.test(t) ? 100 : /^(soins|medication|médication|pflege|medikation|medikamente)/.test(t) ? 62 : 56;
  else if (f.type === 'constantes') s = 50;
  else if (f.type === 'profil') s = /^(allergies|allergien)/.test(t) ? 98 : /^(risques|risiken)/.test(t) ? 90 : /^(diagnostics|diagnosen)/.test(t) ? 58 : 30;
  else if (f.type === 'medication') s = 70;
  else if (['allergie'].includes(f.type)) s = 97;
  else if (['diagnostic', 'analyse'].includes(f.type)) s = 60;
  else if (f.type === 'protocole') s = 45;
  else if (f.type === 'rapport_valide') s = 35;
  if (prioritaires.has(f.label)) s += 100;
  if (/alarme|capteur|alarm|sensor/i.test(f.label)) s += 120; // ein Sensoralarm wird immer behalten
  return s + (rangRecent ?? 0); // bei gleicher Wichtigkeit der jüngste
};
// ---- Relevanz für die Anfrage (Modus B: die Anweisung der Pflegekraft, BEREITS geprüft) ----
// Ohne dies hingen die 8 behaltenen Fakten nur von ihrer allgemeinen Wichtigkeit ab: Eine Frage zum Gewicht oder zum Fieber
// konnte den Fakt, der antwortet, nie zu sehen bekommen. Hier lassen die Wörter der Anfrage (und einige pflegerische Synonyme)
// die Fakten nach oben steigen, die davon handeln. Handelt KEIN Fakt des Bewohners davon, erhält das Modell KEINEN Fakt: Es kann dann
// nichts behaupten, und die Antwort lautet « Information nicht verfügbar » (statt eines Fakts ohne Bezug).
// Hinweis: sansAccent entfernt auch die Umlaute (ä -> a, ö -> o, ü -> u) und wandelt ß in ss um; die Wörter unten stehen in dieser Form.
const sansAccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase();
const MOTS_GENERAUX = new Set([
  'quel', 'quels', 'quelle', 'quelles', 'comment', 'passe', 'passee', 'derniers', 'dernieres', 'dernier', 'derniere', 'nuit', 'heures',
  'resume', 'resumer', 'resumes', 'donne', 'donnez', 'indique', 'liste', 'dites', 'sont', 'etre', 'avoir', 'faire', 'fait', 'faits', 'etat',
  'general', 'generale', 'situation', 'journee', 'soir', 'matin', 'rapport', 'transmission', 'synthese', 'points', 'important', 'importants',
  'importante', 'importantes', 'information', 'informations', 'concernant', 'propos', 'resident', 'residente', 'avec', 'dans', 'pour', 'cette',
  'depuis', 'tout', 'tous', 'toute', 'toutes', 'plus', 'moins', 'aujourd', 'hier', 'recemment', 'actuel', 'actuelle', 'actuellement', 'quand', 'combien',
  'elle', 'elles', 'etait', 'etaient', 'avant', 'apres', 'pendant', 'porte', 'portent', 'contre', 'prend', 'prends', 'prennent', 'heure', 'niveau',
  'autre', 'autres', 'encore', 'deja', 'jamais', 'souvent', 'cette', 'celui', 'celle', 'leur', 'leurs', 'ainsi', 'alors', 'aussi', 'sans', 'chez',
  // deutsch
  'welche', 'welcher', 'welches', 'welchen', 'wann', 'wieviel', 'wieviele', 'wurde', 'wurden', 'letzte', 'letzten', 'letzter', 'letztes',
  'nacht', 'stunde', 'stunden', 'zusammenfassung', 'fasse', 'fassen', 'gebe', 'gebt', 'nenne', 'nennen', 'zeige', 'zeigen', 'liste', 'sind',
  'sein', 'seine', 'seinen', 'seiner', 'haben', 'macht', 'machen', 'zustand', 'allgemein', 'allgemeine', 'allgemeiner', 'situation', 'tagesverlauf',
  'abend', 'morgen', 'bericht', 'ubergabe', 'uebergabe', 'wichtig', 'wichtige', 'wichtigen', 'wichtiger', 'wichtigsten', 'information',
  'informationen', 'bezuglich', 'bezueglich', 'betreffend', 'bewohner', 'bewohnerin', 'diese', 'dieser', 'diesem', 'diesen', 'dieses', 'seit',
  'alle', 'allen', 'alles', 'mehr', 'weniger', 'heute', 'gestern', 'kurzlich', 'aktuell', 'aktuelle', 'aktuellen', 'aktueller', 'aktuelles',
  'sie', 'ihre', 'ihren', 'ihrem', 'ihrer', 'vorher', 'nachher', 'wahrend', 'waehrend', 'gegen', 'nimmt', 'nehmen', 'bekommt', 'erhalt',
  'erhaelt', 'stand', 'andere', 'anderen', 'noch', 'schon', 'nicht', 'immer', 'oft', 'haufig', 'dann', 'auch', 'ohne', 'fur', 'fuer',
  'uber', 'ueber', 'beim', 'einer', 'einem', 'einen', 'eine', 'gibt', 'liegt', 'liegen', 'steht', 'stehen', 'zeit', 'ganz', 'mein', 'unser',
]);
const SYNONYMES = {
  fievre: ['temperature', 'fievre', 'febrile'], febrile: ['temperature', 'fievre', 'febrile'], temperature: ['temperature', 'fievre'],
  saturation: ['spo2', 'saturation', 'oxygene'], oxygene: ['spo2', 'oxygene'], respiration: ['spo2', 'respir', 'dyspnee'],
  tension: ['tension', 'pression'], pouls: ['pouls', 'frequence'], poids: ['poids', 'kg'], diurese: ['diurese', 'urine', 'urines'],
  glycemie: ['glycemie', 'glucose', 'sucre'], sucre: ['glycemie', 'glucose'], douleur: ['douleur', 'eva'], medicaments: ['medication', 'dosage', 'mg'],
  medicament: ['medication', 'dosage', 'mg'], traitement: ['medication', 'traitement', 'dosage', 'mg'], allergie: ['allergie', 'allergies'],
  mobilisation: ['mobilis', 'deambul', 'marche', 'fauteuil'], agite: ['agit', 'errance', 'nerveu'], agitee: ['agit', 'errance', 'nerveu'],
  agitation: ['agit', 'errance'], peau: ['peau', 'rougeur', 'escarre', 'sacrum', 'pansement'], chute: ['chute', 'sol'],
  // deutsch (Schlüssel in der Form von sansAccent)
  fieber: ['temperatur', 'fieber'], fieberhaft: ['temperatur', 'fieber'], temperatur: ['temperatur', 'fieber'], korpertemperatur: ['temperatur', 'fieber'],
  sattigung: ['spo2', 'sattigung', 'sauerstoff'], sauerstoff: ['spo2', 'sauerstoff', 'sattigung'], sauerstoffsattigung: ['spo2', 'sattigung', 'sauerstoff'],
  atmung: ['spo2', 'atem', 'atmung', 'dyspnoe', 'luftnot'], atem: ['spo2', 'atem', 'atmung', 'dyspnoe', 'luftnot'], luftnot: ['spo2', 'atem', 'dyspnoe', 'luftnot'],
  blutdruck: ['blutdruck', 'rr', 'mmhg'], puls: ['puls', 'frequenz'], pulsfrequenz: ['puls', 'frequenz'], gewicht: ['gewicht', 'kg'],
  urin: ['urin', 'ausscheidung', 'diurese'], ausscheidung: ['ausscheidung', 'urin', 'diurese'], ausscheidungen: ['ausscheidung', 'urin', 'diurese'],
  blutzucker: ['blutzucker', 'glukose', 'glucose', 'zucker'], zucker: ['blutzucker', 'glukose', 'glucose', 'zucker'],
  schmerz: ['schmerz', 'nrs', 'eva'], schmerzen: ['schmerz', 'nrs', 'eva'], medikamente: ['medikation', 'dosierung', 'mg'], medikament: ['medikation', 'dosierung', 'mg'],
  medikation: ['medikation', 'dosierung', 'mg'], therapie: ['medikation', 'therapie', 'dosierung', 'mg'], behandlung: ['medikation', 'behandlung', 'therapie', 'dosierung', 'mg'],
  allergien: ['allergie', 'allergien'], mobilisation: ['mobilis', 'gehen', 'gang', 'rollstuhl'], mobilisierung: ['mobilis', 'gehen', 'gang', 'rollstuhl'],
  unruhe: ['unruh', 'umherirr', 'nervos'], unruhig: ['unruh', 'umherirr', 'nervos'], agitiert: ['agit', 'unruh', 'umherirr'],
  haut: ['haut', 'rotung', 'dekubitus', 'sakrum', 'verband'], wunde: ['wunde', 'verband', 'dekubitus'], sturz: ['sturz', 'boden'], sturze: ['sturz', 'boden'],
};
// Ein Wort der Anfrage « handelt » von einem Fakt, wenn der Fakt dieses Wort bis auf eine Endung (s, e, es, n, en …) enthält: « Röntgenaufnahme »
// findet « Röntgenaufnahmen », « Person » findet aber nicht « Personal ». Die Synonyme oben werden am Wortanfang gesucht.
const TERMINAISONS = new Set(['s', 'x', 'e', 'es', 'ee', 'ees', 'ent', 'er', 'ez', 'a', 'n', 'en', 'em', 't', 'te', 'ten']);
const memeMot = (demande, mot) => demande === mot || (demande.length >= 5 && mot.length >= 5 && (mot.startsWith(demande) ? TERMINAISONS.has(mot.slice(demande.length)) : demande.startsWith(mot) && TERMINAISONS.has(demande.slice(mot.length))));
const motsDemande = P.filtrer_requete === true
  ? [...new Set(sansAccent(P.requete).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !MOTS_GENERAUX.has(w)))]
  : [];
const debutsSynonymes = [...new Set(motsDemande.flatMap((w) => SYNONYMES[w] ?? []))];
const parleDeLaDemande = (f) => {
  if (!motsDemande.length) return false;
  const mots = sansAccent(`${f.texte} ${f.label} ${f.type ?? ''}`).split(/[^a-z0-9]+/).filter(Boolean);
  return motsDemande.some((w) => mots.some((m) => memeMot(w, m))) || debutsSynonymes.some((d) => mots.some((m) => m.startsWith(d)));
};
const bonusPertinence = (f) => (parleDeLaDemande(f) ? 150 : 0);

const candidats = [
  ...fond.map((f) => ({ ...f, groupe: 'fond', score: importance(f) + bonusPertinence(f) })),
  ...periode.map((f, i) => ({ ...f, groupe: 'periode', score: importance(f, (i / Math.max(periode.length, 1)) * 10) + bonusPertinence(f) })),
];
const aucuneCorrespondance = motsDemande.length > 0 && !candidats.some(parleDeLaDemande);
const tronque = candidats.length > MAX_FAITS;
const retenus = new Set(aucuneCorrespondance ? [] : [...candidats].sort((a, b) => b.score - a.score).slice(0, MAX_FAITS));
// Anzeigereihenfolge: zuerst die Hintergrundinformationen, dann der Zeitraum in chronologischer Reihenfolge
const faits = candidats
  .filter((f) => retenus.has(f))
  .map(({ score, ...f }) => f)
  .map((f, i) => ({ id: `F${i + 1}`, ...f, date_affichee: f.date ? fmt(f.date) : null }));

const par_source = {};
for (const f of faits) par_source[f.label] = (par_source[f.label] ?? 0) + 1;

return [
  {
    json: {
      patient: {
        patient_id: r.patient_id,
        label: `${r.civilite} ${r.prenom} ${r.nom}`,
        chambre: r.chambre,
        etage: r.etage,
        naissance: r.naissance,
      },
      periode: { depuis: P.depuis, jusqua: P.jusqua, depuis_affiche: fmt(P.depuis), jusqua_affiche: fmt(P.jusqua) },
      faits,
      lettres,
      // für die Kontrolle « niemals zwei Bewohner vermischen »: Namen und Zimmer der ANDEREN Bewohner
      autres: {
        noms: [...new Set(autres.map((x) => x.nom))].filter((n) => n.toLowerCase() !== String(r.nom).toLowerCase()),
        chambres: autres.map((x) => String(x.chambre)).filter((c) => c !== String(r.chambre)),
      },
      stats: { nb_faits: faits.length, par_source, tronque, nb_lettres_a_verifier: lettres.length, aucune_correspondance: aucuneCorrespondance },
    },
  },
];
