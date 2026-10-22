import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, beacon, fmtTime } from '../api.js';
import Stars from '../components/Stars.jsx';

const SAVE_EVERY_MS = 10_000;
const UP_NEXT_SECONDS = 10;
const RATING_CARD_MS = 15_000;
const MAX_AUTOPLAYS = 3;
const SUB_SIZES = { small: 'clamp(14px, 2vw, 26px)', medium: 'clamp(18px, 2.8vw, 36px)', large: 'clamp(22px, 3.8vw, 48px)' };

// Episodes played back-to-back with nobody touching anything (for "Are you still watching?").
const autoplays = {
  get: () => Number(sessionStorage.getItem('hr_autoplays') || 0),
  set: (n) => sessionStorage.setItem('hr_autoplays', String(n)),
};

export default function Watch() {
  const { videoId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const hideTimer = useRef(null);
  const creditsHandled = useRef(false);
  const lastSaved = useRef(0);

  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [controls, setControls] = useState(true);
  const [ccId, setCcId] = useState(null);
  const [ccMenu, setCcMenu] = useState(false);
  const [offset, setOffset] = useState(0);
  const [prefs, setPrefs] = useState({});
  const [cue, setCue] = useState('');
  const [upNext, setUpNext] = useState(null); // seconds left, or null
  const [upNextCancelled, setUpNextCancelled] = useState(false);
  const [rating, setRating] = useState(null); // { trigger, question, current, thanks }
  const [stillWatching, setStillWatching] = useState(false);
  const [ended, setEnded] = useState(false);

  // ---------------------------------------------------------------------------
  // Load

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setError(null);
    setUpNext(null);
    setUpNextCancelled(false);
    setRating(null);
    setEnded(false);
    setStillWatching(false);
    setCue('');
    creditsHandled.current = false;
    api.get(`/api/play/${videoId}${params.get('start') === '0' ? '?start=0' : ''}`).then((data) => {
      if (cancelled) return;
      setInfo(data);
      setOffset(data.subOffsetMs || 0);
      setPrefs(data.prefs || {});
      const want = data.prefs?.subtitleLang;
      const pick = want && (data.subtitles.find((s) => !s.forced && !s.sdh && (s.lang || s.label) === want)
        || data.subtitles.find((s) => !s.forced && (s.lang || s.label) === want));
      setCcId(pick ? pick.id : null);
    }).catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [videoId, params]);

  // ---------------------------------------------------------------------------
  // Progress saving

  const report = useCallback((useBeacon = false) => {
    const v = videoRef.current;
    if (!v || !info || !Number.isFinite(v.currentTime) || v.currentTime < 1) return null;
    const body = { videoId: info.video.id, position: v.currentTime, duration: Number.isFinite(v.duration) ? v.duration : null };
    lastSaved.current = Date.now();
    if (useBeacon) return beacon('/api/progress', body);
    return api.post('/api/progress', body).catch(() => null);
  }, [info]);

  useEffect(() => {
    if (!info) return undefined;
    const id = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused && Date.now() - lastSaved.current >= SAVE_EVERY_MS - 500) report();
    }, 1000);
    const onHide = () => { if (document.visibilityState === 'hidden') report(true); };
    const onPageHide = () => report(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      report(true);
    };
  }, [info, report]);

  // ---------------------------------------------------------------------------
  // Subtitles: we render cues ourselves so size/background follow the profile's settings.

  const forced = info?.subtitles.find((s) => s.forced);
  const activeSubId = ccId ?? forced?.id ?? null;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !info) return undefined;
    setCue('');
    const tracks = [...v.querySelectorAll('track')];
    const listeners = [];
    tracks.forEach((el) => {
      const on = Number(el.dataset.id) === activeSubId;
      el.track.mode = on ? 'hidden' : 'disabled';
      if (on) {
        const handler = () => {
          const active = [...(el.track.activeCues || [])].map((c) => c.text);
          setCue(active.join('\n').replace(/<[^>]+>/g, ''));
        };
        el.track.addEventListener('cuechange', handler);
        listeners.push([el.track, handler]);
      }
    });
    return () => listeners.forEach(([t, h]) => t.removeEventListener('cuechange', h));
  }, [info, activeSubId, offset]);

  const savePrefs = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    api.put('/api/me/prefs', patch).catch(() => {});
  };

  const chooseSub = (s) => {
    setCcId(s ? s.id : null);
    savePrefs({ subtitleLang: s ? (s.lang || s.label) : '' });
  };

  const nudgeOffset = (deltaMs) => {
    const next = offset + deltaMs;
    setOffset(next);
    api.put(`/api/videos/${info.video.id}/sub-offset`, { ms: next }).catch(() => {});
  };

  // ---------------------------------------------------------------------------
  // Next episode, credits, rating

  const goNext = useCallback((auto) => {
    if (!info?.next) return;
    if (auto && autoplays.get() >= MAX_AUTOPLAYS) {
      videoRef.current?.pause();
      setUpNext(null);
      setStillWatching(true);
      return;
    }
    autoplays.set(auto ? autoplays.get() + 1 : 0);
    report();
    navigate(`/watch/${info.next.videoId}`, { replace: true });
  }, [info, navigate, report]);

  const askForRating = useCallback(async () => {
    const r = await api.get(`/api/titles/${info.title.id}/rating-prompt?videoId=${info.video.id}`).catch(() => null);
    if (r?.ask) setRating(r);
  }, [info]);

  const onCreditsReached = useCallback(async () => {
    await report(); // marks it finished on the server before we ask anything
    askForRating();
    if (info.next && !upNextCancelled) setUpNext(UP_NEXT_SECONDS);
  }, [report, askForRating, info, upNextCancelled]);

  useEffect(() => {
    if (upNext === null || stillWatching) return undefined;
    if (upNext <= 0) {
      goNext(true);
      return undefined;
    }
    const id = setTimeout(() => setUpNext((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(id);
  }, [upNext, goNext, stillWatching]);

  // Rating card hides itself after a while; ignoring it counts as "Not now".
  useEffect(() => {
    if (!rating || rating.thanks) return undefined;
    const id = setTimeout(() => dismissRating(), RATING_CARD_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rating]);

  const rate = async (stars) => {
    await api.put(`/api/titles/${info.title.id}/rating`, { stars, trigger: rating.trigger });
    setRating({ ...rating, current: stars, thanks: true });
    setTimeout(() => setRating(null), 1500);
  };

  const dismissRating = () => {
    if (!rating) return;
    api.post(`/api/titles/${info.title.id}/rating-prompt/dismiss`, { trigger: rating.trigger }).catch(() => {});
    setRating(null);
  };

  // ---------------------------------------------------------------------------
  // Video events

  const onLoaded = () => {
    const v = videoRef.current;
    setDuration(v.duration);
    if (info.resumeAt > 0 && info.resumeAt < v.duration - 5) v.currentTime = info.resumeAt;
    v.play().catch(() => setPlaying(false));
  };

  const onTime = () => {
    const v = videoRef.current;
    setTime(v.currentTime);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    const creditsStart = info.creditsStart ?? (Number.isFinite(v.duration) ? v.duration * 0.97 : null);
    if (creditsStart === null) return;
    if (v.currentTime >= creditsStart && !creditsHandled.current) {
      creditsHandled.current = true;
      onCreditsReached();
    } else if (v.currentTime < creditsStart - 1 && creditsHandled.current) {
      // Seeked back before the credits: put things back as they were.
      creditsHandled.current = false;
      setUpNext(null);
    }
  };

  const onEnded = () => {
    report();
    if (info.next && !upNextCancelled && !stillWatching) goNext(true);
    else setEnded(true);
  };

  // ---------------------------------------------------------------------------
  // Controls

  const poke = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControls(false);
    }, 3000);
  }, []);

  const interacted = () => autoplays.set(0);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }, []);

  const seekBy = useCallback((d) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d));
  }, []);

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else boxRef.current?.requestFullscreen?.();
  }, []);

  const back = useCallback(() => navigate(info ? `/title/${info.title.id}` : '/'), [navigate, info]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
      interacted();
      poke();
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') seekBy(10);
      else if (e.key === 'ArrowLeft') seekBy(-10);
      else if (e.key === 'f') fullscreen();
      else if (e.key === 'm') { const v = videoRef.current; v.muted = !v.muted; setMuted(v.muted); }
      else if (e.key === 'c' && info) chooseSub(ccId ? null : info.subtitles.find((s) => !s.forced) || null);
      else if (e.key === 'Escape' && !document.fullscreenElement) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggle, seekBy, fullscreen, back, poke, info, ccId]);

  if (error) return <div className="center-screen"><p className="error">{error}</p><button className="btn" onClick={() => navigate('/')}>Back</button></div>;
  if (!info) return <div className="center-screen player-bg"><div className="spinner" /></div>;

  const inIntro = info.intro && time >= info.intro.start && time < info.intro.end - 1;
  const subStyle = {
    fontSize: SUB_SIZES[prefs.subtitleSize || 'medium'],
    background: prefs.subtitleBackground === false ? 'transparent' : 'rgba(0,0,0,0.75)',
    textShadow: prefs.subtitleBackground === false ? '0 0 4px #000, 0 0 2px #000, 1px 1px 2px #000' : 'none',
  };

  return (
    <div
      ref={boxRef}
      className={`player ${controls || !playing ? 'show-controls' : ''}`}
      onMouseMove={poke}
      onPointerDown={() => { interacted(); poke(); }}
    >
      <video
        ref={videoRef}
        src={info.video.src}
        playsInline
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onPlay={() => { setPlaying(true); poke(); }}
        onPause={() => { setPlaying(false); setControls(true); report(); }}
        onSeeked={() => report()}
        onEnded={onEnded}
        onVolumeChange={(e) => { setMuted(e.target.muted); setVolume(e.target.volume); }}
        onError={() => setError(info.video.mayNeedConversion
          ? "This file's format can't be played in a web browser. It needs converting to MP4 (coming in a later version)."
          : "This video couldn't be played.")}
        onClick={() => { toggle(); }}
        onDoubleClick={fullscreen}
      >
        {info.subtitles.map((s) => (
          <track key={`${s.id}-${offset}`} data-id={s.id} kind="subtitles" src={`${s.src}?offset=${offset}`} srcLang={s.lang || 'und'} label={s.label} />
        ))}
      </video>

      {cue && <div className={`subtitle-cue ${controls || !playing ? 'raised' : ''}`}><span style={subStyle}>{cue}</span></div>}

      <div className="player-top">
        <button className="icon-btn big" onClick={back} aria-label="Back">←</button>
        <div className="player-heading">
          <strong>{info.title.title}</strong>
          {info.video.heading && <span>{info.video.heading}</span>}
        </div>
      </div>

      {inIntro && <button className="skip-btn" onClick={() => { videoRef.current.currentTime = info.intro.end; }}>Skip Intro</button>}

      {rating && (
        <div className="rating-card">
          {rating.thanks ? <p>Thanks! Your rating helps pick what to show you next.</p> : (
            <>
              <p>{rating.question}</p>
              <Stars value={rating.current} onChange={rate} size={34} />
              <button className="link" onClick={dismissRating}>Not now</button>
            </>
          )}
        </div>
      )}

      {upNext !== null && info.next && !stillWatching && (
        <div className="up-next">
          <img src={info.next.thumb} alt="" />
          <div>
            <small>Next episode in {upNext}s</small>
            <strong>{info.next.label}</strong>
            <div className="up-next-actions">
              <button className="btn primary small" onClick={() => goNext(false)}>▶ Play now</button>
              <button className="btn secondary small" onClick={() => { setUpNext(null); setUpNextCancelled(true); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {stillWatching && (
        <div className="overlay-center">
          <h2>Are you still watching {info.title.title}?</h2>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => { setStillWatching(false); autoplays.set(0); goNext(false); }}>Continue watching</button>
            <button className="btn secondary" onClick={back}>Back to browse</button>
          </div>
        </div>
      )}

      {ended && !info.next && (
        <div className="overlay-center">
          <h2>{info.title.title}</h2>
          <div className="hero-actions">
            <button className="btn primary" onClick={back}>Back to details</button>
            <button className="btn secondary" onClick={() => { setEnded(false); videoRef.current.currentTime = 0; videoRef.current.play(); }}>↺ Watch again</button>
          </div>
        </div>
      )}

      <div className="player-bottom" onPointerDown={(e) => e.stopPropagation()}>
        <div className="seek">
          <div className="seek-buffer" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
          {info.intro && duration > 0 && (
            <div className="seek-intro" style={{ left: `${(info.intro.start / duration) * 100}%`, width: `${((info.intro.end - info.intro.start) / duration) * 100}%` }} />
          )}
          <input
            type="range" min={0} max={duration || 0} step={0.1} value={time}
            onChange={(e) => { videoRef.current.currentTime = Number(e.target.value); setTime(Number(e.target.value)); interacted(); }}
            aria-label="Seek"
          />
        </div>
        <div className="controls">
          <button className="icon-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
          <button className="icon-btn" onClick={() => seekBy(-10)} aria-label="Back 10 seconds">↺10</button>
          <button className="icon-btn" onClick={() => seekBy(10)} aria-label="Forward 10 seconds">10↻</button>
          <button className="icon-btn" onClick={() => { const v = videoRef.current; v.muted = !v.muted; }} aria-label="Mute">{muted || volume === 0 ? '🔇' : '🔊'}</button>
          <input className="volume" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
            onChange={(e) => { const v = videoRef.current; v.volume = Number(e.target.value); v.muted = false; }} aria-label="Volume" />
          <span className="time">{fmtTime(time)} / {fmtTime(duration)}</span>
          <span className="spacer" />
          {info.next && <button className="icon-btn" onClick={() => goNext(false)} title={`Next: ${info.next.label}`}>⏭</button>}
          {info.subtitles.some((s) => !s.forced) && (
            <div className="cc-wrap">
              <button className={`icon-btn cc-btn ${ccId ? 'on' : ''}`} onClick={() => setCcMenu(!ccMenu)} aria-label="Subtitles">CC</button>
              {ccMenu && (
                <div className="cc-menu">
                  <h4>Subtitles</h4>
                  <button className={!ccId ? 'on' : ''} onClick={() => chooseSub(null)}>Off{forced ? ' (forced only)' : ''}</button>
                  {info.subtitles.filter((s) => !s.forced).map((s) => (
                    <button key={s.id} className={ccId === s.id ? 'on' : ''} onClick={() => chooseSub(s)}>{s.label}</button>
                  ))}
                  <h4>Timing</h4>
                  <div className="cc-row">
                    <button onClick={() => nudgeOffset(-500)}>Earlier</button>
                    <span>{offset === 0 ? 'In sync' : `${offset > 0 ? '+' : ''}${(offset / 1000).toFixed(1)}s`}</span>
                    <button onClick={() => nudgeOffset(500)}>Later</button>
                  </div>
                  <h4>Size</h4>
                  <div className="cc-row">
                    {['small', 'medium', 'large'].map((sz) => (
                      <button key={sz} className={(prefs.subtitleSize || 'medium') === sz ? 'on' : ''} onClick={() => savePrefs({ subtitleSize: sz })}>{sz[0].toUpperCase() + sz.slice(1)}</button>
                    ))}
                  </div>
                  <label className="cc-check">
                    <input type="checkbox" checked={prefs.subtitleBackground !== false} onChange={(e) => savePrefs({ subtitleBackground: e.target.checked })} />
                    Dark box behind text
                  </label>
                </div>
              )}
            </div>
          )}
          <button className="icon-btn" onClick={fullscreen} aria-label="Full screen">⛶</button>
        </div>
      </div>
    </div>
  );
}
