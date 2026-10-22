import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import TitleInfoForm from '../components/TitleInfoForm.jsx';

export default function EditTitle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/api/admin/titles/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="center-screen"><div className="spinner" /></div>;

  return (
    <div className="page narrow">
      <p><Link to="/admin">← Admin</Link></p>
      <h1>Edit {data.kind === 'series' ? 'series' : 'movie'}</h1>
      <p className="muted small">Saving writes these details to <code>{data.writeTarget}</code>, so the folder always has everything.{data.infoPath?.endsWith('.nfo') && ' Your .nfo file is left as it is; info.txt takes priority from now on.'}</p>
      <TitleInfoForm data={data} missing={data.missing} onSaved={() => navigate('/admin')} />
      <p className="muted small">Posters, trailers and subtitles are files: put <code>poster.jpg</code>, <code>trailer.mp4</code> or <code>Movie Name.en.srt</code> in the folder, or pick a poster from a video frame in the <Link to={`/admin/fix/${data.id}`}>Library Fixer</Link>.</p>
    </div>
  );
}
