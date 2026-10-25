// Hand-drawn medieval icon set as one inline SVG sprite. Object icons (resources, troops, skills) are inked and
// coloured like woodcut prints; control glyphs (play, close, arrows) are single-colour and follow the text colour.
// The HUD keeps writing its short emoji tokens; `installIcons` swaps every token for its icon as it reaches the DOM,
// so game logic and tests never see markup.

const INK = '#22150a';

/** Inked object icon: shapes get the ink outline. */
const obj = (body: string) => `<g stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
/** Control glyph in the text colour. */
const glyph = (body: string) => `<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;

const ICONS: Record<string, string> = {
  // ---- resources and castle status
  wood: obj(`<rect x="2.5" y="8" width="16" height="9" rx="2" fill="#a8743e"/><ellipse cx="18.5" cy="12.5" rx="3" ry="4.5" fill="#dcae6c"/><ellipse cx="18.5" cy="12.5" rx="1.3" ry="2.1" fill="none" stroke-width="1"/><path d="M5.5 10.6h7M6.5 14.6h8" fill="none" stroke-width="1"/>`),
  stone: obj(`<path d="M3.5 17.5l2-7.5 5.5-4.5 6.5 2 3.5 6.5-2 4.5z" fill="#9c958a"/><path d="M11 5.5l1.2 5.5 6.6 3.2M12.2 11l-6.2 6.5" fill="none" stroke-width="1"/><path d="M7.2 10.2l3.6-3" fill="none" stroke="#d8d2c6" stroke-width="1.2"/>`),
  food: obj(`<ellipse cx="14.3" cy="9.7" rx="6.6" ry="5.4" transform="rotate(-40 14.3 9.7)" fill="#b8553a"/><path d="M11.4 7.2c1.6-1.6 4.1-2.1 6-1" fill="none" stroke="#f2b48c" stroke-width="1.2"/><path d="M9.6 14.4L5.2 18.8" stroke-width="3.4"/><path d="M9.6 14.4L5.2 18.8" stroke="#efe2c8" stroke-width="1.6"/><circle cx="4.3" cy="18.4" r="1.7" fill="#efe2c8"/><circle cx="5.6" cy="19.9" r="1.7" fill="#efe2c8"/>`),
  gold: obj(`<circle cx="12" cy="12" r="8.5" fill="#e2b24c"/><circle cx="12" cy="12" r="5.8" fill="none" stroke="#a5771f" stroke-width="1.2"/><path d="M8.8 14.3l.5-3.6 1.7 1.7 1-2.7 1 2.7 1.7-1.7.5 3.6z" fill="#a5771f" stroke="none"/><path d="M6.5 8.5a7 7 0 0 1 3-2.6" fill="none" stroke="#fff0b8" stroke-width="1.2"/>`),
  pop: obj(`<path d="M13 20.5v-2.8c0-2.6 2-4.2 4.2-4.2s4.3 1.6 4.3 4.2v2.8z" fill="#55703a"/><circle cx="17.2" cy="9.5" r="2.7" fill="#e6c49c"/><path d="M2.5 21v-3.3c0-3.1 2.6-5.2 5.8-5.2s5.7 2.1 5.7 5.2V21z" fill="#6f9246"/><circle cx="8.3" cy="8" r="3.3" fill="#e9c9a0"/><path d="M4.8 8.6c0-4 2.2-5.6 3.5-5.6s3.6 1.6 3.6 5.6c-1-1.6-2.2-2.3-3.6-2.3S5.8 7 4.8 8.6z" fill="#6f9246" stroke-width="1.1"/>`),
  heart: obj(`<path d="M12 20.3s-7.3-4.6-7.3-10.4A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.3 2.7c0 5.8-7.3 10.4-7.3 10.4z" fill="#c43a2a"/><path d="M7.6 9.2a2 2 0 0 1 2-1.6" fill="none" stroke="#ff9a80" stroke-width="1.3"/>`),
  keep: obj(`<path d="M5 21V9h2.5V7H10v2h4V7h2.5v2H19v12z" fill="#9a8f7e"/><path d="M8.5 9V5h7v4" fill="#b0a592"/><path d="M8.5 5V3.5M11 5V3.5M13.5 5V3.5M15.5 5V3.5" stroke-width="1.2"/><path d="M10 21v-4.2a2 2 0 0 1 4 0V21z" fill="#4a3220"/><path d="M12 3.5V1.5l3 .9-3 .9" fill="#c43a2a" stroke-width="1"/>`),
  wall: obj(`<path d="M3 20V7h3V4.5h3V7h3V4.5h3V7h3V4.5h3V20z" fill="#9c8d7a"/><path d="M3 11h18M3 15.5h18M8 7v4M14 7v4M5.5 11v4.5M11 11v4.5M16.5 11v4.5M8 15.5V20M14 15.5V20" fill="none" stroke-width="1"/>`),
  wheel: obj(`<circle cx="12" cy="12" r="8.6" fill="none" stroke-width="3.6"/><circle cx="12" cy="12" r="8.6" fill="none" stroke="#8a5c33" stroke-width="2"/><path d="M12 4v16M4 12h16M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" fill="none" stroke="#8a5c33" stroke-width="1.4"/><circle cx="12" cy="12" r="2.3" fill="#c9a25a"/>`),
  scales: obj(`<path d="M12 3.5v15.5M7.5 20.5h9M4 6.5h16" fill="none" stroke-width="1.8"/><path d="M4 6.5l-2 6.5M4 6.5l4 6.5M20 6.5l-4 6.5M20 6.5l2 6.5" fill="none" stroke-width="1"/><path d="M1.5 13a2.5 1.8 0 0 0 7 0z" fill="#e2b24c"/><path d="M15.5 13a2.5 1.8 0 0 0 7 0z" fill="#e2b24c"/><circle cx="12" cy="3.5" r="1.3" fill="#e2b24c"/>`),
  crate: obj(`<rect x="3.5" y="5" width="17" height="15" rx="1" fill="#b07a44"/><path d="M3.5 10h17M3.5 15h17" fill="none" stroke-width="1"/><path d="M4.5 6l15 13" fill="none" stroke-width="1.3"/><circle cx="5.5" cy="7" r=".5" fill="${INK}"/><circle cx="18.5" cy="18" r=".5" fill="${INK}"/>`),
  fire: obj(`<path d="M12 21.5c-4 0-6.6-2.7-6.6-6.1 0-3.6 3-5.6 3.5-9.4 2.1 1.5 2.6 3.6 2.4 5.2 1-1 2-2.6 2-4.2 3.1 2.6 5.3 5.4 5.3 8.4 0 3.4-2.6 6.1-6.6 6.1z" fill="#ee7f24"/><path d="M12 21.4c-2 0-3.3-1.4-3.3-3.1 0-2.1 2-3 2.4-5.1 1.7 1.5 4.2 3 4.2 5.1 0 1.7-1.3 3.1-3.3 3.1z" fill="#ffd25a" stroke="none"/>`),
  moon: obj(`<path d="M15.5 3.4a8.6 8.6 0 1 0 5.4 14.2A7.1 7.1 0 0 1 15.5 3.4z" fill="#ecdfa8"/><circle cx="9" cy="13" r="1.2" fill="#cdbd7e" stroke="none"/><circle cx="12.5" cy="17" r=".9" fill="#cdbd7e" stroke="none"/>`),
  sun: obj(`<circle cx="12" cy="12" r="4.6" fill="#f2c040"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" fill="none" stroke="#c98a1a" stroke-width="1.8"/>`),
  hourglass: obj(`<path d="M7.2 3.6c0 4.1 4.8 5.9 4.8 8.4s-4.8 4.3-4.8 8.4h9.6c0-4.1-4.8-5.9-4.8-8.4s4.8-4.3 4.8-8.4z" fill="#ead9b0"/><path d="M9.3 19.6h5.4c0-1.5-1.3-2.5-2.7-3-1.4.5-2.7 1.5-2.7 3z" fill="#d8a845" stroke="none"/><path d="M5.5 3h13M5.5 21h13" fill="none" stroke="#7a5230" stroke-width="2.4"/>`),
  timer: obj(`<circle cx="12" cy="13.5" r="7.5" fill="#ead9b0"/><path d="M12 13.5V9.2M12 13.5l3 2" fill="none" stroke-width="1.6"/><path d="M10 3h4M12 3v3" fill="none" stroke-width="1.8"/>`),
  auto: obj(`<path d="M12 2.8l1.6 2.3 2.7-.7.6 2.7 2.7.6-.7 2.7 2.3 1.6-2.3 1.6.7 2.7-2.7.6-.6 2.7-2.7-.7L12 21.2l-1.6-2.3-2.7.7-.6-2.7-2.7-.6.7-2.7L2.8 12l2.3-1.6-.7-2.7 2.7-.6.6-2.7 2.7.7z" fill="#a9adb6"/><circle cx="12" cy="12" r="4.4" fill="#ecdfa8"/><circle cx="12" cy="12" r="1.9" fill="#2f6aa0" stroke="none"/>`),
  // ---- troops, terrain, monsters
  wheat: obj(`<path d="M12 21.5V7" fill="none" stroke="#8a6a2a" stroke-width="1.6"/><g fill="#e0b448" stroke-width="1"><ellipse cx="9.6" cy="9.5" rx="1.6" ry="2.6" transform="rotate(-30 9.6 9.5)"/><ellipse cx="14.4" cy="9.5" rx="1.6" ry="2.6" transform="rotate(30 14.4 9.5)"/><ellipse cx="9.6" cy="13.5" rx="1.6" ry="2.6" transform="rotate(-30 9.6 13.5)"/><ellipse cx="14.4" cy="13.5" rx="1.6" ry="2.6" transform="rotate(30 14.4 13.5)"/><ellipse cx="12" cy="5" rx="1.6" ry="2.7"/></g>`),
  hammer: obj(`<path d="M13.2 10.8L4.6 19.4" fill="none" stroke-width="3.6"/><path d="M13.2 10.8L4.6 19.4" fill="none" stroke="#a8743e" stroke-width="2"/><path d="M10.8 6.3l3.4-3.4 6.9 6.9-3.4 3.4z" fill="#8f949d"/><path d="M12.3 4.8l2.2 2.2" fill="none" stroke="#d4d8de" stroke-width="1"/>`),
  dagger: obj(`<path d="M20.5 3.5l-2.2 6.8-7 7-2.6-2.6 7-7z" fill="#cfd3da"/><path d="M19.6 4.4l-5.4 5.4" fill="none" stroke="#f2f4f7" stroke-width="1"/><path d="M6.8 13.4l3.8 3.8" fill="none" stroke-width="3.4"/><path d="M6.8 13.4l3.8 3.8" fill="none" stroke="#e2b24c" stroke-width="1.8"/><path d="M8.6 15.4l-4.1 4.1" fill="none" stroke-width="3"/><path d="M8.6 15.4l-4.1 4.1" fill="none" stroke="#6b4426" stroke-width="1.4"/><circle cx="4" cy="20" r="1.2" fill="#e2b24c"/>`),
  shield: obj(`<path d="M12 2.8l7.3 2.6v5.8c0 5.1-3.6 8.6-7.3 10.2-3.7-1.6-7.3-5.1-7.3-10.2V5.4z" fill="#3f5c8c"/><path d="M12 3.6v16.8M5.3 10.3h13.4" fill="none" stroke="#e2b24c" stroke-width="1.8"/><path d="M6.6 6.4l4-1.4" fill="none" stroke="#8fb0e0" stroke-width="1.1"/>`),
  bow: obj(`<path d="M7.5 2.5c6.5 3.6 6.5 15.4 0 19" fill="none" stroke-width="3.4"/><path d="M7.5 2.5c6.5 3.6 6.5 15.4 0 19" fill="none" stroke="#a8743e" stroke-width="1.7"/><path d="M7.5 2.5v19" fill="none" stroke="#efe2c8" stroke-width=".9"/><path d="M2.5 12h17" fill="none" stroke-width="1.5"/><path d="M21.8 12l-3.4-2.2v4.4z" fill="#cfd3da" stroke-width="1"/><path d="M2.5 12l-1-2.2M2.5 12l-1 2.2M4.5 12l-1-2.2M4.5 12l-1 2.2" fill="none" stroke="#c43a2a" stroke-width="1.2"/>`),
  pine: obj(`<path d="M12 2.5l5 6.5h-2.6l4.6 6h-3l3.5 4.5h-15L8 15H5l4.6-6H7z" fill="#4f7a3c"/><path d="M11 19.5h2v2.3h-2z" fill="#7a5230"/>`),
  mountain: obj(`<path d="M1.5 20l7-12.5 4 6 3-4.5 7 11z" fill="#8f8a80"/><path d="M8.5 7.5l2 3-1.3 1-1-1.4-1.2 1.4-.8-.6z" fill="#f2efe6" stroke-width="1"/>`),
  wolf: obj(`<path d="M4.5 3.5l3.5 5.2h8l3.5-5.2 1 8.3-3.3 5.3-5.2 4.2-5.2-4.2-3.3-5.3z" fill="#73737c"/><path d="M8.8 18.2l3.2 2.6 3.2-2.6-1.2-3h-4z" fill="#d6d2c8"/><circle cx="12" cy="15.2" r="1.1" fill="${INK}"/><path d="M8.2 11.2l1.8.8M15.8 11.2l-1.8.8" fill="none" stroke="#ffd25a" stroke-width="1.6"/>`),
  skull: obj(`<path d="M12 2.8c-4.8 0-8 3.2-8 7.6 0 2.6 1.3 4.4 3 5.4v3.4h10v-3.4c1.7-1 3-2.8 3-5.4 0-4.4-3.2-7.6-8-7.6z" fill="#ece4d2"/><path d="M8.6 9.6a1.8 1.8 0 1 0 0 .1zM15.4 9.6a1.8 1.8 0 1 0 0 .1z" fill="${INK}"/><path d="M12 12.6l-1.2 2.2h2.4z" fill="${INK}" stroke-width="1"/><path d="M9.5 19.2v-2M12 19.2v-2M14.5 19.2v-2" fill="none" stroke-width="1"/>`),
  target: obj(`<circle cx="11" cy="13" r="8" fill="#ece4d2"/><circle cx="11" cy="13" r="5.3" fill="#c43a2a"/><circle cx="11" cy="13" r="2.4" fill="#ece4d2"/><path d="M11 13l9-9" fill="none" stroke-width="1.5"/><path d="M20 4l.4-2.4M20 4l2.4-.4" fill="none" stroke="#c43a2a" stroke-width="1.4"/>`),
  bell: obj(`<path d="M12 3.2c3.6 0 5.6 2.8 5.6 6.4v3.8l2.2 3.4H4.2l2.2-3.4V9.6c0-3.6 2-6.4 5.6-6.4z" fill="#e2b24c"/><path d="M8.6 7.6c.6-1.6 1.7-2.4 3-2.6" fill="none" stroke="#fff0b8" stroke-width="1.2"/><circle cx="12" cy="19.6" r="1.9" fill="#a5771f"/><path d="M12 1.5v1.7" fill="none" stroke-width="1.8"/>`),
  door: obj(`<path d="M5.5 21V10a6.5 6.5 0 0 1 13 0v11z" fill="#8a5c33"/><path d="M5.5 12.5h13M5.5 17h13" fill="none" stroke="#4a4a52" stroke-width="1.6"/><path d="M12 3.5V21" fill="none" stroke-width="1"/><circle cx="14.6" cy="15" r=".9" fill="#e2b24c"/>`),
  helmet: obj(`<path d="M3.5 15.5c0-6 3.6-10.5 8.5-10.5s8.5 4.5 8.5 10.5z" fill="#a9adb6"/><path d="M2 15.5h20v2.2H2z" fill="#8f949d"/><path d="M12 5v10.5" fill="none" stroke-width="1.2"/><path d="M7 9c1-1.6 2.4-2.6 4-2.9" fill="none" stroke="#e4e7ec" stroke-width="1.2"/>`),
  tools: obj(`<rect x="2.5" y="14.5" width="13" height="5" rx=".8" fill="#b07a44"/><circle cx="5.5" cy="17" r=".7" fill="${INK}"/><circle cx="9" cy="17" r=".7" fill="${INK}"/><circle cx="12.5" cy="17" r=".7" fill="${INK}"/><path d="M20.5 20.5l-8-8" fill="none" stroke-width="3.4"/><path d="M20.5 20.5l-8-8" fill="none" stroke="#a8743e" stroke-width="1.8"/><path d="M9.6 9.8l4.6-4.6 4.6 4.6-4.6 4.6z" fill="#8f949d"/><path d="M11.4 8l2.8-2.8" fill="none" stroke="#d4d8de" stroke-width="1"/>`),
  castle: obj(`<path d="M2.5 21V10h2V8h2v2h1.5V8h2v2h1.5v2h1v-2h1.5V8h2v2h1.5V8h2v2h2v11z" fill="#a39886"/><path d="M9.5 21v-4a2.5 2.5 0 0 1 5 0v4z" fill="#4a3220"/><path d="M5 14h2v2.2H5zM17 14h2v2.2h-2z" fill="${INK}" stroke="none"/><path d="M12 10V4l3.2 1-3.2 1" fill="#c43a2a" stroke-width="1.1"/>`),
  scaffold: obj(`<path d="M4 21V5M20 21V5M4 9h16M4 15h16M4 9l16 6M4 15l16-6" fill="none" stroke="#8a5c33" stroke-width="2"/><path d="M3 4.5h18" fill="none" stroke="#b07a44" stroke-width="2.4"/><path d="M2 21h20" fill="none" stroke-width="1.6"/>`),
  trophy: obj(`<path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="#e2b24c"/><path d="M7 5H4.2c0 3 1.4 4.6 3.4 5M17 5h2.8c0 3-1.4 4.6-3.4 5" fill="none" stroke-width="1.4"/><path d="M10.8 13.3h2.4v3.5h-2.4z" fill="#c9962e"/><path d="M7.5 17h9v3.5h-9z" fill="#7a5230"/><path d="M9 5v3.2" fill="none" stroke="#fff0b8" stroke-width="1.2"/>`),
  worker: obj(`<circle cx="9" cy="8.5" r="3.4" fill="#e9c9a0"/><path d="M5.2 7.6c.6-2.9 2.1-4.1 3.8-4.1s3.2 1.2 3.8 4.1z" fill="#c9962e"/><path d="M3 21v-3.4c0-3 2.6-5 6-5s6 2 6 5V21z" fill="#8a6a42"/><path d="M14 13.5l7-7M18 4.5l4 4" fill="none" stroke-width="1.8"/>`),
  scroll: obj(`<path d="M6 4.5h12v13a2.5 2.5 0 0 1-2.5 2.5H5.5" fill="#ead9b0"/><path d="M5.5 20a2.5 2.5 0 0 1 0-5H8v2.5A2.5 2.5 0 0 1 5.5 20z" fill="#d8c290"/><path d="M6 4.5a2 2 0 0 0-2 2v1h4" fill="#d8c290"/><path d="M10 9h6M10 12h6M10 15h4" fill="none" stroke-width="1"/>`),
  chart: obj(`<path d="M4 3.5h16v17H4z" fill="#ead9b0"/><path d="M6.5 16l3.5-4 3 2.5 4.5-6" fill="none" stroke="#3f7a3c" stroke-width="2"/><path d="M15 8.5h2.5V11" fill="none" stroke="#3f7a3c" stroke-width="1.6"/>`),
  chestOut: obj(`<path d="M3.5 11h17v9.5h-17z" fill="#8a5c33"/><path d="M3.5 11a8.5 4 0 0 1 17 0z" fill="#a8743e"/><path d="M3.5 14h17" fill="none" stroke="#c9a25a" stroke-width="1.4"/><path d="M12 9V1.8M9.2 4.5L12 1.8l2.8 2.7" fill="none" stroke="#3f7a3c" stroke-width="2"/>`),
  chestIn: obj(`<path d="M3.5 11h17v9.5h-17z" fill="#8a5c33"/><path d="M3.5 11a8.5 4 0 0 1 17 0z" fill="#a8743e"/><path d="M3.5 14h17" fill="none" stroke="#c9a25a" stroke-width="1.4"/><path d="M12 1.8V9M9.2 6.3L12 9l2.8-2.7" fill="none" stroke="#2f6aa0" stroke-width="2"/>`),
  horn: obj(`<path d="M2 7.8c2.4 6 8.6 8.6 15.4 6l2-4.3 2.6 10.6-4.8-3.3C10 19.6 3 15.3 1 8.6z" fill="#e2b24c"/><path d="M19.4 9.5l2.6 10.6" fill="none" stroke-width="2.6"/><path d="M19.4 9.5l2.6 10.6" fill="none" stroke="#a5771f" stroke-width="1.2"/><path d="M6.6 12.4l-1.2 2.5M11.4 14.1l-.6 2.7" fill="none" stroke="#7a5230" stroke-width="1.6"/><path d="M1 8.6c-.4-1 .1-1.8 1-.8" fill="none" stroke-width="1.6"/>`),
  lock: obj(`<path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 9 0v2.7" fill="none" stroke-width="3"/><path d="M7.5 10.5V7.8a4.5 4.5 0 0 1 9 0v2.7" fill="none" stroke="#8f949d" stroke-width="1.5"/><rect x="5" y="10.5" width="14" height="10.5" rx="1.5" fill="#6f6a62"/><circle cx="12" cy="15" r="1.4" fill="${INK}"/><path d="M12 15.5v2.6" fill="none" stroke-width="1.4"/>`),
  swords: obj(`<path d="M4 3.5l11.5 11.5M20 3.5L8.5 15" fill="none" stroke-width="3"/><path d="M4 3.5l11.5 11.5M20 3.5L8.5 15" fill="none" stroke="#cfd3da" stroke-width="1.5"/><path d="M13 17.5l4.5-4.5M6.5 13l4.5 4.5" fill="none" stroke="#e2b24c" stroke-width="2.2"/><path d="M16.3 16.3l3.7 3.7M7.7 16.3L4 20" fill="none" stroke="#6b4426" stroke-width="2.2"/>`),
  hammerPick: obj(`<path d="M5 20L17 8M19 20L7 8" fill="none" stroke-width="3"/><path d="M5 20L17 8M19 20L7 8" fill="none" stroke="#a8743e" stroke-width="1.6"/><path d="M14.5 5.5l5 5 1.6-1.6-5-5z" fill="#8f949d"/><path d="M3 7.5c2.2-3 5.6-4.6 9-4.3-2.5 1.3-4.7 3.2-6.3 5.8z" fill="#8f949d"/>`),
  pick: obj(`<path d="M18.5 20.5L8 10" fill="none" stroke-width="3"/><path d="M18.5 20.5L8 10" fill="none" stroke="#a8743e" stroke-width="1.6"/><path d="M2.5 9C5.5 4.4 10.5 2 16 3.2 11 4.5 7.5 7.4 5 12.2z" fill="#8f949d"/>`),
  flag: obj(`<path d="M5 21.5V2.5" fill="none" stroke="#6b4426" stroke-width="2"/><path d="M5.5 3.5h13l-3 4 3 4h-13z" fill="#c43a2a"/><path d="M8 6.5l1.5 1.5 2.5-2.5" fill="none" stroke="#e2b24c" stroke-width="1.2"/>`),
  hand: obj(`<path d="M7 20.5c-1.8-1.6-3-3.6-3.6-6.2l-.4-2.2a1.4 1.4 0 0 1 2.6-.7l1.4 2.4V5.5a1.4 1.4 0 0 1 2.8 0V11V3.8a1.4 1.4 0 0 1 2.8 0V11V5a1.4 1.4 0 0 1 2.8 0v6.5-4a1.4 1.4 0 0 1 2.8 0v7.3c0 3-1.5 5-3.4 5.7z" fill="#a9adb6"/>`),
  grave: obj(`<path d="M6 21v-9.5a6 6 0 0 1 12 0V21z" fill="#9c958a"/><path d="M12 9v8M9 12h6" fill="none" stroke-width="1.8"/><path d="M3 21h18" fill="none" stroke="#55703a" stroke-width="2"/>`),
  sparkle: obj(`<path d="M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2L12 21.5l-2.2-7.3L2.5 12l7.3-2.2z" fill="#f2c040"/>`),
  warn: obj(`<path d="M12 3l9.5 17h-19z" fill="#e2a43a"/><path d="M12 9.5v5" fill="none" stroke-width="2.2"/><circle cx="12" cy="17.3" r="1.1" fill="${INK}"/>`),
  eye: obj(`<path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12z" fill="#ead9b0"/><circle cx="12" cy="12" r="3.4" fill="#5d7a3c"/><circle cx="12" cy="12" r="1.5" fill="${INK}"/>`),
  // ---- control glyphs (text colour)
  play: `<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>`,
  pause: `<path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor"/>`,
  stop: `<rect x="5.5" y="5.5" width="13" height="13" rx="1.5" fill="currentColor"/>`,
  check: glyph(`<path d="M4.5 12.5l4.5 4.5 10-10"/>`),
  close: glyph(`<path d="M6 6l12 12M18 6L6 18"/>`),
  undo: glyph(`<path d="M5 9.5a7.5 7.5 0 1 1 1.2 7.2"/><path d="M4.5 4.5v5h5"/>`),
  back: glyph(`<path d="M9.5 6L4 11.5 9.5 17"/><path d="M4.5 11.5H15a5 5 0 0 1 0 10h-2"/>`),
  restart: glyph(`<path d="M19 12a7 7 0 1 1-2-4.9"/><path d="M19.5 3.5v5h-5"/>`),
  arrow: glyph(`<path d="M4 12h15M13.5 6l6 6-6 6"/>`),
  up: glyph(`<path d="M12 20V5M6 10.5l6-6 6 6"/>`),
  swap: glyph(`<path d="M4 8h14M14.5 4.5L18 8l-3.5 3.5M20 16H6M9.5 12.5L6 16l3.5 3.5"/>`),
  select: glyph(`<path d="M4 4h4M12 4h4M20 4v4M20 12v4M20 20h-4M12 20H8M4 20v-4M4 12V8" stroke-width="2"/>`),
  plus: glyph(`<path d="M12 5v14M5 12h14"/>`),
  list: glyph(`<path d="M5 6.5h14M5 12h14M5 17.5h14"/>`),
  menu: glyph(`<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h15"/>`),
  ring: glyph(`<circle cx="12" cy="12" r="7"/>`),
  ringDot: glyph(`<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>`),
  dot: `<circle cx="12" cy="12" r="6" fill="currentColor"/>`,
};

/** The HUD's emoji tokens and the icon each one becomes. */
const TOKENS: Record<string, string> = {
  '🪵': 'wood', '🪨': 'stone', '🍖': 'food', '🪙': 'gold', '👥': 'pop', '❤': 'heart', '🧱': 'wall', '⚙': 'wheel',
  '⚖': 'scales', '📦': 'crate', '🔥': 'fire', '🌙': 'moon', '☀': 'sun', '⏳': 'hourglass', '⏱': 'timer', '🤖': 'auto',
  '🌾': 'wheat', '🔨': 'hammer', '🗡': 'dagger', '🛡': 'shield', '🏹': 'bow', '🌲': 'pine', '⛰': 'mountain', '🐺': 'wolf',
  '💀': 'skull', '🎯': 'target', '🔔': 'bell', '🚪': 'door', '🪖': 'helmet', '🔧': 'tools', '🏰': 'castle', '🏗': 'scaffold',
  '🏆': 'trophy', '👷': 'worker', '💾': 'scroll', '📈': 'chart', '📤': 'chestOut', '📥': 'chestIn', '📯': 'horn', '🔒': 'lock',
  '⚔': 'swords', '⚒': 'hammerPick', '⛏': 'pick', '⚑': 'flag', '✋': 'hand', '✝': 'grave', '✦': 'sparkle', '⚠': 'warn',
  '👁': 'eye', '▶': 'play', '⏸': 'pause', '■': 'stop', '✓': 'check', '✕': 'close', '↺': 'undo', '↩': 'back', '⟳': 'restart',
  '➡': 'arrow', '➤': 'arrow', '⬆': 'up', '⇄': 'swap', '⬚': 'select', '＋': 'plus', '▤': 'list', '☰': 'menu', '○': 'ring',
  '◎': 'ringDot', '●': 'dot',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TOKEN_RE = new RegExp(`(${Object.keys(TOKENS).sort((a, b) => b.length - a.length).map(escape).join('|')})\\uFE0F?`, 'gu');

/** Inline markup for one icon (for code that builds HTML directly). */
export function icon(name: string, cls = ''): string {
  return `<svg class="gi gi-${name}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><use href="#gi-${name}"/></svg>`;
}

function svgIcon(name: string): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `gi gi-${name}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#gi-${name}`);
  svg.appendChild(use);
  return svg;
}

/** Replace emoji tokens in the text under `node` with icons. */
function iconize(node: Node): void {
  const texts: Text[] = [];
  if (node.nodeType === Node.TEXT_NODE) texts.push(node as Text);
  else {
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) texts.push(t as Text);
  }
  for (const t of texts) {
    const s = t.data;
    TOKEN_RE.lastIndex = 0;
    if (!TOKEN_RE.test(s) || !t.parentNode) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    for (let m = TOKEN_RE.exec(s); m; m = TOKEN_RE.exec(s)) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      frag.appendChild(svgIcon(TOKENS[m[1]]));
      last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    t.parentNode.replaceChild(frag, t);
  }
}

let installed = false;

/** Add the sprite once and keep every emoji token under `root` rendered as an icon. */
export function installIcons(root: HTMLElement): void {
  if (!installed) {
    installed = true;
    const sprite = document.createElement('div');
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    sprite.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${Object.entries(ICONS)
      .map(([name, body]) => `<symbol id="gi-${name}" viewBox="0 0 24 24">${body}</symbol>`)
      .join('')}</svg>`;
    document.body.prepend(sprite);
  }
  iconize(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') iconize(m.target);
      else m.addedNodes.forEach((n) => iconize(n));
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}

export const ICON_NAMES = Object.keys(ICONS);
