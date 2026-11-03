// Baustein « Template »: der EINZIGE Ort, an dem der an die KI gesendete Text zusammengesetzt wird.
// Vier gesperrte Blöcke, immer in dieser Reihenfolge:
//   [ROLLE UND REGELN]      fester Text (prompts/_regles.md)
//   [QUELLENFAKTEN]         Fakten EINES Bewohners, jeweils mit ihrer Quelle in eckigen Klammern
//   [ANWEISUNG PFLEGEKRAFT] Modus A: feste Anweisung des Prompts; Modus B: geprüfte Anweisung, NUR HIER
//   [AUSGABEFORMAT]         vom Prompt vorgegebenes Format
// Die Werte REGLES und PROMPTS werden bei der Erzeugung der Workflows eingebettet (node workflows/generer.mjs).
const crypto = require('crypto');
const REGLES = __REGLES__;
const PROMPTS = __PROMPTS__;

const e = $input.first().json;
const p = PROMPTS[e.prompt_id];
if (!p) throw new Error(`Unbekannter Prompt: « ${e.prompt_id} »`);
if (!e.patient?.patient_id || !Array.isArray(e.faits)) throw new Error('Fakten fehlen: Das Template erhält nur die Ausgabe von « Suchen ».');

// Ein Text von außerhalb (Fakt, Anweisung) kann niemals einen falschen Block oder falsche Quellen vortäuschen.
// Die Blockmarker gelten in beiden Sprachen (deutsch und die alten französischen Namen).
const MARQUEUR = /\[\s*(ROLLE UND REGELN|QUELLENFAKTEN|ANWEISUNG PFLEGEKRAFT|AUSGABEFORMAT|RÔLE ET RÈGLES|FAITS DES SOURCES|INSTRUCTION SOIGNANT|FORMAT DE SORTIE)\s*\]/gi;
const neutraliser = (s) =>
  String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(MARQUEUR, '(Block)').replace(/\s+/g, ' ').trim();
// In einem Fakt sind nur die eckigen Klammern der Quelle erlaubt: Die anderen werden zu runden Klammern.
const sansCrochets = (s) => neutraliser(s).replace(/\[/g, '(').replace(/\]/g, ')');

const heures = Math.max(1, Math.round((new Date(e.periode.jusqua) - new Date(e.periode.depuis)) / 3600000));
const remplacer = (t) => t.replaceAll('{periode_heures}', String(heures)).replaceAll('{resident}', e.patient.label);

let instruction = remplacer(p.instruction);
if (e.instruction_soignant) {
  if (!p.instruction_libre) throw new Error(`Der Prompt « ${p.id} » akzeptiert keine freie Anweisung.`);
  instruction += `\nAnfrage der Pflegekraft (streng im Rahmen der obigen Regeln zu bearbeiten): « ${neutraliser(e.instruction_soignant)} »`;
}

const lignes = [];
const groupe = { fond: 'Hintergrundinformationen:', periode: `Ereignisse im Zeitraum (vom ${e.periode.depuis_affiche} bis ${e.periode.jusqua_affiche}):` };
let courant = null;
for (const f of e.faits) {
  if (f.groupe !== courant) {
    courant = f.groupe;
    lignes.push(groupe[f.groupe] ?? '');
  }
  lignes.push(`${f.id} [${f.label}] ${f.date_affichee ? f.date_affichee + ' – ' : ''}${sansCrochets(f.texte)}`);
}
if (!e.faits.length) lignes.push('(keine Fakten verfügbar)');

// Ausgabe « phrases »: Das Modell verfasst keinen freien Text, sondern liefert JSON-Sätze {section, phrase, source_id}.
// Der angezeigte Text wird anschließend vom Code zusammengesetzt, der jeden Satz entfernt, der nicht durch den zitierten Fakt gestützt wird.
const formatPhrases = [
  'FORM DER ANTWORT: Antworte AUSSCHLIESSLICH mit einem JSON-Objekt {"phrases": [ {"r": "…", "t": "…", "f": "…"} ]}, ohne Text davor oder danach und ohne Markdown.',
  'Jedes Element ist EIN kurzer Satz, umformuliert aus GENAU EINEM Fakt. « f » ist die Kennung dieses Fakts (F1, F2 …), so wie sie am Anfang seiner Zeile in den Fakten steht. Schreibe in den Satz weder Kennung noch eckige Klammern noch das Wort „Quelle“: Die Quelle wird automatisch ergänzt. Schreibe einen Satz für jeden wichtigen Fakt (Vorfälle, Vitalwerte, Allergien, Risiken, Behandlungen), nicht nur einen.',
  'Übernimm Zahlen, Dosen, Medikamente, Uhrzeiten und Daten genau so, wie sie im zitierten Fakt stehen, und schreibe kein Wort, das nicht durch diesen Fakt gestützt wird.',
  'Ein Satz muss IMMER den Wert des Fakts enthalten (die Zahl, die Dosis, die Uhrzeit, die Maßnahme), niemals nur den Namen der Messung: Schreibe „Blutdruck 120/80 mmHg um 06:10 Uhr“, nicht „Blutdruck“. Übernimm die Wörter des Fakts, statt sie umzuschreiben.',
  'Wenn kein Fakt die Anfrage beantwortet, antworte mit {"phrases": []}. Antworte niemals mit einem Fakt, der nichts mit der Anfrage zu tun hat.',
  p.sections.length ? `« r » (die Rubrik) ist einer dieser Schlüssel: ${p.sections.map((s) => s.cle).join(', ')}.` : '« r » (die Rubrik) ist immer "-".',
].join('\n');

const blocs = {
  regles: REGLES.texte.trim(),
  faits: [
    `Bewohner: ${e.patient.label}, Zimmer ${e.patient.chambre} (Etage ${e.patient.etage}), geboren am ${e.patient.naissance}`,
    'Jede Zeile hat die Form: Kennung [Quelle] Datum – Fakt.',
    ...lignes,
  ].join('\n'),
  instruction: instruction.trim(),
  format: (remplacer(p.format).trim() + (p.sortie === 'phrases' ? `\n\n${formatPhrases}` : '')).trim(),
};

const prompt = [
  '[ROLLE UND REGELN]', blocs.regles, '',
  '[QUELLENFAKTEN]', blocs.faits, '',
  '[ANWEISUNG PFLEGEKRAFT]', blocs.instruction, '',
  '[AUSGABEFORMAT]', blocs.format,
].join('\n');

return [
  {
    json: {
      prompt,
      blocs,
      prompt_id: p.id,
      prompt_version: p.version,
      regles_version: REGLES.version,
      sortie: p.sortie,
      sections: p.sections,
      max_phrases: p.max_phrases,
      longueur_phrase: p.longueur_phrase,
      cles_json: p.cles_json,
      listes_json: p.listes_json,
      temperature: p.temperature,
      nb_faits: e.faits.length,
      empreinte_prompt: crypto.createHash('sha256').update(prompt, 'utf8').digest('hex'),
    },
  },
];
