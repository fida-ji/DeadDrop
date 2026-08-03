import { DropMark } from "./Icons";

export default function Logo({ size = 20 }: { size?: number }) {
  return (
    <span className="logo">
      <DropMark size={size + 4} className="mark" style={{ color: "var(--amber)" }} />
      <span className="wordmark">
        Dead<span className="wordmark__drop">Drop</span>
      </span>
    </span>
  );
}
