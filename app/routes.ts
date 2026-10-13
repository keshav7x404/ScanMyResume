import { createBrowserRouter } from "react-router-dom";
import React from "react";
import Layout, { ErrorBoundary } from "./root";
import Home from "./routes/home";
import Auth from "./routes/auth";
import Upload from "./routes/upload";
import Resume from "./routes/resume";
import WipeApp from "./routes/wipe";

const router = createBrowserRouter([
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
]);

export default router;
