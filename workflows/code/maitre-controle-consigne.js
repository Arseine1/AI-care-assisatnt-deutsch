// Mode B – CONTRÔLE de la consigne du soignant, AVANT tout autre traitement.
// Ce nœud est la seule porte d'entrée du texte libre : si la consigne est refusée, rien n'est cherché, rien n'est
// envoyé à l'IA. Une consigne acceptée n'arrive à l'IA que dans le bloc INSTRUCTION SOIGNANT du template verrouillé.
//
// Refus (motif) :
//   format           pas un texte, caractères de contrôle, balises, code, marqueurs de bloc ([RÔLE ET RÈGLES]…)
//   longueur         vide ou plus de 300 caractères
//   regles           tentative de changer les règles, d'ignorer les faits ou de révéler les consignes
//   mots_interdits   injures, demande de diagnostic ou de prescription, données personnelles (e-mail, téléphone, IBAN, lien)
//   autre_resident   le nom ou la chambre d'un AUTRE résident
// Le refus n'enregistre que le motif, la longueur et l'empreinte SHA-256 de la consigne, jamais son texte.
const crypto = require('crypto');
const LIMITE = 300;

const e = $('Webhook').first().json?.body ?? {};
const brut = e.consigne;
const autres = $('Autres résidents (contrôle)').all().map((i) => i.json).filter((r) => r.nom);
const choisi = $('Résident de la chambre').first().json;

const normaliser = (s) =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9@./:+ ]+/g, ' ').replace(/\s+/g, ' ').trim();

const refuser = (motif, message) => ({
  accepte: false,
  motif,
  message,
  patient_id: choisi?.patient_id ?? null,
  empreinte: crypto.createHash('sha256').update(String(brut ?? ''), 'utf8').digest('hex'),
  longueur: typeof brut === 'string' ? brut.length : null,
});

function controler() {
  if (typeof brut !== 'string') return refuser('format', 'La consigne doit être un texte.');
  const texte = brut.replace(/\s+/g, ' ').trim();
  if (!texte) return refuser('longueur', 'La consigne est vide.');
  if (brut.length > LIMITE || texte.length > LIMITE) return refuser('longueur', `La consigne dépasse ${LIMITE} caractères.`);

  // format : caractères de contrôle, balises, code, faux blocs
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(brut)) return refuser('format', 'La consigne contient des caractères non autorisés.');
  if (/<[a-z\/!][^>]*>|\{\{|\}\}|```|\$\{|<\?|%[0-9a-f]{2}/i.test(texte)) return refuser('format', 'La consigne contient du code ou des balises.');
  if (/\[\s*(role et regles|rôle et règles|faits des sources|instruction soignant|format de sortie)\s*\]/i.test(texte)) {
    return refuser('format', 'La consigne contient un marqueur réservé au système.');
  }

  // Lettres espacées (« I g n o r e ») : on recolle les suites de lettres isolées, et on contrôle les DEUX formes du texte.
  const recoller = (s) => s
    .replace(/(?<![a-z0-9])[a-z](?:[.\-_*][a-z](?![a-z0-9])){2,}/g, (suite) => suite.replace(/[.\-_*]/g, '')) // « s.u.p.p.r.i.m.e »
    .replace(/(?:^| )((?:[a-z0-9] ){2,}[a-z0-9])(?= |$)/g, (m, suite) => ` ${suite.replace(/ /g, '')}`)
    .replace(/\s+/g, ' ').trim();
  const n1 = normaliser(texte);
  const n = recoller(n1);

  // tentative de changer les règles
  const REGLES = [
    /\bignor\w*\b/, /\boubli\w*\b/, /ne tiens? pas compte/, /ne tenez pas compte/, /\bdesormais\b/, /\bdorenavant\b/,
    /nouvelles? (regles?|instructions?|consignes?)/, /(regles?|instructions?|consignes?) (precedentes?|ci dessus|du systeme|initiales?)/,
    /\b(system|systeme) ?prompt\b/, /\bprompt\b/, /\bjailbreak\b/, /\bdan\b/, /developer mode|mode developpeur/,
    /tu es (maintenant|desormais)|vous etes (maintenant|desormais)/, /fais comme si|faites comme si|agis comme|joue le role|fais semblant/,
    /(revele|affiche|montre|donne|repete|recite|liste|ecris|dis)\w*( moi| nous)? (tes|vos|les|ton|votre|toutes tes|toutes les) (regles?|instructions?|consignes?|prompt)/,
    /\b(tes|vos|ton|votre) (regles?|instructions?|prompt)\b/,
    /\b(sans|hors|en dehors (des?|du))( les| des| tes| vos| ces)? (regles?|sources?|faits|citations?)\b/, /(supprime|retire|cache|masque|omets?)\w* (l |le |la |les )?(allergie|chute|incident|risque|anticoagulant|alarme|faits?)/,
    /(change|modifie|remplace)\w* (le |ton |votre )?(format|role|langue)/, /reponds? (uniquement|seulement|juste) (par )?(ok|oui|non)/,
    // même tentative en anglais
    /\b(ignore|forget|disregard|override|bypass)\b/, /\bpretend\b/, /\bact as\b/, /\byou are now\b/, /\bjailbreak\b/,
    /\b(no|without|any|your|the|all|previous|prior) (rules?|instructions?|guidelines?|restrictions?)\b/, /\b(say|write|answer|reply) (that )?everything is (fine|ok|okay)\b/,
    // faux rapport « officiel » ou « signé » : seul le soignant qui valide signe
    /\b(rapport|document|texte|note|compte rendu)s? (officiel|officielle|signe|signee|certifie|certifiee|authentifie|authentifiee|approuve|approuvee)\b/,
    /\b(ajoute|ecris|ecrit|mentionne|indique|precise|termine|conclus|finis|termines)\w*\b.*\b(signe|signee|valide|validee|approuve|approuvee|certifie|certifiee|autorise|autorisee) (par|du|de la|de l)\b/,
    // format imposé par la consigne (JSON, code, champ « valide » forcé)
    /\bjson\b/, /\bxml\b/, /\b(champ|cle|propriete|field|key)\b.*\b(valide|valid|approuve|signe)\b/, /\b(valide|valid|approuve|signe|accepte)\w* ?:? ?(true|vrai|oui|1)\b/,
    /reponds? en (json|xml|html|code|anglais|english|allemand|markdown)/, /\brepond\w* (uniquement|seulement|juste) (par|avec|en)\b/,
  ];
  if (REGLES.some((r) => r.test(n) || r.test(n1))) return refuser('regles', 'La consigne cherche à modifier les règles de l\'assistant : elle est refusée.');

  // mots interdits : injures, diagnostic / prescription, données personnelles
  const INTERDITS = [
    /\b(connard|connasse|salaud|salope|merde|putain|enfoire|abruti|imbecile|debile|cretin|ordure|encule|ta gueule|va te faire)\b/,
    // demander un diagnostic ou un traitement est refusé ; LIRE les diagnostics du dossier (« quels sont les diagnostics ? ») reste permis
    /\b(diagnostiquer?|diagnostiques? (la|le|cette|ce|ces)|(fais|faire|pose|poser|etablis|etablir|donne|donner|propose|proposer|suggere\w*|recommande\w*) (moi )?(un |le |ton |votre |des )?(diagnostic|traitement)s?)\b/,
    /\b(prescri\w*|ordonn\w*|posologie|medicament a donner|augmente\w* la dose|reduis\w* la dose|quelle dose|combien de (mg|comprimes?|gouttes?))\b/,
    /\b(euthanasie|suicide|tuer|empoisonn\w*)\b/,
  ];
  if (INTERDITS.some((r) => r.test(n))) return refuser('mots_interdits', 'La consigne contient un terme ou une demande non autorisés (diagnostic, prescription, injure…).');
  if (/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/|www\.|\b(iban|bic)\b|\bde\d{2}[ ]?\d{4}|(\+|00)?\d{2,3}[ .-]?\d{2,4}[ .-]?\d{3,4}[ .-]?\d{3,4}\b/i.test(texte)) {
    return refuser('mots_interdits', 'La consigne contient une donnée personnelle (e-mail, téléphone, IBAN, lien).');
  }

  // un seul résident : pas le nom ni la chambre d'un autre
  for (const r of autres) {
    if (r.nom.toLowerCase() !== String(choisi?.nom ?? '').toLowerCase() && new RegExp(`\\b${normaliser(r.nom)}\\b`).test(n)) {
      return refuser('autre_resident', 'La consigne cite un autre résident : une consigne ne porte que sur le résident choisi.');
    }
  }
  const chambres = [...n.matchAll(/\b(?:chambre|ch|zimmer|room)\s*(?:n|no|numero)?\s*(\d{1,3})\b/g)].map((m) => m[1]);
  if (chambres.some((c) => c !== String(choisi?.chambre))) return refuser('autre_resident', 'La consigne cite une autre chambre : une consigne ne porte que sur le résident choisi.');

  return { accepte: true, consigne: texte, patient_id: choisi?.patient_id ?? null };
}

if (!choisi?.patient_id) {
  return [{ json: { accepte: false, motif: 'format', message: 'Résident inconnu : choisissez une chambre.', patient_id: null, empreinte: null, longueur: null } }];
}
return [{ json: controler() }];
