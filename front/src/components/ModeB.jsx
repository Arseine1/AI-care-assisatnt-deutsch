import { useState } from 'react';
import { t } from '../i18n';
import { trouverResident } from './SelecteurResident.jsx';

export const LIMITE_CONSIGNE = 300;
const EXEMPLES = ['nuit', 'medecin', 'transmission', 'hydratation'];

export default function ModeB({ chambre, onConsigne, enCours }) {
  const [consigne, setConsigne] = useState('');

  const restant = LIMITE_CONSIGNE - consigne.length;
  const pret = chambre !== '' && consigne.trim() !== '' && !enCours;

  function choisirExemple(cle) {
    setConsigne(t(`modeB.exemples.${cle}`).slice(0, LIMITE_CONSIGNE));
  }

  function envoyer(e) {
    e.preventDefault();
    if (!pret) return;
    onConsigne({
      mode: 'b',
      consigne: consigne.trim(),
      chambre,
      resident: trouverResident(chambre),
    });
  }

  return (
    <form className="mode-b" onSubmit={envoyer}>
      <label className="champ">
        <span className="champ-label">{t('modeB.consigne')}</span>
        <textarea
          rows={5}
          maxLength={LIMITE_CONSIGNE}
          value={consigne}
          onChange={(e) => setConsigne(e.target.value)}
          placeholder={t('modeB.placeholder')}
          aria-describedby="aide-consigne compteur-consigne"
        />
      </label>

      <div className="ligne-compteur">
        <p id="aide-consigne" className="astuce">{t('modeB.aide')}</p>
        <p
          id="compteur-consigne"
          className={restant <= 0 ? 'compteur limite' : restant <= 30 ? 'compteur proche' : 'compteur'}
          aria-live="polite"
        >
          {t('modeB.compteur', { n: consigne.length, max: LIMITE_CONSIGNE })}
        </p>
      </div>

      <div className="exemples">
        <p className="champ-label">{t('modeB.exemplesTitre')}</p>
        <div className="puces">
          {EXEMPLES.map((cle) => (
            <button key={cle} type="button" className="puce" onClick={() => choisirExemple(cle)}>
              {t(`modeB.exemples.${cle}`)}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className="bouton-principal" disabled={!pret}>
        {t('modeB.envoyer')}
      </button>
      {!chambre && <p className="astuce">{t('modeB.choisirResident')}</p>}
      <p className="astuce controle">{t('modeB.controle')}</p>
    </form>
  );
}
