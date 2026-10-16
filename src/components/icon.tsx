import type { CSSProperties } from "react";
const paths: Record<string, string[]> = {
  pen: ["m16 3 5 5-12 12-6 1 1-6L16 3Z", "m14 5 5 5"],
  outline: ["M9 5h12M9 12h12M9 19h12", "M3 5h1M3 12h1M3 19h1"],
  shuffle: ["M3 5h3c6 0 6 14 12 14h3", "m18 16 3 3-3 3", "M3 19h3c2 0 3-2 4-4M14 9c1-2 2-4 4-4h3", "m18 2 3 3-3 3"],
  document: ["M14 2H5v20h14V7l-5-5Z", "M14 2v6h5M8 12h8M8 16h8"],
  connections: ["M12 7v5M5 17v-5h14v5", "M9 2h6v5H9zM2 17h6v5H2zM16 17h6v5h-6z"],
  folder: ["M3 5h7l2 3h9v13H3V5Z"], search: ["M21 21l-5-5", "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z"],
  plus: ["M12 5v14M5 12h14"], arrow: ["M4 12h16m-6-6 6 6-6 6"], back: ["M20 12H4m6-6-6 6 6 6"],
  home: ["m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z"], trash: ["M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"],
  check: ["m5 12 4 4L19 6"], close: ["m6 6 12 12M6 18 18 6"], clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2"],
  spark: ["m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"],
  download: ["M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"], menu: ["M4 6h16M4 12h16M4 18h16"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
  save: ["M3 3h15l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8"], book: ["M12 5v16M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Z"],
  up: ["m6 14 6-6 6 6"], down: ["m6 10 6 6 6-6"], refresh: ["M20 7V3l-4 4M4 17v4l4-4", "M20 7a8 8 0 0 0-14-2M4 17a8 8 0 0 0 14 2"],
};
export function Icon({ name, size = 20, className = "", style }: { name: string; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{(paths[name] ?? paths.document).map((path, index) => <path key={index} d={path} />)}</svg>;
}
