// Brique « rédiger » – contrôle automatique de la réponse de l'IA, AVANT affichage au soignant.
// Aucun contrôle ne remplace la relecture humaine ; ils signalent ce qui n'est pas dans les sources :
//   source_inconnue      une source entre crochets qui n'existe pas dans les faits
//   phrase_sans_source   une ligne (une phrase) sans source
//   valeur_non_sourcee   un nombre ou une heure absent des faits
//   chiffre_hors_source_citee   un chiffre qui existe dans les faits, mais pas dans la source citée sur sa ligne
//   source_probablement_erronee  la ligne ressemble surtout à un fait d'une AUTRE source que celle citée
//   autre_resident       le nom ou la chambre d'un autre résident
//   json_invalide        sortie JSON stricte non respectée
const rep = $input.first().json;
const ctx = $('Préparer appel').first().json;
const faits = ctx.faits ?? [];
let texte = String(rep.response ?? '').trim();
const avertissements = [];
// Un même avertissement n'est noté qu'une fois (une réponse qui boucle en produirait des dizaines).
const signale = (type, detail) => {
  if (!avertissements.some((a) => a.type === type && a.detail === detail)) avertissements.push({ type, detail });
};
const normaliser = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

if (!texte) signale('reponse_vide', 'L\'IA n\'a rien répondu.');

// ======================================================================================================
// SORTIE « PHRASES » – filtre anti-invention (code, sans IA)
// Le modèle renvoie des phrases JSON {section, phrase, source_id}. Une phrase n'entre dans le texte que si :
//   - son source_id désigne un fait réellement fourni ;
//   - chaque chiffre, dose, heure et date qu'elle contient figure dans CE fait ;
//   - chaque médicament qu'elle nomme figure dans CE fait ;
//   - elle ne contient aucun jugement (« élevé », « important »…) que ce fait ne formule pas ;
//   - ses mots de contenu sont, pour l'essentiel, ceux de CE fait ;
//   - elle ne parle pas d'un autre résident.
// Les phrases refusées sont RETIRÉES du texte et renvoyées à part (« retirees ») avec leur motif.
// ======================================================================================================
const retirees = [];
const corrections = []; // phrases rattachées au bon fait par le code (le modèle s'était trompé d'identifiant)
if (ctx.sortie === 'phrases') {
  const MOTS_NEUTRES = new Set(['resident', 'residente', 'information', 'disponible', 'aucune', 'aucun', 'pendant', 'depuis', 'durant', 'ensuite', 'egalement', 'notamment', 'present', 'presente', 'signale', 'signalee', 'constate', 'constatee', 'observe', 'observee', 'indique', 'indiquee', 'releve', 'mentionne', 'mentionnee', 'enregistre', 'enregistree', 'prevu', 'prevue', 'realise', 'realisee', 'effectue', 'effectuee', 'apres', 'avant', 'toutes', 'toutes', 'heures', 'minutes', 'surveillance']);
  const SUFFIXES_MEDICAMENTS = /(cilline|cillin|cycline|mycine|floxacine|azole|prazole|pril|sartan|olol|dipine|statine|statin|formine|gliptine|parine|xaban|gatran|coumarol|profene|fenac|codone|morphine|tramadol|paracetamol|metamizol|novalgin|insuline|insulin|semide|spironolacton|thyroxine|azepam|peridol|peridone|mirtazapin|citalopram|sertralin|donepezil|memantin|levodopa|clopidogrel|digoxin|amiodaron|methotrexat|prednisolon|prednison|cortison|warfarin|marcumar|aspirin|macrogol|lactulos|salbutamol|ibuprofen|diclofenac|naproxen|metoprolol|torasemid|furosemid|pantoprazol|omeprazol)/;
  const QUALIFICATIFS = ['anormal', 'anormale', 'anormaux', 'eleve', 'elevee', 'elevees', 'bas', 'basse', 'normal', 'normale', 'normaux', 'preoccupant', 'preoccupante', 'inquietant', 'inquietante', 'alarmant', 'alarmante', 'grave', 'severe', 'critique', 'dangereux', 'dangereuse', 'important', 'importante', 'importants', 'importantes', 'significatif', 'significative', 'majeur', 'majeure', 'excessif', 'excessive', 'insuffisant', 'insuffisante', 'satisfaisant', 'satisfaisante', 'bon', 'bonne', 'mauvais', 'mauvaise', 'stable', 'amelioration', 'aggravation', 'deterioration', 'legere', 'leger', 'moderee', 'modere'];

  const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mots = (s) => normaliser(s).split(/[^a-z0-9]+/).filter(Boolean);
  const racine6 = (w) => w.slice(0, 6);
  // « 7h17 », « 07:17 », « 07h17 » : une seule écriture ; « 36,8 » et « 36.8 » aussi.
  const uniformise = (s) => normaliser(s).replace(/(\d{1,2})\s*[:h]\s*(\d{2})(?!\d)/g, (_, h, m) => `${h.padStart(2, '0')}h${m}`).replace(/(\d),(\d)/g, '$1.$2');
  const nombresDe = (s) => uniformise(s).match(/\d+(?:[./]\d+)*(?:h\d{2})?/g) ?? [];

  const infoFait = (f) => {
    const brut = `${f.texte} ${f.date_affichee ?? ''}`;
    const u = uniformise(brut);
    return { fait: f, u, nombres: new Set(nombresDe(brut)), liste: mots(brut), mots: new Set(mots(brut)), racines: new Set(mots(brut).filter((w) => w.length >= 6).map(racine6)) };
  };
  const infos = new Map(faits.map((f) => [f.id, infoFait(f)]));

  // médicaments connus : noms suivis d'une dose dans N'IMPORTE QUEL fait (plan de médication, ePA, hôpital)
  const medicamentsConnus = new Set();
  for (const f of faits) {
    for (const m of String(f.texte).matchAll(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]{3,})\s+\d+(?:[.,]\d+)?\s*(?:mg|g|µg|mcg|ml|ie|ui)\b/gi)) medicamentsConnus.add(racine6(normaliser(m[1])));
  }
  const estMedicament = (w) => w.length >= 6 && (SUFFIXES_MEDICAMENTS.test(w) || medicamentsConnus.has(racine6(w)));

  const motifs = { source_inconnue: 'Identifiant de fait inexistant', valeur_absente: 'Valeur, heure ou date absente du fait cité', medicament_absent: 'Médicament absent du fait cité', jugement_non_source: 'Jugement que le fait cité ne formule pas', termes_absents: 'Termes absents du fait cité', negation_alteree: 'Négation ajoutée ou perdue par rapport au fait cité', autre_resident: 'Mention d\'un autre résident', doublon: 'Phrase en double', rubrique_inconnue: 'Rubrique inconnue', phrase_vide: 'Phrase vide ou trop longue' };

  // 1. lecture du JSON ; s'il a été coupé (limite de longueur), on récupère les phrases complètes une à une
  let liste = null;
  try {
    const o = JSON.parse(texte);
    liste = Array.isArray(o) ? o : o?.phrases;
  } catch { /* récupération ci-dessous */ }
  if (!Array.isArray(liste)) {
    liste = [...texte.matchAll(/\{[^{}]*\}/g)].map((m) => { try { return JSON.parse(m[0]); } catch { return null; } }).filter((x) => x && typeof x === 'object' && ('t' in x || 'phrase' in x));
    signale('json_invalide', liste.length ? `JSON coupé ou mal formé : ${liste.length} phrase(s) récupérée(s).` : 'La réponse n\'est pas un JSON valide.');
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
    if (/^information non disponible\.?$/i.test(phrase)) continue; // le code affiche lui-même « information non disponible »
    const refuse = (...codes) => retirees.push({ phrase: phrase.slice(0, 400), source_id: source_id || null, section, motifs: codes.map((c) => ({ code: c, libelle: motifs[c] })), detail: codes.map((c) => detailsParCode[c]).filter(Boolean).join(' ; ') });
    const detailsParCode = {};

    if (!phrase || phrase.length > 400) { refuse('phrase_vide'); continue; }
    if (sections.length ? !cles.has(section) : false) { refuse('rubrique_inconnue'); continue; }
    const info = infos.get(source_id);
    if (!info) { detailsParCode.source_inconnue = `« ${source_id || 'vide'} » n'est pas un fait fourni`; refuse('source_inconnue'); continue; }
    const cle = normaliser(phrase).replace(/[^a-z0-9]+/g, ' ').trim();
    if (vues.has(cle)) { refuse('doublon'); continue; }

    // Évalue la phrase par rapport à UN fait : liste des codes de refus (vide = la phrase est appuyée par ce fait).
    const evaluer = (info) => {
    const codes = [];
    const detailsParCode = {};
    // valeurs : chaque nombre, dose, heure ou date doit figurer dans le fait cité
    const absentsValeurs = [];
    for (const n of new Set(nombresDe(phrase))) {
      const jj = /^(\d{1,2})\/(\d{1,2})$/.test(n) ? n.replace('/', '.') : null; // « 24/10 » ~ « 24.10 »
      const ok = info.nombres.has(n) || (jj && info.u.includes(jj)) || new RegExp(`(?<![\\d])${echapper(n)}(?![\\d])`).test(info.u);
      if (!ok) absentsValeurs.push(n);
    }
    if (absentsValeurs.length) { codes.push('valeur_absente'); detailsParCode.valeur_absente = `${absentsValeurs.join(', ')} absent(s) de ${info.fait.id}`; }
    // médicaments
    const motsPhrase = mots(phrase);
    const medicamentsAbsents = [...new Set(motsPhrase.filter((w) => estMedicament(w) && !info.racines.has(racine6(w))))];
    if (medicamentsAbsents.length) { codes.push('medicament_absent'); detailsParCode.medicament_absent = `${medicamentsAbsents.join(', ')} absent(s) de ${info.fait.id}`; }
    // jugements
    const jugements = [...new Set(motsPhrase.filter((w) => QUALIFICATIFS.includes(w) && !info.mots.has(w)))];
    if (jugements.length) { codes.push('jugement_non_source'); detailsParCode.jugement_non_source = `« ${jugements.join(', ')} » n'est pas dans ${info.fait.id}`; }
    // négations : une phrase ne peut ni ajouter une négation que le fait n'a pas, ni perdre celle du fait
    // (« pas de perte de connaissance » ne doit jamais devenir « perte de connaissance »)
    {
      const NEG = new Set(['sans', 'pas', 'aucun', 'aucune', 'jamais', 'absence', 'ni']);
      const dansFait = info.liste;
      // « pas de » et « sans » sont équivalents. Une négation de la phrase est « ajoutée » si les mots qu'elle porte
      // existent dans le fait mais n'y sont jamais précédés d'une négation.
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
        detailsParCode.negation_alteree = ajoutees.length ? `négation « ${ajoutees.join(', ')} » absente de ${info.fait.id}` : `la négation de ${info.fait.id} est perdue (« ${[...new Set(perdues)].join(', ')} »)`;
      }
    }
    // couverture des mots de contenu : l'essentiel de la phrase doit venir du fait cité
    const contenu = [...new Set(motsPhrase.filter((w) => w.length >= 6 && !MOTS_NEUTRES.has(w) && !/\d/.test(w)))];
    const absentsContenu = contenu.filter((w) => !info.racines.has(racine6(w)) && !info.mots.has(w));
    if (absentsContenu.length >= 1 && absentsContenu.length / Math.max(contenu.length, 1) >= 0.3) { codes.push('termes_absents'); detailsParCode.termes_absents = `${absentsContenu.join(', ')} absent(s) de ${info.fait.id}`; }
    // un autre résident
    const autre = nomsAutres.find((n) => new RegExp(`\\b${n}\\b`).test(normaliser(phrase))) ?? ([...phrase.matchAll(/chambre\s*(?:n°\s*)?(\d+)/gi)].map((m) => m[1]).find((c) => chambresAutres.includes(c)) && 'une autre chambre');
    if (autre) { codes.push('autre_resident'); detailsParCode.autre_resident = String(autre); }

    return { codes, detailsParCode, motsPhrase, contenu, absentsContenu };
    };

    let evalue = evaluer(info);
    let attribuee = info;
    if (evalue.codes.length) {
      // Mauvais identifiant de fait (fréquent avec un petit modèle) : si UN AUTRE fait appuie entièrement la phrase
      // (mêmes contrôles, zéro refus et au moins un mot de contenu ou un nombre en commun), elle lui est rattachée.
      const candidats = [...infos.values()].filter((x) => x !== info).map((x) => ({ x, e: evaluer(x) })).filter(({ x, e }) => {
        if (e.codes.length || e.absentsContenu.length) return false; // le fait doit couvrir TOUS les mots de contenu de la phrase
        const communs = e.contenu.filter((w) => x.racines.has(racine6(w)) || x.mots.has(w)).length;
        return communs >= 3; // rattachement seulement si la phrase est nettement le texte de ce fait (3 mots de contenu au moins)
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

  // 2. le texte est assemblé par le CODE : phrase + source du fait cité, entre crochets
  const ligne = ({ phrase, fait }) => `${phrase.replace(/[\s.]+$/, '')}. [${fait.label}]`;
  texte = sections.length
    ? sections.map((s) => { const l = gardees.filter((g) => g.section === s.cle).map(ligne); return `${s.titre}\n${l.length ? l.join('\n') : 'information non disponible.'}`; }).join('\n')
    : gardees.length ? gardees.map(ligne).join('\n') : 'information non disponible.';
}

// Réponse arrêtée par la limite de longueur : la dernière phrase est probablement coupée.
if (rep.done_reason === 'length') signale('reponse_tronquee', 'La réponse a atteint la limite de longueur et est probablement incomplète.');
// Une réponse qui se répète (même ligne plusieurs fois) est le signe d'une boucle du modèle.
{
  const lignes = texte.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 20 && !/^information non disponible/i.test(l));
  const doublons = lignes.length - new Set(lignes).size;
  if (doublons >= 2) signale('repetitions', `${doublons} lignes répétées : le modèle a probablement bouclé.`);
}
// Recopie des lignes de faits (« [source] 23.10. 06h08 – … ») : ce n'est pas un texte rédigé.
if (/\[[^\]\n]{2,80}\]\s*\d{2}\.\d{2}\.\s*\d{1,2}h\d{2}\s*[–-]/.test(texte)) {
  signale('copie_des_faits', 'La réponse recopie les lignes de faits au lieu de les reformuler.');
}

const corpus = normaliser(faits.map((f) => `${f.texte} ${f.date_affichee ?? ''} ${ctx.patient?.chambre ?? ''} ${ctx.patient?.naissance ?? ''}`).join(' \n '));
const sourcesAutorisees = new Set(faits.map((f) => f.label));
const NON_DISPO = /information non disponible/i;

if (ctx.sortie === 'json') {
  let objet = null;
  try {
    objet = JSON.parse(texte);
  } catch {
    signale('json_invalide', 'La réponse n\'est pas un JSON valide.');
  }
  // schéma : toutes les clés demandées par le prompt doivent être présentes (sinon la suite du traitement serait faussée)
  if (objet !== null) {
    if (typeof objet !== 'object' || Array.isArray(objet)) signale('json_incomplet', 'La réponse doit être un objet JSON.');
    else {
      for (const cle of ctx.cles_json ?? []) if (!(cle in objet)) signale('json_incomplet', `clé manquante : ${cle}`);
      // chaque élément des listes déclarées doit porter toutes ses clés (ex. gravite, sources…)
      for (const [liste, cles] of Object.entries(ctx.listes_json ?? {})) {
        if (!Array.isArray(objet[liste])) continue;
        objet[liste].forEach((el, i) => {
          for (const cle of cles) if (!el || typeof el !== 'object' || !(cle in el)) signale('json_incomplet', `${liste}[${i}] : clé manquante « ${cle} »`);
        });
      }
      // cohérence : « aucune_contradiction » doit refléter la liste, quoi qu'ait écrit le modèle
      if (Array.isArray(objet.contradictions) && 'aucune_contradiction' in objet && objet.aucune_contradiction !== (objet.contradictions.length === 0)) {
        signale('json_incoherent', `aucune_contradiction vaut ${objet.aucune_contradiction} mais la liste contient ${objet.contradictions.length} contradiction(s)`);
      }
    }
  }
} else if (texte) {
  // 1. sources citées
  for (const c of new Set([...texte.matchAll(/\[([^\]\n]{2,80})\]/g)].map((m) => m[1]))) {
    if (!sourcesAutorisees.has(c)) signale('source_inconnue', c);
  }
  // 2. une ligne = une phrase avec sa source (les titres et les « information non disponible » sont tolérés)
  const nombres = (s) => s.replace(/^\s*\d+[.)]\s+/, '').match(/\d+(?:[.,:h]\d+)*(?:\/\d+)?/g) ?? [];
  // mots de 5 lettres ou plus (sans accents) : sert à retrouver de quelle source vient une ligne
  const motsDe = (s) => new Set(normaliser(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 5));
  const motsFaits = faits.map((f) => ({ label: f.label, mots: motsDe(f.texte) }));
  const absents = new Set();
  for (const n of new Set(nombres(texte.replace(/^\s*\d+[.)]\s+/gm, '')))) {
    // 3. un nombre ou une heure de la réponse doit exister dans les faits
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
    // 4. les chiffres d'une ligne doivent se trouver dans les faits des sources que cette ligne cite
    const corpusCite = normaliser(faits.filter((f) => cites.includes(f.label)).map((f) => `${f.texte} ${f.date_affichee ?? ''}`).join(' \n '));
    const sansCitation = ligne.replace(/\[[^\]]*\]/g, '');
    for (const n of new Set(nombres(sansCitation))) {
      if (!absents.has(n) && !corpusCite.includes(normaliser(n))) signale('chiffre_hors_source_citee', `${n} cité avec [${cites.join(', ')}]`);
    }
    // 5. attribution : le fait le plus proche de la ligne (mots communs) doit venir d'une source citée
    const motsLigne = motsDe(sansCitation);
    if (motsLigne.size >= 3) {
      const score = (f) => [...motsLigne].filter((w) => f.mots.has(w)).length / motsLigne.size;
      // part des mots de la ligne expliquée par l'ENSEMBLE des faits des sources citées
      const motsCites = new Set(motsFaits.filter((f) => cites.includes(f.label)).flatMap((f) => [...f.mots]));
      const couvertureCitee = [...motsLigne].filter((w) => motsCites.has(w)).length / motsLigne.size;
      const meilleur = motsFaits
        .filter((f) => !cites.includes(f.label))
        .reduce((a, f) => (score(f) > a.s ? { label: f.label, s: score(f) } : a), { label: null, s: 0 });
      // signalé seulement si les sources citées expliquent mal la ligne ET qu'un fait d'une autre source l'explique au moins aussi bien
      if (couvertureCitee < 0.8 && meilleur.s >= 0.5 && meilleur.s >= couvertureCitee) {
        signale('source_probablement_erronee', `« ${ligne.slice(0, 70)}… » semble venir de [${meilleur.label}], citée : [${cites.join(', ')}]`);
      }
    }
  }
  // 5. un seul résident
  const t = normaliser(texte);
  for (const nom of ctx.autres?.noms ?? []) {
    if (new RegExp(`\\b${normaliser(nom)}\\b`).test(t)) signale('autre_resident', nom);
  }
  for (const m of texte.matchAll(/chambre\s*(?:n°\s*)?(\d+)/gi)) {
    if ((ctx.autres?.chambres ?? []).includes(m[1])) signale('autre_resident', `chambre ${m[1]}`);
  }
  // 7. termes de contenu (5 lettres et plus) qui n'existent dans AUCUN fait : paraphrase ou invention
  //    (« contrôle prévu », « évaluation »). On ne signale une ligne que si plusieurs termes lui manquent.
  const MOTS_DE_STRUCTURE = new Set(['resident', 'residente', 'information', 'disponible']);
  const motsTousFaits = new Set(motsFaits.flatMap((f) => [...f.mots]));
  for (const ligne of texte.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const sansCitation = ligne.replace(/\[[^\]]*\]/g, '');
    if (NON_DISPO.test(sansCitation) || /:\s*$/.test(ligne) || ligne.split(/\s+/).length < 5) continue; // titres de rubrique exclus
    const mots6 = [...motsDe(sansCitation)].filter((w) => w.length >= 5 && !MOTS_DE_STRUCTURE.has(w));
    const absentsFaits = mots6.filter((w) => !motsTousFaits.has(w) && !/^\d/.test(w));
    if (absentsFaits.length >= 2 && absentsFaits.length / Math.max(mots6.length, 1) >= 0.3) {
      signale('terme_non_source', `« ${absentsFaits.join(', ')} » n'apparaît dans aucun fait (ligne : ${ligne.slice(0, 60)}…)`);
    }
  }
  // 6. qualifications que l'IA ajoute de son propre chef (« pouls anormal », « tension élevée ») : un jugement
  //    clinique n'est acceptable que si un fait le formule.
  const QUALIFICATIFS = ['anormal', 'anormale', 'anormaux', 'eleve', 'elevee', 'elevees', 'bas', 'basse', 'normal', 'normale', 'normaux', 'preoccupant', 'preoccupante', 'inquietant', 'inquietante', 'alarmant', 'alarmante', 'grave', 'severe', 'critique', 'dangereux', 'dangereuse'];
  for (const q of QUALIFICATIFS) {
    const motEntier = new RegExp(`\\b${q}\\b`);
    if (motEntier.test(t) && !motEntier.test(corpus)) signale('qualification_non_sourcee', q);
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
