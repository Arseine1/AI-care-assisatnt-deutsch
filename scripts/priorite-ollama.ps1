# Stellt die Priorität von Ollama ein, während es einen Text erzeugt (mehrere Minuten, alle Kerne ausgelastet).
#   .\scripts\priorite-ollama.ps1            Priorität UNTER normal: n8n und PostgreSQL behalten die Oberhand, ein Sensoralarm
#                                            wird schnell bearbeitet, die Erzeugung wird aber gebremst, sobald der Rechner etwas anderes tut
#   .\scripts\priorite-ollama.ps1 -Normale   normale Priorität (Standardeinstellung von Windows)
# Wirkt nur auf die aktuell laufenden Ollama-Prozesse: nach jedem Neustart von Ollama zu wiederholen. Keine Windows-Einstellung
# wird dauerhaft verändert.
param([switch]$Normale)
$classe = if ($Normale) { 'Normal' } else { 'BelowNormal' }
$n = 0
Get-Process | Where-Object { $_.ProcessName -like 'ollama*' } | ForEach-Object {
  try { $_.PriorityClass = $classe; $n++ } catch { Write-Warning "$($_.ProcessName) : $($_.Exception.Message)" }
}
Write-Output "$n Ollama-Prozess(e) mit Priorität $classe."