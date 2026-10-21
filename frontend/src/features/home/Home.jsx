/** Present the supplied employer culture message and interest entry points. */
import { Link } from 'react-router-dom';

const features = [
  {
    icon: '💡',
    title: 'Innovation',
    description: 'Work on cutting-edge projects that push boundaries and shape the future of technology.',
  },
  {
    icon: '📈',
    title: 'Career Growth',
    description: 'Clear career paths, mentorship programs, and continuous learning opportunities for every team member.',
  },
  {
    icon: '🤝',
    title: 'Great Culture',
    description: 'A diverse, inclusive workplace where collaboration and creativity thrive every day.',
  },
  {
    icon: '🌍',
    title: 'Global Impact',
    description: "Your work reaches millions of users worldwide, making a real difference in people's lives.",
  },
];

/**
 * Render the public landing page without application or administrator features.
 * Returns:
 *   The hero, four culture cards, and the closing interest link.
 */
export default function Home() {
  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <h1 id="hero-title">
            Build Your Future With Us
          </h1>
          <p className="hero-subtitle">
            Join a team that values innovation, collaboration, and growth. We're looking for talented people like you.
          </p>
          <Link className="cta-link" to="/apply">
            Express Your Interest
          </Link>
        </div>
      </section>
      <section className="features-section" aria-labelledby="features-title">
        <h2 id="features-title">
          Why Join Us?
        </h2>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <span className="feature-icon" aria-hidden="true">
                {feature.icon}
              </span>
              <h3>
                {feature.title}
              </h3>
              <p>
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="bottom-cta" aria-labelledby="next-step-title">
        <h2 id="next-step-title">
          Ready to take the next step?
        </h2>
        <Link className="cta-link" to="/apply">
          Apply Now
        </Link>
      </section>
    </main>
  );
}
