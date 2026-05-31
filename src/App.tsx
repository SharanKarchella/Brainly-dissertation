import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import { SharedBrain } from "./pages/SharedBrain";
import { SharedBrainView } from "./pages/SharedBrainView";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/brain/view" element={<SharedBrainView />} />
        <Route path="/brain/:hash" element={<SharedBrain />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
