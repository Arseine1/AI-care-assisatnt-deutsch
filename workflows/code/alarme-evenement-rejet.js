// Sensoralarm – unbekanntes MQTT-Topic: kein Alarm, eine Zeile im Prüfprotokoll (Topic bereinigt; der Inhalt der Nachricht wird nie gelesen).
return [{ json: { evenement: 'alarme_rejetee', mode: 'a', action: 'alarme_capteur', details: { topic: String($input.first().json.topic ?? '').slice(0, 80) } } }];
