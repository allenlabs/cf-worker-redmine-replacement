import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Heatmap } from '~/components/Heatmap';

describe('Heatmap', () => {
  it('renders one cell per entry + bucket attribute', () => {
    render(
      <Heatmap
        cells={[
          { date: '2026-05-22', score: 5 },
          { date: '2026-05-23', score: 2 },
          { date: '2026-05-24', score: null },
        ]}
      />,
    );
    expect(screen.getByTestId('heatmap-cell-2026-05-22').getAttribute('data-bucket')).toBe('5');
    expect(screen.getByTestId('heatmap-cell-2026-05-23').getAttribute('data-bucket')).toBe('2');
    expect(screen.getByTestId('heatmap-cell-2026-05-24').getAttribute('data-bucket')).toBe('0');
  });
});
