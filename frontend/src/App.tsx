import { Routes, Route } from "react-router-dom";
import { PartsView } from "./pages/PartsView";

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<PartsView />} />
            {/* Future pages go here, e.g. <Route path="/approvals" element={<ApprovalsView />} /> */}
        </Routes>
    );
}
