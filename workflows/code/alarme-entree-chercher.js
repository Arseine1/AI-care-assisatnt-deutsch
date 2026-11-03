// Sensoralarm – Eingang von « Suchen »: der Bewohner des Alarms und der FESTE Prompt (contexte_alarme).
return [{ json: { patient_id: $('Alarm erstellen').first().json.patient_id, prompt_id: 'contexte_alarme' } }];
