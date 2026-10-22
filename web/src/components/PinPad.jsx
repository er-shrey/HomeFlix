import { useEffect, useState } from 'react';

/** 4-digit PIN entry that works with a keyboard, a mouse, or a TV remote. */
export default function PinPad({ title, error, onSubmit, onCancel }) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (pin.length === 4) {
      onSubmit(pin);
      setPin('');
    }
  }, [pin, onSubmit]);

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p + e.key).slice(0, 4));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="pinpad" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="pin-dots">{[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'filled' : ''} />)}</div>
        {error && <p className="error">{error}</p>}
        <div className="pin-keys">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => setPin((p) => (p + n).slice(0, 4))}>{n}</button>)}
          <button onClick={onCancel} className="pin-cancel">Cancel</button>
          <button onClick={() => setPin((p) => (p + '0').slice(0, 4))}>0</button>
          <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete">⌫</button>
        </div>
      </div>
    </div>
  );
}
