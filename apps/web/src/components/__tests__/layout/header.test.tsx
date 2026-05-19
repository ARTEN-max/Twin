import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../../layout/header';

const mockUsePathname = vi.fn(() => '/recordings');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('Header', () => {
  it('should render page title based on pathname', () => {
    render(<Header />);
    expect(screen.getByText('Recordings')).toBeInTheDocument();
  });

  it('should render default title for unknown routes', () => {
    mockUsePathname.mockReturnValue('/unknown');
    render(<Header />);
    expect(screen.getByText('Twin')).toBeInTheDocument();
  });
});
