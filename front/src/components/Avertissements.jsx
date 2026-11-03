import { useState } from 'react';
import { t } from '../i18n';

const MAX_AVERTISSEMENTS = 6;

// Les contrôles automatiques signalent ce qui n'est pas dans les sources ; ils ne corrigent rien.
export default function Avertissements({ liste }) {
  const [toutVoir, setToutVoir] = useState(false);
  if (!liste?.length) return null;
  const vus = toutVoir ? liste : liste.slice(0, MAX_AVERTISSEMENTS);
  const caches = liste.length - MAX_AVERTISSEMENTS;
  return (
    <aside className="avertissements" aria-label={t('avertissements.titre')}>
      <h3>{t('avertissements.titre')}</h3>
      <p className="astuce">{t('avertissements.intro')}</p>
      <ul>
        {vus.map((a, i) => {
          const cle = `avertissements.types.${a.type}`;
          const libelle = t(cle) === cle ? a.type : t(cle);
          return (
            <li key={`${a.type}-${i}`}>
              <strong>{libelle}</strong>
              {a.detail && <span className="detail"> – {a.detail}</span>}
            </li>
          );
        })}
      </ul>
      {caches > 0 && (
        <button type="button" className="lien-bouton" aria-expanded={toutVoir} onClick={() => setToutVoir(!toutVoir)}>
          {toutVoir ? t('avertissements.masquer') : t('avertissements.voirAutres', { n: caches })}
        </button>
      )}
    </aside>
  );
}
