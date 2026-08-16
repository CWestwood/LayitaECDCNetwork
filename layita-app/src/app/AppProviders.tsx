import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '../features/auth/AuthProvider';
import { ErrorBoundary } from './ErrorBoundary';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
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
