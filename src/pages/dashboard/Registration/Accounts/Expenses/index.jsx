import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Modal, Form, Input, message, Space, Typography, Tooltip, Popconfirm, InputNumber, Select, Spin } from 'antd';
import { UserAddOutlined, EditOutlined, DeleteOutlined, SearchOutlined, FilePdfOutlined, EyeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { useAuth } from '../../../../../context/AuthContext';
import { db } from '../../../../../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, writeBatch, getDoc, increment, limit, startAfter, serverTimestamp, Timestamp } from 'firebase/firestore';
import { generatePDF } from '../../../../../services/pdfHelpers';
import { useSettings } from '../../../../../context/SettingsContext';

// Import the new CSS file
// import './Expenses.css';

const { Title } = Typography;
const { Option } = Select;

const Expenses = ({ expenses }) => {
    const { user } = useAuth();
    const { settings } = useSettings();
    const role = user?.role;
    const isExpenseUser = role === 'customer';

    // State Declarations
    const [expensesData, setExpensesData] = useState(expenses);
    const [searchTerm, setSearchTerm] = useState('');
    const [grandTotals, setGrandTotals] = useState({ totalExpenses: 0, totalRemaining: 0 });

    // Add/Edit Modal
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);

    // Receipts Modal
    const [receiptModalVisible, setReceiptModalVisible] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState(null);
    const [receipts, setReceipts] = useState([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);
    const [receiptDateRange, setReceiptDateRange] = useState({ start: '', end: '' });
    const [pdfExporting, setPdfExporting] = useState(false);

    // Add Receipt Modal
    const [isReceiptModalVisible, setIsReceiptModalVisible] = useState(false);
    const [receiptForm] = Form.useForm();
    const [selectedExpenseForReceipt, setSelectedExpenseForReceipt] = useState(null);

    // Last Transactions Modal
    const [isTransactionsModalVisible, setIsTransactionsModalVisible] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [shifts, setShifts] = useState([]);
    const [selectedShift, setSelectedShift] = useState(null);

    // --- Data Maps (Memoized) ---
    const accountMap = useMemo(() => {
        return expensesData.reduce((map, acc) => {
            map[acc.id] = acc.accountName;
            return map;
        }, {});
    }, [expensesData]);

    const shiftMap = useMemo(() => {
        return shifts.reduce((map, shift) => {
            map[shift.id] = shift;
            return map;
        }, {});
    }, [shifts]);


    // Sync expenses prop to state
    useEffect(() => {
        setExpensesData(expenses);
    }, [expenses]);

    // Fetch grand totals from Firebase summaries
    useEffect(() => {
        const fetchSummary = async () => {
            try {
                const summaryRef = doc(db, 'summaries', 'global');
                const summarySnap = await getDoc(summaryRef);
                if (summarySnap.exists()) {
                    const data = summarySnap.data();
                    setGrandTotals({
                        totalExpenses: data.totalExpenses || 0,
                        totalRemaining: data.totalRemaining || 0,
                    });
                }
            } catch (err) {
                message.error('Failed to fetch summary: ' + err.message);
            }
        };
        fetchSummary();
    }, []);

    const fetchShifts = async () => {
        if (shifts.length > 0) return;
        try {
            const shiftsQuery = query(collection(db, 'shifts'), orderBy('startTime', 'desc'));
            const shiftsSnap = await getDocs(shiftsQuery);
            const shiftsData = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setShifts(shiftsData);
        } catch (err) {
            message.error('Failed to fetch shifts: ' + err.message);
        }
    };

    // MODIFIED: fetchTransactions uses the string date state
    const fetchTransactions = async (reset = false) => {
        setTransactionsLoading(true);
        try {
            let q = query(collection(db, 'receipts'), where('accountType', '==', 'expenses'));

            if (selectedShift) {
                q = query(q, where('shiftId', '==', selectedShift));
            } else if (dateRange.start && dateRange.end) {
                const start = Timestamp.fromDate(new Date(dateRange.start));
                const end = Timestamp.fromDate(moment(dateRange.end).endOf('day').toDate());
                q = query(q, where('date', '>=', start), where('date', '<=', end));
            }

            q = query(q, orderBy('date', 'desc'), limit(10));
            if (!reset && lastDoc) {
                q = query(q, startAfter(lastDoc));
            }

            const snap = await getDocs(q);
            const newTransactions = snap.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                date: doc.data().date.toDate(),
                amount: parseFloat(doc.data().amount || 0),
                balanceAfter: parseFloat(doc.data().balanceAfter || 0),
            }));

            setTransactions((prev) => (reset ? newTransactions : [...prev, ...newTransactions]));
            setLastDoc(snap.docs[snap.docs.length - 1]);
            setHasMore(snap.docs.length === 10);
        } catch (err) {
            message.error('Failed to fetch transactions: ' + err.message);
        } finally {
            setTransactionsLoading(false);
        }
    };

    const showModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue({ ...record });
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

    const handleSubmit = async (values) => {
        setSubmitLoading(true);
        try {
            if (editingId) {
                await updateDoc(doc(db, 'accounts', editingId), { ...values, updatedAt: serverTimestamp() });
                message.success('Expense updated successfully');
            } else {
                const initialBalance = parseFloat(values.initialBalance || 0);
                const accountRef = doc(collection(db, 'accounts'));
                const batch = writeBatch(db);
                const newAccount = { ...values, accountType: 'expenses', createdAt: serverTimestamp(), currentBalance: 0, totalExpenses: 0 };
                batch.set(accountRef, newAccount);

                if (initialBalance > 0) {
                    const shiftsQuery = query(collection(db, 'shifts'), where('status', '==', 'active'), limit(1));
                    const shiftsSnap = await getDocs(shiftsQuery);
                    if (shiftsSnap.empty) {
                        message.error('No active shift found.');
                        setSubmitLoading(false);
                        return;
                    }
                    const shiftId = shiftsSnap.docs[0].id;

                    const receiptDocRef = doc(collection(db, 'receipts'));
                    const cashflowDocRef = doc(collection(db, 'cashflow'));
                    const globalSummaryRef = doc(db, 'summaries', 'global');

                    batch.set(receiptDocRef, {
                        accountId: accountRef.id,
                        accountType: 'expenses',
                        date: Timestamp.now(),
                        amount: initialBalance,
                        note: 'Initial expense transaction',
                        transactionType: 'expense',
                        balanceAfter: initialBalance,
                        createdAt: serverTimestamp(),
                        shiftId: shiftId,
                        cashflowId: cashflowDocRef.id,
                    });
                    batch.set(cashflowDocRef, { amount: initialBalance, type: 'cashOut', category: 'expense', description: `Initial expense: ${values.accountName}`, date: Timestamp.now(), createdAt: serverTimestamp(), shiftId });
                    batch.update(accountRef, { currentBalance: increment(initialBalance), totalExpenses: increment(initialBalance) });
                    batch.update(globalSummaryRef, { totalExpenses: increment(initialBalance), totalRemaining: increment(initialBalance) });
                }
                await batch.commit();
                message.success('Expense created successfully');
            }
            setIsModalVisible(false);
        } catch (err) {
            message.error('Operation failed: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            const accountRef = doc(db, 'accounts', id);
            const transactionsQuery = query(collection(db, 'receipts'), where('accountId', '==', id));
            const transactionsSnap = await getDocs(transactionsQuery);
            const totalExpensesContribution = transactionsSnap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);

            const batch = writeBatch(db);
            const summaryRef = doc(db, 'summaries', 'global');
            batch.update(summaryRef, { totalExpenses: increment(-totalExpensesContribution), totalRemaining: increment(-totalExpensesContribution) });
            transactionsSnap.docs.forEach(d => batch.delete(d.ref));
            batch.delete(accountRef);
            await batch.commit();

            setExpensesData(ds => ds.filter(d => d.id !== id));
            message.success('Expense and related transactions deleted');
        } catch (err) {
            message.error('Delete failed: ' + err.message);
        }
    };

    const handleViewReceipts = async (expense) => {
        setSelectedExpense(expense);
        setReceiptModalVisible(true);
        setReceiptsLoading(true);
        setReceiptDateRange({ start: '', end: '' });
        try {
            const q = query(collection(db, 'receipts'), where('accountId', '==', expense.id), orderBy('date', 'desc'));
            const snap = await getDocs(q);
            setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().date.toDate() })));
        } catch (err) {
            message.error('Failed to fetch receipts: ' + err.message);
        } finally {
            setReceiptsLoading(false);
        }
    };

    const handleCloseReceiptsModal = () => {
        setReceiptModalVisible(false);
        setSelectedExpense(null);
        setReceipts([]);
    };

    // MODIFIED: filteredReceipts uses the new string state object
    const filteredReceipts = useMemo(() => {
        const { start, end } = receiptDateRange;
        if (!start || !end) return receipts;
        return receipts.filter(r => moment(r.date).isBetween(moment(start).startOf('day'), moment(end).endOf('day')));
    }, [receipts, receiptDateRange]);

    const exportReceiptsToPDF = () => {
        if (!selectedExpense) return;
        setPdfExporting(true);
        try {
            const columns = ['Date', 'Shift', 'Type', 'Amount', 'Balance After', 'Note'];
            const data = filteredReceipts.map(r => [
                moment(r.date).format('YYYY-MM-DD HH:mm'),
                shiftMap[r.shiftId] ? moment(shiftMap[r.shiftId].startTime.toDate()).format('DD-MM HH:mm') : 'Unknown',
                r.transactionType,
                r.amount.toFixed(2),
                r.balanceAfter.toFixed(2),
                r.note || '-'
            ]);

            // *** NEW: Calculate summary for the PDF header ***
            const totalExpensesInPeriod = filteredReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);

            // For expenses, we only need to show the total.
            // We'll use the 'odhar' key as it's typically styled in red (like an outflow).
            const summaryData = {
                odhar: totalExpensesInPeriod,
            };

            // We'll provide a custom label for it.
            const pdfOptions = {
                summaryLabels: {
                    odhar: 'Total Expenses in Period'
                }
            };

            const title = `Receipts for ${selectedExpense?.accountName}`;
            const filename = `Receipts_${selectedExpense?.accountName}_${moment().format('YYYYMMDD')}.pdf`;

            // *** MODIFIED: Pass the new summaryData and pdfOptions to generatePDF ***
            generatePDF(title, columns, data, filename, summaryData, pdfOptions, settings);
            message.success('PDF exported');
        } catch (err) {
            message.error('PDF export failed: ' + err.message);
        } finally {
            setPdfExporting(false);
        }
    };

    // MODIFIED: showReceiptModal formats date for datetime-local input
    const showReceiptModal = (expense) => {
        setSelectedExpenseForReceipt(expense);
        setIsReceiptModalVisible(true);
        receiptForm.resetFields();
        receiptForm.setFieldsValue({
            date: moment().format('YYYY-MM-DDTHH:mm'),
            transactionType: 'expense',
        });
    };

    // MODIFIED: handleAddReceipt parses the datetime string
    const handleAddReceipt = async (values) => {
        setSubmitLoading(true);
        try {
            const accountId = selectedExpenseForReceipt.id;
            const amount = parseFloat(values.amount || 0);
            if (amount <= 0) {
                message.error("Amount must be a positive number.");
                setSubmitLoading(false);
                return;
            }

            const transactionDate = new Date(values.date); // Parse datetime-local string
            if (isNaN(transactionDate.getTime())) {
                message.error("Invalid date format.");
                setSubmitLoading(false);
                return;
            }

            const shiftsQuery = query(collection(db, 'shifts'), where('startTime', '<=', transactionDate), orderBy('startTime', 'desc'), limit(1));
            const shiftsSnap = await getDocs(shiftsQuery);
            if (shiftsSnap.empty) {
                message.error("No shift found for the selected date.");
                setSubmitLoading(false);
                return;
            }
            const shiftId = shiftsSnap.docs[0].id;

            const batch = writeBatch(db);
            const accountRef = doc(db, 'accounts', accountId);
            const summaryRef = doc(db, 'summaries', 'global');
            const receiptDocRef = doc(collection(db, 'receipts'));
            const cashflowDocRef = doc(collection(db, 'cashflow'));

            const accountSnap = await getDoc(accountRef);
            const currentBalance = accountSnap.data().currentBalance || 0;
            const newBalance = currentBalance + amount;

            batch.set(receiptDocRef, {
                accountId,
                accountType: 'expenses',
                date: Timestamp.fromDate(transactionDate),
                amount,
                note: values.note || '',
                transactionType: 'expense',
                balanceAfter: newBalance,
                createdAt: serverTimestamp(),
                shiftId: shiftId,
                cashflowId: cashflowDocRef.id,
            });
            batch.set(cashflowDocRef, { amount, type: 'cashOut', category: 'expense', description: `Expense: ${selectedExpenseForReceipt.accountName}`, date: Timestamp.fromDate(transactionDate), createdAt: serverTimestamp(), shiftId });
            batch.update(accountRef, { currentBalance: increment(amount), totalExpenses: increment(amount) });
            batch.update(summaryRef, { totalExpenses: increment(amount), totalRemaining: increment(amount) });

            await batch.commit();

            if (selectedExpense && selectedExpense.id === accountId) handleViewReceipts(selectedExpenseForReceipt);
            setExpensesData(prev => prev.map(exp => exp.id === accountId ? { ...exp, currentBalance: newBalance, totalExpenses: (exp.totalExpenses || 0) + amount } : exp));
            setGrandTotals(prev => ({ totalExpenses: prev.totalExpenses + amount, totalRemaining: prev.totalRemaining + amount }));

            message.success('Receipt added successfully');
            setIsReceiptModalVisible(false);
        } catch (err) {
            message.error('Failed to add receipt: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const exportExpensesToPDF = () => {
        const columns = ['Name', 'Balance'];
        const data = filteredExpenses.map((exp) => [exp.accountName, exp.currentBalance?.toFixed(2) || '0.00']);
        data.push(['Grand Total', grandTotals.totalRemaining.toFixed(2)]);
        generatePDF('Expenses List', columns, data, `Expenses_List_${moment().format('YYYYMMDD')}.pdf`, {}, settings);
    };

    const exportTransactionsToPDF = () => {
        const columns = ['Date', 'Shift', 'Expense', 'Type', 'Amount', 'Balance After', 'Note'];
        const data = transactions.map(tx => [
            moment(tx.date).format('YYYY-MM-DD HH:mm'),
            shiftMap[tx.shiftId] ? moment(shiftMap[tx.shiftId].startTime.toDate()).format('DD-MM HH:mm') : 'Unknown',
            accountMap[tx.accountId] || 'Unknown',
            tx.transactionType,
            tx.amount.toFixed(2),
            tx.balanceAfter.toFixed(2),
            tx.note || '-'
        ]);

        // *** NEW: Calculate summary for the PDF header ***
        const totalExpensesInPeriod = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);

        const summaryData = {
            odhar: totalExpensesInPeriod
        };

        const pdfOptions = {
            summaryLabels: {
                odhar: 'Total Expenses in Period'
            }
        };

        const title = 'Last Expense Transactions';
        const filename = `Expense_Transactions_${moment().format('YYYYMMDD')}.pdf`;

        // *** MODIFIED: Pass the new summaryData and pdfOptions to generatePDF ***
        generatePDF(title, columns, data, filename, summaryData, pdfOptions, settings);
    };



    const filteredExpenses = useMemo(() => {
        return expensesData
            .filter((exp) => exp.accountName.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
    }, [expensesData, searchTerm]);

    useEffect(() => {
        if (isTransactionsModalVisible || receiptModalVisible) {
            fetchShifts();
        }
        if (isTransactionsModalVisible) {
            fetchTransactions(true);
        }
    }, [isTransactionsModalVisible, receiptModalVisible, selectedShift, dateRange]);


    const columns = [
        { title: 'Name', dataIndex: 'accountName', key: 'accountName', sorter: (a, b) => a.accountName.localeCompare(b.accountName), render: (text, rec) => <Link to={`/dashboard/account-details/${rec.id}`}>{text}</Link> },
        { title: 'Balance', key: 'balance', render: (_, rec) => <span style={{ color: rec.currentBalance < 0 ? 'red' : 'green' }}>₨ {rec.currentBalance?.toFixed(2) || '0.00'}</span>, sorter: (a, b) => (a.currentBalance || 0) - (b.currentBalance || 0) },
        { title: 'Actions', key: 'actions', render: (_, rec) => !isExpenseUser && <Space size="small"><Tooltip title="Edit"><Button type="primary" icon={<EditOutlined />} onClick={() => showModal(rec)} size="small" /></Tooltip><Tooltip title="Delete"><Popconfirm title="Delete this expense and all its records?" onConfirm={() => handleDelete(rec.id)}><Button danger icon={<DeleteOutlined />} size="small" /></Popconfirm></Tooltip><Tooltip title="View Receipts"><Button icon={<EyeOutlined />} onClick={() => handleViewReceipts(rec)} size="small" /></Tooltip><Tooltip title="Add Transaction"><Button style={{ backgroundColor: '#faad14', color: '#fff' }} size="small" onClick={() => showReceiptModal(rec)}>Expense</Button></Tooltip></Space> }
    ];

    const receiptColumns = [
        { title: 'Date', dataIndex: 'date', key: 'date', render: d => moment(d).format('YYYY-MM-DD HH:mm'), sorter: (a, b) => moment(a.date).unix() - moment(b.date).unix() },
        { title: 'Shift', key: 'shift', render: (_, record) => shiftMap[record.shiftId] ? moment(shiftMap[record.shiftId].startTime.toDate()).format('DD-MM HH:mm') : 'Unknown' },
        { title: 'Type', dataIndex: 'transactionType', key: 'transactionType' },
        { title: 'Amount', dataIndex: 'amount', key: 'amount', render: amount => <span style={{ color: '#3f8600' }}>{amount.toFixed(2)}</span> },
        { title: 'Running Balance', dataIndex: 'balanceAfter', key: 'balanceAfter', render: balance => <span style={{ fontWeight: 'bold' }}>{balance.toFixed(2)}</span> },
        { title: 'Note', dataIndex: 'note', key: 'note' }
    ];

    const transactionsColumns = [
        { title: 'Date', dataIndex: 'date', key: 'date', render: d => moment(d).format('YYYY-MM-DD HH:mm') },
        { title: 'Shift', key: 'shift', render: (_, record) => shiftMap[record.shiftId] ? moment(shiftMap[record.shiftId].startTime.toDate()).format('DD-MM HH:mm') : 'Unknown' },
        { title: 'Expense', key: 'accountName', render: (_, r) => accountMap[r.accountId] || 'Unknown' },
        { title: 'Type', dataIndex: 'transactionType', key: 'transactionType' },
        { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => a.toFixed(2) },
        { title: 'Balance After', dataIndex: 'balanceAfter', key: 'balanceAfter', render: b => b.toFixed(2) },
        { title: 'Note', dataIndex: 'note', key: 'note' }
    ];

    return (
        <div className="expense-management-container">
            <div className="account-header">
                <Title level={3}>Expenses Management</Title>
                <Space wrap>
                    <Input placeholder="Search by name" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: 300 }} prefix={<SearchOutlined />} />
                    {!isExpenseUser && <Button type="primary" icon={<UserAddOutlined />} onClick={() => showModal()}>Add Expense Category</Button>}
                    <Button icon={<FilePdfOutlined />} onClick={exportExpensesToPDF}>Export List</Button>
                    <Button onClick={() => setIsTransactionsModalVisible(true)}>Last Transactions</Button>
                </Space>
            </div>

            <Card type="inner" title="Grand Totals (All Time)" style={{ marginBottom: 20 }}>
                <Space size="large">
                    <span style={{ fontSize: '1.1rem' }}>Total Expenses: <strong style={{ color: '#cf1322' }}>₨ {grandTotals.totalExpenses.toFixed(2)}</strong></span>
                    <span style={{ fontSize: '1.1rem' }}>Total Remaining: <strong style={{ color: grandTotals.totalRemaining < 0 ? '#cf1322' : '#3f8600' }}>₨ {grandTotals.totalRemaining.toFixed(2)}</strong></span>
                </Space>
            </Card>

            <Table columns={columns} dataSource={filteredExpenses} rowKey="id" pagination={{ pageSize: 10, responsive: true }} bordered scroll={{ x: 'max-content' }} />

            <Modal title={editingId ? 'Edit Expense' : 'Add Expense'} open={isModalVisible} onCancel={handleCancel} footer={null} width={600}>
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item name="accountName" label="Expense Name" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="initialBalance" label="Initial Balance (Optional)"><InputNumber min={0} style={{ width: '100%' }} formatter={v => `₨ ${v}`} parser={v => v.replace(/₨\s?|(,*)/g, '')} /></Form.Item>
                    <Form.Item name="status" label="Status" rules={[{ required: true }]}><Select><Option value="active">Active</Option><Option value="inactive">Inactive</Option></Select></Form.Item>
                    <Form.Item><Space style={{ float: 'right' }}><Button onClick={handleCancel}>Cancel</Button><Button type="primary" htmlType="submit" loading={submitLoading}>{editingId ? 'Update' : 'Create'}</Button></Space></Form.Item>
                </Form>
            </Modal>

            <Modal title={`Receipts for ${selectedExpense?.accountName}`} open={receiptModalVisible} onCancel={handleCloseReceiptsModal} footer={<Space><Button icon={<FilePdfOutlined />} onClick={exportReceiptsToPDF} loading={pdfExporting}>Export PDF</Button><Button onClick={handleCloseReceiptsModal}>Close</Button></Space>} width={900}>
                <div className="date-range-filter">
                    <label className="date-range-label">From:</label>
                    <input type="date" className="date-input" value={receiptDateRange.start} onChange={e => setReceiptDateRange(p => ({ ...p, start: e.target.value }))} />
                    <label className="date-range-label">To:</label>
                    <input type="date" className="date-input" value={receiptDateRange.end} onChange={e => setReceiptDateRange(p => ({ ...p, end: e.target.value }))} />
                </div>
                {receiptsLoading ? <Spin /> : <Table dataSource={filteredReceipts} columns={receiptColumns} rowKey="id" pagination={false} bordered size="small" scroll={{ y: 400 }} />}
            </Modal>

            <Modal title={`Add Expense for ${selectedExpenseForReceipt?.accountName}`} open={isReceiptModalVisible} onCancel={() => setIsReceiptModalVisible(false)} footer={null} width={400}>
                <Form form={receiptForm} layout="vertical" onFinish={handleAddReceipt}>
                    <Form.Item name="date" label="Date & Time" rules={[{ required: true }]}>
                        <input type="datetime-local" className="date-input-form" />
                    </Form.Item>
                    <Form.Item name="amount" label="Amount (PKR)" rules={[{ required: true }]}><InputNumber min={0.01} style={{ width: '100%' }} formatter={v => `₨ ${v}`} parser={v => v.replace(/₨\s?|(,*)/g, '')} /></Form.Item>
                    <Form.Item name="note" label="Note"><Input.TextArea /></Form.Item>
                    <Form.Item><Space style={{ float: 'right' }}><Button onClick={() => setIsReceiptModalVisible(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={submitLoading}>Add Expense</Button></Space></Form.Item>
                </Form>
            </Modal>

            <Modal title="Last Expense Transactions" open={isTransactionsModalVisible} onCancel={() => setIsTransactionsModalVisible(false)} footer={<Button onClick={() => setIsTransactionsModalVisible(false)}>Close</Button>} width={1000}>
                <Space style={{ marginBottom: 16 }}>
                    <Select style={{ width: 240 }} placeholder="Filter by Shift" value={selectedShift} onChange={v => setSelectedShift(v)} allowClear>
                        {shifts.map(s => <Option key={s.id} value={s.id}>{moment(s.startTime.toDate()).format('DD-MM HH:mm')} - {s.endTime ? moment(s.endTime.toDate()).format('HH:mm') : 'Active'}</Option>)}
                    </Select>
                    <div className="date-range-filter">
                        <label className="date-range-label">From:</label>
                        <input type="date" className="date-input" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} />
                        <label className="date-range-label">To:</label>
                        <input type="date" className="date-input" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} />
                    </div>
                    <Button icon={<FilePdfOutlined />} onClick={exportTransactionsToPDF}>Export PDF</Button>
                </Space>
                {transactionsLoading && transactions.length === 0 ? <Spin /> : <><Table dataSource={transactions} columns={transactionsColumns} rowKey="id" pagination={false} bordered /><br />{hasMore && <Button onClick={() => fetchTransactions(false)} loading={transactionsLoading}>Load More</Button>}</>}
            </Modal>
        </div>
    );
};

export default Expenses;