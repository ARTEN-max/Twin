import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useRecordings } from '../use-recordings';
import * as api from '@/lib/api';

vi.mock('@/lib/api');
vi.mock('@/lib/auth', () => ({
  useUserId: () => 'test-user-id',
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useRecordings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch recordings', async () => {
    const mockRecordings = {
      data: [
        { id: '1', title: 'Recording 1', userId: 'test-user-id' },
        { id: '2', title: 'Recording 2', userId: 'test-user-id' },
      ],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      success: true,
    } as Awaited<ReturnType<typeof api.getRecordings>>;

    vi.mocked(api.getRecordings).mockResolvedValue(mockRecordings);

    const { result } = renderHook(() => useRecordings(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockRecordings);
  });
});
