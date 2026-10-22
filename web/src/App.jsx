import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api } from './api.js';
import Header from './components/Header.jsx';
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

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export default function App() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const location = useLocation();

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.get('/api/status'));
      setError(null);
    } catch {
      setError('Cannot reach the HomeFlix server. Is it running?');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error) return <div className="center-screen"><p>{error}</p><button className="btn" onClick={refresh}>Try again</button></div>;
  if (!status) return <div className="center-screen"><div className="spinner" /></div>;

  const ctx = { status, profile: status.profile, refresh };
  let body;
  if (!status.setupDone) body = <Setup />;
  else if (!status.loggedIn) body = <Login />;
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
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/admin" element={status.profile.isAdmin ? <Admin /> : <Navigate to="/" />} />
          <Route path="/admin/title/:id" element={status.profile.isAdmin ? <EditTitle /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </>
    );
  }
  return <AppContext.Provider value={ctx}>{body}</AppContext.Provider>;
}
