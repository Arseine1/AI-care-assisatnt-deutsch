// Dienstbericht einer Etage – was an den Unter-Workflow « Etage komplett » geht: die Etage und die bereits erstellte Aufgabe.
const etage = $('Etage prüfen').first().json.etage;
const task_id = $('Aufgabe erstellen').first().json.id;
return [{ json: { etage, task_id } }];
