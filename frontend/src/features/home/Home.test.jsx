/** Verify landing copy and shared navigation using real in-memory routing. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Home from './Home';
import { Header } from '../../components/Header';

/**
 * Expose the current route as visible test feedback.
 * Returns:
 *   A status element containing the router's pathname.
 */
function LocationFeedback() {
  const { pathname } = useLocation();
  return (
    <output aria-label="Current route">
      {pathname}
    </output>
  );
}

/**
 * Render a component with navigation feedback and forward-compatible routing.
 * Args:
 *   element: The home or header component under test.
 *   route: The initial public pathname.
 * Returns:
 *   The testing-library render result.
 */
function renderAt(element, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {element}
      <LocationFeedback />
    </MemoryRouter>,
  );
}

const expectedFeatures = [
  ['💡', 'Innovation', 'Work on cutting-edge projects that push boundaries and shape the future of technology.'],
  ['📈', 'Career Growth', 'Clear career paths, mentorship programs, and continuous learning opportunities for every team member.'],
  ['🤝', 'Great Culture', 'A diverse, inclusive workplace where collaboration and creativity thrive every day.'],
  ['🌍', 'Global Impact', "Your work reaches millions of users worldwide, making a real difference in people's lives."],
];

describe('Home', () => {
  it('renders the exact hero and closing call to action with semantic headings', () => {
    renderAt(
      <Home />,
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Build Your Future With Us' })).toBeVisible();
    expect(screen.getByText("Join a team that values innovation, collaboration, and growth. We're looking for talented people like you.")).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Why Join Us?' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Ready to take the next step?' })).toBeVisible();
  });

  it('renders exactly four supplied cards with decorative emoji icons', () => {
    renderAt(
      <Home />,
    );
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(4);
    expectedFeatures.forEach(([icon, title, description], index) => {
      expect(within(cards[index]).getByRole('heading', { level: 3, name: title })).toBeVisible();
      expect(within(cards[index]).getByText(description)).toBeVisible();
      expect(within(cards[index]).getByText(icon)).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it.each(['Express Your Interest', 'Apply Now'])('navigates to /apply through %s', async (name) => {
    const user = userEvent.setup();
    renderAt(
      <Home />,
    );
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', '/apply');
    await user.click(link);
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/apply');
  });

  it('does not expose forms or administrator controls in the landing slice', () => {
    renderAt(
      <Home />,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit Application' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Submissions Dashboard' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});

describe('Header', () => {
  it.each([
    ['/', 'Home'],
    ['/apply', 'Apply'],
    ['/admin', 'Admin'],
  ])('marks only %s as the active navigation destination', (route, activeName) => {
    renderAt(
      <Header authenticated={false} onLogout={vi.fn()} />,
      route,
    );
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    for (const name of ['Home', 'Apply', 'Admin']) {
      const link = within(nav).getByRole('link', { name });
      if (name === activeName) {
        expect(link).toHaveAttribute('aria-current', 'page');
      } else {
        expect(link).not.toHaveAttribute('aria-current');
      }
    }
  });

  it('marks no navigation link active at an unknown pathname', () => {
    renderAt(
      <Header authenticated={false} onLogout={vi.fn()} />,
      '/unknown',
    );
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current');
    }
  });

  it.each([
    ['Apply', '/apply'],
    ['Admin', '/admin'],
    ['Home', '/'],
    ['HireHub', '/'],
    ['Login', '/admin'],
  ])('follows the %s route without invoking logout', async (name, route) => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderAt(
      <Header authenticated={false} onLogout={onLogout} />,
      '/apply',
    );
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name, exact: true }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(route);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('shows Logout instead of Login and calls the owner callback on click', async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderAt(
      <Header authenticated onLogout={onLogout} />,
      '/admin',
    );
    expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Logout' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('defaults an omitted authenticated flag to logged out', () => {
    renderAt(
      <Header onLogout={vi.fn()} />,
    );
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/admin');
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });
});
