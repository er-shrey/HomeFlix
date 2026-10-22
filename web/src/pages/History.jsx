import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function History() {
  const [items, setItems] = useState(null);
  const load = () => api.get('/api/history').then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const remove = async (item) => {
    if (!window.confirm(`Remove ${item.title} from your history? Its progress and your rating are removed too, so it stops shaping your recommendations.`)) return;
    await api.del(`/api/history/${item.id}`);
    load();
  };

  return (
    <div className="page narrow">
      <h1>Viewing history</h1>
      {items && !items.length && <p className="muted">You haven't watched anything yet.</p>}
      <ul className="history">
        {items?.map((i) => (
          <li key={i.id}>
            <span className="muted small date">{new Date(i.watchedAt).toLocaleDateString()}</span>
            <Link to={`/title/${i.id}`} className="history-title">{i.title}</Link>
            <span className="muted small">{i.label}{i.myRating ? ` · You rated ${'★'.repeat(i.myRating)}` : ''}</span>
            <button className="link" onClick={() => remove(i)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
