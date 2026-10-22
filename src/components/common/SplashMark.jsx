import React from 'react';

/* v50 splash/login mark: the 33 comic fragments + 10 letter fragments are
   assembled exactly like mangatrack-app-v3.html's `.ai.aigo` animation. The
   `dg` group rotates slowly once the mark is complete. Positions, sizes and
   delays come straight from the reference markup. */

const BD = [
  ['42.090%', '4.688%', '3.809%', '0.050s'],
  ['37.402%', '5.078%', '3.613%', '0.095s'],
  ['33.301%', '6.836%', '3.223%', '0.140s'],
  ['30.176%', '10.059%', '2.637%', '0.185s'],
  ['28.418%', '14.355%', '2.051%', '0.230s'],
  ['27.832%', '19.043%', '1.465%', '0.275s'],
  ['28.027%', '23.926%', '1.758%', '0.320s'],
  ['37.402%', '45.410%', '1.465%', '0.365s'],
  ['38.086%', '50.293%', '1.758%', '0.410s'],
  ['41.016%', '64.551%', '1.562%', '0.455s'],
  ['46.680%', '72.363%', '3.516%', '0.500s'],
  ['51.172%', '74.316%', '3.711%', '0.545s'],
  ['56.055%', '73.828%', '3.613%', '0.590s'],
  ['66.309%', '62.695%', '1.758%', '0.635s'],
  ['64.453%', '48.438%', '2.148%', '0.680s'],
  ['63.281%', '45.605%', '1.660%', '0.725s'],
  ['59.473%', '24.609%', '1.562%', '0.770s'],
  ['58.691%', '19.824%', '1.758%', '0.815s'],
  ['57.227%', '15.137%', '2.148%', '0.860s'],
  ['54.688%', '11.035%', '2.734%', '0.905s'],
  ['51.270%', '7.520%', '3.125%', '0.950s'],
  ['46.973%', '5.371%', '3.516%', '0.995s'],
  ['56.445%', '76.953%', '3.613%', '1.300s'],
  ['53.027%', '79.395%', '2.832%', '1.345s'],
  ['51.855%', '83.594%', '1.562%', '1.390s'],
  ['52.441%', '88.379%', '2.441%', '1.435s'],
  ['55.273%', '92.188%', '3.418%', '1.480s'],
  ['59.766%', '93.945%', '3.809%', '1.525s'],
  ['64.551%', '92.188%', '3.516%', '1.570s'],
  ['68.555%', '88.574%', '2.734%', '1.615s'],
  ['69.531%', '80.762%', '2.637%', '1.660s'],
  ['65.918%', '77.637%', '3.320%', '1.705s'],
  ['61.133%', '76.660%', '3.711%', '1.750s'],
];

const LT = [
  ['6.348%', '25.098%', '18.652%', '0.300s,2.000s'],
  ['25.586%', '27.539%', '17.383%', '0.375s,2.060s'],
  ['42.090%', '27.148%', '16.992%', '0.450s,2.120s'],
  ['58.887%', '27.344%', '16.504%', '0.525s,2.180s'],
  ['76.074%', '27.539%', '17.383%', '0.600s,2.240s'],
  ['9.277%', '53.906%', '14.844%', '0.675s,2.300s'],
  ['22.852%', '51.953%', '18.848%', '0.750s,2.360s'],
];

const LTG = [
  ['0.000%', '41.629%', '17.887%'],
  ['5.083%', '2.145%', '65.040%'],
  ['64.635%', '0.000%', '35.365%'],
];

const tileStyle = ([left, top, width, delay]) => ({
  left,
  top,
  width,
  ...(delay ? { animationDelay: delay } : null),
});

function bdTile([left, top, width, delay], index) {
  return (
    <img
      key={`bd-${index + 1}`}
      className="bd"
      src={`/login-art/bd-${String(index + 1).padStart(2, '0')}.webp`}
      alt=""
      style={tileStyle([left, top, width, delay])}
    />
  );
}

export default function SplashMark({ active = true, className = '' }) {
  return (
    <div
      className={`ai${active ? ' aigo' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {BD.slice(0, 22).map(bdTile)}
      <div className="dg">{BD.slice(22).map((tile, i) => bdTile(tile, i + 22))}</div>
      {LT.map((tile, index) => (
        <img
          key={`lt-${index + 1}`}
          className="lt"
          src={`/login-art/lt-${String(index + 1).padStart(2, '0')}.webp`}
          alt=""
          style={tileStyle(tile)}
        />
      ))}
      <div
        className="lt ltg"
        style={{ left: '41.406%', top: '51.758%', width: '48.047%', height: '22.754%', animationDelay: '0.825s,2.420s' }}
      >
        {LTG.map((tile, index) => (
          <img
            key={`ltg-${index + 1}`}
            src={`/login-art/lt-${String(index + 8).padStart(2, '0')}.webp`}
            alt=""
            style={tileStyle(tile)}
          />
        ))}
      </div>
    </div>
  );
}
