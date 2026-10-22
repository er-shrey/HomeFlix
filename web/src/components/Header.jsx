import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

export default function Header() {
  const { profile, refresh } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const typeActive = (type) => location.pathname === '/search' && new URLSearchParams(location.search).get('type') === type;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const signOut = async () => {
    await api.post('/api/logout');
    await refresh();
    navigate('/');
  };

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      <Link to="/" className="logo">HOMEFLIX</Link>
      <nav className="nav">
        <NavLink to="/" end>Home</NavLink>
        <Link to="/search?type=series" className={`hide-sm ${typeActive('series') ? 'active' : ''}`}>Series</Link>
        <Link to="/search?type=movie" className={`hide-sm ${typeActive('movie') ? 'active' : ''}`}>Movies</Link>
        <NavLink to="/mylist">My List</NavLink>
      </nav>
      <div className="header-right">
        <Link to="/search" className="icon-btn" aria-label="Search">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        </Link>
        <div className="profile-menu" ref={menuRef}>
          <button className="profile-btn" onClick={() => setMenu(!menu)} aria-label="Profile menu">
            <Avatar profile={profile} />
            <span className="caret">▾</span>
          </button>
          {menu && (
            <div className="dropdown" onClick={() => setMenu(false)}>
              <div className="dropdown-head"><Avatar profile={profile} size={28} /> {profile.name}{profile.isKid && <span className="kid-tag">Kids</span>}</div>
              <Link to="/profiles">Switch profile</Link>
              <Link to="/history">Viewing history</Link>
              <Link to="/settings">Profile & subtitles</Link>
              {profile.isAdmin && <Link to="/admin">Admin: library & profiles</Link>}
              <button onClick={signOut}>Sign out of HomeFlix</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
