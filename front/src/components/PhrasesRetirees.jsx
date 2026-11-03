import { t } from '../i18n';

// Sätze des KI-Assistenten, die aus dem Text entfernt wurden, weil keine Tatsache sie stützt. Standardmäßig eingeklappt:
// Die Pflegekraft sieht alles, was ausgesondert wurde, aber nichts davon gelangt in den Bericht.
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
