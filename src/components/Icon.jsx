const paths = {
  sun: 'M12 3V1 M12 23v-2 M3 12H1 M23 12h-2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  moon: 'M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  search: 'M21 21l-5-5 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  chart: 'M3 3v18h18 M6 16l5-5 4 2 6-8',
  news: 'M4 3h16v18H4z M8 7h8 M8 11h8 M8 15h3 M14 15h2 M8 18h8',
  fund: 'M12 3l9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  ipo: 'M7 17L17 7 M7 7h10v10 M3 21h18',
  commodity: 'M12 3l9 5v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8',
  user: 'M20 21a8 8 0 0 0-16 0 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  logout: 'M9 3H3v18h6 M8 12h13 M17 8l4 4-4 4',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  refresh: 'M21 4v6h-6 M3 20v-6h6 M20 10a8 8 0 0 0-14-5L3 8 M4 14a8 8 0 0 0 14 5l3-3',
  chevron: 'M9 5l7 7-7 7',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'M6 6l12 12 M18 6L6 18',
  bell: 'M18 8a6 6 0 0 0-12 0c0 8-3 8-3 9h18c0-1-3-1-3-9 M10 21h4',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18 M12 3c-5 5-5 13 0 18',
}
export default function Icon({ name, size = 20, ...props }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.chart}/></svg> }
export function Logo() { return <span className="brand"><span className="brand-mark"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6v14M16 6v14M8 15l8-6" stroke="currentColor" strokeWidth="2.8" strokeLinecap="square"/></svg></span>trovan<span className="brand-dot">.</span></span> }
