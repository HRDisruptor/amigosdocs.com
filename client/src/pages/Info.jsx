import { useState } from 'react';
import { api } from '../api.js';
import { useApp, useLoad } from '../app.jsx';
import { Loading } from '../components.jsx';

export function Guides() {
  const { t, locale, country, doc } = useApp();
  const state = useLoad(() => api('/guides'));
  const [open, setOpen] = useState(null);
  return (
    <>
      <h1>{t('guides.title')}</h1>
      <p className="muted">{t('guides.intro')}</p>
      <Loading state={state}>
        {({ guides }) => {
          // Guides in the reader's language come first. Others are still shown.
          const sorted = [...guides].sort((a, b) => (a.language === locale ? 0 : 1) - (b.language === locale ? 0 : 1));
          if (sorted.length === 0) return <p className="muted">{t('guides.none')}</p>;
          return sorted.map((guide) => (
            <article key={guide.id} className="card" lang={guide.language}>
              <button className="guide-head" aria-expanded={open === guide.id} onClick={() => setOpen(open === guide.id ? null : guide.id)}>
                <strong>{guide.title}</strong>
                <span className="muted small-text">
                  {[guide.country && country(guide.country), guide.docType && doc(guide.docType)].filter(Boolean).join(' · ')}
                </span>
              </button>
              {open === guide.id && (
                <>
                  <p className="pre">{guide.body}</p>
                  {guide.sourceUrl && (
                    <p className="small-text">
                      {t('guides.source')}: <a href={guide.sourceUrl} target="_blank" rel="noopener noreferrer">{guide.sourceUrl}</a>
                    </p>
                  )}
                </>
              )}
            </article>
          ));
        }}
      </Loading>
    </>
  );
}

export function Safety() {
  const { t } = useApp();
  return (
    <article className="card prose">
      <h1>{t('safety.title')}</h1>
      <p>{t('safety.intro')}</p>
      <h2>{t('safety.everyone')}</h2>
      <ul>{[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`safety.rule${n}`)}</li>)}</ul>
      <h2>{t('safety.money')}</h2>
      <ul>{[1, 2, 3].map((n) => <li key={n}>{t(`safety.money${n}`)}</li>)}</ul>
      <h2>{t('safety.problem')}</h2>
      <p>{t('safety.problem_body')}</p>
      <p className="note warn">{t('safety.emergency')}</p>
      <p className="muted small-text">{t('safety.disclaimer')}</p>
    </article>
  );
}
