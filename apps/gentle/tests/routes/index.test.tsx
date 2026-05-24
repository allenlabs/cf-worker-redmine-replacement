import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  createFileRoute: () => () => ({}),
  useRouter: () => ({ invalidate: () => {} }),
}));

import { render, screen } from '@testing-library/react';
import { GentleHint } from '~/routes/index';

describe('GentleHint', () => {
  it('shows the "you checked in" hint', () => {
    render(<GentleHint hasToday={true} />);
    expect(screen.getByTestId('checked-in-hint')).toBeTruthy();
    expect(screen.queryByTestId('not-yet-hint')).toBeNull();
  });
  it('shows the "no pressure" hint', () => {
    render(<GentleHint hasToday={false} />);
    expect(screen.getByTestId('not-yet-hint')).toBeTruthy();
    expect(screen.queryByTestId('checked-in-hint')).toBeNull();
  });
});
