import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home }          from "./pages/Home";
import Dashboard         from "./pages/Dashboard";
import { SharedBrain }   from "./pages/SharedBrain";
import { SharedBrainView } from "./pages/SharedBrainView";
import EvalHarness       from "./pages/EvalHarness";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"           element={<Home />} />
        <Route path="/dashboard"  element={<Dashboard />} />
        <Route path="/brain/view" element={<SharedBrainView />} />
        <Route path="/brain/:hash" element={<SharedBrain />} />
        {/* Research / evaluation page — navigate to /eval */}
        <Route path="/eval"       element={<EvalHarness />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
