import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { forgetServer, getBase, hello, isNativeApp, setMediaToken, setServer } from './connection.js';
import Connect from './pages/Connect.jsx';
import Header from './components/Header.jsx';
import AdminHeader from './components/AdminHeader.jsx';
import Setup from './pages/Setup.jsx';
import Login from './pages/Login.jsx';
import Profiles from './pages/Profiles.jsx';
import Home from './pages/Home.jsx';
import Title from './pages/Title.jsx';
import Watch from './pages/Watch.jsx';
import Search from './pages/Search.jsx';
import MyList from './pages/MyList.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import EditTitle from './pages/EditTitle.jsx';
import Fixer from './pages/Fixer.jsx';
import AdminUnlock from './pages/AdminUnlock.jsx';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

/**
 * Admin settings ask for the Admin password every time they're opened (and again after
 * 10 idle minutes). Unlocking also closes any profile that was being watched.
 */
function AdminArea() {
  const { status, refresh } = useApp();
  useEffect(() => {
    window.addEventListener('admin-locked', refresh);
    return () => window.removeEventListener('admin-locked', refresh);
  }, [refresh]);
  if (!status.adminUnlocked) return <AdminUnlock />;
  return (
    <>
      <AdminHeader />
      <Routes>
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/title/:id" element={<EditTitle />} />
        <Route path="/admin/fix" element={<Fixer />} />
        <Route path="/admin/fix/:id" element={<Fixer />} />
      </Routes>
    </>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  // 'finding' -> which server? 'connect' -> ask the person; 'ready' -> talking to a server.
  const [phase, setPhase] = useState('finding');
  const [problem, setProblem] = useState(null);
  const [changing, setChanging] = useState(false);
  const [server, setServerInfo] = useState(null);
  const location = useLocation();

  const refresh = useCallback(async () => {
    try {
      const s = await api.get('/api/status');
      setMediaToken(s.mediaToken);
      setStatus(s);
    } catch (err) {
      if (err.status) return; // the server answered; the page shows its own error
      setProblem(`Lost the connection to ${getBase() || 'the server'}. Is the computer running HomeFlix switched on?`);
      setPhase('connect');
    }
  }, []);

  // Use the server this device used last; in a browser, the server that served this page.
  const findServer = useCallback(async () => {
    setPhase('finding');
    const saved = getBase();
    const candidates = saved !== null ? [saved] : isNativeApp ? [] : [''];
    for (const c of candidates) {
      const info = await hello(c);
      if (info) {
        setServer(c);
        setServerInfo(info);
        setPhase('ready');
        return;
      }
    }
    if (saved !== null) setProblem(`Couldn't reach the HomeFlix server at ${saved || 'this address'}.`);
    setPhase('connect');
  }, []);

  useEffect(() => { findServer(); }, [findServer]);
  useEffect(() => { if (phase === 'ready') refresh(); }, [phase, refresh]);
  useEffect(() => {
    window.addEventListener('signed-out', refresh);
    return () => window.removeEventListener('signed-out', refresh);
  }, [refresh]);

  const connected = useCallback(async (base) => {
    setServer(base);
    setServerInfo(await hello(base));
    setProblem(null);
    setChanging(false);
    setStatus(null);
    setPhase('ready');
  }, []);

  const changeServer = useCallback(() => {
    forgetServer();
    setStatus(null);
    setProblem(null);
    setChanging(true);
    setPhase('connect');
  }, []);

  if (phase === 'finding') return <div className="center-screen"><div className="spinner" /></div>;
  if (phase === 'connect') return <Connect onConnected={connected} problem={problem} autoSearch={!changing} />;
  if (!status) return <div className="center-screen"><div className="spinner" /></div>;

  const ctx = { status, profile: status.profile, refresh, server, changeServer };
  let body;
  if (!status.setupDone) body = <Setup />;
  else if (!status.loggedIn) body = <Login />;
  else if (location.pathname.startsWith('/admin')) body = <AdminArea />;
  else if (!status.profile) body = <Profiles />;
  else {
    const watching = location.pathname.startsWith('/watch/');
    body = (
      <>
        {!watching && <Header />}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/title/:id" element={<Title />} />
          <Route path="/watch/:videoId" element={<Watch />} />
          <Route path="/search" element={<Search />} />
          <Route path="/mylist" element={<MyList />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </>
    );
  }
  return <AppContext.Provider value={ctx}>{body}</AppContext.Provider>;
}
