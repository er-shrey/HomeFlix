import { useRef } from 'react';
import Card from './Card.jsx';

export default function Row({ title, items, wide = false, onMenu }) {
  const ref = useRef(null);
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  if (!items?.length) return null;
  return (
    <section className="row">
      <h2 className="row-title">{title}</h2>
      <div className="row-wrap">
        <button className="row-arrow left" onClick={() => scroll(-1)} aria-label="Scroll left">‹</button>
        <div className="row-items" ref={ref}>
          {items.map((item) => <Card key={`${item.id}-${item.videoId || ''}`} item={item} wide={wide} onMenu={onMenu} />)}
        </div>
        <button className="row-arrow right" onClick={() => scroll(1)} aria-label="Scroll right">›</button>
      </div>
    </section>
  );
}
