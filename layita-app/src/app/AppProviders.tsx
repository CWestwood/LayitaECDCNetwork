import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '../features/auth/AuthProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { reportError } from '../lib/diagnostics';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => reportError('query_failed', error, { queryKey: query.queryKey }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => reportError('mutation_failed', error, {
      mutationKey: mutation.options.mutationKey ?? null,
    }),
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: (failureCount, error) => {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (message.includes('permission') || message.includes('unauthorized') || message.includes('forbidden')) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
