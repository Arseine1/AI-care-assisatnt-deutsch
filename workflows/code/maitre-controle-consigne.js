// Modus B – PRÜFUNG der Anweisung der Pflegekraft, VOR jeder anderen Verarbeitung.
// Dieser Knoten ist das einzige Eingangstor für Freitext: Wird die Anweisung abgelehnt, wird nichts gesucht und nichts
// an die KI gesendet. Eine akzeptierte Anweisung erreicht die KI nur im Block INSTRUCTION SOIGNANT der gesperrten Vorlage.
//
// Ablehnung (Grund):
//   format           kein Text, Steuerzeichen, Tags, Code, Blockmarkierungen ([RÔLE ET RÈGLES]…)
//   longueur         leer oder länger als 300 Zeichen
//   regles           Versuch, die Regeln zu ändern, die Fakten zu ignorieren oder die Anweisungen preiszugeben
//   mots_interdits   Beleidigungen, Bitte um Diagnose oder Verordnung, personenbezogene Daten (E-Mail, Telefon, IBAN, Link)
//   autre_resident   Name oder Zimmer eines ANDEREN Bewohners
// Die Ablehnung speichert nur den Grund, die Länge und den SHA-256-Fingerabdruck der Anweisung, nie ihren Text.
// Die Muster erkennen französische, deutsche und englische Formulierungen (der Eingabetext kann in allen drei Sprachen sein).
const crypto = require('crypto');
const LIMITE = 300;

const e = $('Webhook').first().json?.body ?? {};
const brut = e.consigne;
const autres = $('Andere Bewohner (Prüfung)').all().map((i) => i.json).filter((r) => r.nom);
const choisi = $('Bewohner des Zimmers').first().json;

// ß wird zu ss (NFD zerlegt es nicht); Akzente und Umlaute fallen weg (ä/ö/ü -> a/o/u)
const normaliser = (s) =>
  String(s).replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9@./:+ ]+/g, ' ').replace(/\s+/g, ' ').trim();

const refuser = (motif, message) => ({
  accepte: false,
  motif,
  message,
  patient_id: choisi?.patient_id ?? null,
  empreinte: crypto.createHash('sha256').update(String(brut ?? ''), 'utf8').digest('hex'),
  longueur: typeof brut === 'string' ? brut.length : null,
});

function controler() {
  if (typeof brut !== 'string') return refuser('format', 'Die Anweisung muss ein Text sein.');
  const texte = brut.replace(/\s+/g, ' ').trim();
  if (!texte) return refuser('longueur', 'Die Anweisung ist leer.');
  if (brut.length > LIMITE || texte.length > LIMITE) return refuser('longueur', `Die Anweisung überschreitet ${LIMITE} Zeichen.`);

  // Format: Steuerzeichen, Tags, Code, falsche Blöcke
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(brut)) return refuser('format', 'Die Anweisung enthält unzulässige Zeichen.');
  if (/<[a-z\/!][^>]*>|\{\{|\}\}|```|\$\{|<\?|%[0-9a-f]{2}/i.test(texte)) return refuser('format', 'Die Anweisung enthält Code oder Tags.');
  if (/\[\s*(role et regles|rôle et règles|faits des sources|instruction soignant|format de sortie|rolle und regeln|quellenfakten|anweisung pflegekraft|ausgabeformat)\s*\]/i.test(texte)) {
    return refuser('format', 'Die Anweisung enthält eine für das System reservierte Markierung.');
  }

  // Gesperrte Buchstaben (« I g n o r e ») : Folgen einzelner Buchstaben werden zusammengesetzt, und BEIDE Formen des Textes werden geprüft.
  const recoller = (s) => s
    .replace(/(?<![a-z0-9])[a-z](?:[.\-_*][a-z](?![a-z0-9])){2,}/g, (suite) => suite.replace(/[.\-_*]/g, '')) // « s.u.p.p.r.i.m.e »
    .replace(/(?:^| )((?:[a-z0-9] ){2,}[a-z0-9])(?= |$)/g, (m, suite) => ` ${suite.replace(/ /g, '')}`)
    .replace(/\s+/g, ' ').trim();
  const n1 = normaliser(texte);
  const n = recoller(n1);

  // Versuch, die Regeln zu ändern
  const REGLES = [
    /\bignor\w*\b/, /\boubli\w*\b/, /ne tiens? pas compte/, /ne tenez pas compte/, /\bdesormais\b/, /\bdorenavant\b/,
    /nouvelles? (regles?|instructions?|consignes?)/, /(regles?|instructions?|consignes?) (precedentes?|ci dessus|du systeme|initiales?)/,
    /\b(system|systeme) ?prompt\b/, /\bprompt\b/, /\bjailbreak\b/, /\bdan\b/, /developer mode|mode developpeur/,
    /tu es (maintenant|desormais)|vous etes (maintenant|desormais)/, /fais comme si|faites comme si|agis comme|joue le role|fais semblant/,
    /(revele|affiche|montre|donne|repete|recite|liste|ecris|dis)\w*( moi| nous)? (tes|vos|les|ton|votre|toutes tes|toutes les) (regles?|instructions?|consignes?|prompt)/,
    /\b(tes|vos|ton|votre) (regles?|instructions?|prompt)\b/,
    /\b(sans|hors|en dehors (des?|du))( les| des| tes| vos| ces)? (regles?|sources?|faits|citations?)\b/, /(supprime|retire|cache|masque|omets?)\w* (l |le |la |les )?(allergie|chute|incident|risque|anticoagulant|alarme|faits?)/,
    /(change|modifie|remplace)\w* (le |ton |votre )?(format|role|langue)/, /reponds? (uniquement|seulement|juste) (par )?(ok|oui|non)/,
    // dieselben Versuche auf Englisch
    /\b(ignore|forget|disregard|override|bypass)\b/, /\bpretend\b/, /\bact as\b/, /\byou are now\b/, /\bjailbreak\b/,
    /\b(no|without|any|your|the|all|previous|prior) (rules?|instructions?|guidelines?|restrictions?)\b/, /\b(say|write|answer|reply) (that )?everything is (fine|ok|okay)\b/,
    // dieselben Versuche auf Deutsch (der Text ist normalisiert: ä/ö/ü -> a/o/u, ß -> ss; die ue/oe/ae-Schreibweisen sind mit abgedeckt)
    /\bignorier\w*\b/, /\bvergiss\w*\b/, /\bvergessen sie\b/, /\bmissachte\w*\b/, /\bu(?:e)?bersieh\w*\b/, /\bu(?:e)?bergeh\w*\b/,
    /\b(beachte\w*|beachten sie|berucksichtige\w*|beruecksichtige\w*)(?: [a-z]+){0,3} (nicht|kein\w*)\b/,
    /\bab sofort\b/, /\bab jetzt\b/, /\bk(?:u|ue)nftig\b/,
    /\bneue[nmrs]? (regel\w*|anweisung\w*|instruktion\w*|vorgabe\w*)\b/,
    /\b(vorherige\w*|bisherige\w*|obige\w*|ursprungliche\w*|urspruengliche\w*|fr(?:u|ue)here\w*|vorangehende\w*) (regel\w*|anweisung\w*|instruktion\w*|vorgabe\w*)\b/,
    /\b(regeln|anweisungen|instruktionen|vorgaben) (von (vorhin|oben)|zuvor|davor|oben)\b/,
    /\bsystem ?(anweisung|nachricht|befehl)\w*\b/, /\bsystemprompt\b/, /\bentwickler ?modus\b/,
    /\bdu bist (jetzt|nun|ab sofort)\b/, /\bsie sind (jetzt|nun|ab sofort)\b/,
    /\btu so als\b/, /\btun sie so als\b/, /\bverhalte dich wie\b/, /\bverhalten sie sich wie\b/, /\bspiel\w* (die |eine )?rolle\b/, /\bschlupf\w* in die rolle\b/, /\bagiere als\b/,
    /\b(zeig\w*|nenn\w*|verrat\w*|gib\w*|geben sie|wiederhol\w*|liste\w*|schreib\w*|sag\w*|offenbar\w*|ausgeb\w*|ausgib\w*)( mir| uns| bitte)* (deine|ihre|alle deine|alle ihre) (regeln|anweisungen|instruktionen|prompts?)\b/,
    /\b(zeig\w*|nenn\w*|verrat\w*|gib\w*|geben sie|wiederhol\w*|liste\w*|schreib\w*|sag\w*|offenbar\w*|ausgeb\w*|ausgib\w*)( mir| uns| bitte)* (die|alle) (regeln|instruktionen|prompts?|systemanweisungen)\b/,
    /\b(deine|deinen|deiner|euren|eure) (regeln|anweisungen|instruktionen|vorgaben|prompts?)\b/,
    /\b(ohne|ausser|abseits|ausserhalb)( der| die| den| des| von| deine| ihre| deinen| ihren| alle)? (regeln|quellen|fakten|belege|belegen|zitate|zitaten)\b/,
    /\b(weglass\w*|auslass\w*|ausblend\w*|streich\w*|loesch\w*|losch\w*|entfern\w*|verschweig\w*|verheimlich\w*|unterdruck\w*|unterdrueck\w*|verberg\w*|verbirg\w*|verstecke\w*)\b.{0,40}\b(allergie\w*|sturz\w*|sturze\w*|stuerze\w*|vorfall\w*|vorfalle\w*|risiko\w*|risiken|antikoagul\w*|blutverdunn\w*|blutverduenn\w*|alarm\w*|fakt\w*)/,
    /\blass\w*\b.{0,40}\b(allergie\w*|sturz\w*|sturze\w*|stuerze\w*|vorfall\w*|vorfalle\w*|risiko\w*|antikoagul\w*|blutverdunn\w*|blutverduenn\w*|alarm\w*|fakt\w*)\b.{0,20}\bweg\b/,
    /\b(andere|aendere|aender\w*|wechsle\w*|ersetze\w*) ?(das |dein |deine |ihr |ihre |die |den )?(format|rolle|sprache)\b/,
    /\bantworte\w* (nur|ausschliesslich|lediglich|einfach) (mit |durch )?(ok|ja|nein)\b/,
    // falscher « offizieller » oder « unterschriebener » Bericht: nur die bestätigende Pflegekraft unterschreibt
    /\b(offizielle\w*|unterschriebene\w*|unterzeichnete\w*|zertifizierte\w*|beglaubigte\w*|authentifizierte\w*) (bericht|dokument|text|notiz|vermerk|protokoll)\b/,
    /\b(bericht|dokument|text|notiz|vermerk|protokoll)e?s? (ist |sei |als )?(offiziell|unterschrieben|unterzeichnet|zertifiziert|beglaubigt|authentifiziert)\b/,
    /\b(fuge\w*|fuege\w*|schreib\w*|erwahn\w*|erwaehn\w*|vermerk\w*|erganz\w*|ergaenz\w*|schliess\w*|beende\w*)\b.*\b(unterschrieben|unterzeichnet|bestatigt|bestaetigt|freigegeben|genehmigt|zertifiziert|autorisiert|gezeichnet) (von|durch|vom)\b/,
    // dasselbe auf Französisch: faux rapport « officiel » ou « signé »
    /\b(rapport|document|texte|note|compte rendu)s? (officiel|officielle|signe|signee|certifie|certifiee|authentifie|authentifiee|approuve|approuvee)\b/,
    /\b(ajoute|ecris|ecrit|mentionne|indique|precise|termine|conclus|finis|termines)\w*\b.*\b(signe|signee|valide|validee|approuve|approuvee|certifie|certifiee|autorise|autorisee) (par|du|de la|de l)\b/,
    // von der Anweisung erzwungenes Format (JSON, Code, erzwungenes Feld « valide »)
    /\bjson\b/, /\bxml\b/, /\b(champ|cle|propriete|field|key)\b.*\b(valide|valid|approuve|signe)\b/, /\b(valide|valid|approuve|signe|accepte)\w* ?:? ?(true|vrai|oui|1)\b/,
    /reponds? en (json|xml|html|code|anglais|english|allemand|markdown)/, /\brepond\w* (uniquement|seulement|juste) (par|avec|en)\b/,
    /\b(feld|schlussel|schluessel|eigenschaft|attribut)\b.*\b(bestatigt|bestaetigt|gultig|gueltig|genehmigt|freigegeben|unterschrieben|valid|valide)\b/,
    /\b(bestatigt|bestaetigt|gultig|gueltig|genehmigt|freigegeben|unterschrieben|valid|valide) ?:? ?(true|wahr|ja|1)\b/,
    /\bantworte\w* (nur |ausschliesslich |lediglich )?(in|als|im|mit) ?(json|xml|html|code|englisch|franzosisch|franzoesisch|markdown)\b/,
    /\bantworte\w* (nur|ausschliesslich|lediglich) (mit|durch|per)\b/,
  ];
  if (REGLES.some((r) => r.test(n) || r.test(n1))) return refuser('regles', 'Die Anweisung versucht, die Regeln des Assistenten zu ändern: Sie wird abgelehnt.');

  // Verbotene Wörter: Beleidigungen, Diagnose / Verordnung, personenbezogene Daten
  const INTERDITS = [
    /\b(connard|connasse|salaud|salope|merde|putain|enfoire|abruti|imbecile|debile|cretin|ordure|encule|ta gueule|va te faire)\b/,
    // deutsche Beleidigungen
    /\b(arschloch|arschgeige|scheisse|scheiss\w*|scheisskerl|idiot\w*|vollidiot|depp|deppen|trottel|volltrottel|dummkopf|schwachkopf|blodmann|bloedmann|wichser|hurensohn|fotze|schlampe|miststuck|mistkerl|drecksau|spast\w*|ficken?|fick dich|halt die fresse|halt die klappe|halts maul|halt s maul|verpiss dich|geh sterben)\b/,
    // eine Diagnose oder Behandlung zu verlangen wird abgelehnt; die Diagnosen der Akte LESEN (« quels sont les diagnostics ? ») bleibt erlaubt
    /\b(diagnostiquer?|diagnostiques? (la|le|cette|ce|ces)|(fais|faire|pose|poser|etablis|etablir|donne|donner|propose|proposer|suggere\w*|recommande\w*) (moi )?(un |le |ton |votre |des )?(diagnostic|traitement)s?)\b/,
    /\bdiagnostizier(?:e|en|st)?\b/,
    /\b(stell\w*|erstell\w*|mach\w*|ermittle\w*)( mir| uns| bitte)* (eine |die |deine |ihre |ein |den |eine moegliche |eine mogliche )?diagnose\w*/,
    /\b(vorschlag\w*|schlag\w*|empfiehl\w*|empfehl\w*|verordn\w*|bestimm\w*)( mir| uns| bitte)* (eine |die |deine |ihre |ein |den |eine moegliche |eine mogliche )?(diagnose|therapie|behandlung)\w*/,
    /\b(gib|gebt|geben sie|nenn\w*|sag\w*|nennen sie)( mir| uns| bitte)* (eine|deine|ihre|ein) (neue |moegliche |mogliche )?(diagnose|therapie|behandlung)\w*/,
    /\b(prescri\w*|ordonn\w*|posologie|medicament a donner|augmente\w* la dose|reduis\w* la dose|quelle dose|combien de (mg|comprimes?|gouttes?))\b/,
    /\b(verschreib\w*|verordn\w*|rezept\w*|dosierung\w*|welche dosis|wie hoch (ist |sollte |soll )?die dosis)\b/,
    /\b(erhohe\w*|erhoehe\w*|steiger\w*|senk\w*|reduzier\w*|verringer\w*|verdopple\w*|halbier\w*) (die |der |ihre |deine )?dosis\b/,
    /\b(wie viel\w*|wieviel\w*|wie viele) (mg|milligramm|tabletten?|tropfen)\b/,
    /\bwelches medikament\b.{0,25}\b(geben|verabreich\w*)\b/,
    /\b(euthanasie|suicide|tuer|empoisonn\w*)\b/,
    /\b(sterbehilfe|suizid\w*|selbstmord\w*|toeten|umbringen|vergift\w*)\b/,
  ];
  if (INTERDITS.some((r) => r.test(n))) return refuser('mots_interdits', 'Die Anweisung enthält einen unzulässigen Begriff oder eine unzulässige Anfrage (Diagnose, Verordnung, Beleidigung …).');
  if (/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/|www\.|\b(iban|bic)\b|\bde\d{2}[ ]?\d{4}|(\+|00)?\d{2,3}[ .-]?\d{2,4}[ .-]?\d{3,4}[ .-]?\d{3,4}\b/i.test(texte)) {
    return refuser('mots_interdits', 'Die Anweisung enthält personenbezogene Daten (E-Mail, Telefon, IBAN, Link).');
  }

  // ein einziger Bewohner: weder Name noch Zimmer eines anderen
  for (const r of autres) {
    if (r.nom.toLowerCase() !== String(choisi?.nom ?? '').toLowerCase() && new RegExp(`\\b${normaliser(r.nom)}\\b`).test(n)) {
      return refuser('autre_resident', 'Die Anweisung nennt einen anderen Bewohner: Eine Anweisung bezieht sich nur auf den gewählten Bewohner.');
    }
  }
  const chambres = [...n.matchAll(/\b(?:chambre|ch|zimmer|raum|room)\s*(?:n|no|nr|numero)?\s*(\d{1,3})\b/g)].map((m) => m[1]);
  if (chambres.some((c) => c !== String(choisi?.chambre))) return refuser('autre_resident', 'Die Anweisung nennt ein anderes Zimmer: Eine Anweisung bezieht sich nur auf den gewählten Bewohner.');

  return { accepte: true, consigne: texte, patient_id: choisi?.patient_id ?? null };
}

if (!choisi?.patient_id) {
  return [{ json: { accepte: false, motif: 'format', message: 'Bewohner unbekannt: Wählen Sie ein Zimmer.', patient_id: null, empreinte: null, longueur: null } }];
}
return [{ json: controler() }];
