// Connecteur « fichiers » – branche texte (.md, .txt) : décoder le contenu du fichier lu sur disque.
const sortie = [];
const items = $input.all();
for (let i = 0; i < items.length; i++) {
  const octets = await this.helpers.getBinaryDataBuffer(i, 'data');
  sortie.push({ json: { nom: items[i].binary.data.fileName, texte: octets.toString('utf8'), methode: 'texte' } });
}
return sortie;
