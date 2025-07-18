import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    collection,
    getDocs,
    query,
    onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase'; // Adjust the path as needed
import { message } from 'antd'; // Optional: For displaying error messages

// Create a context for Firebase data
const FirebaseContext = createContext();

export const FirebaseDataProvider = ({ children }) => {
    // States for common collections
    const [products, setProducts] = useState([]);
    const [tanks, setTanks] = useState([]);
    const [readings, setReadings] = useState([]);
    const [nozzles, setNozzles] = useState([]);
    const [dipChartData, setDipChartData] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [salesInvoices, setSalesInvoices] = useState([]);
    const [salesReturnInvoices, setSalesReturnInvoices] = useState([]);
    const [purchaseInvoices, setPurchaseInvoices] = useState([]);
    const [receipts, setReceipts] = useState([]);
    const [discounts, setDiscounts] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [shiftWiseSummaries, setShiftWiseSummaries] = useState({});
    const [loading, setLoading] = useState(false);

    // Fetch common collections including shifts once on mount
    const fetchCollectionData = async () => {
        setLoading(true);
        try {
            const [productsSnapshot, tanksSnapshot, readingsSnapshot, nozzlesSnapshot, dipChartsSnapshot, shiftsSnapshot] = await Promise.all([
                getDocs(collection(db, 'products')),
                getDocs(collection(db, 'tanks')),
                getDocs(collection(db, 'readings')),
                getDocs(collection(db, 'nozzles')),
                getDocs(collection(db, 'dipcharts')),
                getDocs(collection(db, 'shifts')),
            ]);
            setProducts(productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setTanks(tanksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setReadings(readingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setNozzles(nozzlesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setDipChartData(dipChartsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setShifts(shiftsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            message.error("Failed to fetch collection data: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Fetch accounts from Firestore
    const fetchAccounts = async () => {
        try {
            const colRef = collection(db, 'accounts');
            const querySnapshot = await getDocs(colRef);
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAccounts(data);
        } catch (error) {
            console.error("Error fetching accounts:", error);
            message.error("Failed to fetch accounts: " + error.message);
        }
    };

    // Fetch Sales Invoices
    const fetchSalesInvoices = async () => {
        try {
            const snapshot = await getDocs(collection(db, 'saleInvoices'));
            setSalesInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            message.error("Failed to fetch sales invoices: " + error.message);
        }
    };

    // Fetch Sales Return Invoices
    const fetchSalesReturnInvoices = async () => {
        try {
            const snapshot = await getDocs(collection(db, 'saleReturnInvoices'));
            setSalesReturnInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            message.error("Failed to fetch sales return invoices: " + error.message);
        }
    };

    // Fetch Purchase Invoices (filtering out new purchases)
    const fetchPurchaseInvoices = async () => {
        try {
            const snapshot = await getDocs(collection(db, 'purchaseInvoices'));
            const filtered = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(inv => !inv.isNewPurchase);
            setPurchaseInvoices(filtered);
        } catch (error) {
            message.error("Failed to fetch purchase invoices: " + error.message);
        }
    };

    // Subscribe to Receipts in Real-Time
    useEffect(() => {
        const receiptsQuery = query(collection(db, 'receipts'));
        const unsubscribe = onSnapshot(
            receiptsQuery,
            snapshot => {
                const receiptsData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setReceipts(receiptsData);
            },
            error => {
                message.error("Failed to fetch receipts: " + error.message);
            }
        );
        return () => unsubscribe();
    }, []);

    // Subscribe to Discounts in Real-Time
    useEffect(() => {
        const discountsQuery = query(collection(db, 'discounts'));
        const unsubscribe = onSnapshot(
            discountsQuery,
            snapshot => {
                const discountsData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setDiscounts(discountsData);
            },
            error => {
                message.error("Failed to fetch discounts: " + error.message);
            }
        );
        return () => unsubscribe();
    }, []);

    // Compute shift-wise summaries
    useEffect(() => {
        if (shifts.length === 0 || receipts.length === 0 || discounts.length === 0) return;

        const summaries = {};

        shifts.forEach(shift => {
            const shiftId = shift.id;
            summaries[shiftId] = {
                wasooli: 0,
                odhar: 0,
                discounts: 0,
            };

            // Filter receipts for this shift
            const shiftReceipts = receipts.filter(r => r.shiftId === shiftId);
            const wasooliReceipts = shiftReceipts.filter(r => r.transactionType === 'wasooli');
            const odharReceipts = shiftReceipts.filter(r => r.transactionType === 'odhar');

            // Calculate totals
            summaries[shiftId].wasooli = wasooliReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
            summaries[shiftId].odhar = odharReceipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

            // Filter and calculate discounts for this shift
            const shiftDiscounts = discounts.filter(d => d.shiftId === shiftId);
            summaries[shiftId].discounts = shiftDiscounts.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
        });

        setShiftWiseSummaries(summaries);
    }, [shifts, receipts, discounts]);

    // Aggregate summaries across all shifts
    const aggregateShiftSummaries = (summaries) => {
        const totals = {
            wasooli: 0,
            odhar: 0,
            discounts: 0,
        };

        Object.values(summaries).forEach(summary => {
            totals.wasooli += summary.wasooli;
            totals.odhar += summary.odhar;
            totals.discounts += summary.discounts;
        });

        return totals;
    };

    const overallTotals = aggregateShiftSummaries(shiftWiseSummaries);

    // Fetch static data on mount
    useEffect(() => {
        fetchCollectionData();
        fetchAccounts();
        fetchSalesInvoices();
        fetchSalesReturnInvoices();
        fetchPurchaseInvoices();
    }, []);

    return (
        <FirebaseContext.Provider value={{
            products,
            tanks,
            readings,
            nozzles,
            dipChartData,
            accounts,
            salesInvoices,
            salesReturnInvoices,
            purchaseInvoices,
            receipts,
            discounts,
            shifts,
            shiftWiseSummaries,
            overallTotals,
            loading,
            fetchCollectionData,
            fetchAccounts,
            fetchSalesInvoices,
            fetchSalesReturnInvoices,
            fetchPurchaseInvoices,
        }}>
            {children}
        </FirebaseContext.Provider>
    );
};

// Custom hook for context access
export const useFirebaseData = () => {
    const context = useContext(FirebaseContext);
    if (!context) {
        throw new Error("useFirebaseData must be used within a FirebaseDataProvider");
    }
    return context;
};