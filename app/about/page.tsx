import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "How Pear works — Private by design",
  description:
    "Pear uses WebRTC and AES-256 encryption to transfer files and run video calls directly between browsers. No servers ever see your data.",
};

export default function AboutPage() {
  return (
    <main className="flex-1 flex flex-col min-h-screen bg-surface text-fg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-3xl mx-auto w-full">
        <a href="/" className="text-2xl font-extrabold tracking-tight text-fg">
          Pear
        </a>
        <ThemeToggle />
      </nav>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-12 w-full animate-fade-in">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-fg mb-4">
          How Pear works
        </h1>
        <p className="text-lg text-fg-muted leading-relaxed mb-16 max-w-xl">
          Private by design. No accounts, no servers, no traces. Here is what
          actually happens when you share a file or start a call.
        </p>

        {/* Section: The core idea */}
        <Section
          number="01"
          title="Everything goes peer-to-peer"
          body="When two people use Pear, their browsers connect directly to each other using WebRTC — the same technology powering Google Meet and Discord. Your files and video travel along that direct connection. Pear's server is only ever involved for one brief moment: helping the two browsers find each other."
        />

        {/* Section: Signaling */}
        <Section
          number="02"
          title="The server is a blind matchmaker"
          body="To establish a direct connection, browsers need to exchange a small handshake (called an SDP offer and answer). Pear relays these messages through Ably, a WebSocket service. The messages contain no file data or video — just enough information for the two browsers to punch through firewalls and connect. Once they're connected, the server is out of the picture entirely."
        />

        {/* Section: Encryption */}
        <Section
          number="03"
          title="The key never touches the server"
          body="Every room URL looks like this: pear.app/room/abc123#Xk9mQ... — notice the # part. That fragment is the AES-256 encryption key, encoded in base64. By design, browsers never include the URL hash in HTTP requests. So even if someone intercepted your network traffic, they would see the room ID but never the key. Your files are encrypted in your browser before they leave, and decrypted in the receiver's browser after they arrive."
        />

        {/* Section: File transfer detail */}
        <Section
          number="04"
          title="File transfer, step by step"
          steps={[
            "You pick a file. Pear generates a random room ID and a fresh AES-GCM-256 key using your browser's built-in Web Crypto API.",
            "You share the link. The key is embedded in the URL hash — your contact's browser extracts it locally.",
            "Your browsers connect via WebRTC. The server relays only the handshake.",
            "Pear reads your file in 16 KB chunks, encrypts each one with a unique nonce, and sends them through the WebRTC DataChannel.",
            "The receiver's browser decrypts each chunk and reassembles the file. A download starts automatically when the last chunk arrives.",
          ]}
        />

        {/* Section: Video calls */}
        <Section
          number="05"
          title="Video calls"
          body="Calls work the same way. Both browsers connect via WebRTC, this time sending live audio and video streams instead of file chunks. WebRTC enforces DTLS-SRTP encryption on all media streams by default — meaning the call is encrypted regardless of anything Pear does on top. Screen sharing replaces the outgoing video track mid-call without dropping the connection."
        />

        {/* Section: What Pear never does */}
        <div className="mb-16">
          <SectionHeader number="06" title="What Pear never does" />
          <ul className="space-y-3 mt-6">
            {[
              "Stores files, even temporarily",
              "Logs video or audio",
              "Requires an account or email",
              "Tracks who connects with whom",
              "Stores encryption keys",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-fg-muted">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-pear-green shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-card border border-border-pear p-8 text-center">
          <h2 className="text-2xl font-bold text-fg mb-2">Ready to try it?</h2>
          <p className="text-fg-muted text-sm mb-6">No sign-up. Just a link.</p>
          <a
            href="/"
            className="inline-block px-8 py-4 rounded-2xl bg-pear-green text-white font-bold text-lg hover:bg-pear-green-dark active:scale-95 transition-all duration-200 shadow-md shadow-pear-green/30"
          >
            Go to Pear
          </a>
        </div>
      </article>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-fg-muted/60 border-t border-border-pear mt-auto">
        Pear is open source. Your privacy is the product.
      </footer>
    </main>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="text-xs font-bold text-pear-green font-mono">{number}</span>
      <h2 className="text-xl font-bold text-fg">{title}</h2>
    </div>
  );
}

function Section({
  number,
  title,
  body,
  steps,
}: {
  number: string;
  title: string;
  body?: string;
  steps?: string[];
}) {
  return (
    <div className="mb-14 pl-0 border-l-2 border-pear-green/20 pl-6">
      <SectionHeader number={number} title={title} />
      {body && (
        <p className="mt-4 text-fg-muted leading-relaxed">{body}</p>
      )}
      {steps && (
        <ol className="mt-4 space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-fg-muted">
              <span className="shrink-0 w-5 h-5 rounded-full bg-pear-green/15 text-pear-green text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
