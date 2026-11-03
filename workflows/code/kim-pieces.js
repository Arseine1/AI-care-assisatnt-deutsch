// KIM-Konnektor: eine Zeile je angehängtem PDF (Arztbrief).
const sortie = [];
for (const { json: m } of $input.all()) {
  for (const pj of m.Attachments ?? []) {
    const estPdf = /pdf/i.test(pj.ContentType ?? '') || /\.pdf$/i.test(pj.FileName ?? '');
    if (!estPdf) continue;
    sortie.push({
      json: {
        id: m.ID,
        partId: pj.PartID,
        fileName: pj.FileName,
        from: m.From?.Address,
        expediteur: m.From?.Name || m.From?.Address,
        subject: m.Subject,
        date: m.Date,
      },
    });
  }
}
return sortie;
