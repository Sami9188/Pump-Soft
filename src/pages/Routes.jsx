import React from "react";
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Dashboard from "./dashboard";
import Auth from "./auth";
import NotFound from "../components/NotFound";
import { useAuth } from '../context/AuthContext';
import Loader from "../components/Loader";

export default function Index() {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="d-flex justify-content-center align-items-center" style={{ height: "100vh" }}><Loader /></div>;
    }

    // Only redirect if the current path is exactly "/"
    if (location.pathname === "/") {
        return (
            <Navigate to={user ? "/dashboard" : "/auth/login"} replace />
        );
    }

    return (
        <Routes>
            {/* Auth route: if already logged in, redirect to dashboard */}
            <Route
                path="/auth/*"
                element={!user ? <Auth /> : <Navigate to="/dashboard" replace />}
            />

            {/* Dashboard route: if not logged in, redirect to login */}
            <Route
                path="/dashboard/*"
                element={user ? <Dashboard /> : <Navigate to="/auth/login" replace />}
            />

            {/* Other routes should render correctly */}
            <Route
                path="*"
                element={<NotFound />}
            />
        </Routes>
    );
}
