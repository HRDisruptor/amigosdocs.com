import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, post } from '../api.js';
import { useAction, useApp, useLoad } from '../app.jsx';
import { ErrorNote, Field, Loading, PersonLine, RequestTitle, SafetyReminder, StatusBadge, Steps } from '../components.jsx';

export function ChatList() {
  const { t } = useApp();
  const state = useLoad(() => api('/threads'));
  return (
    <>
      <h1>{t('chat.title')}</h1>
      <Loading state={state}>
        {({ threads }) => {
          if (threads.length === 0) return <p className="muted">{t('chat.none')}</p>;
          return threads.map((thread) => (
            <Link key={thread.id} to={`/chats/${thread.id}`} className={`card link-card ${thread.unread || thread.needsMyAnswer ? 'highlight' : ''}`}>
              <div className="row">
                <strong>{thread.other?.name || t('chat.former_member')}</strong>
                <span>
                  {thread.unread > 0 && <span className="badge danger">{thread.unread}</span>} <StatusBadge status={thread.status} />
                </span>
              </div>
              <div><RequestTitle request={thread.request} /></div>
              {thread.lastMessage && <div className="muted clip">{thread.lastMessage}</div>}
            </Link>
          ));
        }}
      </Loading>
    </>
  );
}

function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Files({ data, reload }) {
  const { t, meta, date } = useApp();
  const action = useAction();
  const input = useRef(null);

  const upload = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > meta.maxFileBytes) return action.setError({ code: 'file_too_large' });
    action.run(async () => {
      await api(`/threads/${data.thread.id}/files`, { method: 'POST', file });
      await reload();
    });
  };

  if (!data.thread.canShareFiles && data.files.length === 0) return null;
  return (
    <section className="card">
      <h2>{t('files.title')}</h2>
      <p className="muted small-text">{t('files.notice', { days: String(meta.fileRetentionDays) })}</p>
      {data.files.length > 0 && (
        <ul className="file-list">
          {data.files.map((file) => (
            <li key={file.id}>
              <a href={`/api/files/${file.id}`} download={file.filename}>{file.filename}</a>
              <span className="muted small-text"> · {fileSize(file.size)} · {t('files.expires', { date: date(file.expiresAt) })}</span>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={action.error} />
      {data.thread.canShareFiles && (
        <>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={upload} />
          <button className="btn" onClick={() => input.current.click()} disabled={action.busy}>
            {action.busy ? t('files.uploading') : t('files.share')}
          </button>
        </>
      )}
    </section>
  );
}

function ReviewForm({ data, reload }) {
  const { t } = useApp();
  const action = useAction();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const submit = (e) => {
    e.preventDefault();
    action.run(async () => {
      await post(`/requests/${data.request.id}/reviews`, { rating, comment });
      await reload();
    });
  };
  return (
    <form className="card highlight" onSubmit={submit}>
      <h2>{t('review.title', { name: data.other?.name || '' })}</h2>
      <fieldset className="field">
        <legend className="field-label">{t('review.rating')}</legend>
        <div className="rating-input">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={n <= rating ? 'on' : ''}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
              <span aria-hidden="true">★</span>
              <span className="sr-only">{n}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t('review.comment')}>
        <textarea rows={3} maxLength={600} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <ErrorNote error={action.error} />
      <button className="btn accent" disabled={action.busy}>{t('review.send')}</button>
    </form>
  );
}

function ReportForm({ threadId, onDone }) {
  const { t, meta } = useApp();
  const action = useAction();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    action.run(async () => {
      await post('/reports', { threadId, reason, details });
      setSent(true);
    });
  };
  if (sent) return <p className="note ok">{t('report.sent')} <button className="linklike" onClick={onDone}>{t('common.close')}</button></p>;
  return (
    <form className="card" onSubmit={submit}>
      <h2>{t('report.title')}</h2>
      <p className="muted">{t('report.intro')}</p>
      <Field label={t('report.reason')}>
        <select required value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="" disabled>{t('common.choose')}</option>
          {meta.reportReasons.map((code) => <option key={code} value={code}>{t(`report.${code}`)}</option>)}
        </select>
      </Field>
      <Field label={t('report.details')}>
        <textarea rows={3} maxLength={1500} value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
      <ErrorNote error={action.error} />
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onDone}>{t('common.cancel')}</button>
        <button className="btn danger-solid" disabled={action.busy}>{t('report.send')}</button>
      </div>
    </form>
  );
}

export function Thread() {
  const { id } = useParams();
  const { t, dateTime } = useApp();
  const state = useLoad(() => api(`/threads/${id}`), [id]);
  const action = useAction();
  const [draft, setDraft] = useState('');
  const [reporting, setReporting] = useState(false);
  const bottom = useRef(null);
  const { reload } = state;

  // Check for new messages every few seconds while the page is visible.
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === 'visible' && reload(), 5000);
    return () => clearInterval(timer);
  }, [reload]);

  const messageCount = state.data?.messages.length || 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [messageCount]);

  const act = (path, body, confirmKey) => {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    action.run(async () => {
      await post(path, body);
      await reload();
    });
  };
  const send = (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    action.run(async () => {
      await post(`/threads/${id}/messages`, { body });
      setDraft('');
      await reload();
    });
  };

  return (
    <Loading state={state}>
      {(data) => {
        const { thread, request, other, messages } = data;
        const isHelper = thread.role === 'helper';
        const working = thread.assigned && request.status === 'matched';
        return (
          <div className="thread">
            <section className="card">
              <div className="row">
                {other ? <PersonLine person={other} /> : <strong>{t('chat.former_member')}</strong>}
                <StatusBadge status={thread.assigned ? request.status : thread.status} />
              </div>
              <div>
                <Link to={`/requests/${request.id}`}><RequestTitle request={request} /></Link>
              </div>
              {isHelper && request.details && <p className="pre quote">{request.details}</p>}
              {isHelper && request.thanks && <p className="muted">{t('req.thanks')}: {request.thanks}</p>}

              {thread.status === 'pending' && (
                thread.canAnswer ? (
                  <div className="note info">
                    <p>{t(isHelper ? 'chat.invited' : 'chat.offered', { name: other?.name || '' })}</p>
                    <div className="actions">
                      <button className="btn ghost" disabled={action.busy} onClick={() => act(`/threads/${id}/decline`)}>{t('chat.decline')}</button>
                      <button className="btn accent" disabled={action.busy} onClick={() => act(`/threads/${id}/accept`)}>
                        {t(isHelper ? 'chat.accept_help' : 'chat.accept_offer')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="note info">{t('chat.waiting', { name: other?.name || '' })}</p>
                )
              )}

              {thread.assigned && <Steps step={request.step} />}
              {working && isHelper && (
                <div className="actions">
                  <button className="btn ghost danger" disabled={action.busy} onClick={() => act(`/requests/${request.id}/release`, {}, 'chat.release_confirm')}>
                    {t('chat.release')}
                  </button>
                  {request.step < 4 && (
                    <button className="btn accent" disabled={action.busy} onClick={() => act(`/requests/${request.id}/step`, { step: request.step + 1 })}>
                      {t('chat.mark_step', { step: t(`steps.${['details_confirmed', 'requested', 'obtained', 'sent'][request.step]}`) })}
                    </button>
                  )}
                </div>
              )}
              {working && isHelper && request.step === 4 && <p className="muted">{t('chat.waiting_receipt')}</p>}
              {working && !isHelper && (
                <div className="actions">
                  <button className="btn accent" disabled={action.busy} onClick={() => act(`/requests/${request.id}/complete`, {}, 'req.received_confirm')}>
                    {t('req.received')}
                  </button>
                </div>
              )}
            </section>

            {thread.canReview && <ReviewForm data={data} reload={reload} />}
            {thread.canWrite && <SafetyReminder />}

            <section className="messages" aria-live="polite">
              {messages.length === 0 && <p className="muted center">{t('chat.empty')}</p>}
              {messages.map((message) => (
                <div key={message.id} className={`bubble ${message.mine ? 'mine' : ''}`}>
                  <p className="pre">{message.body}</p>
                  <time dateTime={message.createdAt}>{dateTime(message.createdAt)}</time>
                </div>
              ))}
              <div ref={bottom} />
            </section>

            <ErrorNote error={action.error} />
            {thread.canWrite ? (
              <form className="composer" onSubmit={send}>
                <textarea
                  rows={2}
                  maxLength={2000}
                  placeholder={t('chat.placeholder')}
                  aria-label={t('chat.placeholder')}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(e)}
                />
                <button className="btn accent" disabled={action.busy || !draft.trim()}>{t('chat.send')}</button>
              </form>
            ) : (
              <p className="muted center">{t('chat.closed')}</p>
            )}

            <Files data={data} reload={reload} />

            {reporting
              ? <ReportForm threadId={thread.id} onDone={() => setReporting(false)} />
              : other && <button className="linklike danger" onClick={() => setReporting(true)}>{t('report.open')}</button>}
          </div>
        );
      }}
    </Loading>
  );
}
