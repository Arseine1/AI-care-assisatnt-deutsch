-- FIKTIVE Pflegesoftware (Demonstrationsdaten).
-- Eigenes Schema „soins“, um sich nicht mit den internen Tabellen von n8n zu vermischen.
-- Diese Datei löscht nichts: Sie kann risikolos wiederholt ausgeführt werden.

-- In den Notizen angezeigte Uhrzeiten („Sturz um 02h40“): Ortszeit des Pflegeheims, nicht UTC.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Europe/Berlin');
END $$;

CREATE SCHEMA IF NOT EXISTS soins;

CREATE TABLE IF NOT EXISTS soins.residents (
  patient_id      text PRIMARY KEY,
  civilite        text NOT NULL,
  prenom          text NOT NULL,
  nom             text NOT NULL,
  date_naissance  date NOT NULL,
  sexe            text NOT NULL CHECK (sexe IN ('M', 'F')),
  chambre         text NOT NULL,
  etage           int  NOT NULL,
  date_admission  date NOT NULL,
  diagnostics     text[] NOT NULL DEFAULT '{}',
  allergies       text[] NOT NULL DEFAULT '{}',
  regime          text,
  risques         text[] NOT NULL DEFAULT '{}'
);

-- Eine einzige patient_id für alle Systeme: Pflegesoftware, FHIR, KVNR (ePA), Sensoren, Zimmer.
CREATE TABLE IF NOT EXISTS soins.correspondance (
  patient_id  text NOT NULL REFERENCES soins.residents(patient_id) ON DELETE CASCADE,
  systeme     text NOT NULL CHECK (systeme IN ('logiciel_soins', 'fhir', 'epa_kvnr', 'capteur', 'chambre')),
  identifiant text NOT NULL,
  PRIMARY KEY (systeme, identifiant)
);
CREATE INDEX IF NOT EXISTS correspondance_patient ON soins.correspondance (patient_id);

-- Identitätsauflösung: Namensvettern (zwei „Heinz Müller“) lassen sich nur über das Geburtsdatum unterscheiden.
CREATE UNIQUE INDEX IF NOT EXISTS residents_identite ON soins.residents (lower(nom), lower(prenom), date_naissance);

-- patient_id aus einer Kennung eines Systems (z. B. 'epa_kvnr', 'Z000000012'), NULL wenn unbekannt.
CREATE OR REPLACE FUNCTION soins.resoudre_patient(p_systeme text, p_identifiant text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT patient_id FROM soins.correspondance WHERE systeme = p_systeme AND identifiant = p_identifiant
$$;

-- patient_id aus Name und Geburtsdatum (Arztbriefe): 0 Zeilen, wenn unbekannt,
-- 2 oder mehr Zeilen, wenn mehrdeutig (als „zu prüfen“ behandeln, niemals raten).
CREATE OR REPLACE FUNCTION soins.trouver_par_identite(p_nom text, p_naissance date)
RETURNS SETOF text LANGUAGE sql STABLE AS $$
  SELECT patient_id FROM soins.residents WHERE lower(nom) = lower(p_nom) AND date_naissance = p_naissance
$$;

CREATE TABLE IF NOT EXISTS soins.notes_soins (
  id          bigserial PRIMARY KEY,
  patient_id  text NOT NULL REFERENCES soins.residents(patient_id) ON DELETE CASCADE,
  horodatage  timestamptz NOT NULL,
  auteur      text NOT NULL,
  categorie   text NOT NULL,
  texte       text NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_patient_date ON soins.notes_soins (patient_id, horodatage DESC);

CREATE TABLE IF NOT EXISTS soins.plan_medication (
  id          bigserial PRIMARY KEY,
  patient_id  text NOT NULL REFERENCES soins.residents(patient_id) ON DELETE CASCADE,
  medicament  text NOT NULL,
  dosage      text NOT NULL,
  schema_prise text NOT NULL,
  indication  text,
  remarque    text,
  actif       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS soins.signes_vitaux (
  id          bigserial PRIMARY KEY,
  patient_id  text NOT NULL REFERENCES soins.residents(patient_id) ON DELETE CASCADE,
  horodatage  timestamptz NOT NULL,
  type        text NOT NULL,
  valeur      text NOT NULL,
  unite       text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS vitaux_patient_date ON soins.signes_vitaux (patient_id, horodatage DESC);

-- Flache Sicht auf die Zuordnung: eine patient_id, alle ihre Kennungen.
CREATE OR REPLACE VIEW soins.v_correspondance AS
SELECT r.patient_id, r.civilite, r.prenom, r.nom, r.date_naissance, r.chambre, r.etage,
       max(c.identifiant) FILTER (WHERE c.systeme = 'fhir')     AS fhir_id,
       max(c.identifiant) FILTER (WHERE c.systeme = 'epa_kvnr') AS kvnr,
       max(c.identifiant) FILTER (WHERE c.systeme = 'capteur')  AS capteur
FROM soins.residents r
JOIN soins.correspondance c USING (patient_id)
GROUP BY r.patient_id, r.civilite, r.prenom, r.nom, r.date_naissance, r.chambre, r.etage;

-- Protokoll der Importe ins RAG (Tag 2, Schritt 5): Der SHA-256-Fingerabdruck verhindert Duplikate.
-- Kein Fremdschlüssel: Ein erneutes Laden der Testdaten darf den Verlauf nicht löschen.
CREATE TABLE IF NOT EXISTS soins.journal_imports (
  id          bigserial PRIMARY KEY,
  source      text NOT NULL,
  reference   text,
  patient_id  text,
  empreinte   text NOT NULL,
  statut      text NOT NULL DEFAULT 'importe',
  detail      text,
  importe_le  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, empreinte)
);

-- Entwürfe: Rohantwort der KI, VOR jeder Bestätigung (Tag 3). Die Schaltfläche „Bestätigen & Speichern“
-- darf nur den Text eines vorhandenen Entwurfs speichern, niemals einen Text, der von anderswo kommt.
CREATE TABLE IF NOT EXISTS soins.brouillons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  patient_id      text NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('a', 'b')),
  action          text,
  consigne        text,
  prompt_id       text NOT NULL,
  prompt_version  text NOT NULL,
  modele          text,
  texte_ia        text NOT NULL,
  faits           jsonb NOT NULL DEFAULT '[]',
  avertissements  jsonb NOT NULL DEFAULT '[]',
  statut          text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'valide', 'abandonne'))
);
CREATE INDEX IF NOT EXISTS brouillons_patient ON soins.brouillons (patient_id, cree_le DESC);

-- Vom Filter gegen Erfundenes ENTFERNTE Sätze des Modells (nicht durch ihre Tatsache gestützt): für die Revision aufbewahrt.
ALTER TABLE soins.brouillons ADD COLUMN IF NOT EXISTS retirees jsonb NOT NULL DEFAULT '[]';

-- Lange Aufgaben, die von der Oberfläche gestartet werden (z. B. Übergabebericht für ein ganzes Stockwerk: eine Erzeugung pro Bewohner,
-- jeweils mehrere Minuten): Die Oberfläche erhält sofort eine Kennung und fragt dann den Fortschritt ab.
CREATE TABLE IF NOT EXISTS soins.taches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cree_le      timestamptz NOT NULL DEFAULT now(),
  type         text NOT NULL,
  parametres   jsonb NOT NULL DEFAULT '{}',
  statut       text NOT NULL DEFAULT 'en_cours',
  total        integer NOT NULL DEFAULT 0,
  fait         integer NOT NULL DEFAULT 0,
  resultat     jsonb NOT NULL DEFAULT '[]',
  termine_le   timestamptz
);

-- Zuverlässige Aufgaben (Tag 4, Schritt 4): Bei jedem Schritt wird ein Herzschlag (Heartbeat) geschrieben; eine Aufgabe „en_cours“, deren
-- n8n angehalten wurde oder die zu lange keinen Herzschlag hatte, wird „interrompue“; die Pflegekraft kann sie auch abbrechen.
ALTER TABLE soins.taches ADD COLUMN IF NOT EXISTS heartbeat timestamptz NOT NULL DEFAULT now();
ALTER TABLE soins.taches DROP CONSTRAINT IF EXISTS taches_statut_check;
ALTER TABLE soins.taches ADD CONSTRAINT taches_statut_check CHECK (statut IN ('en_cours', 'termine', 'termine_avec_erreurs', 'interrompue', 'annulee'));
-- Weitergaben an das nächste Team, NACH der Bestätigung eines Übergabeberichts durch eine Pflegekraft.
CREATE TABLE IF NOT EXISTS soins.transmissions (
  id              bigserial PRIMARY KEY,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  portee          text NOT NULL CHECK (portee IN ('resident', 'etage')),
  etage           integer,
  patient_ids     text[] NOT NULL DEFAULT '{}',
  validation_ids  bigint[] NOT NULL DEFAULT '{}',
  destinataire    text NOT NULL,
  canal           text NOT NULL,
  sujet           text NOT NULL,
  statut          text NOT NULL,
  detail          jsonb NOT NULL DEFAULT '{}'
);

-- Prüfprotokoll der KI: jede Erzeugung, Ablehnung einer Anweisung, Bestätigung oder Weitergabe.
CREATE TABLE IF NOT EXISTS soins.journal_ia (
  id              bigserial PRIMARY KEY,
  horodatage      timestamptz NOT NULL DEFAULT now(),
  evenement       text NOT NULL,
  patient_id      text,
  mode            text,
  action          text,
  prompt_id       text,
  prompt_version  text,
  modele          text,
  duree_ms        integer,
  details         jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS journal_ia_date ON soins.journal_ia (horodatage DESC);

-- Von den Pflegekräften bestätigte Antworten (Schaltfläche „Bestätigen & Speichern“). Kein Fremdschlüssel, aus demselben Grund.
CREATE TABLE IF NOT EXISTS soins.validations (
  id          bigserial PRIMARY KEY,
  patient_id  text NOT NULL,
  mode        text NOT NULL CHECK (mode IN ('a', 'b')),
  action      text,
  consigne    text,
  texte       text NOT NULL,
  sources     jsonb NOT NULL DEFAULT '[]',
  modifiee    boolean NOT NULL DEFAULT false,
  valide_par  text,
  valide_le   timestamptz NOT NULL DEFAULT now()
);
-- Verweis auf den ursprünglichen Entwurf; ein Entwurf kann nur einmal bestätigt werden.
ALTER TABLE soins.validations ADD COLUMN IF NOT EXISTS brouillon_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS validations_brouillon ON soins.validations (brouillon_id);

-- Ohne Codeänderung anpassbare Einstellungen (Tag 4): „verification_ia“ = ergänzende Analyse der KI für „Dokument prüfen“.
CREATE TABLE IF NOT EXISTS soins.reglages (
  cle         text PRIMARY KEY,
  valeur      jsonb NOT NULL,
  modifie_le  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO soins.reglages (cle, valeur) VALUES ('verification_ia', 'true'::jsonb) ON CONFLICT (cle) DO NOTHING;

-- Sensoralarme (Tag 4, Schritt 5). Die MQTT-Nachricht wird nie gespeichert: Nur das Thema capteurs/chambre{n}/{type} zählt.
-- „faits“ = CODIERTE Fakten aus der Pflegesoftware (Bewohner, Risiken, Allergien, Risikomedikation), sofort angezeigt;
-- „contexte“ = Text des KI-Assistenten, ergänzt, sobald er bereit ist: {statut: aucun | differe | en_cours | pret | indisponible, texte, …}.
CREATE TABLE IF NOT EXISTS soins.alarmes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recue_le      timestamptz NOT NULL DEFAULT now(),
  topic         text NOT NULL,
  chambre       text NOT NULL,
  type          text NOT NULL,
  libelle       text NOT NULL,
  patient_id    text,
  faits         jsonb NOT NULL DEFAULT '{}',
  contexte      jsonb NOT NULL DEFAULT '{"statut":"aucun"}',
  statut        text NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'acquittee')),
  acquittee_le  timestamptz
);
CREATE INDEX IF NOT EXISTS alarmes_recue ON soins.alarmes (recue_le DESC);
-- „document“: eingegangener Brief (Widerspruch, nicht zugeordneter Brief, nichts zu melden) oder Neuigkeit aus der ePA; faits->>'gravite' = rouge | attention | info.
ALTER TABLE soins.alarmes DROP CONSTRAINT IF EXISTS alarmes_type_check;
ALTER TABLE soins.alarmes ADD CONSTRAINT alarmes_type_check CHECK (type IN ('chute', 'sortie_lit', 'appel', 'document'));
-- eine Briefmeldung wird pro Brief nur einmal angelegt (das Thema enthält die Referenz des Briefs)
CREATE UNIQUE INDEX IF NOT EXISTS alarmes_document_unique ON soins.alarmes (topic) WHERE type = 'document';

-- Briefe (Mailpit-Nachrichten), die vom Workflow „Brief eingegangen“ bereits verarbeitet wurden: Der geplante Nachlauf verarbeitet nur die übrigen
-- (verlorene Benachrichtigung, n8n war beim Eingang angehalten). Die Kennung einer Mailpit-Nachricht überlebt ihre Neuerstellung nicht: Das ist gewollt.
CREATE TABLE IF NOT EXISTS soins.courriers_traites (
  message_id  text PRIMARY KEY,
  traite_le   timestamptz NOT NULL DEFAULT now()
);
-- Sperre: Ein Brief im Zustand „en_cours“ seit weniger als 15 Minuten wird nicht erneut aufgegriffen (Benachrichtigung und Nachlauf verarbeiten ihn nicht doppelt)
ALTER TABLE soins.courriers_traites ADD COLUMN IF NOT EXISTS etat text NOT NULL DEFAULT 'traite';
ALTER TABLE soins.courriers_traites ADD COLUMN IF NOT EXISTS debut timestamptz NOT NULL DEFAULT now();

-- Pflegekräfte (fiktive Demokonten): Kennung + PIN-Code. Die PIN wird NIE im Klartext gespeichert: scrypt mit einem eigenen Salt pro Pflegekraft.
CREATE TABLE IF NOT EXISTS soins.soignants (
  identifiant  text PRIMARY KEY CHECK (identifiant ~ '^[a-z0-9._-]{2,40}$'),
  nom          text NOT NULL,
  pin_hash     text NOT NULL,
  actif        boolean NOT NULL DEFAULT true,
  cree_le      timestamptz NOT NULL DEFAULT now()
);
-- Sitzungen: Das Token wird der Pflegekraft nur einmal mitgeteilt; hier wird nur sein SHA-256-Fingerabdruck aufbewahrt. Dauer: 12 Stunden.
CREATE TABLE IF NOT EXISTS soins.sessions (
  jeton_hash   text PRIMARY KEY,
  identifiant  text NOT NULL REFERENCES soins.soignants (identifiant) ON DELETE CASCADE,
  cree_le      timestamptz NOT NULL DEFAULT now(),
  expire_le    timestamptz NOT NULL DEFAULT now() + interval '12 hours'
);
CREATE INDEX IF NOT EXISTS sessions_expire ON soins.sessions (expire_le);
-- Fehlgeschlagene Anmeldungen (Sperre: 5 Fehlversuche in 5 Minuten für dieselbe Kennung). Es wird keine PIN aufbewahrt.
CREATE TABLE IF NOT EXISTS soins.connexions_echecs (
  id           bigserial PRIMARY KEY,
  identifiant  text NOT NULL,
  le           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connexions_echecs_recents ON soins.connexions_echecs (identifiant, le DESC);
-- Wer bestätigt hat: die Kennung des Kontos, aus der SITZUNG entnommen (niemals aus der Anfrage), zusätzlich zum angezeigten Namen.
ALTER TABLE soins.validations ADD COLUMN IF NOT EXISTS soignant_id text;

-- Rentenbeiträge pflegender Angehöriger (Seite „Rentenbeiträge“, FIKTIVE Daten).
-- sgb6_dossiers: ein Fragebogen (Text) und das letzte Ergebnis des Agenten. Das ist die einzige Tabelle mit Namen
--   (denen des Fragebogens, zum erneuten Lesen der Akte nötig); das Protokoll enthält NIEMALS welche.
-- sgb6_journal  : eine Zeile pro Schritt (Agent) oder pro Entscheidung (Mensch): Akte, Schritt, Werkzeug, kurzes Ergebnis, Dauer, wer.
--   Weder Name noch Versicherungsnummer: nur die Kennung der Akte sowie Zähler/Status.
-- sgb6_decisions : bestätigen, Überprüfung oder ablehnen, mit der Pflegekraft der SITZUNG (niemals der aus dem Anfragekörper).
CREATE TABLE IF NOT EXISTS soins.sgb6_dossiers (
  id              text PRIMARY KEY,
  questionnaire   text NOT NULL,
  aidant          text NOT NULL DEFAULT '',
  personne        text NOT NULL DEFAULT '',
  statut          text NOT NULL DEFAULT 'a_traiter' CHECK (statut IN ('a_traiter', 'pret_a_valider', 'exception', 'valide', 'refuse')),
  resultat        jsonb,
  revue           boolean NOT NULL DEFAULT false,
  recu_le         date NOT NULL DEFAULT current_date,
  mis_a_jour_le   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS soins.sgb6_journal (
  id           bigserial PRIMARY KEY,
  horodatage   timestamptz NOT NULL DEFAULT now(),
  dossier_id   text NOT NULL,
  tache_id     uuid,
  etape        text NOT NULL,
  outil        text NOT NULL,
  resultat     text NOT NULL,
  duree_ms     integer NOT NULL DEFAULT 0,
  choisi_par   text NOT NULL CHECK (choisi_par IN ('agent', 'humain')),
  soignant     text
);
CREATE INDEX IF NOT EXISTS sgb6_journal_dossier ON soins.sgb6_journal (dossier_id, id);
CREATE INDEX IF NOT EXISTS sgb6_journal_tache ON soins.sgb6_journal (tache_id, id);
CREATE TABLE IF NOT EXISTS soins.sgb6_decisions (
  id           bigserial PRIMARY KEY,
  dossier_id   text NOT NULL,
  decision     text NOT NULL CHECK (decision IN ('valider', 'revue', 'refuser')),
  motif        text,
  soignant     text NOT NULL,
  heure        timestamptz NOT NULL DEFAULT now(),
  CHECK (decision <> 'refuser' OR btrim(coalesce(motif, '')) <> '')
);
CREATE INDEX IF NOT EXISTS sgb6_decisions_dossier ON soins.sgb6_decisions (dossier_id, id);
-- Von einem Modell gesteuerter Agent (Beiträge): eine Protokollzeile pro RUNDE des Modells (gewähltes Werkzeug, angegebener Grund, von der Schutzprüfung akzeptiert oder abgelehnt).
-- Der Grund wird vom Modell geschrieben: Der Code entfernt Namen und Nummern, bevor er ihn speichert. choisi_par = 'modele' für diese Zeilen.
ALTER TABLE soins.sgb6_journal ADD COLUMN IF NOT EXISTS raison text;
ALTER TABLE soins.sgb6_journal ADD COLUMN IF NOT EXISTS accepte boolean;
ALTER TABLE soins.sgb6_journal DROP CONSTRAINT IF EXISTS sgb6_journal_choisi_par_check;
ALTER TABLE soins.sgb6_journal ADD CONSTRAINT sgb6_journal_choisi_par_check CHECK (choisi_par IN ('agent', 'modele', 'humain'));