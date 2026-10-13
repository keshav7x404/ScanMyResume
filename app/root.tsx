import { Outlet, useRouteError } from "react-router-dom";
import { useEffect } from "react";
import { usePuterStore } from "~/lib/puter";
import "./app.css";

export default function App() {
  const { init } = usePuterStore();

  useEffect(() => {
    init();
  }, []);

  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>Oops!</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
