import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/Loader";

const LoadingSpinner = () => (
    <div className="min-vh-100 loading-spinner d-flex justify-content-center align-items-center">
        <Loader />
    </div>
);

export default function PrivateRoute({ component: Component, allowedRoles = [], redirectPath = "/" }) {
    const { user } = useAuth();
    const location = useLocation();
    const [isAllowed, setIsAllowed] = useState(null);
    const [userRole, setUserRole] = useState(null);

    useEffect(() => {
        if (!user) {
            setIsAllowed(false);
            return;
        }

        const fetchUserRole = async () => {
            try {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const role = userSnap.data().role;
                    setUserRole(role);

                    if (Array.isArray(role)) {
                        setIsAllowed(role.some(r => allowedRoles.includes(r)));
                    } else {
                        setIsAllowed(allowedRoles.includes(role));
                    }
                } else {
                    console.error("User document doesn't exist in Firestore");
                    setIsAllowed(false);
                }
            } catch (error) {
                console.error("Error fetching user role:", error);
                setIsAllowed(false);
            }
        };

        fetchUserRole();
    }, [user, allowedRoles]);

    if (isAllowed === null) {
        return <LoadingSpinner />;
    }

    if (!isAllowed) {
        return <Navigate to={redirectPath} state={{ from: location }} />;
    }

    return <Component userRole={userRole} />;
}
