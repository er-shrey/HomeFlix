import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';

export default function MyList() {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get('/api/mylist').then(setItems).catch(() => setItems([])); }, []);
  return (
    <div className="page">
      <h1>My List</h1>
      {items && !items.length && <p className="muted">Nothing here yet. Press <b>+</b> on any movie or series to save it for later.</p>}
      {items && <div className="grid">{items.map((i) => <Card key={i.id} item={i} />)}</div>}
    </div>
  );
}
