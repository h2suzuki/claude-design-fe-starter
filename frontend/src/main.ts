import "./ui/tokens/tokens.css";
import { renderHomePage } from "./pages/home";

const app = document.getElementById("app");
if (!app) throw new Error("mount point #app not found");
renderHomePage(app);
