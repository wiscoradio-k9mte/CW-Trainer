import { createRoot } from "react-dom/client";
import CWTrainer from "../wr-cw-trainer.jsx";

// No React.StrictMode here on purpose: in dev it double-invokes effects, which
// would spin up the Web Audio engine twice and can leave a stray tone or noise
// loop running. The app is an audio instrument first — a single, clean mount
// matters more than the dev-only double-render check.
createRoot(document.getElementById("root")).render(<CWTrainer />);
