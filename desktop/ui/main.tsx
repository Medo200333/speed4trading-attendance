import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpeedConsole } from "../../src/components/speed-console";
import "../../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SpeedConsole />
  </StrictMode>,
);
