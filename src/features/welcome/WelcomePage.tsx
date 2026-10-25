import Link from "next/link";
import { Check, ScanLine, ShieldCheck } from "lucide-react";

/** Shared by the public route and the production-composition browser fixture. */
export function WelcomePage() {
  return <div className="welcome-page">
    <a className="welcome-skip" href="#welcome-main">Skip to content</a>
    <header className="welcome-nav">
      <Link href="/welcome" aria-label="UNIFY home" className="welcome-wordmark">UNIFY</Link>
      <nav aria-label="Welcome navigation">
        <Link href="/vendor/sign-in" className="welcome-button welcome-button-secondary">Vendor log in</Link>
        <Link href="/sign-in" className="welcome-button welcome-button-secondary">Staff log in</Link>
        <Link href="/fund" className="welcome-button welcome-button-primary">Fund a student</Link>
      </nav>
    </header>
    <main id="welcome-main">
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <div className="welcome-hero-copy">
          <h1 id="welcome-title">Your identity.<br />In your pocket.</h1>
          <p className="welcome-lead">Carry your student identity on your phone. Choose what you share, every time. Keep campus close.</p>
          <div className="welcome-actions">
            <a className="welcome-button welcome-button-secondary" href="#students">How to get started</a>
          </div>
        </div>
        <div className="welcome-art" aria-label="Fictional student wallet illustration">
          <div className="welcome-student-card">
            <div className="welcome-card-top"><span>UNIFY</span><ShieldCheck size={24} aria-hidden="true" /></div>
            <p>DEMO UNIVERSITY</p>
            <div className="welcome-card-name">Naledi Mokoena</div>
            <div className="welcome-card-bottom">
              <div><span>STUDENT NUMBER</span><strong>202600123</strong></div>
              <div><span>FACULTY</span><strong>Science</strong></div>
            </div>
          </div>
          <div className="welcome-share">
            <span className="welcome-check"><Check size={18} aria-hidden="true" /></span>
            <div><strong>You decide what to share.</strong><span>Review details before verification.</span></div>
          </div>
          <span className="welcome-example">Illustrative card · fictional student</span>
        </div>
      </section>
      <section id="students" className="welcome-students" aria-labelledby="students-title">
        <div>
          <p className="welcome-kicker">For students</p>
          <h2 id="students-title">Your student card, on your phone</h2>
          <p>Your university provides the wallet app and issues your card to it.</p>
        </div>
        <ol className="welcome-steps">
          <li><span>1</span><div><h3>Get the wallet</h3><p>Ask your university for its approved wallet app and installation instructions.</p></div></li>
          <li><span>2</span><div><h3>Receive your student card</h3><p>Create your PIN, then open your university’s invitation or scan its activation QR.</p></div></li>
          <li><span>3</span><div><h3>Share your details</h3><p>When a vendor or campus service shows a verification QR, scan it and approve the details you want to share.</p></div></li>
        </ol>
      </section>
      <section className="welcome-flows" aria-labelledby="flows-title">
        <h2 id="flows-title">What you can do with it</h2>
        <div className="welcome-flow-row">
          <ScanLine aria-hidden="true" />
          <div><h3>Student verification</h3><p>Scan a verification request, review the details it asks for and choose whether to share them.</p></div>
        </div>
        <div className="welcome-flow-row">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h3>Campus payments</h3>
            <p>Where your university has enabled payments, activate them in the wallet, scan a sale and confirm the amount.</p>
            <small>Payments are currently in test configuration. Live availability is subject to university and provider approval.</small>
          </div>
        </div>
      </section>
      <section className="welcome-audiences" id="vendors">
        <div>
          <p className="welcome-kicker">For vendors</p>
          <h2>Verify students at your business</h2>
          <p>Connect student verification to your website or point of sale, and request payment access for each branch.</p>
          <div className="welcome-actions">
            <Link className="welcome-button welcome-button-primary" href="/vendor/sign-up">Register your business</Link>
            <Link className="welcome-button welcome-button-secondary" href="/vendor/sign-in">Vendor log in</Link>
          </div>
        </div>
        <div>
          <p className="welcome-kicker">For university teams</p>
          <h2>Manage student credentials</h2>
          <p>Issue and manage student credentials through your university’s portal.</p>
          <div className="welcome-actions">
            <Link className="welcome-button welcome-button-primary" href="/sign-in">University staff log in</Link>
          </div>
        </div>
        <div>
          <p className="welcome-kicker">For family and sponsors</p>
          <h2>Send money to a student</h2>
          <p>Pay into a student’s wallet with their student number and surname. No account needed.</p>
          <div className="welcome-actions">
            <Link className="welcome-button welcome-button-primary" href="/fund">Fund a student</Link>
          </div>
        </div>
      </section>
    </main>
    <footer className="welcome-footer">
      <span className="welcome-wordmark">UNIFY</span>
      <span>Digital student identity for universities.</span>
    </footer>
  </div>;
}
