import React from 'react';
import './TetLanternsEffect.css';

/**
 * Hiệu ứng đôi đèn lồng đỏ cổ truyền đung đưa 2 bên góc màn hình
 */
const TetLanternsEffect = ({ leftChar = 'Phúc', rightChar = 'Lộc' }) => {
  return (
    <div className="tet-lanterns-wrapper" aria-hidden="true">
      <div className="tet-lantern-box tet-lantern-left">
        <div className="tet-lantern-string" />
        <div className="tet-lantern-cap" />
        <div className="tet-lantern-body">
          <span className="tet-lantern-char">{leftChar}</span>
        </div>
        <div className="tet-lantern-cap tet-lantern-cap-bottom" />
        <div className="tet-lantern-tassel" />
      </div>

      <div className="tet-lantern-box tet-lantern-right">
        <div className="tet-lantern-string" />
        <div className="tet-lantern-cap" />
        <div className="tet-lantern-body">
          <span className="tet-lantern-char">{rightChar}</span>
        </div>
        <div className="tet-lantern-cap tet-lantern-cap-bottom" />
        <div className="tet-lantern-tassel" />
      </div>
    </div>
  );
};

export default TetLanternsEffect;
