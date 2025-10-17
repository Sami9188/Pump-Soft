import { useState, useEffect } from 'react';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import TimezoneService from '../services/timezoneService';

const useCashflow = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const cashflowCollection = collection(db, 'cashflow');

    // Create a new transaction
    const createTransaction = async (transactionData) => {
        try {
            setLoading(true);
            setError(null);

            const newTransaction = {
                amount: transactionData.amount,
                type: transactionData.type, // 'cashin' or 'cashout'
                createdAt: serverTimestamp(), // Firebase server timestamp
                updatedAt: serverTimestamp(), // Firebase server timestamp
                ...transactionData // Spread any additional fields
            };

            const docRef = await addDoc(cashflowCollection, newTransaction);

            return {
                success: true,
                id: docRef.id,
                data: { ...newTransaction, id: docRef.id }
            };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    // Update an existing transaction
    const updateTransaction = async (transactionId, updateData) => {
        try {
            setLoading(true);
            setError(null);

            const transactionRef = doc(db, 'cashflow', transactionId);
            const updatedData = {
                ...updateData,
                updatedAt: serverTimestamp() // Firebase server timestamp
            };

            await updateDoc(transactionRef, updatedData);

            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    // Delete a transaction
    const deleteTransaction = async (transactionId) => {
        try {
            setLoading(true);
            setError(null);

            const transactionRef = doc(db, 'cashflow', transactionId);
            await deleteDoc(transactionRef);

            return { success: true };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    // Get all transactions (one-time fetch)
    const getAllTransactions = async () => {
        try {
            setLoading(true);
            setError(null);

            const q = query(cashflowCollection, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            const transactionsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setTransactions(transactionsData);
            return { success: true, data: transactionsData };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    // Real-time listener for transactions
    const subscribeToTransactions = () => {
        const q = query(cashflowCollection, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q,
            (querySnapshot) => {
                const transactionsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setTransactions(transactionsData);
                setLoading(false);
            },
            (err) => {
                setError(err.message);
                setLoading(false);
            }
        );

        return unsubscribe;
    };

    // Calculate totals
    const calculateTotals = () => {
        const cashIn = transactions
            .filter(t => t.type === 'cashin')
            .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

        const cashOut = transactions
            .filter(t => t.type === 'cashout')
            .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

        return {
            totalCashIn: cashIn,
            totalCashOut: cashOut,
            netFlow: cashIn - cashOut
        };
    };

    // Filter transactions by type
    const getTransactionsByType = (type) => {
        return transactions.filter(t => t.type === type);
    };

    // Filter transactions by date range using Firebase Timestamps
    const getTransactionsByDateRange = (startDate, endDate) => {
        // Convert JavaScript Date objects to Firebase Timestamps for comparison
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        return transactions.filter(t => {
            if (!t.createdAt) return false;

            // Handle both Timestamp objects and null values from serverTimestamp()
            const transactionTimestamp = t.createdAt;

            // If it's a Timestamp object, compare directly
            if (transactionTimestamp && transactionTimestamp.seconds) {
                return transactionTimestamp.seconds >= startTimestamp.seconds &&
                    transactionTimestamp.seconds <= endTimestamp.seconds;
            }

            return false;
        });
    };

    // Get transactions for today
    const getTodayTransactions = () => {
        const today = TimezoneService.getCurrentMoment();
        const startOfDay = today.startOf('day').toDate();
        const endOfDay = today.endOf('day').toDate();

        return getTransactionsByDateRange(startOfDay, endOfDay);
    };

    // Get transactions for current month
    const getMonthTransactions = () => {
        const today = TimezoneService.getCurrentMoment();
        const startOfMonth = today.startOf('month').toDate();
        const endOfMonth = today.endOf('month').toDate();

        return getTransactionsByDateRange(startOfMonth, endOfMonth);
    };

    // Utility function to convert Firebase Timestamp to JavaScript Date
    const timestampToDate = (timestamp) => {
        if (!timestamp) return null;
        if (timestamp.toDate) {
            return timestamp.toDate();
        }
        return null;
    };

    // Utility function to format Firebase Timestamp
    const formatTimestamp = (timestamp, options = {}) => {
        const date = timestampToDate(timestamp);
        if (!date) return 'N/A';

        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            ...options
        });
    };

    // Query transactions by date range with Firestore query
    const queryTransactionsByDateRange = async (startDate, endDate) => {
        try {
            setLoading(true);
            setError(null);

            const startTimestamp = Timestamp.fromDate(startDate);
            const endTimestamp = Timestamp.fromDate(endDate);

            const q = query(
                cashflowCollection,
                where('createdAt', '>=', startTimestamp),
                where('createdAt', '<=', endTimestamp),
                orderBy('createdAt', 'desc')
            );

            const querySnapshot = await getDocs(q);
            const transactionsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return { success: true, data: transactionsData };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    return {
        // State
        transactions,
        loading,
        error,

        // CRUD Operations
        createTransaction,
        updateTransaction,
        deleteTransaction,
        getAllTransactions,

        // Real-time subscription
        subscribeToTransactions,

        // Utility functions
        calculateTotals,
        getTransactionsByType,
        getTransactionsByDateRange,
        getTodayTransactions,
        getMonthTransactions,
        queryTransactionsByDateRange,

        // Timestamp utilities
        timestampToDate,
        formatTimestamp,

        // Computed values
        totals: calculateTotals()
    };
};

export default useCashflow;