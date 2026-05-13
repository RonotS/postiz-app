const painPoints = [
  'You spend hours posting but still feel invisible.',
  'You struggle to keep content consistent every day.',
  'You do not know which tweets actually drive signups.',
];

const featureCards = [
  {
    title: 'Viral Inspiration Feed',
    description:
      'Browse high-performing posts by niche, format, and audience type so ideas never run dry.',
  },
  {
    title: 'AI Writing Studio',
    description:
      'Generate hooks, rewrite drafts, and turn one concept into tweet threads in seconds.',
  },
  {
    title: 'Scheduling and Queue',
    description:
      'Plan 2-4 weeks of content and auto-publish at times with the highest engagement probability.',
  },
  {
    title: 'Growth Automations',
    description:
      'Auto DM, evergreen reposting, and auto-plug workflows keep your best content converting.',
  },
  {
    title: 'Conversion Analytics',
    description:
      'Track follower growth, profile visits, and click-through behavior to focus on what moves pipeline.',
  },
  {
    title: 'Mini CRM for X Leads',
    description:
      'Save prospects from replies and mentions, then track touchpoints before they become customers.',
  },
];

const outcomes = [
  { metric: '4.3x', label: 'more weekly impressions (median)' },
  { metric: '62%', label: 'faster content production' },
  { metric: '29%', label: 'higher profile-to-lead conversion' },
  { metric: '11h', label: 'saved per week per creator' },
];

const testimonialCards = [
  {
    name: 'Mia Romero',
    handle: '@miagrowth',
    text: 'Tweetmax gave us a predictable growth engine. We now batch 30 days of content in one afternoon.',
  },
  {
    name: 'Jonas Reed',
    handle: '@buildwithjonas',
    text: 'The automation and analytics stack made X finally feel like a real acquisition channel.',
  },
  {
    name: 'Nina Shah',
    handle: '@ninashahco',
    text: 'I replaced three tools. Our team writes faster, posts smarter, and closes more inbound leads.',
  },
];

const faqs = [
  {
    q: 'Is this connected to app.tweetmax.com?',
    a: 'Yes. This page is designed as the marketing funnel for your app at app.tweetmax.com.',
  },
  {
    q: 'Can I deploy this on Railway?',
    a: 'Yes. The app is isolated in apps/landingpage and ready for standalone Railway deployment.',
  },
  {
    q: 'Can I swap this copy with production copy?',
    a: 'Absolutely. All current text is mock and intentionally structured for fast replacement.',
  },
  {
    q: 'Does Tweetmax support beginners?',
    a: 'Yes. The workflow is designed to guide new users from ideation to consistent publishing and optimization.',
  },
];

export default function HomePage() {
  return (
    <main className="page">
      <header className="nav">
        <div className="container nav-inner">
          <div className="logo">Tweetmax</div>
          <nav className="nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="https://app.tweetmax.com" className="btn btn-ghost">
              Log in
            </a>
            <a href="https://app.tweetmax.com" className="btn btn-primary pulse">
              Start free
            </a>
          </nav>
        </div>
      </header>

      <section className="hero container">
        <div className="pill float">
          The all-in-one X growth funnel for creators and brands
        </div>
        <h1>
          Build authority on X, attract ideal buyers, and convert attention into
          revenue with Tweetmax.
        </h1>
        <p>
          Stop guessing what to post. Tweetmax helps you discover winning ideas,
          publish consistently, automate follow-ups, and turn engagement into
          leads.
        </p>
        <div className="hero-cta">
          <a href="https://app.tweetmax.com" className="btn btn-primary btn-lg pulse">
            Start 7-day free trial
          </a>
          <a href="#how-it-works" className="btn btn-ghost btn-lg">
            See the funnel
          </a>
        </div>
        <div className="proof-strip">
          <span>7-day free trial</span>
          <span>No credit card required</span>
          <span>Cancel anytime</span>
          <span>Made for app.tweetmax.com</span>
        </div>
        <div className="hero-mock card glow">
          <p className="mock-label">Live Funnel Snapshot</p>
          <div className="mock-grid">
            <div>
              <strong>22.4k</strong>
              <span>Impressions</span>
            </div>
            <div>
              <strong>1,180</strong>
              <span>Profile visits</span>
            </div>
            <div>
              <strong>214</strong>
              <span>Leads captured</span>
            </div>
            <div>
              <strong>$18.7k</strong>
              <span>Attributed pipeline</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container section">
        <h2>The growth bottlenecks most X accounts face</h2>
        <div className="pain-grid">
          {painPoints.map((pain) => (
            <article key={pain} className="card">
              <h3>Problem</h3>
              <p>{pain}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container section cta-strip">
        <h2>Tweetmax fixes this with a full-funnel workflow</h2>
        <p>
          Capture attention at the top, nurture in the middle, and convert at
          the bottom with one connected system.
        </p>
        <a href="https://app.tweetmax.com" className="btn btn-primary btn-lg pulse">
          Build my X funnel
        </a>
      </section>

      <section id="features" className="container section">
        <h2>A complete X growth stack in one modern platform</h2>
        <p className="section-subtitle">
          Everything from ideation to conversion, built to scale your posting
          output and ROI.
        </p>
        <div className="feature-grid">
          {featureCards.map((feature) => (
            <article key={feature.title} className="card hover-lift">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="container section workflow">
        <h2>The Tweetmax funnel: attract, engage, convert</h2>
        <div className="workflow-grid">
          <article className="workflow-step hover-lift">
            <span>01</span>
            <h3>Attract the right audience</h3>
            <p>
              Discover high-performing angles and generate posts that pull your
              ideal audience into your profile.
            </p>
          </article>
          <article className="workflow-step hover-lift">
            <span>02</span>
            <h3>Engage at scale</h3>
            <p>
              Use scheduling and smart automations so every reply, mention, and
              interaction becomes a relationship opportunity.
            </p>
          </article>
          <article className="workflow-step hover-lift">
            <span>03</span>
            <h3>Convert to leads and sales</h3>
            <p>
              Track outcomes, identify high-converting posts, and route warm
              prospects into your offer funnel.
            </p>
          </article>
        </div>
      </section>

      <section className="container section">
        <h2>Expected outcomes with consistent execution</h2>
        <div className="outcome-grid">
          {outcomes.map((outcome) => (
            <article key={outcome.label} className="card glow hover-lift">
              <h3 className="outcome-metric">{outcome.metric}</h3>
              <p>{outcome.label}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container section">
        <h2>What teams say after switching to Tweetmax</h2>
        <div className="testimonial-grid">
          {testimonialCards.map((item) => (
            <article key={item.handle} className="card testimonial hover-lift">
              <p>"{item.text}"</p>
              <div>
                <strong>{item.name}</strong>
                <span>{item.handle}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="container section pricing">
        <h2>Choose your growth speed</h2>
        <div className="pricing-grid">
          <article className="pricing-card hover-lift">
            <p className="pricing-plan">Starter</p>
            <p className="pricing-amount">
              $29<span>/month</span>
            </p>
            <ul>
              <li>Idea feed and AI writing tools</li>
              <li>Scheduling and calendar</li>
              <li>Basic analytics</li>
            </ul>
            <a href="https://app.tweetmax.com" className="btn btn-ghost btn-lg">
              Start Starter
            </a>
          </article>
          <article className="pricing-card featured hover-lift">
            <p className="pricing-plan">Growth (Most Popular)</p>
            <p className="pricing-amount">
              $79<span>/month</span>
            </p>
            <ul>
              <li>Everything in Starter</li>
              <li>Advanced automations and DM flows</li>
              <li>Conversion analytics and funnel tracking</li>
              <li>Lead CRM and team collaboration</li>
            </ul>
            <a href="https://app.tweetmax.com" className="btn btn-primary btn-lg pulse">
              Start 7-day free trial
            </a>
          </article>
        </div>
      </section>

      <section id="faq" className="container section">
        <h2>Frequently asked questions</h2>
        <div className="faq-list">
          {faqs.map((item) => (
            <article key={item.q} className="faq-item">
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container section cta">
        <h2>Ready to make app.tweetmax.com your conversion engine?</h2>
        <p>
          If your goal is to grow audience and revenue from X, Tweetmax gives
          you the full system in one place.
        </p>
        <a href="https://app.tweetmax.com" className="btn btn-primary btn-lg pulse">
          Open app.tweetmax.com
        </a>
      </section>

      <footer className="footer">
        <div className="container footer-inner">
          <span>© {new Date().getFullYear()} Tweetmax</span>
          <div>
            <a href="https://app.tweetmax.com">App</a>
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
