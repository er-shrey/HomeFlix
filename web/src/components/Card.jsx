import { useNavigate } from 'react-router-dom';
import { media } from '../api.js';

/**
 * A title card. `wide` cards (Continue Watching) show a 16:9 frame and play directly;
 * poster cards open the title page.
 */
export default function Card({ item, wide = false, onMenu }) {
  const navigate = useNavigate();
  const open = () => {
    if (wide && item.videoId) navigate(`/watch/${item.videoId}`);
    else navigate(`/title/${item.id}`);
  };
  const img = media(wide ? (item.thumb || item.backdrop) : item.poster);
  return (
    <div className={`card ${wide ? 'wide' : ''}`}>
      <button className="card-img" onClick={open} aria-label={item.title}>
        <img src={img} alt="" loading="lazy" />
        {wide && <span className="card-play">▶</span>}
        {item.badge && <span className="badge">{item.badge}</span>}
        {item.progress > 0 && <span className="progress"><span style={{ width: `${Math.min(100, item.progress * 100)}%` }} /></span>}
        {!wide && <span className="card-title-overlay">{item.title}</span>}
      </button>
      {(wide || item.reason || item.note || item.label) && (
        <div className="card-meta">
          {wide && <div className="card-name">{item.title}</div>}
          {item.label && <div className="card-label">{item.label}</div>}
          {item.reason && <div className="card-reason">{item.reason}</div>}
          {item.note && <div className="card-reason">{item.note}</div>}
        </div>
      )}
      {onMenu && <button className="card-menu" onClick={() => onMenu(item)} aria-label="More options">⋮</button>}
    </div>
  );
}
