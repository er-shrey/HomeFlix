import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtTime } from '../api.js';

const SHAPES = {
  poster: { ratio: 2 / 3, name: 'poster' },
  backdrop: { ratio: 16 / 9, name: 'banner image' },
};
const FRAME = 1 / 25;

/**
 * Pick any still from a video as artwork. The frame is grabbed in the browser at the video's
 * full resolution, cropped to the right shape, and handed to onSave as a JPEG Blob.
 */
export default function FramePicker({ videos, kind, canSuggest, onSave, onCancel }) {
  const shape = SHAPES[kind];
  const [videoId, setVideoId] = useState(videos[0]?.id);
  const [duration, setDuration] = useState(videos[0]?.duration || 0);
  const [time, setTime] = useState(0);
  const [cropPos, setCropPos] = useState(0.5);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);

  // Draw the current frame, cropped to the artwork's shape, onto the preview canvas.
  const draw = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    let cw;
    let ch;
    let x = 0;
    let y = 0;
    if (vw / vh > shape.ratio) {
      ch = vh;
      cw = Math.round(vh * shape.ratio);
      x = Math.round((vw - cw) * cropPos);
    } else {
      cw = vw;
      ch = Math.round(vw / shape.ratio);
      y = Math.round((vh - ch) * cropPos);
    }
    c.width = cw;
    c.height = ch;
    c.getContext('2d').drawImage(v, x, y, cw, ch, 0, 0, cw, ch);
    setReady(true);
  }, [shape.ratio, cropPos]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    setReady(false);
    setDuration(videos.find((v) => v.id === videoId)?.duration || 0);
  }, [videoId, videos]);

  const seek = (t) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, Math.min(t, (v.duration || duration) - 0.05));
  };

  const onLoaded = () => {
    const v = videoRef.current;
    setDuration(v.duration);
    // Start a little way in: the very first frame is often black.
    seek(v.duration * 0.15);
  };

  const save = () => {
    draw();
    setBusy(true);
    setError(null);
    canvasRef.current.toBlob(async (blob) => {
      try {
        await onSave(blob);
      } catch (err) {
        setError(err.message);
      }
      setBusy(false);
    }, 'image/jpeg', 0.9);
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(file);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  // Frames suggested across the whole video (needs ffmpeg on the server).
  const suggestions = canSuggest && duration
    ? Array.from({ length: 8 }, (_, i) => Math.round(duration * (0.06 + i * 0.12) * 10) / 10)
    : [];
  const showCrop = shape.ratio < 16 / 9;

  return (
    <div className="frame-picker">
      {videos.length > 1 && (
        <label className="fp-episode">Take the frame from
          <select value={videoId} onChange={(e) => setVideoId(Number(e.target.value))}>
            {videos.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
      )}

      <div className="fp-main">
        <div className="fp-video">
          <video
            key={videoId}
            ref={videoRef}
            src={`/media/video/${videoId}`}
            preload="auto"
            muted
            playsInline
            onLoadedMetadata={onLoaded}
            onSeeked={draw}
            onPause={draw}
            onTimeUpdate={(e) => setTime(e.target.currentTime)}
            onError={() => setError("This video can't be played in this browser, so frames can't be taken from it. Upload an image instead.")}
          />
          <input
            type="range" min={0} max={duration || 0} step={0.04} value={time}
            onChange={(e) => seek(Number(e.target.value))} aria-label="Position in video"
          />
          <div className="fp-steps">
            <button type="button" onClick={() => seek(time - 10)}>−10s</button>
            <button type="button" onClick={() => seek(time - 1)}>−1s</button>
            <button type="button" onClick={() => seek(time - FRAME)} title="Previous frame">◀ frame</button>
            <span className="fp-time">{fmtTime(time)}</span>
            <button type="button" onClick={() => seek(time + FRAME)} title="Next frame">frame ▶</button>
            <button type="button" onClick={() => seek(time + 1)}>+1s</button>
            <button type="button" onClick={() => seek(time + 10)}>+10s</button>
          </div>
        </div>

        <div className={`fp-preview ${kind}`}>
          <span className="field-label">Your {shape.name}</span>
          <canvas ref={canvasRef} className={ready ? '' : 'hidden'} />
          {!ready && <div className="fp-placeholder">Loading video…</div>}
          {showCrop && (
            <label className="fp-crop">Move the crop
              <input type="range" min={0} max={1} step={0.01} value={cropPos} onChange={(e) => setCropPos(Number(e.target.value))} />
            </label>
          )}
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="fp-suggestions">
          <span className="field-label">Jump to a moment</span>
          <div className="fp-strip">
            {suggestions.map((t) => (
              <button type="button" key={`${videoId}-${t}`} onClick={() => seek(t)} className={Math.abs(time - t) < 0.3 ? 'on' : ''}>
                <img src={`/api/admin/videos/${videoId}/frame?t=${t}`} alt={`Frame at ${fmtTime(t)}`} loading="lazy" />
                <span>{fmtTime(t)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="fp-actions">
        <button type="button" className="btn primary" disabled={!ready || busy} onClick={save}>{busy ? 'Saving…' : `Use this frame as the ${shape.name}`}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>Upload an image instead</button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
        {onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
