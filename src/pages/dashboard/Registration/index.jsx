import { Route, Routes } from "react-router-dom";
import AccountManagement from "./Accounts";
import ProductManagement from "./Products";
import TankManagement from "./Tank";
import DispenserManagement from "./Dispensor";
import NozzleAttachmentManagement from "./Nozel";
import DipChartManagement from "./Dipchart";
import TankDetails from "./TankDetails";
import NotFound from "../../../components/NotFound";

const Index = () => {
  return (
    <Routes>
      <Route
        path="/accounts/*"
        element={<AccountManagement key="accounts" />}
      />
      <Route path="/products" element={<ProductManagement key="products" />} />
      <Route
        path="/tank/:tankId"
        element={<TankDetails />}
        key="tank-details"
      />
      <Route path="/tanks" element={<TankManagement key="tanks" />} />
      <Route
        path="/dispensers"
        element={<DispenserManagement key="dispensers" />}
      />
      <Route
        path="/nozzle-attachments"
        element={<NozzleAttachmentManagement key="nozzle-attachments" />}
      />
      <Route
        path="/dip-charts"
        element={<DipChartManagement key="dip-charts" />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default Index;