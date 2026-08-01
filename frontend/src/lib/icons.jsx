/** Inline SVG icons. Presentation only — no logic, no state. */

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

export const IconPlane = (p) => (
  <svg {...base} {...p}><path d="M10.2 9 3.5 6.6l1.6-1.6 8 1.9 3.6-3.6a2 2 0 1 1 2.8 2.8l-3.6 3.6 1.9 8-1.6 1.6L14.8 12l-3 3 .3 3.2-1.3 1.3-1.7-3.6-3.6-1.7 1.3-1.3 3.2.3 3-3Z" /></svg>
);

export const IconHome = (p) => (
  <svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M9.5 20v-5.5h5V20" /></svg>
);

export const IconFood = (p) => (
  <svg {...base} {...p}><path d="M6 3v8a2.5 2.5 0 0 0 5 0V3" /><path d="M8.5 11v10" /><path d="M18 3c-1.6 1.4-2.5 3.3-2.5 5.5S16.4 12.6 18 14v7" /></svg>
);

export const IconCompass = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></svg>
);

export const IconScale = (p) => (
  <svg {...base} {...p}><path d="M12 4v16" /><path d="M6 20h12" /><path d="M4 8h16" /><path d="m4 8-2.5 5.5a3 3 0 0 0 5 0Z" /><path d="m20 8-2.5 5.5a3 3 0 0 0 5 0Z" /></svg>
);

export const IconSpark = (p) => (
  <svg {...base} {...p}><path d="M12 3.5 13.8 9l5.5 1.8L13.8 12.6 12 18l-1.8-5.4L4.7 10.8 10.2 9 12 3.5Z" /><path d="M18.5 16.5 19.2 18.6 21.3 19.3 19.2 20 18.5 22.1 17.8 20 15.7 19.3 17.8 18.6 18.5 16.5Z" /></svg>
);

export const IconShield = (p) => (
  <svg {...base} {...p}><path d="M12 3 5 6v6c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6l-7-3Z" /><path d="m9.2 12 2 2 3.6-3.8" /></svg>
);

export const IconBlocked = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></svg>
);

export const IconCheck = (p) => (
  <svg {...base} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

export const IconList = (p) => (
  <svg {...base} {...p}><path d="M8.5 6.5h11" /><path d="M8.5 12h11" /><path d="M8.5 17.5h11" /><path d="M4.5 6.5h.01" /><path d="M4.5 12h.01" /><path d="M4.5 17.5h.01" /></svg>
);

export const IconRefresh = (p) => (
  <svg {...base} {...p}><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></svg>
);

/** Maps an agent id from the locked contract to its glyph. */
export const AGENT_ICON = {
  flights: IconPlane,
  stay: IconHome,
  food: IconFood,
  guide: IconCompass,
  mediator: IconScale,
  orchestrator: IconSpark,
};
