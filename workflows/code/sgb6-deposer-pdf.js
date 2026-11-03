// Cotisations retraite – dépôt d'un PDF : seul un PDF qui contient déjà du texte est accepté. Un scan (le service d'extraction
// a dû faire de l'OCR) est refusé : on ne lit pas une image.
const r = $input.first().json ?? {};
if (r.error || typeof r.texte !== 'string') return [{ json: { refus: 'lecture', message: "Le texte du PDF n'a pas pu être lu." } }];
if (r.methode !== 'texte') return [{ json: { refus: 'scan', message: 'Ce PDF est un scan (image sans texte) : il est refusé. Déposez un PDF contenant du texte.' } }];
return [{ json: { nom: $('Contrôler le dépôt').first().json.nom, texte: r.texte } }];