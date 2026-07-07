
import { createRoot } from "react-dom/client";
import Login from "./app/login.tsx";
import "./styles/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

createRoot(rootElement).render(<Login />);
