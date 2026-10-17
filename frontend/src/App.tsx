import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { Dashboard } from "./pages/Dashboard";
import { Workbench } from "./pages/Workbench";
import "./index.css";

export function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <TopNav />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workbench" element={<Workbench />} />
          <Route path="*" element={
            <div className="page-content">
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <h3>Page Not Found</h3>
                <p>The page you're looking for doesn't exist.</p>
              </div>
            </div>
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
