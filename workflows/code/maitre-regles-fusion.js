// « Dokument prüfen » – deterministisches REGELNETZ und Zusammenführung mit dem KI-Assistenten.
//
// Warum: Ein Sprachmodell kann einen schweren Widerspruch übersehen (Llama 3 hat ein Amoxicillin bei einer gegen
// Penicillin allergischen Bewohnerin durchgelassen). Diese Regeln hängen nicht vom Modell ab: Sie lesen den TEXT
// des Schreibens und die Fakten der Akte, mit einer geschlossenen Liste von Medikamentenfamilien (französische, deutsche
// und englische Namen). Die Meldungen des Modells kommen hinzu; eine Meldung auf einer der beiden Seiten genügt.
//
// Regeln (Schweregrad hoch):
//   allergie                 ein Medikament des Schreibens gehört zu einer Familie, gegen die eine Allergie bekannt ist
//   anticoagulation_double   ein Antikoagulans im Schreiben, obwohl der Bewohner bereits ein anderes nimmt, ohne Absetzen des ersten
//   insuffisance_renale      ein Entzündungshemmer (NSAR), obwohl die Akte oder das Schreiben eine Niereninsuffizienz angibt
const ctx = $('Schreiben wählen').first().json;
const lettre = ctx.lettre;
// Zwei Aufrufe: « Nur Regeln » (sofortige Antwort: die KI-Schritte sind noch NICHT gelaufen) und « Regeln und Zusammenführung »
// (zusätzliche Analyse als Hintergrundaufgabe: die KI-Schritte sind gelaufen, mit oder ohne Erfolg).
const sortie = (nom) => {
  try {
    return { executee: true, json: $(nom).first().json ?? {} };
  } catch {
    return { executee: false, json: {} };
  }
};
const iaExecutee = sortie('Verfassen (Vergleich)').executee || sortie('Verfassen (Extraktion)').executee;
const extraction = sortie('Verfassen (Extraktion)').json;
const comparaison = sortie('Verfassen (Vergleich)').json;

// ß wird zu ss (NFD zerlegt es nicht); Akzente und Umlaute fallen weg
const norm = (s) => String(s).replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tl = norm(lettre.texte);
const motsLettre = String(lettre.texte).split(/\s+/);
const SRC_LETTRE = 'KIM (Arztbrief)';

// Die Fakten der Akte des Bewohners: weder die Protokolle (allgemeine Regeln) noch das Schreiben selbst.
// (Die alten französischen Quellenbezeichnungen werden weiterhin erkannt.)
const faitsDossier = (ctx.faits ?? []).filter((f) => f.label !== 'Dateien' && f.label !== 'Fichiers' && f.label !== SRC_LETTRE && f.label !== 'KIM (lettre de médecin)');

const FAMILLES = {
  penicillines: {
    allergie: ['penicillin', 'penicilline'],
    medicaments: ['penicillin', 'penicilline', 'amoxicillin', 'amoxicilline', 'ampicillin', 'ampicilline', 'flucloxacillin', 'flucloxacilline', 'piperacillin', 'piperacilline'],
    libelle: 'Penicilline',
  },
  sulfamides: {
    allergie: ['sulfamide', 'sulfonamid', 'cotrimoxazol', 'sulfamethoxazol'],
    medicaments: ['cotrimoxazol', 'cotrimoxazole', 'sulfamethoxazol', 'sulfamethoxazole', 'sulfamide', 'sulfonamid'],
    libelle: 'Sulfonamide',
  },
};
// Antikoagulanzien: Name -> Wirkstoff (die Synonyme bilden einen einzigen Wirkstoff)
const ANTICOAGULANTS = {
  marcumar: 'phenprocoumon', phenprocoumon: 'phenprocoumon', phenprocoumone: 'phenprocoumon',
  apixaban: 'apixaban', rivaroxaban: 'rivaroxaban', dabigatran: 'dabigatran', edoxaban: 'edoxaban',
  heparine: 'heparine', heparin: 'heparine', enoxaparin: 'enoxaparine', enoxaparine: 'enoxaparine',
};
const AINS = ['ibuprofen', 'ibuprofene', 'diclofenac', 'naproxen', 'naproxene', 'ketoprofen', 'ketoprofene', 'indometacin', 'etoricoxib'];
// Niereninsuffizienz (französische, deutsche Begriffe; der Text ist normalisiert: ä/ö/ü -> a/o/u, ß -> ss; ue/oe-Schreibweisen sind mit abgedeckt)
const RENAL = /insuffisance renale|niereninsuffizienz|nierenerkrank|nierenfunktionsst(?:o|oe)rung|eingeschr(?:a|ae)nkte nierenfunktion|nierenversagen|nierenschaden|nsar (sind )?kontraindiziert|ains contre indiques|ains contre-indiques|\bdfg\b|\begfr\b|nephropath/;
const ARRET = /(absetz|abgesetz|pausier|beend|stopp|arret|arreter|discontinu|ersetz|ablos|nicht mehr|supprim)/;

const trouve = (noms, t) => noms.filter((n) => new RegExp(`\\b${n}`).test(t));
const extrait = (nom) => {
  const i = motsLettre.findIndex((w) => norm(w).startsWith(nom));
  return i < 0 ? '' : motsLettre.slice(Math.max(0, i - 1), i + 6).join(' ').slice(0, 120);
};
const court = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 160);

const regles = [];

// ---- Allergie ----
for (const [cle, fam] of Object.entries(FAMILLES)) {
  const faitAllergie = faitsDossier.find((f) => /allergi/.test(norm(f.texte)) && fam.allergie.some((k) => norm(f.texte).includes(k)));
  const meds = trouve(fam.medicaments, tl);
  if (faitAllergie && meds.length) {
    regles.push({
      type: 'allergie',
      gravite: 'haute',
      description: `Das Schreiben nennt ${meds[0]}, ${fam.libelle === 'Penicilline' ? 'ein Penicillin' : 'einen Wirkstoff aus der Familie der ' + fam.libelle}, obwohl eine Allergie gegen diese Wirkstoffgruppe bekannt ist.`,
      element_lettre: extrait(meds[0]),
      element_source: court(faitAllergie.texte),
      sources: [SRC_LETTRE, faitAllergie.label],
      origine: 'regles',
      cle,
    });
  }
}

// ---- doppelte Antikoagulation ----
const substancesLettre = [...new Set(trouve(Object.keys(ANTICOAGULANTS), tl).map((n) => ANTICOAGULANTS[n]))];
const dossierAnticoag = new Map(); // Wirkstoff -> Fakt
for (const f of faitsDossier) {
  const tf = norm(f.texte);
  for (const n of trouve(Object.keys(ANTICOAGULANTS), tf)) if (!dossierAnticoag.has(ANTICOAGULANTS[n])) dossierAnticoag.set(ANTICOAGULANTS[n], f);
}
const arrete = (substance) => {
  const noms = Object.keys(ANTICOAGULANTS).filter((n) => ANTICOAGULANTS[n] === substance);
  return noms.some((n) => {
    for (const m of tl.matchAll(new RegExp(`\\b${n}`, 'g'))) {
      const fenetre = tl.slice(Math.max(0, m.index - 100), m.index + 100);
      if (ARRET.test(fenetre)) return true;
    }
    return false;
  });
};
for (const nouvelle of substancesLettre) {
  if (dossierAnticoag.has(nouvelle) || dossierAnticoag.size === 0) continue;
  if ([...dossierAnticoag.keys()].every((ancienne) => !arrete(ancienne))) {
    const [ancienne, fait] = [...dossierAnticoag.entries()][0];
    const nomLettre = Object.keys(ANTICOAGULANTS).find((n) => ANTICOAGULANTS[n] === nouvelle && new RegExp(`\\b${n}`).test(tl));
    regles.push({
      type: 'anticoagulation_double',
      gravite: 'haute',
      description: `Das Schreiben nennt das Antikoagulans ${nomLettre}, obwohl der Bewohner bereits ein anderes Antikoagulans nimmt (${ancienne}) und das Schreiben dessen Absetzen nicht erwähnt: Risiko einer doppelten Antikoagulation.`,
      element_lettre: extrait(nomLettre),
      element_source: court(fait.texte),
      sources: [SRC_LETTRE, fait.label],
      origine: 'regles',
    });
  }
}

// ---- NSAR und Niereninsuffizienz ----
const ainsLettre = trouve(AINS, tl);
if (ainsLettre.length) {
  const faitRenal = faitsDossier.find((f) => RENAL.test(norm(f.texte)));
  const renalLettre = /niereninsuffizienz|insuffisance renale|nierenerkrank/.test(tl);
  if (faitRenal || renalLettre) {
    regles.push({
      type: 'insuffisance_renale',
      gravite: 'haute',
      description: `Das Schreiben nennt ${ainsLettre[0]}, einen Entzündungshemmer (NSAR), obwohl eine Niereninsuffizienz angegeben ist: NSAR sind zu vermeiden, teilweise kontraindiziert.`,
      element_lettre: extrait(ainsLettre[0]),
      element_source: faitRenal ? court(faitRenal.texte) : 'Hinweis auf eine Niereninsuffizienz im Schreiben selbst',
      sources: faitRenal ? [SRC_LETTRE, faitRenal.label] : [SRC_LETTRE],
      origine: 'regles',
    });
  }
}

// ---- Meldungen des KI-Assistenten (nie unverändert übernommen: kontrolliertes JSON, ergänzte Felder) ----
let modele = [];
try {
  const o = JSON.parse(comparaison.texte ?? '');
  if (Array.isArray(o.contradictions)) modele = o.contradictions.filter((c) => c && typeof c === 'object');
} catch {
  /* unlesbare Ausgabe: die Regeln genügen */
}
// Eine Meldung des Modells wird nur beibehalten, wenn sie sich auf einen ECHTEN Fakt der Akte (Quellelement) und auf eine
// ECHTE Stelle des Schreibens (Element des Schreibens) stützt: Das Modell kann einen Widerspruch erfinden, was die Pflegekräfte ermüden würde.
const motsDe = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 5));
const part = (mots, cible) => (mots.size ? [...mots].filter((w) => cible.has(w)).length / mots.size : 0);
const motsLettre2 = motsDe(lettre.texte);
const soutenue = (c) => {
  const src = motsDe(c.element_source ?? '');
  const let_ = motsDe(c.element_lettre ?? '');
  if (src.size < 2 || let_.size < 1) return false;
  return faitsDossier.some((f) => part(src, motsDe(f.texte)) >= 0.6) && part(let_, motsLettre2) >= 0.6;
};
const candidatsModele = modele.filter((c) => !regles.some((r) => r.type === c.type && r.type !== 'autre'));
const ecartes = candidatsModele.filter((c) => !soutenue(c));
const deModele = candidatsModele
  .filter(soutenue)
  .map((c) => ({
    type: ['allergie', 'anticoagulation_double', 'insuffisance_renale'].includes(c.type) ? c.type : 'autre',
    gravite: c.gravite === 'haute' ? 'haute' : 'moyenne',
    description: `${String(c.description ?? 'Vom KI-Assistenten gemeldeter Widerspruch').slice(0, 220)} (zu prüfen: nur vom KI-Assistenten gemeldet).`,
    element_lettre: court(c.element_lettre ?? ''),
    element_source: court(c.element_source ?? ''),
    sources: [SRC_LETTRE, ...(Array.isArray(c.sources) ? c.sources.map((s) => String(s).replace(/^\[|\]$/g, '')).filter((s) => s !== SRC_LETTRE) : [])],
    origine: 'modele',
  }));

const contradictions = [...regles, ...deModele];

// ---- vom Code verfasster Bericht (nie vom Modell) ----
const lignes = [`Analysiertes Dokument: ${lettre.titre ?? 'Arztbrief'} (Absender: ${lettre.expediteur ?? 'unbekannt'}). [${SRC_LETTRE}]`];
if (!contradictions.length) {
  lignes.push(`Kein Widerspruch von den Kontrollregeln erkannt${iaExecutee ? ' und auch nicht vom KI-Assistenten' : ''}; das ersetzt nicht die Durchsicht durch die Pflegekraft. [${SRC_LETTRE}]`);
} else {
  lignes.push(`${contradictions.length} Widerspruch/Widersprüche vor jeder Verabreichung mit der Ärztin oder dem Arzt zu klären:`);
  contradictions.forEach((c, i) => {
    lignes.push(`${i + 1}. ${c.description} Schreiben: „${c.element_lettre}“. Akte: „${c.element_source}“. ${[...new Set(c.sources)].map((s) => `[${s}]`).join(' ')}`);
  });
}

const avertissements = [];
const ETAPES = { extraction: 'Extraktion', comparaison: 'Vergleich' }; // Anzeigenamen der Schritte (der Code im Typ bleibt « extraction » / « comparaison »)
const heriter = (etape, r) => {
  if (!r || !r.texte) avertissements.push({ type: `${etape}_indisponible`, detail: `Der Schritt „${ETAPES[etape] ?? etape}“ des KI-Assistenten ist nicht gelungen: Es wurden nur die Kontrollregeln angewendet.` });
  else {
    for (const a of r.avertissements ?? []) {
      // fehlende optionale Schlüssel in der Extraktion: interner Schritt, für die Pflegekraft ohne Bedeutung (Wert als « null » gelesen)
      if (etape === 'extraction' && a.type === 'json_incomplet') continue;
      avertissements.push({ type: a.type, detail: `${ETAPES[etape] ?? etape}: ${a.detail ?? ''}`.slice(0, 200) });
    }
  }
};
if (ecartes.length) {
  avertissements.push({ type: 'contradiction_modele_ecartee', detail: `${ecartes.length} vom KI-Assistenten gemeldete(r) Widerspruch/Widersprüche verworfen: Sie stützen sich auf keinen Fakt der Akte.` });
}
if (iaExecutee) {
  heriter('extraction', extraction);
  heriter('comparaison', comparaison);
}
if (regles.length && !modele.length && comparaison.texte) {
  avertissements.push({ type: 'modele_a_rate', detail: 'Der KI-Assistent hat keinen Widerspruch gemeldet; die Widersprüche stammen aus den Kontrollregeln.' });
}

return [
  {
    json: {
      texte: lignes.join('\n'),
      contradictions,
      sources: [...new Set(contradictions.flatMap((c) => c.sources).concat(SRC_LETTRE))],
      alertes: contradictions.map((c) => ({ type: 'contradiction', message: c.description })),
      avertissements,
      nb_regles: regles.length,
      nb_modele: deModele.length,
      ia_executee: iaExecutee,
      contradictions_modele: deModele,
      ecartees_modele: ecartes.length,
      lettre_ref: lettre.ref,
      modele: comparaison.modele ?? extraction.modele ?? null,
      prompt_versions: iaExecutee ? `extraire_faits@${extraction.prompt_version ?? '?'}+comparer@${comparaison.prompt_version ?? '?'}+regles@1.0.0` : 'regles@1.0.0',
    },
  },
];
