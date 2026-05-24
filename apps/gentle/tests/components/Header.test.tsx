import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className, ...rest }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className} {...rest}>
      {children}
    </a>
  ),
}));

import { render, screen } from '@testing-library/react';
import { Header } from '~/components/Header';

describe('Header', () => {
  it('renders the logo + nav links', () => {
    render(<Header />);
    expect(screen.getByTestId('header-logo')).toBeTruthy();
    expect(screen.getByTestId('nav-today')).toBeTruthy();
    expect(screen.getByTestId('nav-history')).toBeTruthy();
  });
});
