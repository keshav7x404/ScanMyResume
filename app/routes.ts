import { createBrowserRouter } from "react-router-dom";
import React from "react";
import Layout, { ErrorBoundary } from "./root";
import Home from "./routes/home";
import Auth from "./routes/auth";
import Upload from "./routes/upload";
import Resume from "./routes/resume";
import WipeApp from "./routes/wipe";

// On GitHub Pages the app is served under /<repo>/, not /. Without this
// basename every URL 404s inside the router (which is exactly the "Oops"
// the live site showed — a thrown 404 Response, not an Error).
const baseUrl: string = import.meta.env.BASE_URL ?? "/";
const basename = baseUrl.length > 1 ? baseUrl.replace(/\/+$/, "") : "/";

const router = createBrowserRouter(
  [
    {
      element: React.createElement(Layout),
      errorElement: React.createElement(ErrorBoundary),
      children: [
        { path: "/", element: React.createElement(Home) },
        { path: "/auth", element: React.createElement(Auth) },
        { path: "/upload", element: React.createElement(Upload) },
        { path: "/resume/:id", element: React.createElement(Resume) },
        { path: "/wipe", element: React.createElement(WipeApp) },
      ],
    },
  ],
  { basename }
);

export default router;
