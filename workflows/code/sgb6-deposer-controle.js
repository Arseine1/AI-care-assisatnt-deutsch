// Rentenbeiträge – Upload eines Fragebogens: { nom, contenu_base64 }. Nur .txt und .pdf (mit Text), höchstens 1 MB.
// Der Inhalt ist ein DATENSATZ: nichts davon wird hier interpretiert. Eine Ablehnung ist eine Antwort { refus, message }.
const e = $input.first().json?.body ?? {};
const refus = (motif, message) => [{ json: { refus: motif, message } }];
const nom = String(e.nom ?? '');
if (!/^[^\/]{1,120}\.(txt|pdf)$/i.test(nom)) return refus('format', 'Es werden nur .txt- und .pdf-Dateien (mit Text, kein Scan) akzeptiert.');
const b64 = typeof e.contenu_base64 === 'string' ? e.contenu_base64 : '';
if (b64.length > 1500000) return refus('taille', 'Datei zu groß: höchstens 1 MB.');
const octets = Buffer.from(b64, 'base64');
if (octets.length === 0) return refus('vide', 'Leere Datei.');
if (octets.length > 1048576) return refus('taille', 'Datei zu groß: höchstens 1 MB.');
if (/\.pdf$/i.test(nom)) {
  if (octets.subarray(0, 5).toString('latin1') !== '%PDF-') return refus('format', 'Diese Datei ist kein echtes PDF.');
  const binaire = await this.helpers.prepareBinaryData(octets, 'questionnaire.pdf', 'application/pdf');
  return [{ json: { nom, pdf: true }, binary: { data: binaire } }];
}
if (octets.includes(0)) return refus('format', 'Diese Datei ist keine Textdatei.');
let texte;
try {
  texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
} catch {
  return refus('format', 'Die Textdatei muss in UTF-8 gespeichert sein.');
}
return [{ json: { nom, pdf: false, texte } }];
