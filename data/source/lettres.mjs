// Metadaten der 5 Arztbriefe des simulierten KIM-Postfachs (fiktive Daten, Briefe auf Deutsch).
// Verwendet von generer-lettres.mjs (PDF) und envoyer-kim.mjs (Mailpit).

export const LETTRES = [
  {
    fichier: 'arztbrief-weber.pdf',
    expediteur: { nom: 'Dr. med. Annika Berger', email: 'praxis-berger@kim.example.test', fonction: 'Hausärztin, Allgemeinmedizin' },
    objet: 'Arztbrief – Hans Weber, geb. 23.11.1941',
    patient: 'Herr Hans Weber, geb. 23.11.1941',
    attendu: 'Widerspruch',
    corps: [
      ['Diagnose', 'Akute Bronchitis.'],
      ['Befund', 'Husten mit gelblichem Auswurf seit zwei Tagen, Temperatur 37,8 °C, Lunge: spastisch-feuchte Rasselgeräusche beidseits. CRP 18 mg/l.'],
      ['Therapie', 'Amoxicillin 1000 mg, 1-0-1, über 7 Tage. Ausreichend trinken.'],
      ['Weiterer Verlauf', 'Die übrige Medikation (Ramipril 5 mg, Amlodipin 5 mg) wird unverändert fortgeführt. Wiedervorstellung bei Fieber über 38,5 °C.'],
    ],
  },
  {
    fichier: 'arztbrief-schulz.pdf',
    expediteur: { nom: 'Dr. med. Thomas Lindner', email: 'kardiologie-lindner@kim.example.test', fonction: 'Facharzt für Kardiologie' },
    objet: 'Arztbrief – Greta Schulz, geb. 14.03.1938',
    patient: 'Frau Greta Schulz, geb. 14.03.1938',
    attendu: 'Widerspruch',
    corps: [
      ['Diagnose', 'Permanentes Vorhofflimmern, arterielle Hypertonie.'],
      ['Befund', 'Ruhe-EKG: Vorhofflimmern, Kammerfrequenz 74/min. Blutdruck 134/80 mmHg. Echokardiographie ohne wesentliche Veränderung.'],
      ['Empfehlung', 'Umstellung der Antikoagulation auf Apixaban 5 mg, 1-0-1, ab sofort. Bisoprolol 2,5 mg und Ramipril 2,5 mg unverändert.'],
      ['Kontrolle', 'Kardiologische Kontrolle in drei Monaten.'],
    ],
  },
  {
    fichier: 'arztbrief-mueller.pdf',
    expediteur: { nom: 'Dr. med. Sabine Krause', email: 'urologie-krause@kim.example.test', fonction: 'Fachärztin für Urologie' },
    objet: 'Arztbrief – Herr Müller, geb. 01.12.1947',
    patient: 'Herr Heinz Müller, geb. 01.12.1947',
    attendu: 'Widerspruch (nur mit dem richtigen Geburtsdatum sichtbar)',
    corps: [
      ['Diagnose', 'Unkomplizierter Harnwegsinfekt.'],
      ['Befund', 'Dysurie seit zwei Tagen, Urin trüb, Leukozyten im Urin positiv, Temperatur 37,9 °C.'],
      ['Therapie', 'Cotrimoxazol 960 mg, 1-0-1, über 5 Tage. Reichlich trinken.'],
      ['Hinweis', 'Bitte Patientenidentität anhand des Geburtsdatums prüfen.'],
    ],
  },
  {
    fichier: 'arztbrief-fischer.pdf',
    expediteur: { nom: 'Dr. med. Markus Vogel', email: 'orthopaedie-vogel@kim.example.test', fonction: 'Facharzt für Orthopädie' },
    objet: 'Arztbrief – Elisabeth Fischer, geb. 19.04.1943',
    patient: 'Frau Elisabeth Fischer, geb. 19.04.1943',
    attendu: 'kein Widerspruch',
    corps: [
      ['Diagnose', 'Gonarthrose rechts, Osteoporose, Hypothyreose.'],
      ['Befund', 'Belastungsabhängige Schmerzen im rechten Knie, kein Erguss, Beweglichkeit 0-0-110°.'],
      ['Empfehlung', 'Krankengymnastik zweimal pro Woche. Paracetamol 500 mg bei Bedarf, maximal 3 g pro Tag. Levothyroxin 75 µg und Calcium/Vitamin D unverändert.'],
      ['Kontrolle', 'Orthopädische Kontrolle in sechs Monaten.'],
    ],
  },
];

// Gescannter Brief (Bild): Ibuprofen bei einem Patienten mit Niereninsuffizienz Stadium 4.
export const LETTRE_SCAN = {
  fichier: 'arztbrief-wagner-scan.pdf',
  expediteur: { nom: 'Dr. med. Peter Neumann', email: 'praxis-neumann@kim.example.test', fonction: 'Hausarzt, Allgemeinmedizin' },
  objet: 'Arztbrief (Scan) – Otto Wagner, geb. 05.08.1936',
  patient: 'Herr Otto Wagner, geb. 05.08.1936',
  attendu: 'renaler Widerspruch (OCR erforderlich)',
};
