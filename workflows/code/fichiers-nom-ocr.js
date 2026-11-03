// Konnektor « Dateien » – PDF-Zweig: Der OCR-Dienst liefert {texte, methode}; der Dateiname wird zugeordnet.
// (Der native Text der PDFs wird mit pdftotext gelesen, nur „Bild“-PDFs laufen über OCRmyPDF.)
const fichiers = $('Ist ein PDF').all(0);
return $input.all().map((item, i) => ({
  json: { nom: fichiers[i].binary.data.fileName, texte: item.json.texte ?? '', methode: item.json.methode ?? 'ocr' },
}));
