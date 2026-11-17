import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { AppProvider, useApp } from './app.jsx';
import { Layout } from './components.jsx';
import { Admin } from './pages/Admin.jsx';
import { Login, Signup } from './pages/Auth.jsx';
import { ChatList, Thread } from './pages/Chats.jsx';
import { Home } from './pages/Home.jsx';
import { Guides, Safety } from './pages/Info.jsx';
import { Landing } from './pages/Landing.jsx';
import { EditProfile, Person } from './pages/People.jsx';
import { Browse, NewRequest, RequestDetail } from './pages/Requests.jsx';
import { Settings } from './pages/Settings.jsx';
import './styles.css';

function Private({ children }) {
  const { user } = useApp();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function Shell() {
  const { user, t } = useApp();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  // Keep the unread badge on the Chats tab current.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const check = () =>
      api('/threads')
        .then(({ threads }) => {
          if (!cancelled) setUnread(threads.reduce((sum, thread) => sum + thread.unread + (thread.needsMyAnswer ? 1 : 0), 0));
        })
        .catch(() => {});
    check();
    const timer = setInterval(() => document.visibilityState === 'visible' && check(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, location.pathname]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const guard = (element) => <Private>{element}</Private>;
  return (
    <Layout unread={unread}>
      <Routes>
        <Route path="/" element={user ? <Home /> : <Landing />} />
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
        <Route path="/safety" element={<Safety />} />
        <Route path="/requests/new" element={guard(<NewRequest />)} />
        <Route path="/requests/:id" element={guard(<RequestDetail />)} />
        <Route path="/help" element={guard(<Browse />)} />
        <Route path="/chats" element={guard(<ChatList />)} />
        <Route path="/chats/:id" element={guard(<Thread />)} />
        <Route path="/guides" element={guard(<Guides />)} />
        <Route path="/profile" element={guard(<EditProfile />)} />
        <Route path="/people/:id" element={guard(<Person />)} />
        <Route path="/settings" element={guard(<Settings />)} />
        <Route path="/admin" element={guard(<Admin />)} />
        <Route path="*" element={<p className="center muted">{t('err.not_found')}</p>} />
      </Routes>
    </Layout>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
