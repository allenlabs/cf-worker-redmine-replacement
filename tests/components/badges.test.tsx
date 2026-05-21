import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PriorityBadge,
  ProgressBar,
  StatusBadge,
  TrackerBadge,
} from '~/components/badges';

describe('StatusBadge', () => {
  it('renders the name and applies the color', () => {
    render(<StatusBadge name="New" color="#abcdef" />);
    const el = screen.getByText('New');
    expect(el).toBeInTheDocument();
    expect(el).toHaveStyle({ backgroundColor: '#abcdef' });
  });

  it('dims when closed', () => {
    render(<StatusBadge name="Closed" color="#fff" closed />);
    expect(screen.getByText('Closed').className).toContain('opacity-75');
  });
});

describe('PriorityBadge', () => {
  it('renders the name and color', () => {
    render(<PriorityBadge name="High" color="#ff0000" />);
    expect(screen.getByText('High')).toHaveStyle({ backgroundColor: '#ff0000' });
  });
});

describe('TrackerBadge', () => {
  it('renders the name with the tracker color and white text', () => {
    render(<TrackerBadge name="Bug" color="#900" />);
    expect(screen.getByText('Bug')).toHaveStyle({ backgroundColor: '#900', color: 'white' });
  });
});

describe('ProgressBar', () => {
  it('clamps below 0', () => {
    const { container } = render(<ProgressBar value={-10} />);
    const inner = container.querySelector('div > div') as HTMLElement;
    expect(inner.style.width).toBe('0%');
  });

  it('clamps above 100', () => {
    const { container } = render(<ProgressBar value={250} />);
    const inner = container.querySelector('div > div') as HTMLElement;
    expect(inner.style.width).toBe('100%');
  });

  it('sets exact width for in-range values', () => {
    const { container } = render(<ProgressBar value={42} />);
    const inner = container.querySelector('div > div') as HTMLElement;
    expect(inner.style.width).toBe('42%');
  });
});
