import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles/global.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Dashboard 根节点不存在");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
