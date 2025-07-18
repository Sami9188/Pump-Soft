import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Typography, Tooltip, InputNumber, Select, Spin, Card, DatePicker } from 'antd';
import { UserAddOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EyeOutlined, FilePdfOutlined, WhatsAppOutlined, MessageOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { useAuth } from '../../../../../context/AuthContext';
import { useSettings } from '../../../../../context/SettingsContext';
import { db } from '../../../../../config/firebase';
import { collection, getDocs, updateDoc, doc, query, where, orderBy, writeBatch, getDoc, increment, Timestamp, serverTimestamp, addDoc } from 'firebase/firestore';
import { generatePDF } from '../../../../../services/pdfHelpers';
import useCashflow from '../../../../../hooks/useCashFlow'; // Adjust the path as needed

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const COMPANY_NAME = 'TOOR FILLING STATION';
const COMPANY_PHONE = '03466315255';
const RAAST_ID = '03100276969';

const MESSAGES = {
    REQUEST_PAYMENT: (customerName, balance) => `
${COMPANY_NAME}
${COMPANY_PHONE}

Dear ${customerName},
Your outstanding balance is Rs ${balance?.toFixed(0)}. Please make the payment at your earliest convenience.

Account details:
RAAST ID: ${RAAST_ID}
TITLE: ${COMPANY_NAME}
    `.trim(),
    THANK_YOU: (customerName, balance) => `
${COMPANY_NAME}
${COMPANY_PHONE}

Dear ${customerName},
Thank you for your payment. You have a credit balance of Rs ${balance?.toFixed(0)} with us.
    `.trim(),
};

// Mapping from receipt transaction types to cash flow types
const cashflowTypeMap = {
    'wasooli': ' CASHIN',
    'cashIn': 'cashin',
    'odhar': 'cashout',
    'cashOut': 'cashout',
    'pay': 'cashout',
    'expense': 'cashout',
};

function AccountManagement({ accounts }) {
    const { user } = useAuth();
    const { settings } = useSettings();
    const isManager = Array.isArray(user?.role) ? user.role.includes('manager') : user?.role === 'manager';

    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [accountsData, setAccountsData] = useState(accounts);
    const [accountSummaries, setAccountSummaries] = useState({});
    const [grandTotals, setGrandTotals] = useState({
        totalWasooli: 0,
        totalOdhar: 0,
        totalSalaries: 0,
        totalExpenses: 0,
    });
    const [receiptModalVisible, setReceiptModalVisible] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [receipts, setReceipts] = useState([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);
    const [receiptDateRange, setReceiptDateRange] = useState([null, null]);
    const [isReceiptModalVisible, setIsReceiptModalVisible] = useState(false);
    const [receiptForm] = Form.useForm();
    const [selectedAccountForReceipt, setSelectedAccountForReceipt] = useState(null);
    const [receiptType, setReceiptType] = useState(null);
    const [isTransactionsModalVisible, setIsTransactionsModalVisible] = useState(false);
    const [transactionsDateRange, setTransactionsDateRange] = useState([null, null]);
    const [transactionsList, setTransactionsList] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [selectedShift, setSelectedShift] = useState(null);

    const { createTransaction, updateTransaction, deleteTransaction } = useCashflow();

    const shiftMap = useMemo(() => {
        return shifts.reduce((map, shift) => {
            map[shift.id] = shift;
            return map;
        }, {});
    }, [shifts]);

    useEffect(() => {
        setAccountsData(accounts);
        checkNextCollectionDates(accounts);
    }, [accounts]);

    const checkNextCollectionDates = (accountsList) => {
        accountsList.forEach(acc => {
            if (acc.accountType === 'customer' && acc.nextCollectionDate && typeof acc.nextCollectionDate.toDate === 'function') {
                const nextDate = moment(acc.nextCollectionDate.toDate());
                if (moment().isAfter(nextDate, 'day')) {
                    message.warning(`Collection overdue for ${acc.accountName}. Next collection date was ${nextDate.format('YYYY-MM-DD')}.`);
                }
            }
        });
    };

    function getDailyRate(salaryMonthly) {
        const monthly = parseFloat(salaryMonthly);
        if (isNaN(monthly) || monthly <= 0) return 0;
        return Math.round((monthly / 30) * 100) / 100;
    }

    function getWorkedDays(startDate, endDate = new Date()) {
        const start = startDate.toDate ? startDate.toDate() : new Date(startDate);
        const end = endDate.toDate ? endDate.toDate() : new Date(endDate);
        if (isNaN(start) || isNaN(end)) return 0;
        const diffMs = end.getTime() - start.getTime();
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return days > 0 ? days : 0;
    }

    function sumPayments(txs = []) {
        return txs
            .filter(tx => tx.transactionType === 'pay')
            .reduce((sum, { amount }) => {
                const val = parseFloat(amount);
                return sum + (isNaN(val) ? 0 : val);
            }, 0);
    }

    function calculateAmountOwed(account, transactions = []) {
        if (account.accountType !== 'staff' || !account.salary) return 0;

        let startDate = account.createdAt.toDate();
        const totalPaid = sumPayments(transactions);
        const dailyRate = getDailyRate(account.salary);
        const daysWorked = getWorkedDays(startDate, new Date());
        const totalEarned = Math.round(dailyRate * daysWorked * 100) / 100;
        const remaining = totalEarned - totalPaid;

        return Math.round(remaining * 100) / 100;
    }

    const fetchAccountSummary = async account => {
        const q = query(
            collection(db, 'receipts'),
            where('accountId', '==', account.id),
            orderBy('date', 'asc'),
            orderBy('createdAt', 'asc')
        );
        const snap = await getDocs(q);
        const receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return { transactions: receipts };
    };

    useEffect(() => {
        if (!accountsData?.length) return;
        const load = async () => {
            const sums = {};
            await Promise.all(
                accountsData.map(async acc => {
                    sums[acc.id] = await fetchAccountSummary(acc);
                })
            );
            setAccountSummaries(sums);
        };
        load();
    }, [accountsData]);

    useEffect(() => {
        const fetchGrandTotals = async () => {
            const globalSummaryRef = doc(db, 'summaries', 'global');
            const globalSnap = await getDoc(globalSummaryRef);
            if (globalSnap.exists()) {
                const data = globalSnap.data();
                setGrandTotals({
                    totalWasooli: data.totalWasooli || 0,
                    totalOdhar: data.totalOdhar || 0,
                    totalSalaries: data.totalSalaries || 0,
                    totalExpenses: data.totalExpenses || 0,
                });
            }
        };
        fetchGrandTotals();
    }, [accountSummaries]);

    const showModal = record => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue({
                ...record,
                nextCollectionDate: record.nextCollectionDate ? moment(record.nextCollectionDate.toDate()) : null,
            });
        } else {
            setEditingId(null);
            form.resetFields();
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        form.resetFields();
    };

    const handleSubmit = async values => {
        setSubmitLoading(true);
        const prev = [...accountsData];
        const ts = Timestamp.now();
        if (isManager) values.accountType = 'customer';
        try {
            if (editingId) {
                const updated = {
                    ...values,
                    id: editingId,
                    updatedAt: ts,
                    nextCollectionDate: values.nextCollectionDate ? Timestamp.fromDate(values.nextCollectionDate.toDate()) : null,
                };
                setAccountsData(a => a.map(x => (x.id === editingId ? updated : x)));
                await updateDoc(doc(db, 'accounts', editingId), {
                    ...values,
                    updatedAt: ts,
                    nextCollectionDate: values.nextCollectionDate ? Timestamp.fromDate(values.nextCollectionDate.toDate()) : null,
                });
                message.success('Account updated');
            } else {
                const tempId = 'temp-' + Date.now();
                const newAcc = {
                    ...values,
                    id: tempId,
                    createdAt: ts,
                    updatedAt: ts,
                    currentBalance: parseFloat(values.initialBalance || 0),
                    nextCollectionDate: values.nextCollectionDate ? Timestamp.fromDate(values.nextCollectionDate.toDate()) : null,
                };
                setAccountsData(a => [newAcc, ...a]);
                const ref = await addDoc(collection(db, 'accounts'), {
                    ...values,
                    createdAt: ts,
                    updatedAt: ts,
                    currentBalance: parseFloat(values.initialBalance || 0),
                    nextCollectionDate: values.nextCollectionDate ? Timestamp.fromDate(values.nextCollectionDate.toDate()) : null,
                });
                setAccountsData(a => a.map(x => (x.id === tempId ? { ...x, id: ref.id } : x)));
                message.success('Account created');
            }
            setIsModalVisible(false);
            form.resetFields();
        } catch (err) {
            setAccountsData(prev);
            message.error('Operation failed: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async id => {
        setSubmitLoading(true);
        try {
            const accountRef = doc(db, 'accounts', id);
            const transactionsQuery = query(collection(db, 'receipts'), where('accountId', '==', id));
            const transactionsSnap = await getDocs(transactionsQuery);
            const transactions = transactionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const contributions = calculateTotalContributions(transactions);
            const cashflowIds = transactions.map(t => t.cashflowId).filter(id => id);

            const batch = writeBatch(db);
            const globalSummaryRef = doc(db, 'summaries', 'global');
            batch.update(globalSummaryRef, {
                totalWasooli: increment(-contributions.totalWasooli),
                totalOdhar: increment(-contributions.totalOdhar),
                totalSalaries: increment(-contributions.totalSalaries),
                totalExpenses: increment(-contributions.totalExpenses),
            });
            transactionsSnap.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            cashflowIds.forEach(cashflowId => {
                const cashflowRef = doc(db, 'cashflow', cashflowId);
                batch.delete(cashflowRef);
            });
            batch.delete(accountRef);
            await batch.commit();

            setAccountsData(a => a.filter(x => x.id !== id));
            message.success('Account and its transactions deleted');
        } catch (err) {
            message.error('Delete failed: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const calculateTotalContributions = transactions => {
        return transactions.reduce(
            (acc, t) => {
                const amount = parseFloat(t.amount || 0);
                if (t.transactionType === 'wasooli' || t.transactionType === 'cashIn') {
                    acc.totalWasooli += amount;
                } else if (t.transactionType === 'odhar' || t.transactionType === 'cashOut') {
                    acc.totalOdhar += amount;
                } else if (t.transactionType === 'pay') {
                    acc.totalSalaries += amount;
                } else if (t.transactionType === 'expense') {
                    acc.totalExpenses += amount;
                }
                return acc;
            },
            { totalWasooli: 0, totalOdhar: 0, totalSalaries: 0, totalExpenses: 0 }
        );
    };

    const exportAccountsToPDF = () => {
        const columns = ['Name', 'Phone', 'Balance/Amount Owed'];
        const data = filteredAccounts.map(acc => {
            let balance;
            if (acc.accountType === 'staff') {
                balance = calculateAmountOwed(acc, accountSummaries[acc.id]?.transactions || [])?.toFixed(2);
            } else {
                balance = acc.currentBalance?.toFixed(2);
            }
            return [acc.accountName, acc.phoneNumber, balance];
        });
        // This PDF doesn't need the summary box, so we pass an empty object.
        generatePDF('Accounts List', columns, data, `Accounts_List_${moment().format('YYYYMMDD')}.pdf`, {}, {}, settings);
        message.success('Exported to PDF');
    };

    const exportTransactionsToPDF = () => {
        const columns = ['Date', 'Shift', 'Account', 'Type', 'Amount', 'Balance After', 'Note'];
        const data = transactionsList.map(tx => {
            const shift = shiftMap[tx.shiftId];
            const shiftText = shift
                ? `${moment(shift.startTime.toDate()).format('YYYY-MM-DD HH:mm')} - ${shift.endTime ? moment(shift.endTime.toDate()).format('HH:mm') : 'Ongoing'}`
                : 'Unknown';
            return [
                moment(tx.date.toDate()).format('YYYY-MM-DD'),
                shiftText,
                tx.accountName,
                typeLabels[tx.transactionType] || tx.transactionType,
                parseFloat(tx.amount || 0)?.toFixed(2),
                tx.balanceAfter !== null ? tx.balanceAfter?.toFixed(2) : '-',
                tx.note || '-',
            ];
        });

        // *** NEW: Calculate summary totals for the exported transactions ***
        const summary = transactionsList.reduce((acc, tx) => {
            const amount = parseFloat(tx.amount || 0);
            if (['wasooli', 'cashIn'].includes(tx.transactionType)) {
                acc.wasooli += amount;
            } else if (['odhar', 'cashOut', 'pay', 'expense'].includes(tx.transactionType)) {
                acc.odhar += amount;
            }
            return acc;
        }, { wasooli: 0, odhar: 0 });

        const summaryData = {
            wasooli: summary.wasooli,
            odhar: summary.odhar,
            // In this context, "Remaining" represents the net change for the period
            remaining: summary.wasooli - summary.odhar
        };

        // *** MODIFIED: Pass the summaryData to generatePDF ***
        generatePDF(
            'Last Transactions Report',
            columns,
            data,
            `Transactions_${moment().format('YYYYMMDD')}.pdf`,
            summaryData, // The new summary data object
            {},
            settings
        );
        message.success('Exported to PDF');
    };

    const handleViewReceipts = async acc => {
        setSelectedAccount(acc);
        setReceiptDateRange([null, null]);
        const q = query(
            collection(db, 'receipts'),
            where('accountId', '==', acc.id),
            orderBy('createdAt', 'desc')
        );
        try {
            const snap = await getDocs(q);
            const freshReceipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setReceipts(freshReceipts);
            setReceiptModalVisible(true);
        } catch (err) {
            message.error('Failed to fetch receipts: ' + err.message);
        }
    };

    const handleCloseReceiptsModal = () => {
        setReceiptModalVisible(false);
        setSelectedAccount(null);
        setReceipts([]);
    };

    const filteredReceipts = useMemo(() => {
        if (!receiptDateRange[0] || !receiptDateRange[1]) return receipts;
        const start = receiptDateRange[0].startOf('day').toDate();
        const end = receiptDateRange[1].endOf('day').toDate();
        return receipts.filter(r => {
            const receiptDate = r.date.toDate();
            return receiptDate >= start && receiptDate <= end;
        });
    }, [receipts, receiptDateRange]);

    const receiptsWithBalance = useMemo(() => {
        if (selectedAccount?.accountType === 'staff') {
            const monthlySalary = parseFloat(selectedAccount.salary || 0);
            const dailySalary = monthlySalary / 30;
            let cumulativePaid = 0;
            return filteredReceipts.map(r => {
                const transactionDate = moment(r.date.toDate());
                const daysSinceCreation = transactionDate.diff(moment(selectedAccount.createdAt.toDate()), 'days');
                const totalEarned = dailySalary * daysSinceCreation;
                if (r.transactionType === 'pay') {
                    cumulativePaid += parseFloat(r.amount || 0);
                }
                const amountOwed = totalEarned - cumulativePaid;
                return { ...r, balanceAfter: amountOwed };
            });
        } else {
            return filteredReceipts;
        }
    }, [selectedAccount, filteredReceipts]);

    const exportReceiptsToPDF = () => {
        if (!selectedAccount) return;
        setReceiptsLoading(true);
        try {
            const columns = ['Date', 'Transaction Type', 'Amount', 'Running Balance', 'Note'];
            const data = receiptsWithBalance.map(r => [
                moment(r.date.toDate()).format('YYYY-MM-DD'),
                typeLabels[r.transactionType] || r.transactionType,
                parseFloat(r.amount || 0)?.toFixed(2),
                r.balanceAfter?.toFixed(2) || '-',
                r.note || '-',
            ]);

            // *** NEW: Calculate summary totals for the selected period and get the final balance ***
            const periodSummary = filteredReceipts.reduce((acc, r) => {
                const amount = parseFloat(r.amount || 0);
                if (['wasooli', 'cashIn'].includes(r.transactionType)) {
                    acc.wasooli += amount;
                } else if (['odhar', 'cashOut', 'pay', 'expense'].includes(r.transactionType)) {
                    acc.odhar += amount;
                }
                return acc;
            }, { wasooli: 0, odhar: 0 });

            // Get the final remaining balance for the account
            const remainingBalance = selectedAccount.accountType === 'staff'
                ? calculateAmountOwed(selectedAccount, accountSummaries[selectedAccount.id]?.transactions || [])
                : selectedAccount.currentBalance;

            const summaryData = {
                wasooli: periodSummary.wasooli, // Total collected in the period
                odhar: periodSummary.odhar,     // Total given out in the period
                remaining: remainingBalance     // Current final outstanding balance
            };

            const options = {
                didParseCell: (d) => {
                    if (d.section === 'body' && d.column.index === 2) {
                        const isOutflow = ['odhar', 'cashOut', 'pay', 'expense'].includes(receiptsWithBalance[d.row.index].transactionType);
                        d.cell.styles.textColor = isOutflow ? [255, 0, 0] : [0, 128, 0];
                    }
                    if (d.section === 'body' && d.column.index === 3 && d.cell.text !== '-') {
                        const val = parseFloat(d.cell.text);
                        d.cell.styles.textColor = val >= 0 ? [0, 128, 0] : [255, 0, 0];
                    }
                },
            };

            // *** MODIFIED: Pass the new summaryData to generatePDF ***
            generatePDF(
                `Receipts for ${selectedAccount?.accountName}`,
                columns,
                data,
                `Receipts_${selectedAccount?.accountName}_${moment().format('YYYYMMDD')}.pdf`,
                summaryData, // The new summary data object
                options,
                settings
            );
            message.success('PDF exported');
        } catch (err) {
            message.error('PDF export failed: ' + err.message);
        } finally {
            setReceiptsLoading(false);
        }
    };

    const showReceiptModal = (acc, type) => {
        setSelectedAccountForReceipt(acc);
        setReceiptType(type);
        receiptForm.resetFields();
        receiptForm.setFieldsValue({ date: moment().format('YYYY-MM-DD'), transactionType: type });
        setIsReceiptModalVisible(true);
    };

    const handleAddReceipt = async values => {
        setSubmitLoading(true);
        try {
            const accountRef = doc(db, 'accounts', selectedAccountForReceipt.id);
            const receiptRef = collection(db, 'receipts');
            const cashflowRef = collection(db, 'cashflow');
            const globalSummaryRef = doc(db, 'summaries', 'global');

            const accountSnap = await getDoc(accountRef);
            const currentBalance = accountSnap.data().currentBalance || 0;
            const creditLimit = accountSnap.data().creditLimit || 0;

            let amount = parseFloat(values.amount || 0);
            amount = Math.abs(amount);

            let balanceChange = 0;
            if (selectedAccountForReceipt.accountType === 'customer' || selectedAccountForReceipt.accountType === 'supplier') {
                if (receiptType === 'wasooli') {
                    balanceChange = amount;
                } else if (receiptType === 'odhar') {
                    balanceChange = -amount;
                    if (selectedAccountForReceipt.accountType === 'customer') {
                        const newBalance = currentBalance + balanceChange;
                        if (newBalance < -creditLimit) {
                            message.error('Credit limit exceeded. Cannot add more odhar.');
                            setSubmitLoading(false);
                            return;
                        }
                    }
                }
            } else if (selectedAccountForReceipt.accountType === 'bank') {
                if (receiptType === 'cashIn') {
                    balanceChange = amount;
                } else if (receiptType === 'cashOut') {
                    balanceChange = -amount;
                }
            } else if (selectedAccountForReceipt.accountType === 'expenses') {
                if (receiptType === 'expense') {
                    balanceChange = amount; // Always positive - adds to the balance
                }
            }
            const newBalance = selectedAccountForReceipt.accountType !== 'staff' ? currentBalance + balanceChange : currentBalance;

            const transactionDate = values.date ? Timestamp.fromDate(new Date(values.date)) : Timestamp.now();

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
                setSubmitLoading(false);
                return;
            }

            const batch = writeBatch(db);
            const receiptDocRef = doc(receiptRef);
            const cashflowDocRef = doc(cashflowRef);

            const cashflowType = cashflowTypeMap[receiptType];
            if (!cashflowType) {
                message.error('Invalid receipt type');
                setSubmitLoading(false);
                return;
            }

            const getCashflowCategory = (receiptType) => {
                switch (receiptType) {
                    case 'wasooli':
                    case 'cashIn':
                        return 'wasooli';
                    case 'odhar':
                    case 'cashOut':
                        return 'odhar';
                    case 'pay':
                        return 'pay';
                    case 'expense':
                        return 'expenses';
                    default:
                        return 'other';
                }
            };

            const cashflowCategory = getCashflowCategory(receiptType);

            const cashflowData = {
                amount: amount,
                type: cashflowType,
                cashflowCategory,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                receiptId: receiptDocRef.id,
            };

            const newReceipt = {
                accountId: selectedAccountForReceipt.id,
                date: transactionDate,
                amount: amount,
                note: values.note || '',
                transactionType: receiptType,
                balanceAfter: selectedAccountForReceipt.accountType !== 'staff' ? newBalance : null,
                createdAt: Timestamp.now(),
                shiftId: selectedShift.id,
                cashflowId: cashflowDocRef.id,
            };

            batch.set(receiptDocRef, newReceipt);
            batch.set(cashflowDocRef, cashflowData);

            if (selectedAccountForReceipt.accountType !== 'staff') {
                batch.update(accountRef, { currentBalance: newBalance });
            }

            const globalSummarySnap = await getDoc(globalSummaryRef);
            if (!globalSummarySnap.exists()) {
                batch.set(globalSummaryRef, {
                    totalWasooli: 0,
                    totalOdhar: 0,
                    totalSalaries: 0,
                    totalExpenses: 0,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }

            if (receiptType === 'wasooli' || receiptType === 'cashIn') {
                batch.update(globalSummaryRef, {
                    totalWasooli: increment(amount),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } else if (receiptType === 'odhar' || receiptType === 'cashOut') {
                batch.update(globalSummaryRef, {
                    totalOdhar: increment(amount),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } else if (receiptType === 'pay') {
                batch.update(globalSummaryRef, {
                    totalSalaries: increment(amount),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            } else if (receiptType === 'expense') {
                batch.update(globalSummaryRef, {
                    totalExpenses: increment(amount),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            await batch.commit();

            message.success('Receipt added');

            setAccountSummaries(prev => {
                const sum = prev[selectedAccountForReceipt.id] || { transactions: [] };
                const newTransactions = [...sum.transactions, { ...newReceipt, id: receiptDocRef.id }];
                return { ...prev, [selectedAccountForReceipt.id]: { transactions: newTransactions } };
            });

            if (selectedAccount && selectedAccount.id === selectedAccountForReceipt.id) {
                setReceipts(prev => [...prev, { ...newReceipt, id: receiptDocRef.id }]);
            }

            setIsReceiptModalVisible(false);
        } catch (err) {
            message.error('Failed to add receipt: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleSetNextCollectionDate = async date => {
        if (!date) return;
        try {
            const accountRef = doc(db, 'accounts', selectedAccount.id);
            const newDate = Timestamp.fromDate(date.toDate());
            await updateDoc(accountRef, {
                nextCollectionDate: newDate,
                updatedAt: Timestamp.now(),
            });
            setSelectedAccount(prev => ({ ...prev, nextCollectionDate: newDate }));
            setAccountsData(prev => prev.map(acc => acc.id === selectedAccount.id ? { ...acc, nextCollectionDate: newDate } : acc));
            message.success('Next collection date updated');
        } catch (err) {
            message.error('Failed to update next collection date: ' + err.message);
        }
    };



    const handleShareBalance = method => {
        if (!selectedAccount?.phoneNumber) return message.error('Phone number mojood nahi hai.');

        const rem = selectedAccount.accountType === 'staff'
            ? calculateAmountOwed(selectedAccount, accountSummaries[selectedAccount.id]?.transactions || [])
            : selectedAccount.currentBalance;

        let text = '';
        const customerName = selectedAccount.accountName;
        const balance = Math.abs(rem).toFixed(0);

        if (rem > 0 && selectedAccount.accountType !== 'staff') {
            // Scenario 4: Jab customer ke paise jama hon
            text = `
Dear ${customerName},

Aapke Rs ${balance} hamare paas jama hain.
Aapke aetimad ka shukriya.

${COMPANY_NAME}
${COMPANY_PHONE}
        `.trim();
        } else if (rem < 0 || (rem > 0 && selectedAccount.accountType === 'staff')) {
            // Scenario 5: Jab customer se payment request karni ho
            text = `
Dear ${customerName},

Aapke zimme Rs ${balance} wajib-ul-ada hain.
Barae meherbani, jald az jald apni payment clear kar ke hamara taawun karein.

Shukriya.

Payment Details:
RAAST ID: ${RAAST_ID}
TITLE: ${COMPANY_NAME}

${COMPANY_NAME}
${COMPANY_PHONE}
        `.trim();
        } else {
            // Jab hisaab barabar ho
            text = `
Dear ${customerName},

Aapka hisaab barabar (settled) hai.
Aapke taawun ka shukriya.

${COMPANY_NAME}
${COMPANY_PHONE}
        `.trim();
        }

        const url = method === 'message'
            ? `sms:${selectedAccount.phoneNumber}?body=${encodeURIComponent(text)}`
            : `https://wa.me/${selectedAccount.phoneNumber}?text=${encodeURIComponent(text)}`;
        method === 'message' ? (window.location.href = url) : window.open(url, '_blank');
    };


    /**
     * Function #2: handleReceiptShare (Transaction Receipt Bhejne Ke Liye)
     * Yeh function bhi ab naye Roman Urdu templates ke mutabiq receipt banayega.
     */
    const handleReceiptShare = (record, method) => {
        if (!selectedAccount?.phoneNumber) return message.error('Phone number mojood nahi hai.');

        const amt = parseFloat(record.amount || 0).toFixed(0);
        const remaining = selectedAccount.accountType === 'staff'
            ? calculateAmountOwed(selectedAccount, accountSummaries[selectedAccount.id]?.transactions || [])
            : selectedAccount.currentBalance;
        const transactionDate = moment(record.date.toDate()).format('YYYY-MM-DD');
        const customerName = selectedAccount.accountName;

        // Message ka aaghaz "Dear Customer Name" se
        let text = `Dear ${customerName},\n\n`;
        text += `Transaction on ${transactionDate}:\n`;

        // Transaction ki noiyat ke mutabiq Roman Urdu message
        const transactionMessages = {
            odhar: `Aapko ${COMPANY_NAME}(${COMPANY_PHONE}) ne Rs ${amt} ka saman udhaar diya.\n`,
            wasooli: `Aapne ${COMPANY_NAME}(${COMPANY_PHONE}) ko Rs ${amt} ka payment kiya.\n`,
            // Neeche diye gaye types ke liye munasib Roman Urdu text
            cashIn: `Bank me Rs ${amt} jama kiye gaye.\n`,
            cashOut: `Bank se Rs ${amt} nikale gaye.\n`,
            pay: `Staff ko Rs ${amt} ada kiye gaye.\n`,
            expense: `Rs ${amt} ka kharcha kiya gaya.\n`,
        };

        text += transactionMessages[record.transactionType] || `Transaction: ${record.transactionType} of Rs ${amt}\n`;

        // Transaction ke waqt ka balance (Aapki instruction ke mutabiq "account mein")
        if (record.balanceAfter !== null) {
            const balanceBeforeTransaction = (record.balanceAfter - (record.transactionType === 'wasooli' ? -amt : amt)).toFixed(0);
            if (record.balanceAfter > 0 && record.transactionType === 'odhar') { // jama raqam se udhar
                text += `Us waqt aapke account mein Rs ${balanceBeforeTransaction} jama thay.\n`;
            } else if (record.transactionType === 'wasooli' && record.balanceAfter < 0) { // payment ki lekin udhar baqi
                text += `Us waqt aapke zimme Rs ${Math.abs(balanceBeforeTransaction)} thay.\n`;
            } else if (record.balanceAfter < 0) {
                text += `Us waqt aapke zimme Rs ${Math.abs(record.balanceAfter).toFixed(0)} thay.\n`;
            } else if (record.balanceAfter > 0) {
                text += `Us waqt aapke account mein Rs ${record.balanceAfter.toFixed(0)} thay.\n`;
            } else {
                text += `Us waqt aapka hisaab barabar tha.\n`;
            }
        }

        // Maujooda (Current) balance ki summary
        const currentBalance = Math.abs(remaining).toFixed(0);
        if (remaining > 0 && selectedAccount.accountType !== 'staff') {
            text += `Ab aapke account mein Rs ${currentBalance} jama hain.\n\nAapke aetimad ka shukriya.`;
        } else if (remaining < 0 || (remaining > 0 && selectedAccount.accountType === 'staff')) {
            text += `Ab aapke zimme Rs ${currentBalance} wajib-ul-ada hain.\n\nBarae meherbani, jald az jald baqaya raqam ada karein.`;
        } else {
            text += `Ab aapka hisaab barabar hai. Shukriya.`;
        }

        // Message ke akhir mein Company ka naam aur number
        text += `\n\n${COMPANY_NAME}\n${COMPANY_PHONE}`;

        // Agar udhaar hai to payment details bhi shamil karein
        if (remaining < 0 || (remaining > 0 && selectedAccount.accountType === 'staff')) {
            text += `\n\nAccount Details:\nRAAST ID: ${RAAST_ID}\nTITLE: ${COMPANY_NAME}`;
        }

        const url = method === 'message'
            ? `sms:${selectedAccount.phoneNumber}?body=${encodeURIComponent(text)}`
            : `https://wa.me/${selectedAccount.phoneNumber}?text=${encodeURIComponent(text)}`;
        method === 'message' ? (window.location.href = url) : window.open(url, '_blank');
    };

    const fetchShifts = async () => {
        try {
            const shiftsSnap = await getDocs(query(collection(db, 'shifts'), orderBy('startTime', 'desc')));
            const shiftsData = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setShifts(shiftsData);
        } catch (err) {
            message.error('Failed to fetch shifts: ' + err.message);
        }
    };

    const fetchTransactions = async () => {
        if (!selectedShift && (!transactionsDateRange[0] || !transactionsDateRange[1])) {
            setTransactionsList([]);
            return;
        }
        setTransactionsLoading(true);
        try {
            const accountsSnap = await getDocs(collection(db, 'accounts'));
            const accountsMap = {};
            accountsSnap.forEach(doc => {
                accountsMap[doc.id] = doc.data().accountName;
            });

            let q;
            if (selectedShift) {
                q = query(
                    collection(db, 'receipts'),
                    where('shiftId', '==', selectedShift.id),
                    orderBy('date', 'desc')
                );
            } else {
                const start = transactionsDateRange[0] ? Timestamp.fromDate(transactionsDateRange[0].startOf('day').toDate()) : Timestamp.fromDate(moment().subtract(30, 'days').startOf('day').toDate());
                const end = transactionsDateRange[1] ? Timestamp.fromDate(transactionsDateRange[1].endOf('day').toDate()) : Timestamp.fromDate(moment().endOf('day').toDate());
                q = query(
                    collection(db, 'receipts'),
                    where('date', '>=', start),
                    where('date', '<=', end),
                    orderBy('date', 'desc')
                );
            }

            const snap = await getDocs(q);
            const receipts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const mappedReceipts = receipts.map(r => ({
                ...r,
                accountName: accountsMap[r.accountId] || 'Unknown',
            }));
            setTransactionsList(mappedReceipts);
        } catch (err) {
            message.error('Failed to fetch transactions: ' + err.message);
        } finally {
            setTransactionsLoading(false);
        }
    };

    useEffect(() => {
        if (isTransactionsModalVisible) {
            fetchShifts();
        }
    }, [isTransactionsModalVisible]);

    useEffect(() => {
        if (isTransactionsModalVisible) {
            fetchTransactions();
        }
    }, [isTransactionsModalVisible, selectedShift, transactionsDateRange]);

    const filteredAccounts = useMemo(() => {
        return accountsData
            .filter(acc => acc.accountName.toLowerCase().includes(searchTerm.toLowerCase()) && acc.createdAt && acc.createdAt.toDate)
            .sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
    }, [accountsData, searchTerm]);

    const typeLabels = {
        odhar: 'Udhaar',
        wasooli: 'Wasooli',
        cashIn: 'Cash In',
        cashOut: 'Cash Out',
        pay: 'Pay',
        expense: 'Expense',
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'accountName',
            key: 'accountName',
            sorter: (a, b) => a.accountName.localeCompare(b.accountName),
            render: (text, rec) => <Link to={`/dashboard/account-details/${rec.id}`}>{text}</Link>,
        },
        { title: 'Phone', dataIndex: 'phoneNumber', key: 'phoneNumber' },
        {
            title: 'Balance / Amount Owed',
            key: 'balance',
            render: (_, rec) => {
                if (rec.accountType === 'staff') {
                    const amountOwed = calculateAmountOwed(rec, accountSummaries[rec.id]?.transactions || []);
                    return <span style={{ color: amountOwed >= 0 ? 'red' : 'green' }}>{amountOwed?.toFixed(2)}</span>;
                } else {
                    return <span style={{ color: rec.currentBalance >= 0 ? 'green' : 'red' }}>{rec.currentBalance?.toFixed(2)}</span>;
                }
            },
            sorter: (a, b) => {
                if (a.accountType === 'staff' && b.accountType === 'staff') {
                    return calculateAmountOwed(a, accountSummaries[a.id]?.transactions || []) -
                        calculateAmountOwed(b, accountSummaries[b.id]?.transactions || []);
                } else if (a.accountType === 'staff') {
                    return calculateAmountOwed(a, accountSummaries[a.id]?.transactions || []) - b.currentBalance;
                } else if (b.accountType === 'staff') {
                    return a.currentBalance - calculateAmountOwed(b, accountSummaries[b.id]?.transactions || []);
                } else {
                    return a.currentBalance - b.currentBalance;
                }
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, rec) => {
                let transactionButtons;
                switch (rec.accountType) {
                    case 'customer':
                    case 'supplier':
                        transactionButtons = (
                            <>
                                <Tooltip title="Add Udhaar">
                                    <Button style={{ backgroundColor: 'red', color: '#fff' }} size="small" onClick={() => showReceiptModal(rec, 'odhar')}>
                                        Udhaar
                                    </Button>
                                </Tooltip>
                                <Tooltip title="Add Wasooli">
                                    <Button style={{ backgroundColor: 'green', color: '#fff' }} size="small" onClick={() => showReceiptModal(rec, 'wasooli')}>
                                        Wasooli
                                    </Button>
                                </Tooltip>
                            </>
                        );
                        break;
                    case 'bank':
                        transactionButtons = (
                            <>
                                <Tooltip title="Cash In">
                                    <Button style={{ backgroundColor: 'green', color: '#fff' }} size="small" onClick={() => showReceiptModal(rec, 'cashIn')}>
                                        Cash In
                                    </Button>
                                </Tooltip>
                                <Tooltip title="Cash Out">
                                    <Button style={{ backgroundColor: 'red', color: '#fff' }} size="small" onClick={() => showReceiptModal(rec, 'cashOut')}>
                                        Cash Out
                                    </Button>
                                </Tooltip>
                            </>
                        );
                        break;
                    case 'staff':
                        transactionButtons = (
                            <Tooltip title="Add Pay">
                                <Button style={{ backgroundColor: 'blue', color: '#fff' }} size="small" onClick={() => showReceiptModal(rec, 'pay')}>
                                    Pay
                                </Button>
                            </Tooltip>
                        );
                        break;
                    case 'expenses':
                        transactionButtons = (
                            <Tooltip title="Add Expense">
                                <Button style={{ backgroundColor: 'orange', color: '#fff' }} size="small" onClick={() => showReceiptModal(rec, 'expense')}>
                                    Expense
                                </Button>
                            </Tooltip>
                        );
                        break;
                    default:
                        transactionButtons = null;
                }
                return (
                    <Space size="small">
                        <Tooltip title="Edit">
                            <Button type="primary" icon={<EditOutlined />} onClick={() => showModal(rec)} size="small" />
                        </Tooltip>
                        <Tooltip title="Delete">
                            <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(rec.id)} size="small" />
                        </Tooltip>
                        <Tooltip title="View Receipts">
                            <Button icon={<EyeOutlined />} onClick={() => handleViewReceipts(rec)} size="small" />
                        </Tooltip>
                        {transactionButtons}
                    </Space>
                );
            },
        },
    ];

    const receiptColumns = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: d => moment(d.toDate()).format('YYYY-MM-DD'),
        },
        {
            title: 'Transaction Type',
            key: 'transactionType',
            render: (_, r) => typeLabels[r.transactionType] || r.transactionType,
        },
        {
            title: 'Amount',
            dataIndex: 'amount',
            key: 'amount',
            render: (amount, record) => {
                const value = parseFloat(amount || 0);
                const isOutflow = ['odhar', 'cashOut', 'pay', 'expense'].includes(record.transactionType);
                const style = isOutflow ? { color: '#cf1322' } : { color: '#3f8600' };
                return <span style={style}>{value?.toFixed(2)}</span>;
            },
        },
        {
            title: 'Running Balance',
            dataIndex: 'balanceAfter',
            key: 'runningBalance',
            render: balance => (
                <span style={{ color: balance >= 0 ? '#3f8600' : '#cf1322' }}>
                    {balance !== null ? balance?.toFixed(2) : '-'}
                </span>
            ),
        },
        {
            title: 'Note',
            dataIndex: 'note',
            key: 'note',
            render: n => n || '-',
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, r) => (
                <Space>
                    <Button size="small" onClick={() => handleReceiptShare(r, 'message')}>Message</Button>
                    <Button size="small" onClick={() => handleReceiptShare(r, 'whatsapp')}>WhatsApp</Button>
                </Space>
            ),
        },
    ];

    const transactionsColumns = [
        { title: 'Date', dataIndex: 'date', key: 'date', render: d => moment(d.toDate()).format('YYYY-MM-DD') },
        {
            title: 'Shift',
            key: 'shift',
            render: (_, record) => {
                const shift = shiftMap[record.shiftId];
                if (shift) {
                    const start = moment(shift.startTime.toDate()).format('YYYY-MM-DD HH:mm');
                    const end = shift.endTime ? moment(shift.endTime.toDate()).format('HH:mm') : 'Ongoing';
                    return `${start} - ${end}`;
                } else {
                    return 'Unknown';
                }
            },
        },
        { title: 'Account', dataIndex: 'accountName', key: 'accountName' },
        { title: 'Type', dataIndex: 'transactionType', key: 'transactionType', render: type => typeLabels[type] || type },
        { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => parseFloat(a)?.toFixed(2) },
        { title: 'Balance After', dataIndex: 'balanceAfter', key: 'balanceAfter', render: b => b !== null ? b?.toFixed(2) : '-' },
        { title: 'Note', dataIndex: 'note', key: 'note', render: n => n || '-' },
    ];

    return (
        <div className="account-management-card">
            <div className="account-header d-flex justify-content-between flex-wrap mb-3">
                <Title level={3}>Account Management</Title>
                <Space wrap style={{ marginTop: 10 }}>
                    <Input
                        placeholder="Search by name"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: 300 }}
                        prefix={<SearchOutlined />}
                    />
                    <Button type="primary" icon={<UserAddOutlined />} onClick={() => showModal()}>Add Account</Button>
                    <Button icon={<FilePdfOutlined />} onClick={exportAccountsToPDF}>Export to PDF</Button>
                    <Button onClick={() => setIsTransactionsModalVisible(true)}>Last Transactions</Button>
                </Space>
            </div>

            <Card type="inner" title="Grand Totals (Across All Accounts)" style={{ marginBottom: 20, fontSize: 18, fontWeight: 'bold' }}>
                <Space size="large">
                    <span>Total Wasooli: {grandTotals.totalWasooli?.toFixed(2)}</span>
                    <span>Total Odhar: {grandTotals.totalOdhar?.toFixed(2)}</span>
                    <span>Total Salaries: {grandTotals.totalSalaries?.toFixed(2)}</span>
                    <span>Total Expenses: {grandTotals.totalExpenses?.toFixed(2)}</span>
                </Space>
            </Card>

            <Table
                columns={columns}
                dataSource={filteredAccounts}
                rowKey="id"
                pagination={false}
                bordered
                scroll={{ x: 'max-content' }}
            />

            <Modal
                title={editingId ? 'Edit Account' : 'Add New Account'}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
                width={800}
                style={{ maxWidth: '95vw' }}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
                        <Form.Item name="accountType" label="Account Type" rules={[{ required: true, message: 'Please select account type' }]}>
                            <Select placeholder="Select account type" disabled={!!editingId}>
                                {isManager ? (
                                    <Option value="customer">Customer</Option>
                                ) : (
                                    <>
                                        <Option value="bank">Bank</Option>
                                        <Option value="supplier">Supplier</Option>
                                        <Option value="customer">Customer</Option>
                                        <Option value="staff">Staff</Option>
                                        <Option value="expenses">Expenses</Option>
                                    </>
                                )}
                            </Select>
                        </Form.Item>

                        <Form.Item shouldUpdate={(prev, curr) => prev.accountType !== curr.accountType} noStyle>
                            {({ getFieldValue }) => {
                                const accountType = getFieldValue('accountType');
                                let label = 'Account Name';
                                if (accountType === 'bank') label = 'Bank Name';
                                else if (accountType === 'supplier') label = 'Supplier Name';
                                else if (accountType === 'customer') label = 'Customer Name';
                                else if (accountType === 'staff') label = 'Staff Name';
                                else if (accountType === 'expenses') label = 'Expense Name';
                                return (
                                    <Form.Item
                                        name="accountName"
                                        label={label}
                                        rules={[{ required: true, message: `Please enter ${label.toLowerCase()}` }]}
                                    >
                                        <Input placeholder={`Enter ${label.toLowerCase()}`} />
                                    </Form.Item>
                                );
                            }}
                        </Form.Item>

                        <Form.Item shouldUpdate={(prev, curr) => prev.accountType !== curr.accountType} noStyle>
                            {({ getFieldValue }) => {
                                const accountType = getFieldValue('accountType');
                                if (accountType === 'supplier') {
                                    return (
                                        <Form.Item
                                            name="phoneNumber"
                                            label="Phone Number"
                                            rules={[{ required: true, message: 'Please enter phone number' }]}
                                        >
                                            <Input placeholder="Enter phone number" />
                                        </Form.Item>
                                    );
                                } else if (accountType === 'customer') {
                                    return (
                                        <>
                                            <Form.Item name="phoneNumber" label="Phone Number">
                                                <Input placeholder="Enter phone number" />
                                            </Form.Item>
                                            <Form.Item name="cnic" label="CNIC">
                                                <Input placeholder="Enter CNIC" />
                                            </Form.Item>
                                            <Form.Item name="address" label="Address">
                                                <Input.TextArea placeholder="Enter address" />
                                            </Form.Item>
                                            <Form.Item name="creditLimit" label="Credit Limit">
                                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0.00" />
                                            </Form.Item>
                                            <Form.Item name="nextCollectionDate" label="Next Collection Date">
                                                <DatePicker style={{ width: '100%' }} />
                                            </Form.Item>
                                        </>
                                    );
                                } else if (accountType === 'staff') {
                                    return (
                                        <>
                                            <Form.Item name="address" label="Address" rules={[{ required: true, message: 'Please enter address' }]}>
                                                <Input.TextArea placeholder="Enter address" />
                                            </Form.Item>
                                            <Form.Item name="phoneNumber" label="Phone Number" rules={[{ required: true, message: 'Please enter phone number' }]}>
                                                <Input placeholder="Enter phone number" />
                                            </Form.Item>
                                            <Form.Item name="cnic" label="CNIC" rules={[{ required: true, message: 'Please enter CNIC' }]}>
                                                <Input placeholder="Enter CNIC" />
                                            </Form.Item>
                                            <Form.Item name="salary" label="Monthly Salary" rules={[{ required: true, message: 'Please enter salary' }]}>
                                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0.00" />
                                            </Form.Item>
                                        </>
                                    );
                                }
                                return null;
                            }}
                        </Form.Item>

                        <Form.Item name="initialBalance" label="Initial Balance" rules={[{ required: true, message: 'Please enter initial balance' }]}>
                            <InputNumber min={0} style={{ width: '100%' }} placeholder="0.00" formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value.replace(/\$\s?|(,*)/g, '')} />
                        </Form.Item>

                        <Form.Item name="status" label="Status">
                            <Select placeholder="Select status">
                                <Option value="active">Active</Option>
                                <Option value="inactive">Inactive</Option>
                            </Select>
                        </Form.Item>
                    </div>

                    <Form.Item>
                        <Space style={{ float: 'right' }}>
                            <Button onClick={handleCancel}>Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={submitLoading}>{editingId ? 'Update' : 'Create'}</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={`Receipts for ${selectedAccount?.accountName}`}
                open={receiptModalVisible}
                onCancel={handleCloseReceiptsModal}
                footer={
                    <Space>
                        <Button icon={<MessageOutlined />} onClick={() => handleShareBalance('message')}>Message</Button>
                        <Button icon={<WhatsAppOutlined />} onClick={() => handleShareBalance('whatsapp')}>WhatsApp</Button>
                        <Button icon={<FilePdfOutlined />} onClick={exportReceiptsToPDF} loading={receiptsLoading}>Download PDF</Button>
                        <Button onClick={handleCloseReceiptsModal}>Close</Button>
                    </Space>
                }
                width={800}
            >
                <RangePicker
                    style={{ marginBottom: 16 }}
                    value={receiptDateRange}
                    onChange={dates => setReceiptDateRange(dates || [null, null])}
                    allowClear
                />
                {receiptsLoading ? (
                    <Spin size="large" tip="Loading receipts..." />
                ) : receiptsWithBalance.length === 0 ? (
                    <p>No receipts found for this date range.</p>
                ) : (
                    <>
                        <Table
                            dataSource={receiptsWithBalance}
                            columns={receiptColumns}
                            rowKey="id"
                            pagination={false}
                            bordered
                            size="small"
                            scroll={{ x: 'max-content' }}
                        />
                        {selectedAccount && (
                            <Card style={{ marginTop: 16 }}>
                                <Title level={4}>Totals for Selected Period</Title>
                                {selectedAccount.accountType === 'customer' && (
                                    <>
                                        {selectedAccount.nextCollectionDate && (
                                            <p><strong>Next Collection Date:</strong> {moment(selectedAccount.nextCollectionDate.toDate()).format('YYYY-MM-DD')}</p>
                                        )}
                                        <div style={{ marginTop: 8 }}>
                                            <Text strong>Set Next Collection Date:</Text>
                                            <DatePicker
                                                style={{ marginLeft: 8 }}
                                                disabledDate={current => current && current < moment().startOf('day')}
                                                onChange={handleSetNextCollectionDate}
                                                placeholder="Select date"
                                            />
                                        </div>
                                    </>
                                )}
                                {selectedAccount.accountType === 'customer' || selectedAccount.accountType === 'supplier' ? (
                                    <>
                                        <p>Total Odhar: {filteredReceipts.filter(r => r.transactionType === 'odhar').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)?.toFixed(2)}</p>
                                        <p>Total Wasooli: {filteredReceipts.filter(r => r.transactionType === 'wasooli').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)?.toFixed(2)}</p>
                                    </>
                                ) : selectedAccount.accountType === 'bank' ? (
                                    <>
                                        <p>Total Cash In: {filteredReceipts.filter(r => r.transactionType === 'cashIn').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)?.toFixed(2)}</p>
                                        <p>Total Cash Out: {filteredReceipts.filter(r => r.transactionType === 'cashOut').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)?.toFixed(2)}</p>
                                    </>
                                ) : selectedAccount.accountType === 'staff' ? (
                                    <p>Total Pay: {filteredReceipts.filter(r => r.transactionType === 'pay').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)?.toFixed(2)}</p>
                                ) : selectedAccount.accountType === 'expenses' ? (
                                    <p>Total Expense: {filteredReceipts.filter(r => r.transactionType === 'expense').reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)?.toFixed(2)}</p>
                                ) : null}
                            </Card>
                        )}
                    </>
                )}
            </Modal>

            <Modal
                title={`Add ${typeLabels[receiptType] || receiptType} for ${selectedAccountForReceipt?.accountName}`}
                open={isReceiptModalVisible}
                onCancel={() => setIsReceiptModalVisible(false)}
                footer={null}
                width={400}
            >
                <Form form={receiptForm} layout="vertical" onFinish={handleAddReceipt}>
                    <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Please select a date' }]}>
                        <Input type="date" style={{ width: '100%' }} defaultValue={moment().format('YYYY-MM-DD')} />
                    </Form.Item>
                    <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Please enter amount' }]}>
                        <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="0.00" />
                    </Form.Item>
                    <Form.Item name="note" label="Note">
                        <Input.TextArea />
                    </Form.Item>
                    <Form.Item name="transactionType" label="Transaction Type">
                        <Input disabled value={typeLabels[receiptType] || receiptType} />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ float: 'right' }}>
                            <Button onClick={() => setIsReceiptModalVisible(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={submitLoading}>Add Receipt</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Last Transactions"
                open={isTransactionsModalVisible}
                onCancel={() => setIsTransactionsModalVisible(false)}
                footer={null}
                width={1000}
            >
                <Space style={{ marginBottom: 16 }}>
                    <Select
                        style={{ width: 200 }}
                        placeholder="Select Shift"
                        value={selectedShift ? selectedShift.id : 'all'}
                        onChange={value => {
                            if (value === 'all') {
                                setSelectedShift(null);
                            } else {
                                setSelectedShift(shifts.find(s => s.id === value));
                            }
                        }}
                    >
                        <Option value="all">All Shifts</Option>
                        {shifts.map(shift => (
                            <Option key={shift.id} value={shift.id}>
                                {moment(shift.startTime.toDate()).format('YYYY-MM-DD HH:mm')} - {shift.endTime ? moment(shift.endTime.toDate()).format('HH:mm') : 'Ongoing'}
                            </Option>
                        ))}
                    </Select>
                    <RangePicker
                        value={transactionsDateRange}
                        onChange={dates => setTransactionsDateRange(dates || [null, null])}
                        allowClear
                    />
                    <Button icon={<FilePdfOutlined />} onClick={exportTransactionsToPDF}>Export to PDF</Button>
                </Space>
                {transactionsLoading ? (
                    <Spin size="large" tip="Loading transactions..." />
                ) : transactionsList.length === 0 ? (
                    <p>Please select a shift or date range to view transactions.</p>
                ) : (
                    <>
                        <Table
                            dataSource={transactionsList}
                            columns={transactionsColumns}
                            rowKey="id"
                            pagination={false}
                            bordered
                            scroll={{ x: 'max-content' }}
                        />
                        <Card type="inner" style={{ marginTop: 16 }} title="All-Time Totals">
                            <Space size="large">
                                <span>Total Wasooli: {grandTotals.totalWasooli?.toFixed(2)}</span>
                                <span>Total Odhar: {grandTotals.totalOdhar?.toFixed(2)}</span>
                                <span>Total Salaries: {grandTotals.totalSalaries?.toFixed(2)}</span>
                                <span>Total Expenses: {grandTotals.totalExpenses?.toFixed(2)}</span>
                            </Space>
                        </Card>
                    </>
                )}
            </Modal>
        </div>
    );
}

export default AccountManagement;