export const AVATAR_COLORS = {
  red: '#e50914', blue: '#2b6ee6', green: '#1f9d55', yellow: '#e0a800',
  purple: '#8e44ad', orange: '#e8641b', teal: '#159a9c', pink: '#d63384',
};

export default function Avatar({ profile, size = 32 }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: AVATAR_COLORS[profile.avatar] || AVATAR_COLORS.red, fontSize: size * 0.45 }}
    >
      {profile.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
