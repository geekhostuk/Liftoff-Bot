import { Link } from 'react-router-dom';
import './Privacy.css';

export default function Privacy() {
  return (
    <div className="privacy-page">
      <h1><span className="accent">Privacy</span> Policy</h1>
      <p className="privacy-updated">Last updated: 30 March 2026</p>

      <section className="privacy-section">
        <h2>Who We Are</h2>
        <p>
          JMT FPV League is a community-run FPV drone racing competition operated
          through the <a href="https://store.steampowered.com/app/410340/Liftoff_FPV_Drone_Racing/" target="_blank" rel="noopener noreferrer">Liftoff</a> simulator.
          The service is hosted in the United Kingdom. This policy explains what
          data we collect, why, and how we handle it.
        </p>
      </section>

      <section className="privacy-section">
        <h2>What Data We Collect</h2>

        <table className="privacy-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Source</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Steam nickname</td>
              <td>Liftoff game server</td>
              <td>Identify pilots in leaderboards and race results</td>
            </tr>
            <tr>
              <td>Steam ID</td>
              <td>Liftoff game server</td>
              <td>Link race sessions to the same pilot across nickname changes</td>
            </tr>
            <tr>
              <td>Lap times &amp; race results</td>
              <td>Liftoff game server</td>
              <td>Competition scoring and leaderboards</td>
            </tr>
            <tr>
              <td>Email address</td>
              <td>Registration form (optional)</td>
              <td>Account verification and password resets</td>
            </tr>
            <tr>
              <td>Password</td>
              <td>Registration form (optional)</td>
              <td>Account authentication (stored as a bcrypt hash, never in plain text)</td>
            </tr>
            <tr>
              <td>IP address hash</td>
              <td>Comments &amp; tag votes</td>
              <td>Rate limiting and spam prevention (one-way hash, not reversible)</td>
            </tr>
          </tbody>
        </table>

        <p>
          <strong>Gameplay data</strong> (nickname, lap times, race results) is collected
          automatically when you fly on the league server. You do not need to register
          an account to race &mdash; registration is optional and provides additional
          features such as priority lobby access.
        </p>
      </section>

      <section className="privacy-section">
        <h2>What Is Publicly Visible</h2>
        <p>The following data is visible to anyone visiting this website:</p>
        <ul>
          <li>Your Steam nickname</li>
          <li>Your lap times, race results, and competition standings</li>
        </ul>
        <p>
          Your email address, password, and IP hash are <strong>never</strong> publicly
          displayed or shared.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Legal Basis for Processing</h2>
        <p>We process your data under the following legal bases (UK GDPR):</p>
        <ul>
          <li>
            <strong>Legitimate interest</strong> &mdash; Processing gameplay data
            (nicknames, lap times, race results) is necessary to operate the competition.
            This is the core purpose of the league and what pilots expect when joining
            the server.
          </li>
          <li>
            <strong>Consent</strong> &mdash; When you register an account, you consent
            to us storing your email address for account management. You can withdraw
            consent by requesting account deletion.
          </li>
        </ul>
      </section>

      <section className="privacy-section">
        <h2>Cookies</h2>
        <p>
          We use a single, essential cookie (<code>liftoff_user</code>) to keep you
          logged in after you sign in. This cookie is only set when you actively log
          in, is <strong>httpOnly</strong> (not accessible to JavaScript), and is
          strictly necessary for session management. We do not use any advertising or
          third-party tracking cookies.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Analytics</h2>
        <p>
          We use <a href="https://umami.is/" target="_blank" rel="noopener noreferrer">Umami</a>,
          a privacy-focused analytics tool, to understand how the site is used. Umami
          does not use cookies, does not collect personal data, and does not track
          individual users across sessions. All data is aggregated and anonymous.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Data Sharing</h2>
        <p>
          We do not sell, rent, or share your personal data with any third parties.
          Gameplay data originates from the Liftoff game and is processed solely for
          the purpose of running the competition.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Data Retention</h2>
        <ul>
          <li>
            <strong>Race data</strong> (nicknames, lap times, results) is retained
            indefinitely to maintain competition history and leaderboards.
          </li>
          <li>
            <strong>Account data</strong> (email, password hash) is retained until
            you request account deletion.
          </li>
          <li>
            <strong>IP hashes</strong> are retained for rate-limiting purposes and
            cannot be reversed to recover your IP address.
          </li>
        </ul>
      </section>

      <section className="privacy-section">
        <h2>Your Rights</h2>
        <p>
          Under the UK General Data Protection Regulation (UK GDPR) and the Data
          Protection Act 2018, you have the right to:
        </p>
        <ul>
          <li><strong>Access</strong> the personal data we hold about you</li>
          <li><strong>Rectify</strong> inaccurate data</li>
          <li><strong>Erase</strong> your personal data (right to be forgotten)</li>
          <li><strong>Restrict</strong> processing in certain circumstances</li>
          <li><strong>Data portability</strong> &mdash; receive your data in a portable format</li>
          <li><strong>Object</strong> to processing based on legitimate interest</li>
        </ul>
        <p>
          These rights apply regardless of where you are located. If you are based
          in the EU, the EU GDPR provides equivalent rights. Pilots in other countries
          may have additional rights under their local data protection laws.
        </p>
      </section>

      <section className="privacy-section">
        <h2>International Users</h2>
        <p>
          This service is hosted in the United Kingdom. By using the league server
          or this website, your data is processed in the UK under UK data protection
          law. The UK GDPR provides a high standard of data protection that we apply
          to all users regardless of location.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Children</h2>
        <p>
          We do not knowingly collect personal data from children under the age of 13.
          The Liftoff game is the data source for gameplay information, and we rely on
          Steam&rsquo;s age verification. If you believe a child&rsquo;s data has been
          collected, please contact us for removal.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Contact</h2>
        <p>
          To exercise any of your rights, request data access, or ask for account
          deletion, please reach out through the <Link to="/about">About</Link> page
          or contact the league administrator directly on the Liftoff game server.
        </p>
      </section>

      <section className="privacy-section">
        <h2>Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. Changes will be posted on this
          page with an updated &ldquo;last updated&rdquo; date. Continued use of the
          service after changes constitutes acceptance of the revised policy.
        </p>
      </section>
    </div>
  );
}
