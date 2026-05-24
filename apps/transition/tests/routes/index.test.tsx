import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
  createFileRoute: () => () => ({ Route: { useLoaderData: () => null } }),
  useRouter: () => ({ invalidate: () => {} }),
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    inputValidator: () => ({ handler: () => () => Promise.resolve(null) }),
    handler: () => () => Promise.resolve(null),
  }),
}));

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => null,
}));

import { render, screen } from '@testing-library/react';
import { EmptyLog } from '~/routes/index';

describe('EmptyLog', () => {
  it('renders empty copy', () => {
    render(<EmptyLog />);
    expect(screen.getByTestId('empty-log').textContent).toContain('No transition rituals yet');
  });
});
