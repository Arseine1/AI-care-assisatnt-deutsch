import { useState } from 'react';
import { t } from '../i18n';
import Avertissements from './Avertissements.jsx';
import PhrasesRetirees from './PhrasesRetirees.jsx';
import AnalyseComplementaire from './AnalyseComplementaire.jsx';

function heure() {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function ApresValidation({ info }) {
  if (!info) return null;
  if (info.erreur) return <p className="erreur" role="alert">{t('apresValidation.erreur')}</p>;
  const { rag, transmission, lettre } = info;
  return (
    <ul className="apres-validation">
      {rag && <li>{t('apresValidation.rag', { n: rag.ajoutes })}</li>}
      {lettre && <li className={lettre.ajoutee ? '' : 'alerte-texte'}>{lettre.ajoutee ? t('apresValidation.lettreAjoutee') : t('apresValidation.lettreNonAjoutee', { motif: lettre.motif })}</li>}
      {transmission && (
        <li className={transmission.statut === 'envoye' ? '' : 'alerte-texte'}>
          {transmission.statut === 'envoye'
            ? t('apresValidation.transmis', { destinataire: transmission.destinataire })
            : t('apresValidation.transmissionEchec')}
        </li>
      )}
    </ul>
  );
}

// Antwort des KI-Assistenten: bearbeitbarer Text, Quellen in eckigen Klammern, Bestätigung.
// `key` auf Elternseite: Eine neue Antwort setzt die Komponente zurück.
export default function Reponse({ reponse, contexte, onValider, onAlertes }) {
  const [texte, setTexte] = useState(reponse.texte);
  const [valide, setValide] = useState(null); // Uhrzeit der Bestätigung oder null
  const [erreur, setErreur] = useState(false);
  const [suite, setSuite] = useState(null); // Aufnahme ins RAG und Weitergabe, nach einem Übergabebericht

  const modifiee = texte !== reponse.texte;
  const validable = reponse.brouillon_id !== null && reponse.brouillon_id !== undefined; // ohne Entwurf gibt es nichts zu speichern

  function modifier(e) {
    setTexte(e.target.value);
    setValide(null); // jede Änderung hebt die vorherige Bestätigung auf
  }

  async function valider() {
    setErreur(false);
    try {
      const r = await onValider?.({ texte, sources: reponse.sources, modifiee });
      setSuite(r?.apres_validation ?? null);
      setValide(heure());
    } catch {
      setErreur(true); // der eingegebene Text bleibt erhalten
    }
  }

  return (
    <div className="reponse">
      <p className="contexte-demande">{contexte}</p>

      <label className="champ">
        <span className="champ-label">
          {t('reponse.texteLabel')}
          {modifiee && <span className="etat-modifie"> {t('reponse.modifiee')}</span>}
        </span>
        <textarea rows={8} value={texte} onChange={modifier} />
      </label>

      <div className="sources">
        <span className="champ-label">{t('reponse.sources')}</span>
        <ul className="liste-sources">
          {reponse.sources.map((s) => (
            <li key={s} className="source">[{s}]</li>
          ))}
        </ul>
      </div>

      <Avertissements liste={reponse.avertissements} />
      <PhrasesRetirees liste={reponse.retirees} />
      <AnalyseComplementaire analyse={reponse.analyse} onAlertes={onAlertes} />

      <p className="astuce">{t('reponse.relire')}</p>

      {validable ? (
        <button type="button" className="bouton-principal" onClick={valider} disabled={texte.trim() === ''}>
          {t('reponse.valider')}
        </button>
      ) : (
        <p className="astuce">{t('reponse.rienAValider')}</p>
      )}

      {erreur && (
        <p className="erreur" role="alert">{t('reponse.erreurEnregistrement')}</p>
      )}

      {valide && (
        <p className="confirmation" role="status">
          {t('reponse.confirmation', { heure: valide })}
        </p>
      )}
      {valide && <ApresValidation info={suite} />}
    </div>
  );
}
