import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import AccountManagement from "./Accounts";
import ProductManagement from "./Products";
import TankManagement from "./Tank";
import DispenserManagement from "./Dispensor";
import NozzleAttachmentManagement from "./Nozel";
import DipChartManagement from "./Dipchart";


const Index = () => {
    return (
        <Routes>
            <Route path="/accounts/*" element={<AccountManagement />} />
            <Route path="/products" element={<ProductManagement />} />
            <Route path="/tanks" element={<TankManagement />} />
            <Route path="/dispensers" element={<DispenserManagement />} />
            <Route path="/nozzle-attachments" element={<NozzleAttachmentManagement />} />
            <Route path="/dip-charts" element={<DipChartManagement />} />
        </Routes>
    );
};

export default Index;