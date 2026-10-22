import React from 'react';
import Avatar from './Avatar';

export default function Header({ profile, onNavigate }) {
  const avatarColor = profile?.avatar_color || 'var(--red)';

  return (
    <div className="hdr">
      <div className="brand" onClick={() => onNavigate?.('home')} style={{ cursor: 'pointer' }}>
        <div className="logo">
          <i>M</i><i>A</i><i>N</i><i>G</i><i>A</i><i className="w">T</i><i className="w">R</i><i className="w">A</i><i className="w">C</i><i className="w">K</i>
        </div>
        <div className="tag">LA TUA LIBRERIA MANGA</div>
      </div>
      <div
        className="avatar press"
        onClick={() => onNavigate?.('settings')}
        style={{ borderColor: avatarColor }}
        title="Apri Impostazioni"
      >
        <Avatar
          src={profile?.avatar_url}
          name={profile?.username}
          color={avatarColor}
          alt=""
        />
      </div>
    </div>
  );
}
