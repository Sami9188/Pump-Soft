import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import PrivateRoute from "../private/PrivateRoute";
import DashboardLayout from "./DashboardLayout";

import "react-datepicker/dist/react-datepicker.css";
// Import dashboard pages
import DashboardHome from "./Home";
import AccessDenied from "./AccessDenied";
import Settings from "./Settings";
import UserManagement from "./Users"
import Registration from "./Registration"
import Invoices from "./Invoices"
import DailyReport from "./DailyReport"
import AccountDetails from "./Account"
import TankDetails from "./TankDetails"
import Bills from "./Bills";
import CashflowPage from "./CashInOut";


export default function Dashboard() {
    const { user } = useAuth();

    // If user is not authenticated, redirect to login
    if (!user) {
        return <Navigate to="/auth/login" replace />;
    }

    return (
        <DashboardLayout>
            <Routes>
                {/* Dashboard Home */}
                {/* <Route index element={<DashboardHome />} /> */}

                {/* Common routes */}
                {/* <Route path="settings" element={<Settings />} /> */}

                <Route
                    index
                    element={
                        <PrivateRoute
                            component={DashboardHome}
                            allowedRoles={["admin", "manager"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />
                <Route
                    path="settings"
                    element={
                        <PrivateRoute
                            component={Settings}
                            allowedRoles={["admin"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />

                {/* Reports Section */}
                <Route
                    path="daily-report"
                    element={
                        <PrivateRoute
                            component={DailyReport}
                            allowedRoles={["manager", "admin"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />
                <Route
                    path="registration/*"
                    element={
                        <PrivateRoute
                            component={Registration}
                            allowedRoles={["admin", "manager", "salesman"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />
                <Route
                    path="invoices/*"
                    element={
                        <PrivateRoute
                            component={Invoices}
                            allowedRoles={["admin"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />

                {/* Admin-only route */}
                <Route
                    path="user-management"
                    element={
                        <PrivateRoute
                            component={UserManagement}
                            allowedRoles={["admin"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />
                <Route
                    path="bills"
                    element={
                        <PrivateRoute
                            component={Bills}
                            allowedRoles={["admin", "manager", "salesman"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />
                <Route
                    path="cashflow"
                    element={
                        <PrivateRoute
                            component={CashflowPage}
                            allowedRoles={["admin"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />

                <Route
                    path="account-details/:accountId"
                    element={
                        <PrivateRoute
                            component={AccountDetails}
                            allowedRoles={["admin"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />

                <Route
                    path="tank-details/:tankId"
                    element={
                        <PrivateRoute
                            component={TankDetails}
                            allowedRoles={["admin", "manager"]}
                            redirectPath="/dashboard/access-denied"
                        />
                    }
                />

                {/* Access Denied */}
                <Route path="access-denied" element={<AccessDenied />} />

                {/* Catch all for undefined routes */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </DashboardLayout>
    );
}