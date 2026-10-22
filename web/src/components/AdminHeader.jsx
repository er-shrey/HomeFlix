import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

/** Top bar for Admin settings, which is used without picking a profile. */
export default function AdminHeader() {
  const { refresh } = useApp();
  const navigate = useNavigate();
  // Leaving Admin settings locks them again.
  const backToProfiles = async () => {
    await api.post('/api/admin/lock');
    await refresh();
    navigate('/');
  };
  const signOut = async () => {
    await api.post('/api/logout');
    await refresh();
    navigate('/');
  };
  return (
    <header className="header scrolled admin-header">
      <span className="logo">HOMEFLIX</span>
      <span className="admin-badge">Admin</span>
      <nav className="nav">
        <NavLink to="/admin" end>Settings</NavLink>
        <NavLink to="/admin/fix">Library Fixer</NavLink>
      </nav>
      <div className="header-right">
        <button className="btn secondary small" onClick={backToProfiles}>← <span className="hide-sm">Who's watching?</span><span className="show-sm">Profiles</span></button>
        <button className="link hide-sm" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}
