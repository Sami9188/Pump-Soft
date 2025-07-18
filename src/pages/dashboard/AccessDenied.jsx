// src/pages/dashboard/AccessDenied.jsx
import React from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AccessDenied = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    return (
        <Result
            status="403"
            title="Access Denied"
            subTitle={`Sorry, you don't have permission to access this page. Your current role (${user?.role || 'Guest'}) doesn't have the required privileges.`}
            extra={
                <Button type="primary" onClick={() => navigate('/dashboard')}>
                    Back to Dashboard
                </Button>
            }
        />
    );
};

export default AccessDenied;