import { useState } from 'react';

/** 1–5 star picker. One tap rates; no submit button. */
export default function Stars({ value, onChange, size = 28, readOnly = false }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  return (
    <div className="stars" onMouseLeave={() => setHover(0)} role={readOnly ? undefined : 'radiogroup'} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star ${n <= shown ? 'on' : ''}`}
          style={{ fontSize: size }}
          disabled={readOnly}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-checked={value === n}
          role={readOnly ? undefined : 'radio'}
          onMouseEnter={() => !readOnly && setHover(n)}
          onClick={() => !readOnly && onChange?.(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}
