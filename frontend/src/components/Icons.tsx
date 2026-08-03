import type { CSSProperties } from "react";

type P = { size?: number; className?: string; style?: CSSProperties };

const base = (size: number): CSSProperties => ({
  width: size,
  height: size,
  display: "block",
  flex: "none",
});

function Svg({ size = 18, className, style, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      style={{ ...base(size), ...style }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// The DeadDrop mark: an evidence document half-inserted into a drop container.
export const DropMark = ({ size = 20, className, style }: P) => (
  <Svg size={size} className={className} style={style}>
    <path d="M9 2 H13 L15.5 4.5 V11 H9 Z" fill="currentColor" stroke="none" />
    <path d="M4 14 H8.5 M15.5 14 H20" strokeWidth={2.2} />
    <path d="M4 14 V22 H20 V14" />
  </Svg>
);

export const Dossier = (p: P) => (
  <Svg {...p}>
    <path d="M4 5 H10 L12 7 H20 V19 H4 Z" />
    <path d="M4 10 H20" />
  </Svg>
);

export const Balance = (p: P) => (
  <Svg {...p}>
    <path d="M12 4 V20" />
    <path d="M6 20 H18" />
    <path d="M5 8 H19" />
    <path d="M5 8 L3 13 H7 Z" />
    <path d="M19 8 L17 13 H21 Z" />
  </Svg>
);

export const Mask = (p: P) => (
  <Svg {...p}>
    <path d="M4 6 H20 V12 C20 16 16 20 12 20 C8 20 4 16 4 12 Z" />
    <path d="M8 11 H10" />
    <path d="M14 11 H16" />
  </Svg>
);

export const Coin = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8 V16" />
    <path d="M9.5 10 H14 M10 14 H14.5" />
  </Svg>
);

export const Hash = (p: P) => (
  <Svg {...p}>
    <path d="M9 4 L7 20" />
    <path d="M17 4 L15 20" />
    <path d="M4 9 H20" />
    <path d="M4 15 H20" />
  </Svg>
);

export const Clock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8 V12 L15 14" />
  </Svg>
);

export const Nodes = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="2" />
    <circle cx="5" cy="18" r="2" />
    <circle cx="19" cy="18" r="2" />
    <path d="M12 7 L6 16 M12 7 L18 16 M7 18 H17" />
  </Svg>
);

export const Arrow = (p: P) => (
  <Svg {...p}>
    <path d="M5 12 H18" />
    <path d="M13 7 L18 12 L13 17" />
  </Svg>
);

export const External = (p: P) => (
  <Svg {...p}>
    <path d="M14 5 H19 V10" />
    <path d="M19 5 L11 13" />
    <path d="M18 14 V19 H5 V6 H10" />
  </Svg>
);

export const Wallet = (p: P) => (
  <Svg {...p}>
    <path d="M4 7 H18 V19 H4 Z" />
    <path d="M4 7 L4 5 H15" />
    <path d="M14 12 H18" />
  </Svg>
);

export const Check = (p: P) => (
  <Svg {...p}>
    <path d="M5 12 L10 17 L19 7" />
  </Svg>
);

// The official GitHub mark (filled, unlike the stroke icon set above).
export const GitHub = ({ size = 18, className, style }: P) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={{ ...base(size), ...style }}
    aria-hidden="true"
  >
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);
