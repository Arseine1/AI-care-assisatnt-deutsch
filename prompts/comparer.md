---
id: comparer
version: 1.0.1
sortie: json
cles_json: contradictions,aucune_contradiction
listes_json: contradictions:type|gravite|description|element_lettre|element_source|sources
temperature: 0.1
heures: 24
requete: allergie médication anticoagulant insuffisance rénale contre-indication risque
protocoles: true
max_faits: 40
---
## INSTRUCTION
Vergleiche den zu prüfenden Brief (den Fakt mit der Quelle [KIM (lettre de médecin)]) mit den übrigen Fakten der Bewohnerin bzw. des Bewohners: Allergien, Medikationsplan, Risiken, Diagnosen, Nierenfunktion und Protokolle des Hauses. Melde einen Widerspruch nur, wenn sich ZWEI konkrete Fakten widersprechen, der eine aus dem Brief, der andere aus einer anderen Quelle.

Zuordnungen für den Vergleich (geschlossene Liste, füge keine hinzu):
- Penicilline: Penicillin, Amoxicillin, Ampicillin, Flucloxacillin;
- Sulfonamide: Sulfonamide, Cotrimoxazol, Sulfamethoxazol;
- Antikoagulanzien: Marcumar, Phenprocoumon, Apixaban, Rivaroxaban, Dabigatran, Heparin;
- Entzündungshemmer (NSAR): Ibuprofen, Diclofenac, Naproxen, Ketoprofen.

Zulässige Widersprüche: ein Medikament des Briefs aus derselben Familie wie eine bekannte Allergie; ein zweites Antikoagulans, obwohl die Person bereits eines einnimmt, ohne dass das Absetzen des ersten erwähnt wird; ein NSAR bei einer Person, deren Fakten eine Niereninsuffizienz oder « AINS contre-indiqués » (NSAR kontraindiziert) angeben. Widerspricht der Brief keinem Fakt, melde nichts. Beurteile nicht die Entscheidung der Ärztin bzw. des Arztes: Du meldest, eine Pflegekraft entscheidet.

## FORMAT DE SORTIE
Antworte mit EINEM EINZIGEN gültigen JSON-Objekt, ohne Text davor oder danach und ohne Codeblock, mit genau diesen Schlüsseln:
- "contradictions": Liste, leer wenn es keine gibt, von Objekten mit "type" ("allergie", "anticoagulation_double", "insuffisance_renale" oder "autre"), "gravite" ("haute" oder "moyenne"), "description" (ein Satz), "element_lettre" (der betroffene Text des Briefs), "element_source" (der Text des Fakts, der ihm widerspricht) und "sources" (Liste der Quellen der beiden Fakten, so wie sie in den Fakten in eckigen Klammern stehen);
- "aucune_contradiction": true genau dann, wenn die Liste "contradictions" leer ist; false, sobald sie mindestens einen Widerspruch enthält.
Schreibe die Schlüssel exakt wie oben, ohne Akzente, und fülle die sechs Schlüssel jedes Widerspruchs aus. Schreibe die Texte der Felder "description", "element_lettre" und "element_source" auf Deutsch (Zitate aus den Fakten unverändert).
