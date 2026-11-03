import { t } from '../i18n';

// Phrases de l'assistant IA retirées du texte parce qu'aucun fait ne les appuie. Repliées par défaut :
// le soignant voit tout ce qui a été écarté, mais rien de cela n'entre dans le rapport.
export default function PhrasesRetirees({ liste }) {
  if (!liste?.length) return null;
  return (
    <details className="retirees">
      <summary>{t('retirees.titre', { n: liste.length })}</summary>
      <p className="astuce">{t('retirees.intro')}</p>
      <ul>
        {liste.map((r, i) => (
          <li key={`${r.source_id}-${i}`}>
            <span className="phrase-retiree">{r.phrase}</span>
            <span className="detail"> – {r.motifs.join(', ')}{r.detail ? ` (${r.detail})` : ''}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
