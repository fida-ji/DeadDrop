import Logo from "./Logo";
import WalletButton from "./WalletButton";
import { GitHub } from "./Icons";
import { NETWORK, REPO_URL } from "../lib/config";

const NAV = [
  ["How it works", "#how"],
  ["Adjudication", "#adjudication"],
  ["Case files", "#cases"],
  ["Console", "#console"],
  ["Protocol", "#protocol"],
];

export default function Header() {
  return (
    <header className="header">
      <div className="wrap header__inner">
        <a href="#top" className="logo" aria-label="DeadDrop home">
          <Logo />
        </a>
        <nav className="header__nav">
          {NAV.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <span className="netbadge" title={`${NETWORK.name} (chain ${NETWORK.chainId})`}>
          <span className="dot" />
          {NETWORK.name}
        </span>
        <a
          className="ghlink"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="DeadDrop source code on GitHub"
          title="DeadDrop on GitHub"
        >
          <GitHub size={17} />
        </a>
        <WalletButton />
      </div>
    </header>
  );
}
