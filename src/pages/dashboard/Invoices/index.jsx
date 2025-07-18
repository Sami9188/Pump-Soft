import { Routes, Route } from 'react-router-dom';
import Purchase from './Purchase';
import PurchaseReturn from './PurchaseReturn';
import Sale from './Sales';
import SaleReturn from './SalesReturn';

const InvoiceRoutes = () => {
    return (
        <Routes>
            <Route path="/purchase" element={<Purchase />} />
            <Route path="/purchase-return" element={<PurchaseReturn />} />
            <Route path="/sale" element={<Sale />} />
            <Route path="/sale-return" element={<SaleReturn />} />
        </Routes>
    );
};

export default InvoiceRoutes;