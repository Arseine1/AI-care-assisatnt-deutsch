// Brique « chercher » – assemblage de la liste de FAITS d'un seul résident.
//
// Deux familles de sources :
//   1. lecture DIRECTE du logiciel de soins (notes, constantes, plan de médication, fiche) : toujours à jour, car
//      le RAG n'est actualisé que 4 fois par jour ;
//   2. RAG (Qdrant), TOUJOURS filtré par patient_id : ePA, base de l'hôpital, documents, et les protocoles.
// Le contenu de la collection « a_verifier » (lettres non contrôlées) n'est JAMAIS mélangé aux faits : il sort à part.
const P = $('Paramètres').first().json;
const r = $('Résident').first().json;
if (!r || r.patient_id !== P.patient_id) throw new Error(`Résident inconnu : ${P.patient_id}`);

const lignes = (nom, cle) => $(nom).all().map((i) => i.json).filter((x) => x[cle] !== undefined && x[cle] !== null);
const autres = lignes('Autres résidents', 'patient_id');
const notes = lignes('Notes de la période', 'id');
const vitaux = lignes('Constantes de la période', 'type');
const meds = lignes('Plan de médication', 'medicament');
const resultats = (nom) => $(nom).first().json?.result ?? [];

const fmt = (d) => {
  const p = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(d));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('day')}.${g('month')}. ${g('hour')}h${g('minute')}`;
};
const propre = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 600);

const fond = []; // informations de fond (profil, ePA, hôpital, protocoles)
const periode = []; // événements datés de la période
const LS = 'Logiciel de soins';
const ajoute = (liste, label, texte, date, type, ref) =>
  liste.push({ label, texte: propre(texte), date: date ? new Date(date).toISOString() : null, type, ref });

// ---- 1. lecture directe du logiciel de soins ----
const liste = (a, vide) => (a && a.length ? a.join(' ; ') : vide);
ajoute(fond, LS, `Diagnostics : ${liste(r.diagnostics, 'aucun')}`, null, 'profil', `profil-${r.patient_id}`);
ajoute(fond, LS, `Allergies : ${liste(r.allergies, 'aucune connue')}`, null, 'profil', `profil-${r.patient_id}`);
ajoute(fond, LS, `Régime : ${(r.regime ?? 'non précisé').replace(/\.\s*$/, '')}`, null, 'profil', `profil-${r.patient_id}`);
ajoute(fond, LS, `Risques : ${liste(r.risques, 'aucun signalé')}`, null, 'profil', `profil-${r.patient_id}`);
if (meds.length) {
  ajoute(
    fond, LS,
    `Plan de médication : ${meds.map((m) => `${m.medicament} ${m.dosage} (${m.schema_prise})${m.indication ? ' pour ' + m.indication : ''}`).join(' ; ')}`,
    null, 'medication', `plan-${r.patient_id}`,
  );
}
for (const n of notes) ajoute(periode, LS, `${n.categorie} (${n.auteur}) : ${n.texte}`, n.horodatage, 'note', `note-${n.id}`);
const parHeure = new Map();
for (const v of vitaux) {
  const cle = new Date(v.horodatage).toISOString().slice(0, 16);
  if (!parHeure.has(cle)) parHeure.set(cle, { date: v.horodatage, items: [] });
  parHeure.get(cle).items.push(`${v.type} ${v.valeur}${v.unite ? ' ' + v.unite : ''}`);
}
for (const { date, items } of parHeure.values()) ajoute(periode, LS, `Constantes : ${items.join(' ; ')}`, date, 'constantes', `vitaux-${date}`);

// ---- 2. RAG : tout ce qui n'est pas lu en direct (le logiciel de soins l'est déjà) ----
const vus = new Set();
const alarmesRag = [];
const depuisRag =(liste, destination) => {
  for (const x of liste) {
    const p = x.payload ?? {};
    if (p.source === 'logiciel_soins') continue;
    // Un rapport déjà validé est le texte d'un soignant, pas un fait source : relire un SBAR passé pour en écrire un nouveau
    // ferait recopier (et amplifier) ses erreurs éventuelles. Seuls les prompts qui le demandent (Mode B) le voient.
    if (p.type === 'rapport_valide' && !P.rapports_valides) continue;
    const cle = `${p.source}|${p.source_ref}|${p.chunk_index}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    // Les alarmes de capteur indexées dans le RAG sont REGROUPÉES en un seul fait (ci-dessous) : une alarme est toujours retenue
    // (importance maximale), et plusieurs alarmes d'une même nuit prendraient sinon la moitié des 8 places au détriment des constantes,
    // des allergies et des notes.
    if (p.type === 'alarme' && p.source === 'capteurs') {
      alarmesRag.push({ date: p.date ?? null, texte: p.texte });
      continue;
    }
    // un protocole s'affiche comme tel (« Protocole chutes »), pas sous le nom du connecteur (« Fichiers »)
    ajoute(destination, p.type === 'protocole' ? `Protocole ${String(p.theme ?? '').replace(/[-_]/g, ' ')}`.trim() : p.source_label, p.texte, p.date ?? null, p.type, `${p.source_ref}#${p.chunk_index}`);
  }
};
depuisRag(resultats('Qdrant période'), periode);
depuisRag(resultats('Qdrant fond'), fond);
if (P.protocoles) depuisRag(resultats('Qdrant protocoles'), fond);
if (alarmesRag.length) {
  const recentes = alarmesRag.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-5);
  // texte construit par le code à l'indexation (« Alarme de capteur (chute) le 27.10. à 13h47, chambre 12. ») : on garde type, jour et heure
  const court = (t) => String(t).replace(/^Alarme de capteur\s*/i, '').replace(/,?\s*chambre\s*\d+\.?$/i, '').trim();
  ajoute(periode, 'Capteurs', `Alarmes de capteur de la période : ${recentes.map((a) => court(a.texte)).join(' ; ')}`, recentes.at(-1).date, 'alarme', 'alarmes-capteurs');
}

// ---- 3. lettres NON contrôlées : jamais dans les faits ----
const lettres = ($('Qdrant lettres').first().json?.result?.points ?? []).map((x) => ({
  titre: x.payload.titre, expediteur: x.payload.expediteur, date: x.payload.date, ref: x.payload.source_ref,
  motif: x.payload.motif, texte: x.payload.texte,
}));

// ---- tri, plafond, numérotation ----
// Au plus MAX_FAITS faits par résident (8 par défaut) : moins de faits, c'est un prompt plus court (le modèle le lit
// plus vite) et moins de matière à confondre. On garde les faits les plus importants pour la sécurité :
// incidents et allergies d'abord, puis risques, médication, constantes, observations récentes, diagnostics, régime.
const MAX_FAITS = Math.min(Math.max(Number(P.max_faits ?? 8), 3), 40);
const prioritaires = new Set(P.sources_prioritaires ?? []);
periode.sort((a, b) => String(a.date).localeCompare(String(b.date)));
const importance = (f, rangRecent) => {
  const t = String(f.texte).toLowerCase();
  let s = 40;
  if (f.type === 'note') s = /^incident/.test(t) ? 100 : /^(soins|medication|médication)/.test(t) ? 62 : 56;
  else if (f.type === 'constantes') s = 50;
  else if (f.type === 'profil') s = /^allergies/.test(t) ? 98 : /^risques/.test(t) ? 90 : /^diagnostics/.test(t) ? 58 : 30;
  else if (f.type === 'medication') s = 70;
  else if (['allergie'].includes(f.type)) s = 97;
  else if (['diagnostic', 'analyse'].includes(f.type)) s = 60;
  else if (f.type === 'protocole') s = 45;
  else if (f.type === 'rapport_valide') s = 35;
  if (prioritaires.has(f.label)) s += 100;
  if (/alarme|capteur/i.test(f.label)) s += 120; // une alarme de capteur est toujours retenue
  return s + (rangRecent ?? 0); // à importance égale, le plus récent
};
// ---- pertinence par rapport à la demande (Mode B : la consigne du soignant, DÉJÀ contrôlée) ----
// Sans cela, les 8 faits retenus ne dépendent que de leur importance générale : une question sur le poids ou la fièvre
// pouvait ne jamais voir le fait qui répond. Ici les mots de la demande (et quelques synonymes de soins) font remonter
// les faits qui en parlent. Si AUCUN fait du résident n'en parle, le modèle ne reçoit AUCUN fait : il ne peut alors
// rien affirmer, et la réponse est « information non disponible » (au lieu d'un fait sans rapport).
const sansAccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MOTS_GENERAUX = new Set([
  'quel', 'quels', 'quelle', 'quelles', 'comment', 'passe', 'passee', 'derniers', 'dernieres', 'dernier', 'derniere', 'nuit', 'heures',
  'resume', 'resumer', 'resumes', 'donne', 'donnez', 'indique', 'liste', 'dites', 'sont', 'etre', 'avoir', 'faire', 'fait', 'faits', 'etat',
  'general', 'generale', 'situation', 'journee', 'soir', 'matin', 'rapport', 'transmission', 'synthese', 'points', 'important', 'importants',
  'importante', 'importantes', 'information', 'informations', 'concernant', 'propos', 'resident', 'residente', 'avec', 'dans', 'pour', 'cette',
  'depuis', 'tout', 'tous', 'toute', 'toutes', 'plus', 'moins', 'aujourd', 'hier', 'recemment', 'actuel', 'actuelle', 'actuellement', 'quand', 'combien',
  'elle', 'elles', 'etait', 'etaient', 'avant', 'apres', 'pendant', 'porte', 'portent', 'contre', 'prend', 'prends', 'prennent', 'heure', 'niveau',
  'autre', 'autres', 'encore', 'deja', 'jamais', 'souvent', 'cette', 'celui', 'celle', 'leur', 'leurs', 'ainsi', 'alors', 'aussi', 'sans', 'chez',
]);
const SYNONYMES = {
  fievre: ['temperature', 'fievre', 'febrile'], febrile: ['temperature', 'fievre', 'febrile'], temperature: ['temperature', 'fievre'],
  saturation: ['spo2', 'saturation', 'oxygene'], oxygene: ['spo2', 'oxygene'], respiration: ['spo2', 'respir', 'dyspnee'],
  tension: ['tension', 'pression'], pouls: ['pouls', 'frequence'], poids: ['poids', 'kg'], diurese: ['diurese', 'urine', 'urines'],
  glycemie: ['glycemie', 'glucose', 'sucre'], sucre: ['glycemie', 'glucose'], douleur: ['douleur', 'eva'], medicaments: ['medication', 'dosage', 'mg'],
  medicament: ['medication', 'dosage', 'mg'], traitement: ['medication', 'traitement', 'dosage', 'mg'], allergie: ['allergie', 'allergies'],
  mobilisation: ['mobilis', 'deambul', 'marche', 'fauteuil'], agite: ['agit', 'errance', 'nerveu'], agitee: ['agit', 'errance', 'nerveu'],
  agitation: ['agit', 'errance'], peau: ['peau', 'rougeur', 'escarre', 'sacrum', 'pansement'], chute: ['chute', 'sol'],
};
// Un mot de la demande « parle » d'un fait si le fait contient ce mot, à une terminaison près (s, e, es…) : « radiographie »
// trouve « radiographies », mais « personne » ne trouve pas « personnel ». Les synonymes ci-dessus se cherchent au début des mots.
const TERMINAISONS = new Set(['s', 'x', 'e', 'es', 'ee', 'ees', 'ent', 'er', 'ez', 'a']);
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
// ordre d'affichage : informations de fond d'abord, puis la période dans l'ordre chronologique
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
      // pour le contrôle « ne jamais mélanger deux résidents » : noms et chambres des AUTRES résidents
      autres: {
        noms: [...new Set(autres.map((x) => x.nom))].filter((n) => n.toLowerCase() !== String(r.nom).toLowerCase()),
        chambres: autres.map((x) => String(x.chambre)).filter((c) => c !== String(r.chambre)),
      },
      stats: { nb_faits: faits.length, par_source, tronque, nb_lettres_a_verifier: lettres.length, aucune_correspondance: aucuneCorrespondance },
    },
  },
];
