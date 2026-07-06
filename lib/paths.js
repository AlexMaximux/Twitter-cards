import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const packageRoot = join(__dirname, "..");
export const defaultPreviewHtml = join(packageRoot, "assets", "preview.html");
