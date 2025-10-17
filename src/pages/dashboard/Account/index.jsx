import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Typography,
    Spin,
    Row,
    Col,
    Statistic,
    message,
    Form,
    Input,
    InputNumber,
    Button,
    Select,
    Space,
    Modal,
    Tooltip,
    Divider,
    DatePicker,
} from 'antd';
import {
    EditOutlined,
    DeleteOutlined,
    PlusOutlined,
} from '@ant-design/icons';
import {
    collection,
    query,
    where,
    doc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    orderBy,
    writeBatch,
    getDoc,
    increment,
    Timestamp,
    getDocs,
    limit,
} from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import moment from 'moment';
import { db } from '../../../config/firebase';

const { Title, Text } = Typography;
const { Option } = Select;
const { confirm } = Modal;

const COMPANY_NAME = 'TOOR FILLING STATION';
const COMPANY_PHONE = '03466315255';
const RAAST_ID = '03100276969';

const MESSAGES = {
    REQUEST_PAYMENT: (accountName, balance) => `
${COMPANY_NAME}
${COMPANY_PHONE}

Dear ${accountName},
Your outstanding balance is Rs ${balance.toFixed(0)}. Please make the payment at your earliest convenience.

Account details:
RAAST_ID: ${RAAST_ID}
TITLE: ${COMPANY_NAME}
    `.trim(),
};

export default function AccountTransactions() {
    const { accountId } = useParams();

    const [accountData, setAccountData] = useState({});
    const [openingCredit, setOpeningCredit] = useState(0);
    const [receipts, setReceipts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({ totals: {}, remaining: 0 });
    const [globalTotals, setGlobalTotals] = useState({
        totalWasooli: 0,
        totalOdhar: 0,
        totalSalaries: 0,
        totalExpenses: 0,
    });
    const [loading, setLoading] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [shiftsLoading, setShiftsLoading] = useState(true);
    const [addModalVisible, setAddModalVisible] = useState(false);
    const [selectedTransactionType, setSelectedTransactionType] = useState(null);
    const [addForm] = Form.useForm();
    const [addingModalTransaction, setAddingModalTransaction] = useState(false);
    const [updateModalVisible, setUpdateModalVisible] = useState(false);
    const [updateRecord, setUpdateRecord] = useState(null);
    const [updateForm] = Form.useForm();
    const [isUpdateSubmitting, setIsUpdateSubmitting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const transactionTypes = {
        customer: {
            odhar: { label: 'Credit Sale', flow: 'out' },
            wasooli: { label: 'Payment Received', flow: 'in' },
        },
        supplier: {
            odhar: { label: 'Credit Purchase', flow: 'in' },
            wasooli: { label: 'Payment Made', flow: 'out' },
        },
        bank: {
            cashIn: { label: 'Deposit', flow: 'in' },
            cashOut: { label: 'Withdrawal', flow: 'out' },
        },
        staff: {
            pay: { label: 'Salary Payment', flow: 'out' },
        },
        expenses: {
            expense: { label: 'Expense', flow: 'out' },
        },
    };

    const possibleTransactions = transactionTypes[accountData.accountType] || {};

    // Determine cashflow type based on account and transaction type
    const getCashflowType = (accountType, transactionType) => {
        if (accountType === 'customer' && transactionType === 'wasooli') return 'cashin';
        if (accountType === 'supplier' && transactionType === 'wasooli') return 'cashout';
        if (accountType === 'customer' && transactionType === 'odhar') return 'cashin';
        if (accountType === 'supplier' && transactionType === 'odhar') return 'cashout';
        if (accountType === 'bank' && transactionType === 'cashIn') return 'cashout'; // Deposit from station
        if (accountType === 'bank' && transactionType === 'cashOut') return 'cashin'; // Withdrawal to station
        if (accountType === 'staff' && transactionType === 'pay') return 'cashout';
        if (accountType === 'expenses' && transactionType === 'expense') return 'cashout';
        return null; // No cashflow for credit transactions
    };

    // Fetch Account Details
    useEffect(() => {
        const accountRef = doc(db, 'accounts', accountId);
        const unsubscribeAccount = onSnapshot(accountRef, (accountSnap) => {
            if (accountSnap.exists()) {
                const accountInfo = accountSnap.data();
                setAccountData(accountInfo);
                setOpeningCredit(parseFloat(accountInfo.initialBalance || 0));
            } else {
                message.warning('Account not found.');
            }
        }, (error) => message.error('Error fetching account details: ' + error.message));
        return () => unsubscribeAccount();
    }, [accountId]);

    // Fetch Shifts
    useEffect(() => {
        const fetchShifts = async () => {
            try {
                const shiftsQuery = query(collection(db, 'shifts'), orderBy('startTime', 'desc'));
                const shiftsSnap = await getDocs(shiftsQuery);
                const shiftsData = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setShifts(shiftsData);
            } catch (err) {
                message.error('Failed to fetch shifts: ' + err.message);
            } finally {
                setShiftsLoading(false);
            }
        };
        fetchShifts();
    }, []);

    // Fetch Receipts ordered by 'createdAt' descending
    useEffect(() => {
        setLoading(true);
        const qReceipts = query(
            collection(db, 'receipts'),
            where('accountId', '==', accountId),
            orderBy('createdAt', 'desc')
        );

        const unsubscribeReceipts = onSnapshot(
            qReceipts,
            (snapshot) => {
                const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
                setReceipts(data);
                setLoading(false);
            },
            (error) => {
                message.error('Error fetching receipts: ' + error.message);
                setLoading(false);
            }
        );
        return () => unsubscribeReceipts();
    }, [accountId]);

    // Fetch Global Totals
    useEffect(() => {
        const fetchGlobalTotals = async () => {
            const globalSummaryRef = doc(db, 'summaries', 'global');
            const globalSnap = await getDoc(globalSummaryRef);
            if (globalSnap.exists()) {
                const data = globalSnap.data();
                setGlobalTotals({
                    totalWasooli: data.totalWasooli || 0,
                    totalOdhar: data.totalOdhar || 0,
                    totalSalaries: data.totalSalaries || 0,
                    totalExpenses: data.totalExpenses || 0,
                });
            }
        };
        fetchGlobalTotals();
    }, [receipts]);

    // Set transactions and summary
    useEffect(() => {
        setTransactions(receipts);
        const currentBalance = calculateCurrentBalance(accountData, receipts);
        const totals = {};
        Object.keys(possibleTransactions).forEach(type => {
            const transactionsOfType = receipts.filter(t => t.transactionType === type);
            const sum = transactionsOfType.reduce((acc, t) => acc + Math.abs(parseFloat(t.amount || 0)), 0);
            totals[type] = sum;
        });
        setSummary({ totals, remaining: currentBalance });
    }, [accountData, receipts]);

    // Calculate current balance
    const calculateCurrentBalance = (account, receiptsList) => {
        if (account.accountType === 'staff') {
            const monthlySalary = parseFloat(account.salary || 0);
            const dailySalary = monthlySalary / 30;
            const creationDate = moment(account.createdAt.toDate());
            const now = moment();
            const daysWorked = now.diff(creationDate, 'days');
            const totalEarned = dailySalary * daysWorked;
            const totalPaid = receiptsList
                .filter(r => r.transactionType === 'pay')
                .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
            return totalEarned - totalPaid;
        } else {
            return receiptsList.length > 0 ? receiptsList[0].balanceAfter : account.initialBalance || 0;
        }
    };

    // Find shift for a given date
    const findShiftForDate = async (date) => {
        const dateTimestamp = Timestamp.fromDate(date);
        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('startTime', '<=', dateTimestamp),
            orderBy('startTime', 'desc'),
            limit(1)
        );
        const shiftsSnap = await getDocs(shiftsQuery);
        console.log('shiftsSnap :>> ', shiftsSnap);
        if (shiftsSnap.empty) return null;
        const shift = shiftsSnap.docs[0].data();
        const shiftStart = shift.startTime.toDate();
        const shiftEnd = shift.endTime ? shift.endTime.toDate() : null;
        if ((shiftEnd && date <= shiftEnd) || (!shiftEnd && date >= shiftStart)) {
            return { id: shiftsSnap.docs[0].id, ...shift };
        }
        return null;
    };

    // Add Transaction with cashflow integration
    const handleAddTransaction = async (values) => {
        setAddingModalTransaction(true);
        try {
            const date = values.date ? Timestamp.fromDate(values.date.toDate()) : Timestamp.now();
            const amount = parseFloat(values.amount || 0);
            const flow = possibleTransactions[selectedTransactionType].flow;
            const isInflow = flow === 'in';
            const transactionAmount = isInflow ? amount : -amount;

            const shiftsQuery = query(
                collection(db, 'shifts'),
                where('status', '==', 'active'),
            );
            const shiftsSnap = await getDocs(shiftsQuery);
            let selectedShift = null;
            for (const shiftDoc of shiftsSnap.docs) {
                const shift = shiftDoc.data();
                const shiftStatus = shift.endTime ? 'ended' : 'active';

                if (shiftStatus === 'active') {
                    selectedShift = { id: shiftDoc.id, ...shift };
                    break;
                }
            }
            if (!selectedShift) {
                message.error('No shift found for the selected date.');
                setAddingModalTransaction(false);
                return;
            }
            const accountRef = doc(db, 'accounts', accountId);
            const receiptRef = collection(db, 'receipts');
            const cashflowRef = collection(db, 'cashflow');
            const globalSummaryRef = doc(db, 'summaries', 'global');
            const batch = writeBatch(db);



            let balanceAfter;
            const currentBalance = receipts.length > 0 ? receipts[0].balanceAfter : accountData.initialBalance || 0;
            if (accountData.accountType === 'staff') {
                const monthlySalary = parseFloat(accountData.salary || 0);
                const dailySalary = monthlySalary / 30;
                const creationDate = moment(accountData.createdAt.toDate());
                const transactionDate = moment(date.toDate());
                const daysWorked = transactionDate.diff(creationDate, 'days');
                const totalEarned = dailySalary * daysWorked;
                const totalPaid = receipts
                    .filter(r => r.transactionType === 'pay' && moment(r.date.toDate()).isSameOrBefore(transactionDate))
                    .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0) + (selectedTransactionType === 'pay' ? amount : 0);
                balanceAfter = totalEarned - totalPaid;
            } else if (accountData.accountType === 'expenses' && selectedTransactionType === 'expense') {
                // Modified: Always add expenses to balance (no subtraction)
                balanceAfter = currentBalance + amount; // Always positive - adds to the balance
            } else {
                balanceAfter = currentBalance + (isInflow ? amount : -amount);
            }

            const receiptDocRef = doc(receiptRef);
            const cashflowType = getCashflowType(accountData.accountType, selectedTransactionType);
            let cashflowDocRef = null;
            if (cashflowType) {
                cashflowDocRef = doc(cashflowRef);
                const cashflowData = {
                    amount: amount,
                    type: cashflowType,
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                    receiptId: receiptDocRef.id,
                };
                batch.set(cashflowDocRef, cashflowData);
            }

            const newReceipt = {
                accountId,
                transactionType: selectedTransactionType,
                amount: transactionAmount.toString(),
                note: values.note || '',
                date,
                createdAt: Timestamp.now(),
                balanceAfter,
                shiftId: selectedShift.id,
                cashflowId: cashflowDocRef ? cashflowDocRef.id : null,
            };

            batch.set(receiptDocRef, newReceipt);

            if (accountData.accountType !== 'staff') {
                batch.update(accountRef, { currentBalance: balanceAfter });
            }

            if (cashflowType) {
                if (cashflowType === 'cashin') {
                    batch.update(globalSummaryRef, { totalWasooli: increment(amount) }, { merge: true });
                } else if (cashflowType === 'cashout') {
                    if (accountData.accountType === 'staff') {
                        batch.update(globalSummaryRef, { totalSalaries: increment(amount) }, { merge: true });
                    } else if (accountData.accountType === 'expenses') {
                        batch.update(globalSummaryRef, { totalExpenses: increment(amount) }, { merge: true });
                    } else {
                        batch.update(globalSummaryRef, { totalOdhar: increment(amount) }, { merge: true });
                    }
                }
            }

            await batch.commit();
            message.success(`${possibleTransactions[selectedTransactionType].label} transaction added successfully`);
            addForm.resetFields();
            setAddModalVisible(false);
        } catch (error) {
            message.error(`Failed to add transaction: ${error.message}`);
        } finally {
            setAddingModalTransaction(false);
        }
    };

    // Update Transaction with cashflow integration
    const handleUpdateClick = (record) => {
        setUpdateRecord(record);
        updateForm.setFieldsValue({
            transactionType: record.transactionType,
            amount: Math.abs(parseFloat(record.amount)),
            note: record.note,
            date: moment(record.date.toDate()),
        });
        setUpdateModalVisible(true);
    };

    const handleUpdateSubmit = async (values) => {
        setIsUpdateSubmitting(true);
        try {
            const oldTransaction = updateRecord;
            const oldTransactionType = oldTransaction.transactionType;
            const oldAmount = parseFloat(oldTransaction.amount);
            const oldFlow = possibleTransactions[oldTransactionType].flow;
            const oldIsInflow = oldFlow === 'in';
            const oldBalanceChange = oldIsInflow ? oldAmount : -oldAmount;

            const newTransactionType = values.transactionType;
            const newAmount = parseFloat(values.amount);
            const newFlow = possibleTransactions[newTransactionType].flow;
            const newIsInflow = newFlow === 'in';
            const newTransactionAmount = newIsInflow ? newAmount : -newAmount;

            let balanceChange;
            if (accountData.accountType === 'expenses' && newTransactionType === 'expense') {
                balanceChange = (newAmount - Math.abs(oldAmount));
            } else {
                balanceChange = newTransactionAmount - oldBalanceChange;
            }

            const newBalanceAfter = oldTransaction.balanceAfter + balanceChange;

            const oldDate = oldTransaction.date.toDate();
            const newDate = values.date ? values.date.toDate() : oldDate;
            let shiftId = oldTransaction.shiftId;
            if (newDate.getTime() !== oldDate.getTime()) {
                const shift = await findShiftForDate(newDate);
                if (shift) {
                    shiftId = shift.id;
                } else {
                    message.warning('No shift found for the new date. Keeping original shift.');
                }
            }

            const oldCashflowType = getCashflowType(accountData.accountType, oldTransactionType); // cashin or cashout
            const newCashflowType = getCashflowType(accountData.accountType, newTransactionType); // cashin or cashout
            let cashflowId = oldTransaction.cashflowId;

            const batch = writeBatch(db);
            const receiptDocRef = doc(db, 'receipts', updateRecord.id);
            const accountRef = doc(db, 'accounts', accountId);
            const globalSummaryRef = doc(db, 'summaries', 'global');

            // Handle cashflow changes
            if (oldCashflowType === null && newCashflowType === null) {
                // No cashflow change
            } else if (oldCashflowType === null && newCashflowType !== null) {
                // Create new cashflow entry
                const cashflowDocRef = doc(collection(db, 'cashflow'));
                const cashflowData = {
                    amount: newAmount,
                    type: newCashflowType,
                    cashflowCategory: newTransactionType, // 🆕 Add the category/type of cashflow
                    createdAt: Timestamp.now(),
                    updatedAt: Timestamp.now(),
                    receiptId: receiptDocRef.id,
                };
                batch.set(cashflowDocRef, cashflowData);
                cashflowId = cashflowDocRef.id;
            } else if (oldCashflowType !== null && newCashflowType === null) {
                // Delete existing cashflow entry
                if (cashflowId) {
                    const cashflowDocRef = doc(db, 'cashflow', cashflowId);
                    batch.delete(cashflowDocRef);
                }
                cashflowId = null;
            } else if (oldCashflowType !== null && newCashflowType !== null) {
                // Update existing cashflow entry
                if (cashflowId) {
                    const cashflowDocRef = doc(db, 'cashflow', cashflowId);
                    const cashflowUpdate = {
                        amount: newAmount,
                        type: newCashflowType,
                        cashflowCategory: newTransactionType, // 🆕 Update the cashflow type field
                        updatedAt: Timestamp.now(),
                    };
                    batch.update(cashflowDocRef, cashflowUpdate);
                } else {
                    // Create if missing
                    const cashflowDocRef = doc(collection(db, 'cashflow'));
                    const cashflowData = {
                        amount: newAmount,
                        type: newCashflowType,
                        cashflowCategory: newTransactionType, // 🆕 Add type if doc missing
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                        receiptId: receiptDocRef.id,
                    };
                    batch.set(cashflowDocRef, cashflowData);
                    cashflowId = cashflowDocRef.id;
                }
            }

            const updatedData = {
                transactionType: newTransactionType,
                amount: newTransactionAmount.toString(),
                note: values.note || '',
                balanceAfter: newBalanceAfter,
                updatedAt: Timestamp.now(),
                date: values.date ? Timestamp.fromDate(values.date.toDate()) : oldTransaction.date,
                shiftId: shiftId,
                cashflowId: cashflowId,
            };

            batch.update(receiptDocRef, updatedData);

            if (accountData.accountType !== 'staff') {
                batch.update(accountRef, { currentBalance: newBalanceAfter });
            }

            // Adjust global totals
            if (oldCashflowType) {
                const oldAbsAmount = Math.abs(oldAmount);
                if (oldCashflowType === 'cashin') {
                    batch.update(globalSummaryRef, { totalWasooli: increment(-oldAbsAmount) }, { merge: true });
                } else if (oldCashflowType === 'cashout') {
                    if (accountData.accountType === 'staff') {
                        batch.update(globalSummaryRef, { totalSalaries: increment(-oldAbsAmount) }, { merge: true });
                    } else if (accountData.accountType === 'expenses') {
                        batch.update(globalSummaryRef, { totalExpenses: increment(-oldAbsAmount) }, { merge: true });
                    } else {
                        batch.update(globalSummaryRef, { totalOdhar: increment(-oldAbsAmount) }, { merge: true });
                    }
                }
            }
            if (newCashflowType) {
                const newAbsAmount = newAmount;
                if (newCashflowType === 'cashin') {
                    batch.update(globalSummaryRef, { totalWasooli: increment(newAbsAmount) }, { merge: true });
                } else if (newCashflowType === 'cashout') {
                    if (accountData.accountType === 'staff') {
                        batch.update(globalSummaryRef, { totalSalaries: increment(newAbsAmount) }, { merge: true });
                    } else if (accountData.accountType === 'expenses') {
                        batch.update(globalSummaryRef, { totalExpenses: increment(newAbsAmount) }, { merge: true });
                    } else {
                        batch.update(globalSummaryRef, { totalOdhar: increment(newAbsAmount) }, { merge: true });
                    }
                }
            }

            await batch.commit();
            message.success('Transaction updated successfully');
            setUpdateModalVisible(false);
            setUpdateRecord(null);
        } catch (error) {
            message.error(`Failed to update transaction: ${error.message}`);
        } finally {
            setIsUpdateSubmitting(false);
        }
    };


    // Delete Transaction with cashflow deletion
    const handleDeleteClick = (record) => {
        if (record.id === 'initial') return;
        confirm({
            title: 'Are you sure you want to delete this transaction?',
            content: `Transaction Type: ${possibleTransactions[record.transactionType]?.label || record.transactionType}\nAmount: ${parseFloat(record.amount).toFixed(2)}`,
            okText: 'Yes',
            okType: 'danger',
            cancelText: 'No',
            okButtonProps: { disabled: isDeleting, loading: isDeleting },
            onOk: async () => {
                setIsDeleting(true);
                try {
                    const docRef = doc(db, 'receipts', record.id);
                    const accountRef = doc(db, 'accounts', accountId);
                    const globalSummaryRef = doc(db, 'summaries', 'global');
                    const batch = writeBatch(db);

                    batch.delete(docRef);

                    if (record.cashflowId) {
                        const cashflowDocRef = doc(db, 'cashflow', record.cashflowId);
                        batch.delete(cashflowDocRef);
                    }

                    if (accountData.accountType !== 'staff') {
                        const amount = parseFloat(record.amount || 0);
                        const flow = possibleTransactions[record.transactionType].flow;
                        let balanceChange;
                        if (accountData.accountType === 'expenses' && record.transactionType === 'expense') {
                            balanceChange = -Math.abs(amount);
                        } else {
                            balanceChange = flow === 'in' ? -amount : Math.abs(amount);
                        }
                        const newBalance = accountData.currentBalance + balanceChange;
                        batch.update(accountRef, { currentBalance: newBalance });
                    }

                    const cashflowType = getCashflowType(accountData.accountType, record.transactionType);
                    if (cashflowType) {
                        const amount = Math.abs(parseFloat(record.amount || 0));
                        if (cashflowType === 'cashin') {
                            batch.update(globalSummaryRef, { totalWasooli: increment(-amount) }, { merge: true });
                        } else if (cashflowType === 'cashout') {
                            if (accountData.accountType === 'staff') {
                                batch.update(globalSummaryRef, { totalSalaries: increment(-amount) }, { merge: true });
                            } else if (accountData.accountType === 'expenses') {
                                batch.update(globalSummaryRef, { totalExpenses: increment(-amount) }, { merge: true });
                            } else {
                                batch.update(globalSummaryRef, { totalOdhar: increment(-amount) }, { merge: true });
                            }
                        }
                    }

                    await batch.commit();
                    message.success('Transaction deleted successfully');
                } catch (error) {
                    message.error(`Failed to delete transaction: ${error.message}`);
                } finally {
                    setIsDeleting(false);
                }
            },
        });
    };

    // Request Payment function (only for customers)
    // Assumptions: Yeh variables (COMPANY_NAME, COMPANY_PHONE, RAAST_ID) aapke scope mein pehle se mojood hain.

    const handleRequestPayment = (method) => {
        // Sirf customers ke liye aur agar balance negative (dues) hai tab hi chalega
        if (accountData.accountType !== 'customer') return;
        if (summary.remaining >= 0) return;

        if (!accountData.phoneNumber) {
            // Error message ko bhi update kar dete hain
            message.error('Phone number mojood nahi hai.');
            return;
        }

        const customerName = accountData.accountName || 'Customer';
        // .toFixed(0) istemal karenge taake decimal points na aayein
        const dueAmount = Math.abs(summary.remaining).toFixed(0);

        // Naya Roman Urdu Message Template (Scenario 5)
        const msg = `
Dear ${customerName},

Aapke zimme Rs ${dueAmount} wajib-ul-ada hain.
Barae meherbani, jald az jald apni payment clear kar ke hamara taawun karein.

Shukriya.

Payment Details:
RAAST ID: ${RAAST_ID}
TITLE: ${COMPANY_NAME}

${COMPANY_NAME}
${COMPANY_PHONE}
    `.trim();

        // Message ya WhatsApp par bhejne ka logic
        if (method === 'message') {
            window.location.href = `sms:${accountData.phoneNumber}?body=${encodeURIComponent(msg)}`;
        } else if (method === 'whatsapp') {
            window.open(`https://wa.me/${accountData.phoneNumber}?text=${encodeURIComponent(msg)}`, '_blank');
        }
    };

    // Table Columns with Shift Column
    // --- HELPER FUNCTION (Place this outside your component or at the top) ---
    // This function safely handles Firestore Timestamps, ISO strings, and JS Date objects.
    const safeFormatDate = (dateValue, format = 'YYYY-MM-DD HH:mm') => {
        // 1. Guard against null or undefined values
        if (!dateValue) {
            return 'N/A';
        }
        // 2. Check if it's a Firestore Timestamp (it will have a .toDate method)
        if (typeof dateValue.toDate === 'function') {
            return moment(dateValue.toDate()).format(format);
        }
        // 3. For everything else (like strings or Date objects), let moment handle it.
        // The .isValid() check is crucial to prevent showing "Invalid date".
        const d = moment(dateValue);
        return d.isValid() ? d.format(format) : 'Invalid Date';
    };

    // --- CORRECTED COLUMNS ARRAY (Use this in your component) ---
    const columns = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            // Use the safe helper function for rendering
            render: (date) => safeFormatDate(date),
            sorter: (a, b) => {
                // Also make the sorter robust
                const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                return dateA - dateB;
            },
            defaultSortOrder: 'descend', // Often useful to show latest first
        },
        {
            title: 'Shift',
            key: 'shift',
            render: (_, record) => {
                const shift = shifts.find(s => s.id === record.shiftId);
                if (shift) {
                    // Use the safe formatter for shift times as well
                    const start = safeFormatDate(shift.startTime, 'YYYY-MM-DD HH:mm');
                    const end = shift.endTime ? safeFormatDate(shift.endTime, 'HH:mm') : 'Ongoing';
                    return `${start} - ${end}`;
                }
                return 'Unknown';
            },
            filters: shifts.map(shift => {
                // Ensure shift times are formatted safely here too
                const startText = safeFormatDate(shift.startTime, 'YYYY-MM-DD HH:mm');
                const endText = shift.endTime ? safeFormatDate(shift.endTime, 'HH:mm') : 'Ongoing';
                return {
                    text: `${startText} - ${endText}`,
                    value: shift.id,
                };
            }),
            onFilter: (value, record) => record.shiftId === value,
        },
        {
            title: 'Transaction Type',
            dataIndex: 'transactionType',
            key: 'transactionType',
            render: (type) => {
                const label = possibleTransactions[type]?.label || type;
                const color = type === 'odhar' ? '#cf1322' : type === 'wasooli' ? '#3f8600' : 'inherit';
                return <span style={{ color }}>{label}</span>;
            },
            filters: Object.entries(possibleTransactions).map(([type, { label }]) => ({ text: label, value: type })),
            onFilter: (value, record) => record.transactionType === value,
        },
        {
            title: 'Amount',
            dataIndex: 'amount',
            key: 'amount',
            render: (amount) => {
                const formatted = parseFloat(amount || 0).toFixed(2);
                const color = parseFloat(amount) >= 0 ? '#3f8600' : '#cf1322';
                return <span style={{ color, fontWeight: 'bold' }}>{formatted}</span>;
            },
            sorter: (a, b) => parseFloat(a.amount || 0) - parseFloat(b.amount || 0),
        },
        {
            title: 'Balance After',
            dataIndex: 'balanceAfter',
            key: 'balanceAfter',
            render: (balance) => (
                <span style={{ color: balance < 0 ? '#cf1322' : '#3f8600' }}>
                    {balance !== undefined ? balance.toFixed(2) : '-'}
                </span>
            ),
            sorter: (a, b) => (a.balanceAfter ?? 0) - (b.balanceAfter ?? 0),
        },
        {
            title: 'Note',
            dataIndex: 'note',
            key: 'note',
            render: (note) => note || '-',
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Tooltip title="Edit Transaction">
                        <Button
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => handleUpdateClick(record)}
                            disabled={loading || isUpdateSubmitting || isDeleting}
                        />
                    </Tooltip>
                    <Tooltip title="Delete Transaction">
                        <Button
                            type="link"
                            icon={<DeleteOutlined />}
                            danger
                            onClick={() => handleDeleteClick(record)}
                            disabled={loading || isUpdateSubmitting || isDeleting}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];
    return (
        <Card style={{ margin: '20px' }}>
            <Row justify="space-between" align="middle" gutter={[16, 16]}>
                <Col xs={24} md={12}>
                    <Title level={2}>Account Transactions</Title>
                    {accountData && (
                        <Text strong>
                            {accountData.accountName || 'Account Name'} ({accountData.accountType || 'Unknown'})
                        </Text>
                    )}
                </Col>
                <Col xs={24} md={12}>
                    <Row gutter={[16, 16]} justify="end">
                        <Col>
                            <Statistic
                                title="Opening Balance"
                                value={openingCredit}
                                precision={2}
                                valueStyle={{ color: openingCredit >= 0 ? '#3f8600' : '#cf1322' }}
                            />
                        </Col>
                        {Object.entries(summary.totals).map(([type, total]) => (
                            <Col key={type}>
                                <Statistic
                                    title={`Total ${possibleTransactions[type]?.label || type}`}
                                    value={total}
                                    precision={2}
                                    valueStyle={{ color: possibleTransactions[type]?.flow === 'in' ? '#3f8600' : '#cf1322' }}
                                />
                            </Col>
                        ))}
                        <Col>
                            <Statistic
                                title="Current Balance"
                                value={summary.remaining}
                                precision={2}
                                valueStyle={{ color: summary.remaining >= 0 ? '#3f8600' : '#cf1322' }}
                            />
                        </Col>
                    </Row>
                </Col>
            </Row>

            <Divider />

            {accountData.accountType === 'customer' && (
                <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                    <Col>
                        <Button onClick={() => handleRequestPayment('whatsapp')}>
                            Request Payment via WhatsApp
                        </Button>
                    </Col>
                    <Col>
                        <Button onClick={() => handleRequestPayment('message')}>
                            Request Payment via SMS
                        </Button>
                    </Col>
                </Row>
            )}

            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                {Object.entries(possibleTransactions).map(([type, { label, flow }]) => (
                    <Col key={type}>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            style={{ backgroundColor: flow === 'in' ? '#3f8600' : '#cf1322', borderColor: flow === 'in' ? '#3f8600' : '#cf1322' }}
                            onClick={() => {
                                setSelectedTransactionType(type);
                                setAddModalVisible(true);
                            }}
                        >
                            Add {label}
                        </Button>
                    </Col>
                ))}
            </Row>

            {loading || shiftsLoading ? <Spin /> : <Table dataSource={transactions} columns={columns} rowKey="id" bordered pagination={false} />}

            <Modal
                title="Update Transaction"
                open={updateModalVisible}
                onCancel={() => setUpdateModalVisible(false)}
                footer={null}
            >
                <Form form={updateForm} layout="vertical" onFinish={handleUpdateSubmit}>
                    <Form.Item
                        name="date"
                        label="Date"
                        rules={[{ required: true, message: 'Select date' }]}
                    >
                        <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        name="transactionType"
                        label="Transaction Type"
                        rules={[{ required: true, message: 'Select transaction type' }]}
                    >
                        <Select placeholder="Select Type">
                            {Object.entries(possibleTransactions).map(([type, { label }]) => (
                                <Option key={type} value={type}>
                                    {label}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="amount"
                        label="Amount"
                        rules={[{ required: true, message: 'Enter amount' }]}
                    >
                        <InputNumber placeholder="Amount" style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item name="note" label="Note">
                        <Input placeholder="Note (optional)" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={isUpdateSubmitting}>
                            Update Transaction
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={`Add Transaction for ${accountData.accountName}`}
                open={addModalVisible}
                onCancel={() => setAddModalVisible(false)}
                footer={null}
            >
                <Form form={addForm} layout="vertical" onFinish={handleAddTransaction}>
                    <Form.Item
                        name="date"
                        label="Date"
                        rules={[{ required: true, message: 'Select date' }]}
                        initialValue={moment()}
                    >
                        <DatePicker style={{ width: '100%' }} defaultValue={moment()} />
                    </Form.Item>
                    <Form.Item
                        name="amount"
                        label="Amount"
                        rules={[{ required: true, message: 'Enter amount' }]}
                    >
                        <InputNumber placeholder="Amount" style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item name="note" label="Note">
                        <Input placeholder="Note (optional)" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={addingModalTransaction}>
                            Add {selectedTransactionType && possibleTransactions[selectedTransactionType].label} Transaction
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
}