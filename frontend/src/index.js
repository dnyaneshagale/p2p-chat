import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

if (process.env.NODE_ENV === "production") {
  const noop = () => {};
  ["log", "debug", "info", "warn", "error", "group", "groupEnd", "groupCollapsed", "table", "time", "timeEnd"].forEach(
    (method) => { console[method] = noop; }
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
