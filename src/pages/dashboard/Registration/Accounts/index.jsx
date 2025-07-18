import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { Route, Routes, Navigate } from 'react-router-dom';

import { useAuth } from '../../../../context/AuthContext';
import { db } from '../../../../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

import Customers from './Customers';
import Suppliers from './Suppliers';
import Banks from './Banks';
import AllAccounts from './AllAccounts';
import Expenses from './Expenses';
import Staff from './Staff';

export default function Index() {
    const { user } = useAuth(); // Get user role

    // Define states for all account types
    const [accounts, setAccounts] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [banks, setBanks] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Start loading
        setLoading(true);
        const colRef = collection(db, 'accounts');
        const unsubscribe = onSnapshot(
            colRef,
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                // Update all slices with real-time data
                setAccounts(data);
                setCustomers(data.filter(acc => acc.accountType === 'customer'));
                setSuppliers(data.filter(acc => acc.accountType === 'supplier'));
                setBanks(data.filter(acc => acc.accountType === 'bank'));
                setExpenses(data.filter(acc => acc.accountType === 'expenses'));
                setStaff(data.filter(acc => acc.accountType === 'staff'));
                setLoading(false);
            },
            (error) => {
                console.error('Error listening to accounts:', error);
                setLoading(false);
            }
        );

        // Cleanup on unmount
        return () => unsubscribe();
    }, []); // Run once on mount
    // Show loading spinner while data is being fetched
    if (loading) {
        return (
            <div className="vh-100 d-flex justify-content-center align-items-center">
                <Spin size="large" />
            </div>
        );
    }

    // Salesman role: Only access to customers page
    if (user.role.includes('salesman')) {
        return (
            <Routes>
                <Route path="customers" element={<Customers customers={customers} />} />
                <Route path="*" element={<Navigate to="customers" replace />} />
            </Routes>
        );
    }

    // Admin & Manager roles: Access to all pages
    return (
        <Routes>
            <Route path="allaccounts" element={<AllAccounts accounts={accounts} />} />
            <Route path="customers" element={<Customers customers={customers} />} />
            <Route path="suppliers" element={<Suppliers suppliers={suppliers} />} />
            <Route path="banks" element={<Banks banks={banks} />} />
            <Route path="expenses" element={<Expenses expenses={expenses} />} />
            <Route path="staff" element={<Staff staff={staff} />} />
            <Route path="*" element={<Navigate to="allaccounts" replace />} />
        </Routes>
    );
}