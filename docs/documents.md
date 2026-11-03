# Dokumente automatisch (Arztbriefe, Neuigkeiten der ePA)

Ein Brief trifft im KIM-Postfach ein (simuliert durch Mailpit): n8n liest ihn, extrahiert seinen Text (OCR, wenn es ein Scan ist), ordnet ihn einer Bewohnerin bzw. einem Bewohner zu, wendet die Sicherheitsregeln an und legt auf der Seite **Documents** eine Warnung an. Den Intelligenzquellen wird nichts hinzugefügt, solange keine Pflegekraft validiert hat.

## Auslösung

| Mechanismus | Aufgabe |
|---|---|
| **Benachrichtigung von Mailpit** (Webhook `courrier-recu`, Workflow `83`) | verarbeitet einen Brief sofort nach Eintreffen (27 bis 33 s gemessen) |
| **Nachholen alle 2 Minuten** (Workflow `86`) | verarbeitet jeden noch nicht verarbeiteten Brief: verlorene Benachrichtigung, n8n beim Eintreffen des Briefs angehalten, **Schub** |
| **Sperre pro Brief** (`soins.courriers_traites`) | ein seit weniger als 15 Minuten übernommener Brief wird nicht erneut aufgegriffen: nie zwei Verarbeitungen gleichzeitig |

**Warum kein « Email Trigger (IMAP) »**: Mailpit hat keinen IMAP-Server (nur SMTP und POP3). Es benachrichtigt n8n per Webhook (`MP_WEBHOOK_URL`); n8n liest die Nachricht dann über die API von Mailpit erneut und **verwendet nur ihre Kennung**, niemals den Inhalt der Benachrichtigung. Mit einem echten KIM-Postfach genügte es, den Knoten « Webhook » des Workflows `83` durch einen « Email Trigger (IMAP) » zu ersetzen: Der Rest ändert sich nicht.

**Gemessene Falle**: Mailpit sendet nur **eine Benachrichtigung pro Sekunde** und verwirft die folgenden (5 Briefe auf einmal = 1 Benachrichtigung). Der Einstellwert `MP_WEBHOOK_LIMIT` darf nicht angetastet werden: Bei 50 gehen sogar im Abstand von 6 s gesendete Nachrichten verloren. Schübe deckt das Nachholen ab.

## Die Verarbeitung eines Briefs (Unter-Workflow `85`)

1. **Sperre**, dann Lesen der Nachricht in Mailpit: Nur PDF-Anhänge zählen (eine Übermittlungsnachricht hat keine: nichts geschieht).
2. **Text des PDF** durch den OCR-Dienst (OCRmyPDF: der Text eines PDF, OCR bei einem Scan; 2 bis 3 Minuten für einen Scan auf diesem Rechner).
3. **Identifizierung durch den Code**: Name **und** Geburtsdatum des Briefs müssen genau EINER Person entsprechen (die beiden « Heinz Müller » unterscheiden sich nur durch das Datum). Sonst bleibt der Brief ohne Bewohner: « Schreiben nicht zugeordnet » (Motiv `identite_inconnue` bzw. `identite_ambigue`). **Es wird nie erraten**, und die Identifizierung hängt nicht vom Sprachmodell ab.
4. **Indexierung** in der Collection `a_verifier` (der Inhalt eines Briefs wird vor der Prüfung nicht als verlässlich dargestellt).
5. **Sicherheitsregeln** (Allergie, doppelte Antikoagulation, NSAR bei Niereninsuffizienz) über den Einstiegspunkt « Dokument prüfen » (`aicare-verifier`): Antwort in wenigen Sekunden, die Analyse der KI folgt als Hintergrundaufgabe, wenn die Einstellung aktiviert ist.
6. **Warnung** (nur eine pro Brief) auf der Seite Documents:

| Schweregrad | Fall |
|---|---|
| **rot** | von den Regeln erkannter Widerspruch |
| **Achtung** | nicht identifizierter Brief oder automatische Prüfung unmöglich |
| **Info** | kein Widerspruch: Der Brief ist noch zu validieren |

## Validierung und Aufnahme ins RAG (Workflow `84`)

In « Dokument prüfen » (oder über die Schaltfläche « Prüfung öffnen » einer Warnung) liest die Pflegekraft den Bericht gegen und validiert ihn. **Nur die Validierung eines Prüfberichts** kann den Brief ins RAG bringen, und nur, wenn die Regeln darin **keinen Widerspruch** gefunden haben:

- ohne Widerspruch: Der Brief wird der Collection `patients` hinzugefügt (Typ `lettre_validee`, Quelle « KIM (Arztbrief) ») und ist nicht mehr in `a_verifier`;
- mit Widerspruch: Die Validierung des Berichts wird gespeichert, aber der Brief **bleibt zu prüfen**, solange die Ärztin bzw. der Arzt den Punkt nicht geklärt hat.

Der Text stammt aus der Datenbank (Collection `a_verifier`), nicht aus der Anfrage; die Person des Briefs muss die der Validierung sein; die Entscheidung wird im Audit-Journal protokolliert (`lettre_validee` oder `lettre_non_ajoutee`).

## Neuigkeiten der ePA

Am Ende des ePA-Konnektors (Workflow `40`, 4-mal täglich geplant) erhält eine Person, deren ePA **bereits** importiert war und bei der gerade neuer oder geänderter Inhalt indexiert wurde, eine Informationswarnung auf der Seite Documents. Der erste Import einer Person meldet nichts. Geprüft an der echten Abfrage, in einer abgebrochenen Transaktion (die ePA-Mocks, zur Speicherersparnis angehalten, wurden für diesen Versuch nicht neu gestartet).

## Versuche

```bash
node tests/courriers.test.mjs    # offline: Identifizierung, Warnungen, Wege, Validierung, Nachholen, Sperre
node tests/courrier-live.mjs     # real: echte PDFs an Mailpit gesendet (darunter ein Scan), Validierungen, ePA; 8 bis 12 Minuten
```
