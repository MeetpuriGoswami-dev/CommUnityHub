/**
 * App.tsx — TanStack Router + TanStack Query setup
 *
 * The actual routing tree is auto-generated in src/routeTree.gen.ts by the
 * TanStack Router Vite plugin from files in src/routes/.
 * Authentication & layout logic lives in src/routes/__root.tsx.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute default stale time
      retry: 1,
    },
  },
});

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  // basepath: import.meta.env.BASE_URL, // Uncomment if deploying to a subpath
  context: {},
});

// Register the router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
