// Connecteur « KIM » : une ligne par PDF joint (lettre de médecin).
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
