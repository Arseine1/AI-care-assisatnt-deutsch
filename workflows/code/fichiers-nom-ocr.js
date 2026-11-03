// Connecteur « fichiers » – branche PDF : le service OCR renvoie {texte, methode} ; on rattache le nom du fichier.
// (Le texte natif des PDF est lu par pdftotext, seuls les PDF « image » passent par OCRmyPDF.)
const fichiers = $('Est un PDF').all(0);
return $input.all().map((item, i) => ({
  json: { nom: fichiers[i].binary.data.fileName, texte: item.json.texte ?? '', methode: item.json.methode ?? 'ocr' },
}));
