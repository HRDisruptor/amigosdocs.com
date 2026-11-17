import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp, useLoad } from '../app.jsx';
import { Loading, RequestTitle, StatusBadge, Steps, UrgencyBadge } from '../components.jsx';

export function Home() {
  const { user, t } = useApp();
  const state = useLoad(async () => {
    const [mine, threads] = await Promise.all([api('/requests/mine'), api('/threads')]);
    return { requests: mine.requests, threads: threads.threads };
  });
  const firstName = user.name.split(' ')[0];

  return (
    <>
      <h1>{t('home.hello', { name: firstName })}</h1>
      <div className="choice">
        <Link className="btn accent big" to="/requests/new">{t('home.need')}</Link>
        <Link className="btn big" to={user.isHelper ? '/help' : '/profile?helper=1'}>{t('home.can_help')}</Link>
      </div>

      {user.isHelper && user.verification !== 'verified' && (
        <p className="note info">
          {t(`home.verify_${user.verification}`)} <Link to="/profile">{t('home.verify_link')}</Link>
        </p>
      )}

      <Loading state={state}>
        {({ requests, threads }) => {
          const waiting = threads.filter((thread) => thread.needsMyAnswer);
          const helping = threads.filter((thread) => thread.role === 'helper' && thread.status === 'accepted' && thread.request.status === 'matched');
          const active = requests.filter((request) => ['open', 'matched'].includes(request.status));
          const past = requests.filter((request) => !['open', 'matched'].includes(request.status));
          return (
            <>
              {waiting.length > 0 && (
                <section>
                  <h2>{t('home.waiting')}</h2>
                  {waiting.map((thread) => (
                    <Link key={thread.id} to={`/chats/${thread.id}`} className="card link-card highlight">
                      <div><RequestTitle request={thread.request} /></div>
                      <div className="muted">
                        {t(thread.role === 'helper' ? 'home.invited_by' : 'home.offer_from', { name: thread.other?.name || '' })}
                      </div>
                    </Link>
                  ))}
                </section>
              )}

              <section>
                <h2>{t('home.my_requests')}</h2>
                {active.length === 0 && <p className="muted">{t('home.no_requests')}</p>}
                {active.map((request) => (
                  <Link key={request.id} to={`/requests/${request.id}`} className="card link-card">
                    <div className="row">
                      <div><RequestTitle request={request} /></div>
                      <span><UrgencyBadge urgency={request.urgency} /> <StatusBadge status={request.status} /></span>
                    </div>
                    {request.status === 'matched' && <Steps step={request.step} />}
                    {request.status === 'open' && request.pendingThreads > 0 && (
                      <div className="muted">{t('home.conversations', { count: String(request.pendingThreads) })}</div>
                    )}
                    {request.status === 'open' && request.pendingThreads === 0 && <div className="muted">{t('home.find_amigo')}</div>}
                  </Link>
                ))}
              </section>

              {helping.length > 0 && (
                <section>
                  <h2>{t('home.helping')}</h2>
                  {helping.map((thread) => (
                    <Link key={thread.id} to={`/chats/${thread.id}`} className="card link-card">
                      <div><RequestTitle request={thread.request} /></div>
                      <div className="muted">{t('home.for_person', { name: thread.other?.name || '' })}</div>
                      <Steps step={thread.request.step} />
                    </Link>
                  ))}
                </section>
              )}

              {past.length > 0 && (
                <section>
                  <h2>{t('home.past')}</h2>
                  {past.map((request) => (
                    <Link key={request.id} to={`/requests/${request.id}`} className="card link-card quiet">
                      <div className="row">
                        <div><RequestTitle request={request} /></div>
                        <StatusBadge status={request.status} />
                      </div>
                    </Link>
                  ))}
                </section>
              )}
            </>
          );
        }}
      </Loading>
    </>
  );
}
