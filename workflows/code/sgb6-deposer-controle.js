// Cotisations retraite – dépôt d'un questionnaire : { nom, contenu_base64 }. Seuls .txt et .pdf (avec du texte), 1 Mo au plus.
// Le contenu est une DONNÉE : rien de ce qu'il contient n'est interprété ici. Un refus est une réponse { refus, message }.
const e = $input.first().json?.body ?? {};
const refus = (motif, message) => [{ json: { refus: motif, message } }];
const nom = String(e.nom ?? '');
if (!/^[^\\/]{1,120}\.(txt|pdf)$/i.test(nom)) return refus('format', 'Seuls les fichiers .txt et .pdf (avec du texte, pas un scan) sont acceptés.');
const b64 = typeof e.contenu_base64 === 'string' ? e.contenu_base64 : '';
if (b64.length > 1500000) return refus('taille', 'Fichier trop gros : 1 Mo au maximum.');
const octets = Buffer.from(b64, 'base64');
if (octets.length === 0) return refus('vide', 'Fichier vide.');
if (octets.length > 1048576) return refus('taille', 'Fichier trop gros : 1 Mo au maximum.');
if (/\.pdf$/i.test(nom)) {
  if (octets.subarray(0, 5).toString('latin1') !== '%PDF-') return refus('format', "Ce fichier n'est pas un vrai PDF.");
  const binaire = await this.helpers.prepareBinaryData(octets, 'questionnaire.pdf', 'application/pdf');
  return [{ json: { nom, pdf: true }, binary: { data: binaire } }];
}
if (octets.includes(0)) return refus('format', "Ce fichier n'est pas un fichier texte.");
let texte;
try {
  texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
} catch {
  return refus('format', 'Le fichier texte doit être enregistré en UTF-8.');
}
return [{ json: { nom, pdf: false, texte } }];