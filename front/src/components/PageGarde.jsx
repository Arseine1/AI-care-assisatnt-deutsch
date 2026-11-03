import { useState } from 'react';
import { t } from '../i18n';
import SelecteurResident from './SelecteurResident.jsx';
import ModeA from './ModeA.jsx';
import ModeB from './ModeB.jsx';

// Erster Prozess: Übergabebericht und Weitergabe. Eine einzige Seite, zwei Modi zur Auswahl:
//   Schnellaktionen (Modus A): Übergabebericht, ePA-Zusammenfassung, Aufmerksamkeitspunkte, Bericht für ein ganzes Stockwerk
//   Geführte Anweisung (Modus B): eine kontrollierte Frage zum Bewohner
// Der Bewohner wird nur einmal gewählt, oberhalb der beiden Modi.
export default function PageGarde({ onAction, onEtage, onConsigne, enCours }) {
  const [chambre, setChambre] = useState('');
  const [mode, setMode] = useState('a');
  return (
    <div className="page-garde">
      <div className="panneau-entete">
        <h2>{t('garde.titre')}</h2>
        <p className="panneau-aide">{t('garde.description')}</p>
      </div>
      <SelecteurResident valeur={chambre} onChange={setChambre} />

      <div className="sous-modes" role="tablist" aria-label={t('garde.modes')}>
        <button type="button" role="tab" aria-selected={mode === 'a'} className={mode === 'a' ? 'sous-onglet actif' : 'sous-onglet'} onClick={() => setMode('a')}>
          {t('garde.actionsTitre')}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'b'} className={mode === 'b' ? 'sous-onglet actif' : 'sous-onglet'} onClick={() => setMode('b')}>
          {t('garde.consigneTitre')}
        </button>
      </div>

      {mode === 'a' ? (
        <ModeA chambre={chambre} onAction={onAction} onEtage={onEtage} enCours={enCours} />
      ) : (
        <>
          <p className="panneau-aide">{t('modeB.description')}</p>
          <ModeB chambre={chambre} onConsigne={onConsigne} enCours={enCours} />
        </>
      )}
    </div>
  );
}