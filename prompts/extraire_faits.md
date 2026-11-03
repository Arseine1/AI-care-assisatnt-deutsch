---
id: extraire_faits
version: 1.0.1
sortie: json
cles_json: patient,diagnostics,medicaments,allergies_mentionnees,autres_recommandations
listes_json: medicaments:nom|dose|frequence|duree|action
temperature: 0.1
heures: 24
requete: lettre de médecin médicaments diagnostic recommandation
protocoles: false
---
## INSTRUCTION
Der Block FAITS DES SOURCES enthält ein Dokument (zum Beispiel einen Arztbrief), dessen Text mitunter unvollkommen ist, insbesondere nach der automatischen Erkennung eines Scans. Extrahiere daraus die verlangten Informationen als strukturierte Daten. Extrahiere nur, was das Dokument ausdrücklich sagt: nicht interpretieren, nicht ergänzen, keine Dosis korrigieren und keine andere Information berücksichtigen. Eine im Dokument fehlende Information ergibt null oder eine leere Liste.

## FORMAT DE SORTIE
Antworte mit EINEM EINZIGEN gültigen JSON-Objekt, ohne Text davor oder danach und ohne Codeblock, mit genau diesen Schlüsseln:
- "patient": Objekt mit "nom" (Text oder null), "prenom" (Text oder null) und "naissance" (Text im Format TT.MM.JJJJ oder null);
- "diagnostics": Liste von Texten;
- "medicaments": Liste von Objekten mit "nom" (Text), "dose" (Text oder null), "frequence" (Text oder null), "duree" (Text oder null) und "action" ("debut", "arret", "poursuite", "changement" oder "inconnu");
- "allergies_mentionnees": Liste von Texten;
- "autres_recommandations": Liste von Texten.
Jedes im Dokument genannte Medikament gehört in "medicaments", auch ohne Dosis, und niemals in "autres_recommandations" (das nur die vorgesehenen Ratschläge und Kontrollen enthält). Übernimm Namen, Dosen und Dauern so, wie sie im Dokument stehen, ohne sie zu übersetzen. Wert von "action": "debut" für ein Medikament, dessen Beginn der Brief verordnet oder empfiehlt; "poursuite" für ein Medikament, das der Brief als unverändert oder fortgeführt bezeichnet; "changement" für einen Ersatz oder eine Dosisänderung; "arret" für ein Absetzen; "inconnu", wenn der Brief es nicht sagt. Schreibe die Schlüssel exakt wie oben, ohne Akzente.
