// Baustein „Verfassen“ – automatische Kontrolle der KI-Antwort, BEVOR sie der Pflegekraft angezeigt wird.
// Keine Kontrolle ersetzt die menschliche Durchsicht; sie melden, was nicht in den Quellen steht:
//   source_inconnue      eine Quelle in eckigen Klammern, die in den Fakten nicht existiert
//   phrase_sans_source   eine Zeile (ein Satz) ohne Quelle
//   valeur_non_sourcee   eine Zahl oder Uhrzeit, die in den Fakten fehlt
//   chiffre_hors_source_citee   eine Zahl, die in den Fakten vorkommt, aber nicht in der in ihrer Zeile genannten Quelle
//   source_probablement_erronee  die Zeile ähnelt vor allem einem Fakt einer ANDEREN als der genannten Quelle
//   autre_resident       Name oder Zimmer eines anderen Bewohners
//   json_invalide        strenge JSON-Ausgabe nicht eingehalten
const rep = $input.first().json;
const ctx = $('Aufruf vorbereiten').first().json;
const faits = ctx.faits ?? [];
let texte = String(rep.response ?? '').trim();
const avertissements = [];
// Dieselbe Warnung wird nur einmal vermerkt (eine Antwort in einer Schleife würde Dutzende erzeugen).
const signale = (type, detail) => {
  if (!avertissements.some((a) => a.type === type && a.detail === detail)) avertissements.push({ type, detail });
};
// Ohne Akzente/Umlaute, Kleinbuchstaben; „ß“ wird zu „ss“ (sonst würde es Wörter beim Aufteilen in a-z0-9 zerschneiden).
// Alle Wortlisten und Muster unten (französisch UND deutsch) stehen daher in dieser normalisierten Form (ä -> a, ö -> o, ü -> u, ß -> ss).
const normaliser = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss');
// Zimmer eines Bewohners: „chambre 12“, „Zimmer 12“, „Zimmer Nr. 12“, „Zi. 12“ (auch in Zusammensetzungen wie „Einzelzimmer 12“).
const REGEX_ZIMMER = /(?:chambre|zimmer|(?<![\p{L}])zi\.)\s*(?:n°\s*|nr\.?\s*|nummer\s*)?(\d+)/giu;

if (!texte) signale('reponse_vide', 'Der KI-Assistent hat nichts geantwortet.');

// ======================================================================================================
// AUSGABE „PHRASES“ – Filter gegen Erfundenes (Code, ohne KI)
// Das Modell liefert JSON-Sätze {section, phrase, source_id}. Ein Satz gelangt nur dann in den Text, wenn:
//   - seine source_id einen tatsächlich gelieferten Fakt bezeichnet;
//   - jede Zahl, Dosis, Uhrzeit und jedes Datum, die er enthält, in DIESEM Fakt steht;
//   - jedes Medikament, das er nennt, in DIESEM Fakt steht;
//   - er keine Bewertung („erhöht“, „wichtig“ …) enthält, die dieser Fakt nicht formuliert;
//   - seine Inhaltswörter im Wesentlichen die dieses Fakts sind;
//   - er nicht von einem anderen Bewohner spricht.
// Abgelehnte Sätze werden aus dem Text ENTFERNT und getrennt („retirees“) mit ihrem Grund zurückgegeben.
// ======================================================================================================
const retirees = [];
const corrections = []; // Sätze, die der Code dem richtigen Fakt zugeordnet hat (das Modell hatte sich in der Kennung geirrt)
if (ctx.sortie === 'phrases') {
  const MOTS_NEUTRES = new Set(['resident', 'residente', 'information', 'disponible', 'aucune', 'aucun', 'pendant', 'depuis', 'durant', 'ensuite', 'egalement', 'notamment', 'present', 'presente', 'signale', 'signalee', 'constate', 'constatee', 'observe', 'observee', 'indique', 'indiquee', 'releve', 'mentionne', 'mentionnee', 'enregistre', 'enregistree', 'prevu', 'prevue', 'realise', 'realisee', 'effectue', 'effectuee', 'apres', 'avant', 'toutes', 'toutes', 'heures', 'minutes', 'surveillance',
    // deutsch (normalisiert)
    'bewohner', 'bewohnerin', 'verfugbar', 'keine', 'keiner', 'keinen', 'wahrend', 'danach', 'ebenfalls', 'insbesondere', 'vorhanden', 'gemeldet', 'festgestellt', 'beobachtet', 'angegeben', 'erfasst', 'geplant', 'durchgefuhrt', 'erwahnt', 'dokumentiert', 'nachdem', 'stunden', 'minuten', 'uberwachung']);
  const SUFFIXES_MEDICAMENTS = /(cilline|cillin|cycline|mycine|floxacine|azole|prazole|pril|sartan|olol|dipine|statine|statin|formine|gliptine|parine|xaban|gatran|coumarol|profene|fenac|codone|morphine|tramadol|paracetamol|metamizol|novalgin|insuline|insulin|semide|spironolacton|thyroxine|azepam|peridol|peridone|mirtazapin|citalopram|sertralin|donepezil|memantin|levodopa|clopidogrel|digoxin|amiodaron|methotrexat|prednisolon|prednison|cortison|warfarin|marcumar|aspirin|macrogol|lactulos|salbutamol|ibuprofen|diclofenac|naproxen|metoprolol|torasemid|furosemid|pantoprazol|omeprazol)/;
  const QUALIFICATIFS = ['anormal', 'anormale', 'anormaux', 'eleve', 'elevee', 'elevees', 'bas', 'basse', 'normal', 'normale', 'normaux', 'preoccupant', 'preoccupante', 'inquietant', 'inquietante', 'alarmant', 'alarmante', 'grave', 'severe', 'critique', 'dangereux', 'dangereuse', 'important', 'importante', 'importants', 'importantes', 'significatif', 'significative', 'majeur', 'majeure', 'excessif', 'excessive', 'insuffisant', 'insuffisante', 'satisfaisant', 'satisfaisante', 'bon', 'bonne', 'mauvais', 'mauvaise', 'stable', 'amelioration', 'aggravation', 'deterioration', 'legere', 'leger', 'moderee', 'modere'];
  // Deutsche Bewertungswörter (normalisiert): Stämme, die mit den Endungen e/en/er/es/em gebeugt werden (erhöht -> erhoht, hohe, hohen, hoher …).
  const STAEMME_BEWERTUNG = ['abnorm', 'abnormal', 'auffall', 'unauffall', 'erhoh', 'erhoht', 'erhohung', 'hoch', 'hoh', 'niedrig', 'tief', 'normal', 'besorgniserregend', 'beunruhigend', 'bedenklich', 'alarmierend', 'schwer', 'schwerwiegend', 'kritisch', 'gefahrlich', 'lebensbedrohlich', 'bedrohlich', 'wichtig', 'bedeutend', 'bedeutsam', 'erheblich', 'massig', 'ubermassig', 'exzessiv', 'unzureichend', 'ungenugend', 'ausreichend', 'zufriedenstellend', 'gut', 'schlecht', 'stabil', 'instabil', 'leicht', 'ernst', 'ernsthaft', 'verbesserung', 'verschlechterung', 'verschlimmerung', 'besserung'];
  const ENDUNGEN = ['', 'e', 'en', 'er', 'es', 'em'];
  const stammBewertung = (w) => STAEMME_BEWERTUNG.find((st) => ENDUNGEN.some((x) => w === st + x));

  const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mots = (s) => normaliser(s).split(/[^a-z0-9]+/).filter(Boolean);
  const racine6 = (w) => w.slice(0, 6);
  // „7h17“, „07:17“, „07h17“ (und „07:17 Uhr“): eine einzige Schreibweise; „36,8“ und „36.8“ ebenso.
  const uniformise = (s) => normaliser(s).replace(/(\d{1,2})\s*[:h]\s*(\d{2})(?!\d)/g, (_, h, m) => `${h.padStart(2, '0')}h${m}`).replace(/(\d),(\d)/g, '$1.$2');
  const nombresDe = (s) => uniformise(s).match(/\d+(?:[./]\d+)*(?:h\d{2})?/g) ?? [];

  const infoFait = (f) => {
    const brut = `${f.texte} ${f.date_affichee ?? ''}`;
    const u = uniformise(brut);
    return { fait: f, u, nombres: new Set(nombresDe(brut)), liste: mots(brut), mots: new Set(mots(brut)), racines: new Set(mots(brut).filter((w) => w.length >= 6).map(racine6)) };
  };
  const infos = new Map(faits.map((f) => [f.id, infoFait(f)]));

  // bekannte Medikamente: Namen, auf die eine Dosis folgt, in IRGENDEINEM Fakt (Medikationsplan, ePA, Krankenhaus)
  const medicamentsConnus = new Set();
  for (const f of faits) {
    for (const m of String(f.texte).matchAll(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]{3,})\s+\d+(?:[.,]\d+)?\s*(?:mg|g|µg|mcg|ml|ie|ui)\b/gi)) medicamentsConnus.add(racine6(normaliser(m[1])));
  }
  const estMedicament = (w) => w.length >= 6 && (SUFFIXES_MEDICAMENTS.test(w) || medicamentsConnus.has(racine6(w)));

  const motifs = { source_inconnue: 'Nicht vorhandene Fakt-Kennung', valeur_absente: 'Wert, Uhrzeit oder Datum fehlt im genannten Fakt', medicament_absent: 'Medikament fehlt im genannten Fakt', jugement_non_source: 'Bewertung, die der genannte Fakt nicht enthält', termes_absents: 'Begriffe fehlen im genannten Fakt', negation_alteree: 'Verneinung hinzugefügt oder gegenüber dem genannten Fakt verloren', autre_resident: 'Erwähnung eines anderen Bewohners', doublon: 'Doppelter Satz', rubrique_inconnue: 'Unbekannte Rubrik', phrase_vide: 'Leerer oder zu langer Satz' };

  // 1. JSON lesen; wurde es abgeschnitten (Längengrenze), werden die vollständigen Sätze einzeln wiederhergestellt
  let liste = null;
  try {
    const o = JSON.parse(texte);
    liste = Array.isArray(o) ? o : o?.phrases;
  } catch { /* Wiederherstellung unten */ }
  if (!Array.isArray(liste)) {
    liste = [...texte.matchAll(/\{[^{}]*\}/g)].map((m) => { try { return JSON.parse(m[0]); } catch { return null; } }).filter((x) => x && typeof x === 'object' && ('t' in x || 'phrase' in x));
    signale('json_invalide', liste.length ? `JSON abgeschnitten oder fehlerhaft: ${liste.length} Satz/Sätze wiederhergestellt.` : 'Die Antwort ist kein gültiges JSON.');
  }

  const sections = ctx.sections ?? [];
  const cles = new Set(sections.map((s) => s.cle));
  const gardees = [];
  const vues = new Set();
  const nomsAutres = (ctx.autres?.noms ?? []).map(normaliser);
  const chambresAutres = ctx.autres?.chambres ?? [];

  for (const el of liste) {
    const phrase = String(el?.t ?? el?.phrase ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    const source_id = String(el?.f ?? el?.source_id ?? '').trim().toUpperCase();
    const section = String(el?.r ?? el?.section ?? '-').trim();
    if (/^information (?:non disponible|nicht verf(?:ü|ue|u)gbar)\.?$/i.test(phrase)) continue; // der Code zeigt „Information nicht verfügbar“ selbst an
    const refuse = (...codes) => retirees.push({ phrase: phrase.slice(0, 400), source_id: source_id || null, section, motifs: codes.map((c) => ({ code: c, libelle: motifs[c] })), detail: codes.map((c) => detailsParCode[c]).filter(Boolean).join(' ; ') });
    const detailsParCode = {};

    if (!phrase || phrase.length > 400) { refuse('phrase_vide'); continue; }
    if (sections.length ? !cles.has(section) : false) { refuse('rubrique_inconnue'); continue; }
    const info = infos.get(source_id);
    if (!info) { detailsParCode.source_inconnue = `„${source_id || 'leer'}“ ist kein gelieferter Fakt`; refuse('source_inconnue'); continue; }
    const cle = normaliser(phrase).replace(/[^a-z0-9]+/g, ' ').trim();
    if (vues.has(cle)) { refuse('doublon'); continue; }

    // Bewertet den Satz anhand EINES Fakts: Liste der Ablehnungscodes (leer = der Satz wird von diesem Fakt gestützt).
    const evaluer = (info) => {
    const codes = [];
    const detailsParCode = {};
    // Werte: Jede Zahl, Dosis, Uhrzeit oder jedes Datum muss im genannten Fakt stehen
    const absentsValeurs = [];
    for (const n of new Set(nombresDe(phrase))) {
      const jj = /^(\d{1,2})\/(\d{1,2})$/.test(n) ? n.replace('/', '.') : null; // „24/10“ ~ „24.10“
      const ok = info.nombres.has(n) || (jj && info.u.includes(jj)) || new RegExp(`(?<![\\d])${echapper(n)}(?![\\d])`).test(info.u);
      if (!ok) absentsValeurs.push(n);
    }
    if (absentsValeurs.length) { codes.push('valeur_absente'); detailsParCode.valeur_absente = `${absentsValeurs.join(', ')} nicht in ${info.fait.id} enthalten`; }
    // Medikamente
    const motsPhrase = mots(phrase);
    const medicamentsAbsents = [...new Set(motsPhrase.filter((w) => estMedicament(w) && !info.racines.has(racine6(w))))];
    if (medicamentsAbsents.length) { codes.push('medicament_absent'); detailsParCode.medicament_absent = `${medicamentsAbsents.join(', ')} nicht in ${info.fait.id} enthalten`; }
    // Bewertungen (französische Liste + deutsche Stämme mit Beugungsendungen)
    const jugements = [...new Set(motsPhrase.filter((w) => {
      const stamm = stammBewertung(w);
      if (!QUALIFICATIFS.includes(w) && !stamm) return false;
      if (info.mots.has(w)) return false;
      if (stamm && info.liste.some((x) => stammBewertung(x) === stamm)) return false; // der Fakt enthält dieselbe Bewertung in anderer Beugungsform
      return true;
    }))];
    if (jugements.length) { codes.push('jugement_non_source'); detailsParCode.jugement_non_source = `„${jugements.join(', ')}“ steht nicht in ${info.fait.id}`; }
    // Verneinungen: Ein Satz darf weder eine Verneinung hinzufügen, die der Fakt nicht hat, noch die des Fakts verlieren
    // („kein Bewusstseinsverlust“ darf nie zu „Bewusstseinsverlust“ werden)
    {
      const NEG = new Set(['sans', 'pas', 'aucun', 'aucune', 'jamais', 'absence', 'ni', 'ohne', 'nicht', 'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines', 'nie', 'niemals', 'weder']);
      const dansFait = info.liste;
      // „pas de“ und „sans“ (bzw. „kein“ und „ohne“) sind gleichwertig. Eine Verneinung des Satzes gilt als „hinzugefügt“, wenn die Wörter,
      // auf die sie sich bezieht, im Fakt vorkommen, dort aber nie von einer Verneinung begleitet werden.
      const ajoutees = [];
      motsPhrase.forEach((w, j) => {
        if (!NEG.has(w)) return;
        for (const suivant of motsPhrase.slice(j + 1, j + 4).filter((x) => x.length >= 4 && !NEG.has(x))) {
          const positions = dansFait.map((x, i) => (racine6(x) === racine6(suivant) ? i : -1)).filter((i) => i >= 0);
          if (positions.length && !positions.some((i) => dansFait.slice(Math.max(0, i - 4), i + 5).some((x) => NEG.has(x)))) ajoutees.push(suivant);
        }
      });
      const perdues = [];
      dansFait.forEach((w, i) => {
        if (!NEG.has(w)) return;
        for (const suivant of dansFait.slice(i + 1, i + 4).filter((x) => x.length >= 4 && !NEG.has(x))) {
          motsPhrase.forEach((mp, j) => {
            if (racine6(mp) === racine6(suivant) && !motsPhrase.slice(Math.max(0, j - 4), j).some((x) => NEG.has(x))) perdues.push(suivant);
          });
        }
      });
      if (ajoutees.length || perdues.length) {
        codes.push('negation_alteree');
        detailsParCode.negation_alteree = ajoutees.length ? `Verneinung „${ajoutees.join(', ')}“ fehlt in ${info.fait.id}` : `Die Verneinung aus ${info.fait.id} geht verloren („${[...new Set(perdues)].join(', ')}“)`;
      }
    }
    // Abdeckung der Inhaltswörter: Der Hauptteil des Satzes muss aus dem genannten Fakt stammen
    const contenu = [...new Set(motsPhrase.filter((w) => w.length >= 6 && !MOTS_NEUTRES.has(w) && !/\d/.test(w)))];
    const absentsContenu = contenu.filter((w) => !info.racines.has(racine6(w)) && !info.mots.has(w));
    if (absentsContenu.length >= 1 && absentsContenu.length / Math.max(contenu.length, 1) >= 0.3) { codes.push('termes_absents'); detailsParCode.termes_absents = `${absentsContenu.join(', ')} nicht in ${info.fait.id} enthalten`; }
    // ein anderer Bewohner
    const autre = nomsAutres.find((n) => new RegExp(`\\b${n}\\b`).test(normaliser(phrase))) ?? ([...phrase.matchAll(REGEX_ZIMMER)].map((m) => m[1]).find((c) => chambresAutres.includes(c)) && 'ein anderes Zimmer');
    if (autre) { codes.push('autre_resident'); detailsParCode.autre_resident = String(autre); }

    return { codes, detailsParCode, motsPhrase, contenu, absentsContenu };
    };

    let evalue = evaluer(info);
    let attribuee = info;
    if (evalue.codes.length) {
      // Falsche Fakt-Kennung (bei einem kleinen Modell häufig): Wenn EIN ANDERER Fakt den Satz vollständig stützt
      // (dieselben Kontrollen, keine Ablehnung und mindestens ein gemeinsames Inhaltswort oder eine gemeinsame Zahl), wird er diesem zugeordnet.
      const candidats = [...infos.values()].filter((x) => x !== info).map((x) => ({ x, e: evaluer(x) })).filter(({ x, e }) => {
        if (e.codes.length || e.absentsContenu.length) return false; // der Fakt muss ALLE Inhaltswörter des Satzes abdecken
        const communs = e.contenu.filter((w) => x.racines.has(racine6(w)) || x.mots.has(w)).length;
        return communs >= 3; // Zuordnung nur, wenn der Satz deutlich der Text dieses Fakts ist (mindestens 3 Inhaltswörter)
      });
      const score = ({ x, e }) => e.contenu.filter((w) => x.racines.has(racine6(w)) || x.mots.has(w)).length;
      candidats.sort((a, b) => score(b) - score(a));
      if (candidats.length) { attribuee = candidats[0].x; evalue = candidats[0].e; corrections.push({ phrase: phrase.slice(0, 200), de: source_id, vers: attribuee.fait.id }); }
    }
    Object.assign(detailsParCode, evalue.detailsParCode);
    if (evalue.codes.length) { refuse(...evalue.codes); continue; }
    vues.add(cle);
    gardees.push({ section: sections.length ? section : '-', phrase, fait: attribuee.fait });
  }

  // 2. Der Text wird vom CODE zusammengesetzt: Satz + Quelle des genannten Fakts in eckigen Klammern
  const ligne = ({ phrase, fait }) => `${phrase.replace(/[\s.]+$/, '')}. [${fait.label}]`;
  texte = sections.length
    ? sections.map((s) => { const l = gardees.filter((g) => g.section === s.cle).map(ligne); return `${s.titre}\n${l.length ? l.join('\n') : 'Information nicht verfügbar.'}`; }).join('\n')
    : gardees.length ? gardees.map(ligne).join('\n') : 'Information nicht verfügbar.';
}

// Antwort durch die Längengrenze beendet: Der letzte Satz ist wahrscheinlich abgeschnitten.
if (rep.done_reason === 'length') signale('reponse_tronquee', 'Die Antwort hat die Längengrenze erreicht und ist wahrscheinlich unvollständig.');
// Eine Antwort, die sich wiederholt (dieselbe Zeile mehrfach), deutet auf eine Schleife des Modells hin.
{
  const lignes = texte.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 20 && !/^information (?:non disponible|nicht verf(?:ü|ue|u)gbar)/i.test(l));
  const doublons = lignes.length - new Set(lignes).size;
  if (doublons >= 2) signale('repetitions', `${doublons} wiederholte Zeilen: Das Modell hat sich wahrscheinlich im Kreis gedreht.`);
}
// Abschreiben der Faktenzeilen („[Quelle] 23.10. 06:08 Uhr – …“, alt: „06h08“): Das ist kein verfasster Text.
if (/\[[^\]\n]{2,80}\]\s*\d{2}\.\d{2}\.\s*\d{1,2}[h:]\d{2}(?:\s*Uhr)?\s*[–-]/.test(texte)) {
  signale('copie_des_faits', 'Die Antwort schreibt die Faktenzeilen ab, statt sie umzuformulieren.');
}

const corpus = normaliser(faits.map((f) => `${f.texte} ${f.date_affichee ?? ''} ${ctx.patient?.chambre ?? ''} ${ctx.patient?.naissance ?? ''}`).join(' \n '));
const sourcesAutorisees = new Set(faits.map((f) => f.label));
const NON_DISPO = /information (?:non disponible|nicht verf(?:ü|ue|u)gbar)/i;

if (ctx.sortie === 'json') {
  let objet = null;
  try {
    objet = JSON.parse(texte);
  } catch {
    signale('json_invalide', 'Die Antwort ist kein gültiges JSON.');
  }
  // Schema: Alle vom Prompt verlangten Schlüssel müssen vorhanden sein (sonst würde die weitere Verarbeitung verfälscht)
  if (objet !== null) {
    if (typeof objet !== 'object' || Array.isArray(objet)) signale('json_incomplet', 'Die Antwort muss ein JSON-Objekt sein.');
    else {
      for (const cle of ctx.cles_json ?? []) if (!(cle in objet)) signale('json_incomplet', `Schlüssel fehlt: ${cle}`);
      // Jedes Element der deklarierten Listen muss alle seine Schlüssel tragen (z. B. gravite, sources …)
      for (const [liste, cles] of Object.entries(ctx.listes_json ?? {})) {
        if (!Array.isArray(objet[liste])) continue;
        objet[liste].forEach((el, i) => {
          for (const cle of cles) if (!el || typeof el !== 'object' || !(cle in el)) signale('json_incomplet', `${liste}[${i}]: Schlüssel fehlt „${cle}“`);
        });
      }
      // Kohärenz: „aucune_contradiction“ muss die Liste widerspiegeln, was auch immer das Modell geschrieben hat
      if (Array.isArray(objet.contradictions) && 'aucune_contradiction' in objet && objet.aucune_contradiction !== (objet.contradictions.length === 0)) {
        signale('json_incoherent', `aucune_contradiction hat den Wert ${objet.aucune_contradiction}, aber die Liste enthält ${objet.contradictions.length} Widerspruch/Widersprüche`);
      }
    }
  }
} else if (texte) {
  // 1. genannte Quellen
  for (const c of new Set([...texte.matchAll(/\[([^\]\n]{2,80})\]/g)].map((m) => m[1]))) {
    if (!sourcesAutorisees.has(c)) signale('source_inconnue', c);
  }
  // 2. eine Zeile = ein Satz mit seiner Quelle (Überschriften und „Information nicht verfügbar“ werden toleriert)
  const nombres = (s) => s.replace(/^\s*\d+[.)]\s+/, '').match(/\d+(?:[.,:h]\d+)*(?:\/\d+)?/g) ?? [];
  // Wörter mit 5 oder mehr Buchstaben (ohne Akzente/Umlaute): dient dazu, die Quelle einer Zeile wiederzufinden
  const motsDe = (s) => new Set(normaliser(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 5));
  const motsFaits = faits.map((f) => ({ label: f.label, mots: motsDe(f.texte) }));
  const absents = new Set();
  for (const n of new Set(nombres(texte.replace(/^\s*\d+[.)]\s+/gm, '')))) {
    // 3. Eine Zahl oder Uhrzeit der Antwort muss in den Fakten vorkommen
    if (!corpus.includes(normaliser(n))) {
      absents.add(n);
      signale('valeur_non_sourcee', n);
    }
  }
  for (const ligne of texte.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const mots = ligne.split(/\s+/).length;
    if (mots < 5 || /:\s*$/.test(ligne) || NON_DISPO.test(ligne)) continue;
    const cites = [...new Set([...ligne.matchAll(/\[([^\]\n]{2,80})\]/g)].map((m) => m[1]))];
    if (!cites.length) {
      signale('phrase_sans_source', ligne.slice(0, 120));
      continue;
    }
    // 4. Die Zahlen einer Zeile müssen in den Fakten der Quellen stehen, die diese Zeile nennt
    const corpusCite = normaliser(faits.filter((f) => cites.includes(f.label)).map((f) => `${f.texte} ${f.date_affichee ?? ''}`).join(' \n '));
    const sansCitation = ligne.replace(/\[[^\]]*\]/g, '');
    for (const n of new Set(nombres(sansCitation))) {
      if (!absents.has(n) && !corpusCite.includes(normaliser(n))) signale('chiffre_hors_source_citee', `${n} mit [${cites.join(', ')}] zitiert`);
    }
    // 5. Zuordnung: Der Fakt, der der Zeile am nächsten ist (gemeinsame Wörter), muss aus einer genannten Quelle stammen
    const motsLigne = motsDe(sansCitation);
    if (motsLigne.size >= 3) {
      const score = (f) => [...motsLigne].filter((w) => f.mots.has(w)).length / motsLigne.size;
      // Anteil der Wörter der Zeile, der durch die GESAMTHEIT der Fakten der genannten Quellen erklärt wird
      const motsCites = new Set(motsFaits.filter((f) => cites.includes(f.label)).flatMap((f) => [...f.mots]));
      const couvertureCitee = [...motsLigne].filter((w) => motsCites.has(w)).length / motsLigne.size;
      const meilleur = motsFaits
        .filter((f) => !cites.includes(f.label))
        .reduce((a, f) => (score(f) > a.s ? { label: f.label, s: score(f) } : a), { label: null, s: 0 });
      // nur gemeldet, wenn die genannten Quellen die Zeile schlecht erklären UND ein Fakt einer anderen Quelle sie mindestens ebenso gut erklärt
      if (couvertureCitee < 0.8 && meilleur.s >= 0.5 && meilleur.s >= couvertureCitee) {
        signale('source_probablement_erronee', `„${ligne.slice(0, 70)}…“ scheint aus [${meilleur.label}] zu stammen, genannt: [${cites.join(', ')}]`);
      }
    }
  }
  // 5. nur ein Bewohner
  const t = normaliser(texte);
  for (const nom of ctx.autres?.noms ?? []) {
    if (new RegExp(`\\b${normaliser(nom)}\\b`).test(t)) signale('autre_resident', nom);
  }
  for (const m of texte.matchAll(REGEX_ZIMMER)) {
    if ((ctx.autres?.chambres ?? []).includes(m[1])) signale('autre_resident', `Zimmer ${m[1]}`);
  }
  // 7. Inhaltsbegriffe (5 Buchstaben und mehr), die in KEINEM Fakt vorkommen: Umschreibung oder Erfindung
  //    („Kontrolle geplant“, „Beurteilung“). Eine Zeile wird nur gemeldet, wenn ihr mehrere Begriffe fehlen.
  const MOTS_DE_STRUCTURE = new Set(['resident', 'residente', 'information', 'disponible', 'bewohner', 'bewohnerin', 'verfugbar']);
  const motsTousFaits = new Set(motsFaits.flatMap((f) => [...f.mots]));
  for (const ligne of texte.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const sansCitation = ligne.replace(/\[[^\]]*\]/g, '');
    if (NON_DISPO.test(sansCitation) || /:\s*$/.test(ligne) || ligne.split(/\s+/).length < 5) continue; // Rubrikenüberschriften ausgenommen
    const mots6 = [...motsDe(sansCitation)].filter((w) => w.length >= 5 && !MOTS_DE_STRUCTURE.has(w));
    const absentsFaits = mots6.filter((w) => !motsTousFaits.has(w) && !/^\d/.test(w));
    if (absentsFaits.length >= 2 && absentsFaits.length / Math.max(mots6.length, 1) >= 0.3) {
      signale('terme_non_source', `„${absentsFaits.join(', ')}“ kommt in keinem Fakt vor (Zeile: ${ligne.slice(0, 60)}…)`);
    }
  }
  // 6. Bewertungen, die die KI von sich aus hinzufügt („Puls abnorm“, „Blutdruck erhöht“): Eine klinische Bewertung
  //    ist nur zulässig, wenn ein Fakt sie formuliert.
  const QUALIFICATIFS = ['anormal', 'anormale', 'anormaux', 'eleve', 'elevee', 'elevees', 'bas', 'basse', 'normal', 'normale', 'normaux', 'preoccupant', 'preoccupante', 'inquietant', 'inquietante', 'alarmant', 'alarmante', 'grave', 'severe', 'critique', 'dangereux', 'dangereuse'];
  for (const q of QUALIFICATIFS) {
    const motEntier = new RegExp(`\\b${q}\\b`);
    if (motEntier.test(t) && !motEntier.test(corpus)) signale('qualification_non_sourcee', q);
  }
  // deutsche Entsprechungen (Stämme + Beugungsendungen, auf normalisiertem Text); gemeldet wird das Wort, wie es im Text steht
  const BEWERTUNG_TEXT = ['abnorm', 'abnormal', 'auffall', 'erhoh', 'erhoht', 'hoch', 'hoh', 'niedrig', 'tief', 'normal', 'besorgniserregend', 'beunruhigend', 'alarmierend', 'schwer', 'schwerwiegend', 'kritisch', 'gefahrlich'];
  for (const st of BEWERTUNG_TEXT) {
    const re = new RegExp(`\\b${st}(?:e|en|er|es|em)?\\b`);
    const treffer = t.match(re);
    if (treffer && !re.test(corpus)) signale('qualification_non_sourcee', (texte.match(/\p{L}+/gu) ?? []).find((w) => normaliser(w) === treffer[0]) ?? treffer[0]);
  }
}

return [
  {
    json: {
      texte,
      avertissements,
      retirees,
      corrections,
      modele: ctx.modele,
      duree_ms: Math.round((rep.total_duration ?? 0) / 1e6),
      tokens: rep.eval_count ?? null,
    },
  },
];
