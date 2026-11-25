import { Navigate, Routes, Route, Outlet } from "react-router-dom";
import { PartsView } from "./pages/PartsView";
import { FamilyFilesView } from "./pages/FamilyFilesView";
import { ConsoleView } from "./pages/ConsoleView";
import { DistintaView } from "./pages/DistintaView";
import { DistintaBomView } from "./pages/DistintaBomView";
import { PartsDataProvider } from "./data/PartsDataContext";

// Scopes the (large, slow) parts dataset fetch to just the routes that need it - without this
// layout, PartsDataProvider at the app root would fetch it on every page, including /console.
function PartsDataLayout() {
    return (
        <PartsDataProvider>
            <Outlet />
        </PartsDataProvider>
    );
}

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/parts-view" replace />} />
            <Route element={<PartsDataLayout />}>
                <Route path="/parts-view" element={<PartsView />} />
                <Route path="/parts-view/family/:family" element={<FamilyFilesView />} />
            </Route>
            <Route path="/console" element={<ConsoleView />} />
            <Route path="/distinta" element={<DistintaView />} />
            <Route path="/distinta-bom" element={<DistintaBomView />} />
            {/* Future pages go here, e.g. <Route path="/approvals" element={<ApprovalsView />} /> */}
        </Routes>
    );
}
