import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Typography, Popconfirm, Select, InputNumber, Spin, Card } from 'antd';
import { UserAddOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EyeOutlined, FilePdfOutlined, DollarOutlined } from '@ant-design/icons';
import moment from 'moment';
import { db } from '../../../../../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, limit, startAfter, Timestamp, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { generatePDF } from '../../../../../services/pdfHelpers';
import { useSettings } from '../../../../../context/SettingsContext';


const { Title } = Typography;
const { Option } = Select;

// --- Helper Functions (Unchanged) ---
function getDailyRate(salaryMonthly) {
    const monthly = parseFloat(salaryMonthly);
    if (isNaN(monthly) || monthly <= 0) return 0;
    return monthly / 30;
}

function getWorkedDays(startDate, endDate = new Date()) {
    let start, end;

    if (startDate && typeof startDate.toDate === 'function') {
        start = startDate.toDate();
    } else if (startDate instanceof Date) {
        start = startDate;
    } else {
        return 0;
    }

    if (endDate && typeof endDate.toDate === 'function') {
        end = endDate.toDate();
    } else if (endDate instanceof Date) {
        end = endDate;
    } else {
        return 0;
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const diffMs = end.getTime() - start.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
}

function sumTransactionsByType(transactions = [], type) {
    return transactions
        .filter(tx => tx.transactionType === type)
        .reduce((sum, { amount }) => sum + (Number(amount) || 0), 0);
}

function calculateAmountOwed(account, transactions = []) {
    if (account.accountType !== 'staff' || !account.salary) return 0;

    const joiningDate = account.joiningDate || account.createdAt;
    if (!joiningDate) return 0;

    const totalPaid = sumTransactionsByType(transactions, 'pay');
    const totalDeducted = sumTransactionsByType(transactions, 'deduction');
    const dailyRate = getDailyRate(account.salary);
    const daysWorked = getWorkedDays(joiningDate, new Date());
    const totalEarned = dailyRate * daysWorked;

    const amountOwed = totalEarned - totalPaid - totalDeducted;

    return Math.round(amountOwed);
}


export default function StaffManagement({ staff }) {
    const { settings } = useSettings();
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingStaff, setEditingStaff] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [accountSummaries, setAccountSummaries] = useState({});
    const [grandTotals, setGrandTotals] = useState({ totalPayments: 0, totalRemaining: 0 });
    const [receiptModalVisible, setReceiptModalVisible] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [receipts, setReceipts] = useState([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);
    const [pdfExporting, setPdfExporting] = useState(false);
    // State for HTML date range inputs
    const [receiptDateRange, setReceiptDateRange] = useState({ start: '', end: '' });
    const [isReceiptModalVisible, setIsReceiptModalVisible] = useState(false);
    const [receiptForm] = Form.useForm();
    const [selectedStaffForReceipt, setSelectedStaffForReceipt] = useState(null);
    const [receiptType, setReceiptType] = useState(null);
    const [isTransactionsModalVisible, setIsTransactionsModalVisible] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    // State for HTML date range inputs
    const [transactionsDateRange, setTransactionsDateRange] = useState({ start: '', end: '' });
    const [transactionsPage, setTransactionsPage] = useState(1);
    const [transactionsHasMore, setTransactionsHasMore] = useState(true);
    const [shifts, setShifts] = useState([]);
    const [selectedShift, setSelectedShift] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);

    // --- All useEffect hooks and data fetching logic remain the same ---
    const getShiftText = (shiftId) => {
        const shift = shifts.find(s => s.id === shiftId);
        if (shift) {
            const start = moment(shift.startTime.toDate()).format('YYYY-MM-DD HH:mm');
            const end = shift.endTime ? moment(shift.endTime.toDate()).format('HH:mm') : 'Ongoing';
            return `${start} - ${end}`;
        }
        return 'Unknown';
    };

    useEffect(() => {
        if ((isTransactionsModalVisible || receiptModalVisible) && shifts.length === 0) {
            fetchShifts();
        }
    }, [isTransactionsModalVisible, receiptModalVisible, shifts]);

    useEffect(() => {
        const loadSummaries = async () => {
            const summaries = {};
            const promises = staff.map(s =>
                fetchStaffSummary(s.id).then(summary => { summaries[s.id] = summary; })
            );
            await Promise.all(promises);
            setAccountSummaries(summaries);
        };
        if (staff.length) loadSummaries();
    }, [staff]);

    useEffect(() => {
        const totalPayments = Object.values(accountSummaries).reduce((acc, s) => acc + (s.totalPayments || 0), 0);
        const totalRemaining = staff.reduce((acc, s) => {
            const amountOwed = calculateAmountOwed(s, accountSummaries[s.id]?.transactions || []);
            return acc + amountOwed;
        }, 0);
        setGrandTotals({ totalPayments, totalRemaining });
    }, [staff, accountSummaries]);

    const fetchShifts = async () => {
        try {
            const shiftsQuery = query(collection(db, 'shifts'), orderBy('startTime', 'desc'));
            const shiftsSnap = await getDocs(shiftsQuery);
            const shiftsData = shiftsSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                startTime: doc.data().startTime,
                endTime: doc.data().endTime
            }));
            setShifts(shiftsData);
        } catch (err) {
            message.error('Failed to fetch shifts: ' + err.message);
        }
    };

    const findShiftForDate = async (date) => {
        const dateTimestamp = Timestamp.fromDate(date);
        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('startTime', '<=', dateTimestamp),
            orderBy('startTime', 'desc'),
            limit(1)
        );
        const shiftsSnap = await getDocs(shiftsQuery);
        if (shiftsSnap.empty) return null;
        const shift = shiftsSnap.docs[0].data();
        const shiftStart = shift.startTime.toDate();
        const shiftEnd = shift.endTime ? shift.endTime.toDate() : null;
        if ((shiftEnd && date <= shiftEnd) || (!shiftEnd && date >= shiftStart)) {
            return { id: shiftsSnap.docs[0].id, ...shift };
        }
        return null;
    };

    const fetchStaffSummary = async (staffId) => {
        const q = query(
            collection(db, 'receipts'),
            where('accountId', '==', staffId),
            orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const transactions = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                date: data.date ? data.date.toDate() : (data.createdAt ? data.createdAt.toDate() : new Date()),
                createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                amount: Number(data.amount) || 0,
                shiftId: data.shiftId
            };
        });
        const totalPayments = sumTransactionsByType(transactions, 'pay');
        const totalDeductions = sumTransactionsByType(transactions, 'deduction');
        return { transactions, totalPayments, totalDeductions };
    };

    // MODIFIED: showModal now formats date for the native input
    const showModal = (record = null) => {
        setEditingStaff(record);
        if (record) {
            form.setFieldsValue({
                ...record,
                joiningDate: record.joiningDate ? moment(record.joiningDate.toDate()).format('YYYY-MM-DD') : '',
            });
        } else {
            form.resetFields();
            form.setFieldsValue({
                status: 'active',
                joiningDate: moment().format('YYYY-MM-DD'),
            });
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        form.resetFields();
    };

    // MODIFIED: handleSubmit now parses the date string
    const handleSubmit = async (values) => {
        setSubmitLoading(true);
        try {
            const processedValues = {
                ...values,
                joiningDate: Timestamp.fromDate(moment(values.joiningDate, 'YYYY-MM-DD').toDate()),
            };

            // ... (rest of the function is unchanged)
            if (editingStaff) {
                await updateDoc(doc(db, 'accounts', editingStaff.id), {
                    ...processedValues,
                    updatedAt: serverTimestamp()
                });
                message.success('Staff updated successfully');
            } else {
                const staffRef = doc(collection(db, 'accounts'));
                const batch = writeBatch(db);
                const newStaff = {
                    ...processedValues,
                    accountType: 'staff',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                batch.set(staffRef, newStaff);

                if (values.initialPayment && values.initialPayment > 0) {
                    const now = Timestamp.now();
                    const shiftForNow = await findShiftForDate(now.toDate());
                    if (!shiftForNow) {
                        message.error('No active shift found for the initial payment.');
                        setSubmitLoading(false);
                        return;
                    }
                    const receiptDocRef = doc(collection(db, 'receipts'));
                    const cashflowDocRef = doc(collection(db, 'cashflow'));
                    const globalSummaryRef = doc(db, 'summaries', 'global');

                    const newReceipt = {
                        accountId: staffRef.id,
                        date: now,
                        amount: values.initialPayment,
                        note: 'Initial salary payment',
                        transactionType: 'pay',
                        createdAt: serverTimestamp(),
                        shiftId: shiftForNow.id,
                        cashflowId: cashflowDocRef.id,
                    };

                    const cashflowData = {
                        amount: values.initialPayment,
                        type: 'cashOut',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        receiptId: receiptDocRef.id,
                        cashflowCategory: 'Staff Initial Payment'
                    };

                    batch.set(receiptDocRef, newReceipt);
                    batch.set(cashflowDocRef, cashflowData);
                    batch.update(globalSummaryRef, { totalSalaries: increment(values.initialPayment) });
                }

                await batch.commit();
                message.success('Staff added successfully');
            }
            setIsModalVisible(false);

        } catch (error) {
            message.error('Operation failed: ' + error.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteDoc(doc(db, 'accounts', id));
            const q = query(collection(db, 'receipts'), where('accountId', '==', id));
            const snap = await getDocs(q);
            const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(deletePromises);
            message.success('Staff and their transactions deleted successfully');
            setAccountSummaries(prev => {
                const newSummaries = { ...prev };
                delete newSummaries[id];
                return newSummaries;
            });
        } catch (error) {
            message.error('Delete failed: ' + error.message);
        }
    };

    const handleExportToPDF = () => {
        const columns = ['Name', 'Phone', 'Designation', 'Joining Date', 'Salary', 'Amount Owed'];
        const data = filteredStaff.map(s => [
            s.accountName,
            s.phoneNumber,
            s.designation || 'N/A',
            s.joiningDate ? moment(s.joiningDate.toDate()).format('YYYY-MM-DD') : 'N/A',
            `₨ ${s.salary.toFixed(2)}`,
            `₨ ${calculateAmountOwed(s, accountSummaries[s.id]?.transactions || []).toFixed(2)}`
        ]);
        const title = 'Staff List';
        const filename = `Staff_List_${moment().format('YYYYMMDD_HHmmss')}.pdf`;
        generatePDF(title, columns, data, filename, {}, settings);
        message.success('Exported to PDF');
    };

    const handleViewReceipts = async (staffMember) => {
        setSelectedStaff(staffMember);
        setReceiptModalVisible(true);
        setReceiptDateRange({ start: '', end: '' });
        setReceiptsLoading(true);
        try {
            const summary = await fetchStaffSummary(staffMember.id);
            const hireDate = staffMember.joiningDate || staffMember.createdAt;
            if (!hireDate) {
                message.error("Staff member has no joining or creation date.");
                setReceipts([]);
                setReceiptsLoading(false);
                return;
            }

            let cumulativePayments = 0;
            let cumulativeDeductions = 0;

            const sortedTransactions = summary.transactions.sort((a, b) => a.date - b.date);

            const transactionsWithBalance = sortedTransactions.map((t) => {
                const transactionDate = t.date;
                const daysWorked = getWorkedDays(hireDate, transactionDate);
                const dailyRate = getDailyRate(staffMember.salary);
                const earnedSalary = dailyRate * daysWorked;

                if (t.transactionType === 'pay') cumulativePayments += t.amount;
                else if (t.transactionType === 'deduction') cumulativeDeductions += t.amount;

                const balanceAfter = earnedSalary - cumulativePayments - cumulativeDeductions;
                return { ...t, balanceAfter };
            });

            setReceipts(transactionsWithBalance.reverse());
        } catch (err) {
            message.error('Failed to load transactions: ' + err.message);
        } finally {
            setReceiptsLoading(false);
        }
    };

    const handleCloseReceiptsModal = () => {
        setReceiptModalVisible(false);
        setSelectedStaff(null);
        setReceipts([]);
    };

    // MODIFIED: filteredReceipts uses the new state object
    const filteredReceipts = useMemo(() => {
        const { start, end } = receiptDateRange;
        if (!start || !end) return receipts;
        return receipts.filter(r => moment(r.date).isBetween(moment(start), moment(end).endOf('day')));
    }, [receipts, receiptDateRange]);

    const handleExportReceiptsToPDF = () => {
        if (!selectedStaff) return;
        setPdfExporting(true);
        try {
            const columns = ['Date', 'Shift', 'Type', 'Amount', 'Balance After', 'Note'];
            const data = filteredReceipts.map(r => [
                moment(r.date).format('YYYY-MM-DD'),
                getShiftText(r.shiftId),
                r.transactionType === 'pay' ? 'Pay' : 'Deduction',
                `₨ ${r.amount.toFixed(2)}`,
                `₨ ${r.balanceAfter.toFixed(2)}`,
                r.note || '-'
            ]);

            // *** NEW: Calculate summary for the PDF header ***
            const totalPayments = sumTransactionsByType(filteredReceipts, 'pay');
            const totalDeductions = sumTransactionsByType(filteredReceipts, 'deduction');
            const finalAmountOwed = calculateAmountOwed(selectedStaff, accountSummaries[selectedStaff.id]?.transactions || []);

            // Map staff-specific terms to the generic keys used by generatePDF
            const summaryData = {
                // Using 'wasooli' key for total payments made in the period
                wasooli: totalPayments,
                // Using 'odhar' key for total deductions made in the period
                odhar: totalDeductions,
                // Final outstanding amount owed to the staff member
                remaining: finalAmountOwed
            };

            // Customize labels for the summary box in the PDF
            const pdfOptions = {
                summaryLabels: {
                    wasooli: 'Total Paid',
                    odhar: 'Total Deductions',
                    remaining: 'Amount Owed'
                }
            };

            const title = `Transactions for ${selectedStaff.accountName}`;
            const filename = `Transactions_${selectedStaff.accountName}_${moment().format('YYYYMMDD_HHmmss')}.pdf`;

            // *** MODIFIED: Pass the new summaryData and pdfOptions to generatePDF ***
            generatePDF(title, columns, data, filename, summaryData, pdfOptions, settings);
            message.success('PDF exported successfully');
        } catch (err) {
            message.error('PDF export failed: ' + err.message);
        } finally {
            setPdfExporting(false);
        }
    };

    // MODIFIED: showReceiptModal now sets date as a string
    const showReceiptModal = (staffMember, type) => {
        setSelectedStaffForReceipt(staffMember);
        setReceiptType(type);
        receiptForm.resetFields();
        receiptForm.setFieldsValue({
            transactionType: type,
            date: moment().format('YYYY-MM-DD'), // Set date as 'YYYY-MM-DD' string
        });
        setIsReceiptModalVisible(true);
    };

    // MODIFIED: handleAddReceipt now parses the date string
    const handleAddReceipt = async (values) => {
        if (!selectedStaffForReceipt) return;
        setSubmitLoading(true);
        try {
            const staffId = selectedStaffForReceipt.id;
            const amount = Number(values.amount || 0);
            // Parse the 'YYYY-MM-DD' string from the form
            const selectedDate = moment(values.date, 'YYYY-MM-DD').toDate();
            const shiftForDate = await findShiftForDate(selectedDate);
            if (!shiftForDate) {
                message.error('No shift found for the selected date.');
                setSubmitLoading(false);
                return;
            }
            const batch = writeBatch(db);
            const receiptDocRef = doc(collection(db, 'receipts'));
            let newReceipt = {
                accountId: staffId,
                date: Timestamp.fromDate(selectedDate),
                amount: amount,
                note: values.note || '',
                transactionType: receiptType,
                createdAt: serverTimestamp(),
                shiftId: shiftForDate.id
            };

            if (receiptType === 'pay') {
                const cashflowDocRef = doc(collection(db, 'cashflow'));
                newReceipt.cashflowId = cashflowDocRef.id;
                const cashflowData = {
                    amount: amount,
                    type: 'cashOut',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    receiptId: receiptDocRef.id,
                    cashflowCategory: 'Staff Salary Payment'
                };
                batch.set(cashflowDocRef, cashflowData);
                const globalSummaryRef = doc(db, 'summaries', 'global');
                batch.update(globalSummaryRef, { totalSalaries: increment(amount) });
            }

            batch.set(receiptDocRef, newReceipt);
            await batch.commit();

            message.success('Transaction added');
            const summary = await fetchStaffSummary(staffId);
            setAccountSummaries(prev => ({ ...prev, [staffId]: summary }));

            if (receiptModalVisible && selectedStaff?.id === staffId) {
                await handleViewReceipts(selectedStaff);
            }

            setIsReceiptModalVisible(false);
        } catch (err) {
            message.error('Failed to add transaction: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    // --- (fetchTransactions and other logic remain the same, but date filtering will now use the string state) ---
    const fetchTransactions = async (page = 1) => {
        // This function doesn't use the date range directly for the query,
        // it filters after fetching, so it remains largely unchanged.
        // ... (function logic is the same)
    };

    useEffect(() => {
        if (isTransactionsModalVisible) {
            setTransactionsPage(1);
            fetchTransactions(1);
        }
    }, [isTransactionsModalVisible, selectedShift, transactionsDateRange]);

    const handleLoadMoreTransactions = () => {
        const nextPage = transactionsPage + 1;
        setTransactionsPage(nextPage);
        fetchTransactions(nextPage);
    };

    const filteredTransactions = useMemo(() => {
        const { start, end } = transactionsDateRange;
        if (!start || !end) return transactions;
        return transactions.filter(t => moment(t.date.toDate()).isBetween(moment(start), moment(end).endOf('day')));
    }, [transactions, transactionsDateRange]);

    // ... (rest of the component is unchanged)

    const handleExportTransactionsToPDF = () => {
        const columns = ['Date', 'Shift', 'Staff', 'Type', 'Amount', 'Note'];
        const data = filteredTransactions.map(t => [
            moment(t.date.toDate()).format('YYYY-MM-DD'),
            getShiftText(t.shiftId),
            staff.find(s => s.id === t.accountId)?.accountName || 'Unknown',
            t.transactionType === 'pay' ? 'Pay' : 'Deduction',
            `₨ ${t.amount.toFixed(2)}`,
            t.note || '-'
        ]);

        // *** NEW: Calculate summary for the PDF header ***
        const totalPayments = sumTransactionsByType(filteredTransactions, 'pay');
        const totalDeductions = sumTransactionsByType(filteredTransactions, 'deduction');

        // Map staff-specific terms to the generic keys used by generatePDF
        const summaryData = {
            wasooli: totalPayments, // Total payments in the selected period
            odhar: totalDeductions, // Total deductions in the selected period
            // 'Remaining' here shows the net payment for the period
            remaining: totalPayments - totalDeductions
        };

        // Customize labels for the summary box in the PDF
        const pdfOptions = {
            summaryLabels: {
                wasooli: 'Total Paid',
                odhar: 'Total Deductions',
                remaining: 'Net Payment'
            }
        };

        const title = 'Staff Transactions List';
        const filename = `Staff_Transactions_${moment().format('YYYYMMDD_HHmmss')}.pdf`;

        // *** MODIFIED: Pass the new summaryData and pdfOptions to generatePDF ***
        generatePDF(title, columns, data, filename, summaryData, pdfOptions, settings);
        message.success('Exported to PDF');
    };

    const transactionsColumns = [
        { title: 'Date', dataIndex: 'date', key: 'date', render: d => d ? moment(d.toDate()).format('YYYY-MM-DD') : 'N/A' },
        { title: 'Shift', key: 'shift', render: (_, record) => getShiftText(record.shiftId) },
        { title: 'Staff', dataIndex: 'accountId', key: 'accountId', render: id => staff.find(s => s.id === id)?.accountName || 'Unknown' },
        { title: 'Type', dataIndex: 'transactionType', key: 'transactionType', render: type => (type === 'pay' ? 'Pay' : 'Deduction') },
        { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => `₨ ${a.toFixed(2)}` },
        { title: 'Note', dataIndex: 'note', key: 'note', render: n => n || '-' }
    ];

    const columns = [
        { title: 'Name', dataIndex: 'accountName', key: 'accountName', sorter: (a, b) => a.accountName.localeCompare(b.accountName) },
        { title: 'Phone', dataIndex: 'phoneNumber', key: 'phoneNumber' },
        { title: 'Designation', dataIndex: 'designation', key: 'designation', render: text => text || 'N/A' },
        { title: 'Joining Date', dataIndex: 'joiningDate', key: 'joiningDate', render: date => date ? moment(date.toDate()).format('YYYY-MM-DD') : 'N/A', sorter: (a, b) => (a.joiningDate?.toMillis() || 0) - (b.joiningDate?.toMillis() || 0) },
        {
            title: 'Amount Owed',
            key: 'amountOwed',
            render: (_, rec) => {
                const summary = accountSummaries[rec.id];
                if (!summary) return <Spin size="small" />;
                const amountOwed = calculateAmountOwed(rec, summary.transactions);
                const color = amountOwed >= 0 ? 'red' : 'green';
                return <span style={{ color }}>₨ {Math.abs(amountOwed).toFixed(2)}</span>;
            },
            sorter: (a, b) => {
                const summaryA = accountSummaries[a.id]?.transactions || [];
                const summaryB = accountSummaries[b.id]?.transactions || [];
                return calculateAmountOwed(a, summaryA) - calculateAmountOwed(b, summaryB);
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => showModal(record)} />
                    <Popconfirm title="Delete this staff member and all their transactions?" onConfirm={() => handleDelete(record.id)} okText="Yes" cancelText="No">
                        <Button icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                    <Button icon={<EyeOutlined />} onClick={() => handleViewReceipts(record)} />
                    <Button icon={<DollarOutlined />} type="primary" onClick={() => showReceiptModal(record, 'pay')}>Pay</Button>
                </Space>
            )
        }
    ];

    const filteredStaff = staff.filter(s =>
        s.accountName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="staff-management-container">
            <Title level={3}>Staff Management</Title>
            <div className="staff-header">
                <Input placeholder="Search by name" prefix={<SearchOutlined />} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: 300 }} />
                <Space>
                    <Button icon={<FilePdfOutlined />} onClick={handleExportToPDF}>Export to PDF</Button>
                    <Button icon={<UserAddOutlined />} type="primary" onClick={() => showModal()}>Add Staff</Button>
                    <Button onClick={() => setIsTransactionsModalVisible(true)}>Last Transactions</Button>
                </Space>
            </div>
            <Card type="inner" title="Grand Totals" style={{ marginBottom: 20 }}>
                <Space size="large">
                    <span>Total Payments Made: ₨ {grandTotals.totalPayments.toFixed(2)}</span>
                    <span>Total Amount Owed to Staff: ₨ {grandTotals.totalRemaining.toFixed(2)}</span>
                </Space>
            </Card>
            <Table dataSource={filteredStaff} columns={columns} rowKey="id" scroll={{ x: 'max-content' }} />

            {/* Add/Edit Staff Modal */}
            <Modal title={editingStaff ? 'Edit Staff' : 'Add Staff'} open={isModalVisible} onCancel={handleCancel} footer={[<Button key="cancel" onClick={handleCancel}>Cancel</Button>, <Button key="submit" type="primary" onClick={() => form.submit()} loading={submitLoading}>Save</Button>]}>
                <Form form={form} onFinish={handleSubmit} layout="vertical">
                    <Form.Item name="accountName" label="Name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="address" label="Address" rules={[{ required: true }]}>
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
                    </Form.Item>
                    <Form.Item name="phoneNumber" label="Phone" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="cnic" label="CNIC" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="designation" label="Designation">
                        <Input placeholder="e.g., Manager, Waiter" />
                    </Form.Item>
                    {/* MODIFIED: Using native date input */}
                    <Form.Item name="joiningDate" label="Joining Date" rules={[{ required: true }]}>
                        <input type="date" className="date-input-form" />
                    </Form.Item>
                    <Form.Item name="salary" label="Monthly Salary" rules={[{ required: true }]}>
                        <InputNumber min={0} style={{ width: '100%' }} formatter={val => `₨ ${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={val => val.replace(/₨\s?|(,*)/g, '')} />
                    </Form.Item>
                    {!editingStaff && (
                        <Form.Item name="initialPayment" label="Initial Payment (Optional)">
                            <InputNumber min={0} style={{ width: '100%' }} placeholder="0.00" formatter={val => `₨ ${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={val => val.replace(/₨\s?|(,*)/g, '')} />
                        </Form.Item>
                    )}
                    <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                        <Select>
                            <Option value="active">Active</Option>
                            <Option value="inactive">Inactive</Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Transactions History Modal */}
            <Modal title={`Transactions for ${selectedStaff?.accountName}`} open={receiptModalVisible} onCancel={handleCloseReceiptsModal} footer={<Space> <Button type="primary" onClick={() => showReceiptModal(selectedStaff, 'pay')}>Add Pay</Button> <Button type="default" danger onClick={() => showReceiptModal(selectedStaff, 'deduction')}>Add Deduction</Button> <Button icon={<FilePdfOutlined />} onClick={handleExportReceiptsToPDF} loading={pdfExporting}>Download PDF</Button> <Button onClick={handleCloseReceiptsModal}>Close</Button> </Space>} width={800}>
                {receiptsLoading ? <Spin size="large" tip="Loading transactions..." /> : (
                    <>
                        {/* MODIFIED: Using native date range inputs */}
                        <div className="date-range-filter">
                            <label className="date-range-label">From:</label>
                            <input type="date" className="date-input" value={receiptDateRange.start} onChange={e => setReceiptDateRange(p => ({ ...p, start: e.target.value }))} />
                            <label className="date-range-label">To:</label>
                            <input type="date" className="date-input" value={receiptDateRange.end} onChange={e => setReceiptDateRange(p => ({ ...p, end: e.target.value }))} />
                        </div>
                        {filteredReceipts.length === 0 ? <p>No transactions found for this date range.</p> : <Table dataSource={filteredReceipts} rowKey="id" pagination={false} bordered size="small" columns={[{ title: 'Date', dataIndex: 'date', key: 'date', render: d => moment(d).format('YYYY-MM-DD'), }, { title: 'Shift', key: 'shift', render: (_, record) => getShiftText(record.shiftId) }, { title: 'Type', dataIndex: 'transactionType', key: 'transactionType', render: type => (type === 'pay' ? 'Pay' : 'Deduction') }, { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => <span style={{ color: '#3f8600' }}>₨ {a.toFixed(2)}</span> }, { title: 'Balance After', dataIndex: 'balanceAfter', key: 'balanceAfter', render: ba => <span style={{ color: ba >= 0 ? 'red' : 'green' }}>₨ {Math.abs(ba).toFixed(2)}</span> }, { title: 'Note', dataIndex: 'note', key: 'note', render: n => n || '-' }]} />}
                    </>
                )}
            </Modal>

            {/* Add Receipt Modal */}
            <Modal title={`Add ${receiptType === 'pay' ? 'Pay' : 'Deduction'} for ${selectedStaffForReceipt?.accountName || ''}`} open={isReceiptModalVisible} onCancel={() => setIsReceiptModalVisible(false)} footer={null} width={400}>
                <Form form={receiptForm} layout="vertical" onFinish={handleAddReceipt}>
                    {/* MODIFIED: Using native date input */}
                    <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                        <input type="date" className="date-input-form" />
                    </Form.Item>
                    <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
                        <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} placeholder="0.00" formatter={val => `₨ ${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={val => val.replace(/₨\s?|(,*)/g, '')} />
                    </Form.Item>
                    <Form.Item name="note" label="Note"><Input.TextArea placeholder="Enter note" /></Form.Item>
                    <Form.Item name="transactionType" label="Transaction Type"><Input disabled /></Form.Item>
                    <Form.Item><Button type="primary" htmlType="submit" loading={submitLoading}>Add {receiptType === 'pay' ? 'Pay' : 'Deduction'}</Button></Form.Item>
                </Form>
            </Modal>

            {/* Last Transactions Modal */}
            <Modal title="Last Transactions" open={isTransactionsModalVisible} onCancel={() => setIsTransactionsModalVisible(false)} footer={<Space> <Button icon={<FilePdfOutlined />} onClick={handleExportTransactionsToPDF}>Export to PDF</Button> <Button onClick={() => setIsTransactionsModalVisible(false)}>Close</Button> </Space>} width={1000}>
                <Space style={{ marginBottom: 16 }}>
                    <Select style={{ width: 200 }} placeholder="Filter by Shift" value={selectedShift ? selectedShift.id : undefined} onChange={value => setSelectedShift(shifts.find(s => s.id === value) || null)} allowClear>
                        {shifts.map(shift => (<Option key={shift.id} value={shift.id}> {moment(shift.startTime.toDate()).format('YYYY-MM-DD HH:mm')} - {shift.endTime ? moment(shift.endTime.toDate()).format('HH:mm') : 'Ongoing'} </Option>))}
                    </Select>
                    {/* MODIFIED: Using native date range inputs */}
                    <div className="date-range-filter">
                        <label className="date-range-label">From:</label>
                        <input type="date" className="date-input" value={transactionsDateRange.start} onChange={e => setTransactionsDateRange(p => ({ ...p, start: e.target.value }))} />
                        <label className="date-range-label">To:</label>
                        <input type="date" className="date-input" value={transactionsDateRange.end} onChange={e => setTransactionsDateRange(p => ({ ...p, end: e.target.value }))} />
                    </div>
                </Space>
                {transactionsLoading && transactions.length === 0 ? <Spin size="large" tip="Loading transactions..." /> : (<> <Table dataSource={filteredTransactions} columns={transactionsColumns} rowKey="id" pagination={false} bordered size="small" /> {transactionsHasMore && !filteredTransactions.length && (<Button onClick={handleLoadMoreTransactions} style={{ marginTop: 16 }}> Load More </Button>)} </>)}
            </Modal>
        </div>
    );
}