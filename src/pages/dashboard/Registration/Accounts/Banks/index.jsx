import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Typography, Popconfirm, InputNumber, Select, Spin, Card, Tooltip } from 'antd';
import { UserAddOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EyeOutlined, FilePdfOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import moment from 'moment';
import { useAuth } from '../../../../../context/AuthContext';
import { db } from '../../../../../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, limit, increment, getDoc, setDoc, Timestamp, writeBatch, serverTimestamp } from 'firebase/firestore';
import { generatePDF } from '../../../../../services/pdfHelpers';
import { useSettings } from '../../../../../context/SettingsContext';

const { Title, Text } = Typography;
const { Option } = Select;

// CSS for styling native date inputs to look better
const CustomDateInputStyles = `
  .custom-date-input-wrapper {
    position: relative;
    display: inline-block;
    width: 100%;
  }
  .custom-date-input {
    width: 100%;
    height: 38px;
    padding: 8px 12px;
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
    line-height: 1.5715;
    background-color: #fff;
    transition: all 0.2s;
    color: #333;
  }
  .custom-date-input:hover {
    border-color: #40a9ff;
  }
  .custom-date-input:focus, .custom-date-input:focus-visible {
    outline: none;
    border-color: #40a9ff;
    box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
  }
  .custom-date-input::-webkit-calendar-picker-indicator {
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s;
  }
  .custom-date-input::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
  }
  .date-range-container {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .date-range-container .date-input-group {
    display: flex;
    align-items: center;
    gap: 5px;
  }
`;

const Banks = ({ banks: initialBanks = [] }) => {
    const { user } = useAuth();
    const { settings } = useSettings();
    const isBankUser = user?.role === 'customer';

    // State
    const [banks, setBanks] = useState(initialBanks);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);

    const [bankTotals, setBankTotals] = useState({ totalDeposits: 0, totalWithdrawals: 0, netBalance: 0 });

    const [receiptModalVisible, setReceiptModalVisible] = useState(false);
    const [selectedBank, setSelectedBank] = useState(null);
    const [receipts, setReceipts] = useState([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);
    const [pdfExporting, setPdfExporting] = useState(false);
    // State for native date range inputs
    const [receiptDateRange, setReceiptDateRange] = useState({ start: '', end: '' });

    const [isReceiptModalVisible, setIsReceiptModalVisible] = useState(false);
    const [receiptForm] = Form.useForm();
    const [selectedBankForReceipt, setSelectedBankForReceipt] = useState(null);
    const [receiptType, setReceiptType] = useState(null); // 'deposit' or 'withdraw'

    const [isTransactionsModalVisible, setIsTransactionsModalVisible] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    // State for native date range inputs
    const [transactionsDateRange, setTransactionsDateRange] = useState({ start: '', end: '' });
    const [shifts, setShifts] = useState([]);
    const [selectedShift, setSelectedShift] = useState(null);

    const shiftMap = useMemo(() => shifts.reduce((map, shift) => ({ ...map, [shift.id]: shift }), {}), [shifts]);

    useEffect(() => {
        setBanks(initialBanks);
    }, [initialBanks]);

    const fetchBankSummary = async () => {
        const netBalance = banks.reduce((acc, b) => acc + (b.currentBalance || 0), 0);
        const bankSummaryRef = doc(db, 'summaries', 'banks');
        const snap = await getDoc(bankSummaryRef);
        if (snap.exists()) {
            const data = snap.data();
            setBankTotals({
                totalDeposits: data.totalDeposits || 0,
                totalWithdrawals: data.totalWithdrawals || 0,
                netBalance,
            });
        } else {
            setBankTotals({ totalDeposits: 0, totalWithdrawals: 0, netBalance });
        }
    };

    useEffect(() => {
        if (banks.length) fetchBankSummary();
    }, [banks]);

    const showModal = (record) => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue(record);
        } else {
            setEditingId(null);
            form.resetFields();
            form.setFieldsValue({ status: 'active' });
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        form.resetFields();
    };

    const handleSubmit = async (values) => {
        setSubmitLoading(true);
        const now = Timestamp.now();
        const payload = {
            ...values,
            accountType: 'bank',
            currentBalance: parseFloat(values.initialBalance || 0),
            updatedAt: now,
        };

        try {
            if (editingId) {
                await updateDoc(doc(db, 'accounts', editingId), payload);
                setBanks(banks.map((b) => b.id === editingId ? { ...b, ...payload } : b));
                message.success('Bank updated successfully');
            } else {
                const ref = await addDoc(collection(db, 'accounts'), { ...payload, createdAt: now });
                setBanks([{ ...payload, id: ref.id, createdAt: now }, ...banks]);
                message.success('Bank created successfully');
            }
            setIsModalVisible(false);
            form.resetFields();
            fetchBankSummary();
        } catch (err) {
            message.error('Operation failed: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteDoc(doc(db, 'accounts', id));
            setBanks(banks.filter((b) => b.id !== id));
            message.success('Bank deleted successfully');
            fetchBankSummary();
        } catch (err) {
            message.error('Delete failed: ' + err.message);
        }
    };

    const handleViewReceipts = async (bank) => {
        setSelectedBank(bank);
        setReceiptModalVisible(true);
        setReceiptsLoading(true);
        try {
            const q = query(collection(db, 'receipts'), where('accountId', '==', bank.id), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            setReceipts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (err) {
            message.error('Failed to load receipts: ' + err.message);
        } finally {
            setReceiptsLoading(false);
        }
    };

    const filteredReceipts = useMemo(() => {
        const { start, end } = receiptDateRange;
        if (!start && !end) return receipts;

        const startDate = start ? moment(start).startOf('day') : null;
        const endDate = end ? moment(end).endOf('day') : null;

        return receipts.filter(r => {
            const date = moment(r.date.toDate());
            if (startDate && endDate) return date.isBetween(startDate, endDate, 'day', '[]');
            if (startDate) return date.isSameOrAfter(startDate, 'day');
            if (endDate) return date.isSameOrBefore(endDate, 'day');
            return true;
        });
    }, [receipts, receiptDateRange]);


    const showReceiptModal = (bank, type) => {
        setSelectedBankForReceipt(bank);
        setReceiptType(type);
        receiptForm.resetFields();
        // Set default date to today in YYYY-MM-DD format for native input
        receiptForm.setFieldsValue({ date: moment().format('YYYY-MM-DD'), transactionType: type });
        setIsReceiptModalVisible(true);
    };

    const handleAddReceipt = async (values) => {
        if (!selectedBankForReceipt) return;
        setSubmitLoading(true);

        try {
            const amount = parseFloat(values.amount);
            const newBalance = receiptType === 'deposit'
                ? selectedBankForReceipt.currentBalance + amount
                : selectedBankForReceipt.currentBalance - amount;

            const batch = writeBatch(db);
            const receiptDocRef = doc(collection(db, 'receipts'));
            const bankRef = doc(db, 'accounts', selectedBankForReceipt.id);
            const bankSummaryRef = doc(db, 'summaries', 'banks');

            // Convert YYYY-MM-DD string from form to Firebase Timestamp
            const receiptData = {
                accountId: selectedBankForReceipt.id,
                date: Timestamp.fromDate(moment(values.date).toDate()),
                amount,
                note: values.note || '',
                transactionType: receiptType,
                balanceAfter: newBalance,
                createdAt: serverTimestamp(),
                accountType: 'bank',
            };

            batch.set(receiptDocRef, receiptData);
            batch.update(bankRef, { currentBalance: newBalance });
            batch.set(bankSummaryRef, {
                [receiptType === 'deposit' ? 'totalDeposits' : 'totalWithdrawals']: increment(amount)
            }, { merge: true });

            await batch.commit();

            setBanks(banks.map(b => b.id === selectedBankForReceipt.id ? { ...b, currentBalance: newBalance } : b));
            if (selectedBank && selectedBank.id === selectedBankForReceipt.id) {
                // Manually create a client-side version of the new receipt to show instantly
                const newReceiptClient = {
                    ...receiptData,
                    id: receiptDocRef.id,
                    createdAt: Timestamp.now(), // Approximate
                    date: Timestamp.fromDate(moment(values.date).toDate())
                };
                setReceipts([newReceiptClient, ...receipts]);
            }

            message.success(`${receiptType === 'deposit' ? 'Deposit' : 'Withdrawal'} successful`);
            setIsReceiptModalVisible(false);
            fetchBankSummary();
        } catch (err) {
            console.error('Error adding receipt:', err);
            message.error('Failed to add receipt: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const fetchShifts = async () => {
        try {
            const shiftsSnap = await getDocs(query(collection(db, 'shifts'), orderBy('startTime', 'desc')));
            setShifts(shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
            message.error('Failed to fetch shifts: ' + err.message);
        }
    };

    const fetchTransactions = async () => {
        if (!isTransactionsModalVisible) return;
        setTransactionsLoading(true);
        try {
            let q;
            const baseQuery = collection(db, 'receipts');
            let constraints = [where('accountType', '==', 'bank')];

            if (selectedShift) {
                constraints.push(where('shiftId', '==', selectedShift));
            } else if (transactionsDateRange.start || transactionsDateRange.end) {
                if (transactionsDateRange.start) {
                    constraints.push(where('date', '>=', Timestamp.fromDate(moment(transactionsDateRange.start).startOf('day').toDate())));
                }
                if (transactionsDateRange.end) {
                    constraints.push(where('date', '<=', Timestamp.fromDate(moment(transactionsDateRange.end).endOf('day').toDate())));
                }
                constraints.push(orderBy('date', 'desc'));
            }

            constraints.push(orderBy('createdAt', 'desc'));
            if (!transactionsDateRange.start && !transactionsDateRange.end && !selectedShift) {
                constraints.push(limit(100));
            }

            q = query(baseQuery, ...constraints);
            const snap = await getDocs(q);
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            message.error('Failed to fetch transactions: ' + err.message);
        } finally {
            setTransactionsLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, [isTransactionsModalVisible, selectedShift, transactionsDateRange]);

    useEffect(() => {
        if (isTransactionsModalVisible) fetchShifts();
    }, [isTransactionsModalVisible]);

    const exportToPDF = (title, columns, data, totals) => {
        const tableData = data.map(Object.values);
        if (totals) {
            tableData.push([], ...Object.entries(totals).map(([key, value]) => [key, '', '', value]));
        }
        generatePDF(title, columns, tableData, `${title.replace(/\s+/g, '_')}_${moment().format('YYYYMMDD')}.pdf`, {}, settings);
        message.success('Exported to PDF');
    };

    const filteredBanks = useMemo(() => banks
        .filter((b) => b.accountName?.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => (b.createdAt?.toDate() ?? 0) - (a.createdAt?.toDate() ?? 0)), [banks, searchTerm]);

    const columns = [
        { title: 'Name', dataIndex: 'accountName', key: 'accountName', sorter: (a, b) => a.accountName.localeCompare(b.accountName), render: (text, rec) => <Link to={`/dashboard/account-details/${rec.id}`}>{text}</Link> },
        { title: 'Balance', dataIndex: 'currentBalance', key: 'balance', sorter: (a, b) => a.currentBalance - b.currentBalance, render: (bal) => <Text type={bal < 0 ? 'danger' : 'success'}>₨ {bal?.toFixed(2) || '0.00'}</Text> },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, rec) => (isBankUser ? null :
                <Space size="small" wrap>
                    <Tooltip title="Edit"><Button type="primary" icon={<EditOutlined />} onClick={() => showModal(rec)} size="small" /></Tooltip>
                    <Popconfirm title="Delete this bank? This is irreversible." onConfirm={() => handleDelete(rec.id)}><Button danger icon={<DeleteOutlined />} size="small" /></Popconfirm>
                    <Tooltip title="View Statement"><Button icon={<EyeOutlined />} onClick={() => handleViewReceipts(rec)} size="small" /></Tooltip>
                    <Button style={{ backgroundColor: '#e74c3c', color: '#fff' }} icon={<ArrowUpOutlined />} size="small" onClick={() => showReceiptModal(rec, 'withdraw')}>Withdraw</Button>
                    <Button style={{ backgroundColor: '#27ae60', color: '#fff' }} icon={<ArrowDownOutlined />} size="small" onClick={() => showReceiptModal(rec, 'deposit')}>Deposit</Button>
                </Space>
            ),
        },
    ];

    const receiptColumns = [
        { title: 'Date', dataIndex: 'date', key: 'date', render: (d) => moment(d.toDate()).format('YYYY-MM-DD'), sorter: (a, b) => a.date.toDate() - b.date.toDate(), defaultSortOrder: 'descend' },
        { title: 'Type', dataIndex: 'transactionType', key: 'transactionType', render: (type) => <Text type={type === 'deposit' ? 'success' : 'danger'}>{type === 'deposit' ? 'Deposit' : 'Withdrawal'}</Text> },
        { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (amt) => `₨ ${amt.toFixed(2)}` },
        { title: 'Balance After', dataIndex: 'balanceAfter', key: 'balanceAfter', render: (bal) => <Text type={bal < 0 ? 'danger' : 'default'}>₨ {bal.toFixed(2)}</Text> },
        { title: 'Note', dataIndex: 'note', key: 'note' },
    ];

    return (
        <div>
            {/* Injecting CSS styles into the component */}
            <style>{CustomDateInputStyles}</style>

            <div className="account-header d-flex justify-content-between flex-wrap mb-3 align-items-center">
                <Title level={3} style={{ margin: 0 }}>Banks</Title>
                <Space wrap style={{ marginTop: 10 }}>
                    <Input placeholder="Search by name" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: 250 }} prefix={<SearchOutlined />} />
                    {!isBankUser && <>
                        <Button type="primary" icon={<UserAddOutlined />} onClick={() => showModal()}>Add Bank</Button>
                        <Button icon={<FilePdfOutlined />} onClick={() => exportToPDF('Banks List', ['Name', 'Balance'], filteredBanks.map(b => ({ name: b.accountName, balance: b.currentBalance.toFixed(2) })))}>Export Banks</Button>
                        <Button onClick={() => setIsTransactionsModalVisible(true)}>View All Transactions</Button>
                    </>}
                </Space>
            </div>

            <Card type="inner" title="Overall Bank Summary" style={{ marginBottom: 20 }}>
                <Space size="large" wrap>
                    <Text strong>Total Deposits: <span style={{ color: '#27ae60' }}>₨ {bankTotals.totalDeposits.toFixed(2)}</span></Text>
                    <Text strong>Total Withdrawals: <span style={{ color: '#e74c3c' }}>₨ {bankTotals.totalWithdrawals.toFixed(2)}</span></Text>
                    <Text strong>Net Balance: <span style={{ color: bankTotals.netBalance < 0 ? '#e74c3c' : '#27ae60' }}>₨ {bankTotals.netBalance.toFixed(2)}</span></Text>
                </Space>
            </Card>

            <Table columns={columns} dataSource={filteredBanks} rowKey="id" pagination={{ pageSize: 10, responsive: true }} bordered scroll={{ x: 'max-content' }} />

            <Modal title={editingId ? 'Edit Bank' : 'Add New Bank'} open={isModalVisible} onCancel={handleCancel} footer={null} width={600}>
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item name="accountName" label="Bank Name" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="initialBalance" label="Opening Balance (PKR)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} formatter={(val) => `₨ ${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(val) => val.replace(/₨\s?|(,*)/g, '')} /></Form.Item>
                    <Form.Item name="status" label="Status" rules={[{ required: true }]}><Select><Option value="active">Active</Option><Option value="inactive">Inactive</Option></Select></Form.Item>
                    <Form.Item><Space style={{ float: 'right' }}><Button onClick={handleCancel}>Cancel</Button><Button type="primary" htmlType="submit" loading={submitLoading}>{editingId ? 'Update' : 'Create'}</Button></Space></Form.Item>
                </Form>
            </Modal>

            <Modal title={`Statement for ${selectedBank?.accountName}`} open={receiptModalVisible} onCancel={() => setReceiptModalVisible(false)} footer={<Button onClick={() => setReceiptModalVisible(false)}>Close</Button>} width="80%">
                <Space style={{ marginBottom: 16 }} wrap>
                    <div className="date-range-container">
                        <div className="date-input-group">
                            <label>From:</label>
                            <input type="date" className="custom-date-input" style={{ width: '160px' }} value={receiptDateRange.start} onChange={e => setReceiptDateRange(prev => ({ ...prev, start: e.target.value }))} />
                        </div>
                        <div className="date-input-group">
                            <label>To:</label>
                            <input type="date" className="custom-date-input" style={{ width: '160px' }} value={receiptDateRange.end} onChange={e => setReceiptDateRange(prev => ({ ...prev, end: e.target.value }))} />
                        </div>
                        <Button onClick={() => setReceiptDateRange({ start: '', end: '' })}>Clear</Button>
                    </div>
                    <Button icon={<FilePdfOutlined />} onClick={() => exportToPDF(`Statement for ${selectedBank?.accountName}`, receiptColumns.map(c => c.title), filteredReceipts.map(r => ({ date: moment(r.date.toDate()).format('YYYY-MM-DD'), type: r.transactionType, amount: r.amount.toFixed(2), balance: r.balanceAfter.toFixed(2), note: r.note || '-' })))} loading={pdfExporting}>Download PDF</Button>
                </Space>
                <Table dataSource={filteredReceipts} columns={receiptColumns} rowKey="id" pagination={{ pageSize: 10 }} bordered size="small" loading={receiptsLoading} />
            </Modal>

            <Modal title={`New ${receiptType === 'withdraw' ? 'Withdrawal' : 'Deposit'} for ${selectedBankForReceipt?.accountName}`} open={isReceiptModalVisible} onCancel={() => setIsReceiptModalVisible(false)} footer={null} width={400}>
                <Form form={receiptForm} layout="vertical" onFinish={handleAddReceipt}>
                    <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Please select a date' }]}>
                        <input type="date" className="custom-date-input" onChange={e => receiptForm.setFieldsValue({ date: e.target.value })} />
                    </Form.Item>
                    <Form.Item name="amount" label="Amount" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} placeholder="0.00" /></Form.Item>
                    <Form.Item name="note" label="Note"><Input.TextArea /></Form.Item>
                    <Form.Item><Button type="primary" htmlType="submit" loading={submitLoading} block>Submit {receiptType === 'withdraw' ? 'Withdrawal' : 'Deposit'}</Button></Form.Item>
                </Form>
            </Modal>

            <Modal title="All Bank Transactions" open={isTransactionsModalVisible} onCancel={() => setIsTransactionsModalVisible(false)} footer={<Button onClick={() => setIsTransactionsModalVisible(false)}>Close</Button>} width="80%">
                <Space style={{ marginBottom: 16 }} wrap>
                    <Select placeholder="Filter by Shift" value={selectedShift} onChange={setSelectedShift} style={{ width: 250 }} allowClear>
                        {shifts.map(s => <Option key={s.id} value={s.id}>{moment(s.startTime.toDate()).format('lll')} - {s.endTime ? moment(s.endTime.toDate()).format('lll') : 'Active'}</Option>)}
                    </Select>
                    <div className="date-range-container">
                        <div className="date-input-group">
                            <label>From:</label>
                            <input type="date" className="custom-date-input" style={{ width: '160px' }} value={transactionsDateRange.start} onChange={e => setTransactionsDateRange(prev => ({ ...prev, start: e.target.value }))} />
                        </div>
                        <div className="date-input-group">
                            <label>To:</label>
                            <input type="date" className="custom-date-input" style={{ width: '160px' }} value={transactionsDateRange.end} onChange={e => setTransactionsDateRange(prev => ({ ...prev, end: e.target.value }))} />
                        </div>
                        <Button onClick={() => setTransactionsDateRange({ start: '', end: '' })}>Clear</Button>
                    </div>
                    <Button icon={<FilePdfOutlined />} onClick={() => exportToPDF('All Bank Transactions', ['Date', 'Bank', 'Type', 'Amount', 'Note'], transactions.map(t => ({ date: moment(t.date.toDate()).format('YYYY-MM-DD'), bank: banks.find(b => b.id === t.accountId)?.accountName || 'N/A', type: t.transactionType, amount: t.amount, note: t.note || '-' })))}>Export PDF</Button>
                </Space>
                <Table dataSource={transactions} columns={receiptColumns} rowKey="id" pagination={{ pageSize: 10 }} bordered size="small" loading={transactionsLoading} />
            </Modal>
        </div>
    );
};

export default Banks;