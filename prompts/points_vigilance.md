---
id: points_vigilance
version: 1.1.0
sortie: phrases
temperature: 0.1
heures: 24
requete: risque chute allergie anticoagulant hypoglycémie contre-indication surveillance consigne protocole
protocoles: true
---
## INSTRUCTION
Erstelle die Liste der Aufmerksamkeitspunkte für das übernehmende Team, ausschließlich anhand der Fakten: bekannte Risiken der Person, Allergien, zu überwachende Medikamente, Kontraindikationen, Vorfälle der letzten {periode_heures} Stunden und bereits vorgesehene Überwachungsmaßnahmen. Ordne sie nach ihrer Bedeutung für die Sicherheit: zuerst Allergien und lebensbedrohliche Risiken. Ein Punkt wird nur aufgenommen, wenn er sich auf einen Fakt stützt. Die Protokolle des Hauses (Quelle [Fichiers]) dienen nur dazu, an die Maßnahme zu erinnern, die sie für ein bei dieser Person bereits vorhandenes Risiko vorsehen.

## FORMAT DE SORTIE
Gib höchstens 6 Punkte aus, einen pro Satz, jeweils mit dem Fakt, der ihn begründet. Stützt sich kein Punkt auf einen Fakt, gib keinen Satz aus. Kein Einleitungssatz, kein Schluss, keine Behandlungsempfehlung.
