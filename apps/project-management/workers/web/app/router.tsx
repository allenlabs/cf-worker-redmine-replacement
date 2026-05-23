import { QueryClient } from '@tanstack/react-query';
import { Link, createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routerWithQueryClient } from '@tanstack/react-router-with-query';
import { routeTree } from './routeTree.gen';

export function createRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient, user: null },
    defaultPreload: 'intent',
    // Wait ~300 ms before showing the pending UI so quick loads don't flash.
    defaultPendingMs: 300,
    defaultPendingComponent: () => (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        <span
          aria-hidden="true"
          className="inline-block w-4 h-4 mr-2 rounded-full border-2 border-gray-300 border-t-redmine-500 animate-spin"
        />
        Loading…
      </div>
    ),
    defaultErrorComponent: ({ error }: { error: unknown }) => (
      <div className="p-6 text-red-700">
        <h2 className="font-semibold">Something went wrong</h2>
        <pre className="mt-2 whitespace-pre-wrap text-xs">{String(error)}</pre>
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div className="max-w-lg mx-auto card p-8 text-center mt-12">
        <h2 className="text-lg font-semibold mb-2">Page not found</h2>
        <p className="text-sm text-gray-600 mb-4">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <Link to="/projects" className="btn-primary">
          ← Back to projects
        </Link>
      </div>
    ),
  });
  return routerWithQueryClient(router, queryClient);
}

// TanStack Start 1.168 plugin reads `getRouter` from the router entry file.
export const getRouter = createRouter;

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
