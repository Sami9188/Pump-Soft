import React, { useState, useEffect, useMemo } from 'react';
// All Ant Design components are kept
import {
    Table,
    Button,
    Modal,
    Form,
    Input,
    message,
    Space,
    Typography,
    Tooltip,
    Popconfirm,
    InputNumber,
    Select,
    Spin,
    Card,
} from 'antd';
import {
    UserAddOutlined,
    EditOutlined,
    DeleteOutlined,
    FilePdfOutlined,
    SearchOutlined,
    EyeOutlined,
    WhatsAppOutlined,
    MessageOutlined,
} from '@ant-design/icons';

// Import the new CSS file
// import './Suppliers.css';

import { Link } from 'react-router-dom';
import moment from 'moment';
import { useAuth } from '../../../../../context/AuthContext';
import { db } from '../../../../../config/firebase';
import {
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where,
    orderBy,
    limit,
    writeBatch,
    Timestamp,
    serverTimestamp,
    increment,
    getDoc,
} from 'firebase/firestore';
import { generatePDF } from '../../../../../services/pdfHelpers';
import { useSettings } from '../../../../../context/SettingsContext';

const { Title } = Typography;
const { Option } = Select;

// --- (Constants and Messages remain the same) ---
const COMPANY_NAME = 'TOOR FILLING STATION';
const COMPANY_PHONE = '03466315255';
const RAAST_ID = '03100276969';

const MESSAGES = {
    // For suppliers, "request payment" means we need to pay them
    REQUEST_PAYMENT: (supplierName, balance) => `
${COMPANY_NAME}
${COMPANY_PHONE}

Dear ${supplierName},
This is a reminder regarding the outstanding amount of Rs ${Math.abs(balance).toFixed(0)} which we owe you. We will process the payment soon.

Thank you for your business.
    `.trim(),
    // For suppliers, "thank you" means we have paid them and now have a credit
    THANK_YOU: (supplierName, balance) => `
${COMPANY_NAME}
${COMPANY_PHONE}

Dear ${supplierName},
This is a confirmation of our recent payment. We now have a credit balance of Rs ${balance.toFixed(0)} with you.

Thank you.
    `.trim(),
};


function Suppliers({ suppliers }) {
    const { user } = useAuth();
    const { settings } = useSettings();
    const roles = Array.isArray(user?.role) ? user.role : [];
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');

    // Permissions
    const canAddSupplier = isAdmin;
    const canEditSupplier = isAdmin;
    const canDeleteSupplier = isAdmin;
    const canShare = isAdmin || isManager;
    const canViewReceipts = isAdmin || isManager;
    const canAddReceipt = isAdmin || isManager;
    const canExportPDF = isAdmin || isManager;

    // State Variables
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [suppliersData, setSuppliersData] = useState(suppliers);
    const [supplierSummaries, setSupplierSummaries] = useState({});
    const [grandTotals, setGrandTotals] = useState({ totalPayments: 0, totalPurchases: 0, netPayable: 0 });
    const [receiptModalVisible, setReceiptModalVisible] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [receipts, setReceipts] = useState([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);
    // State for HTML5 date input range
    const [receiptDateRange, setReceiptDateRange] = useState({ start: '', end: '' });
    const [isReceiptModalVisible, setIsReceiptModalVisible] = useState(false);
    const [receiptForm] = Form.useForm();
    const [selectedSupplierForReceipt, setSelectedSupplierForReceipt] = useState(null);
    const [receiptType, setReceiptType] = useState(null);
    const [isTransactionsModalVisible, setIsTransactionsModalVisible] = useState(false);
    // State for HTML5 date input range
    const [transactionsDateRange, setTransactionsDateRange] = useState({ start: '', end: '' });
    const [transactionsList, setTransactionsList] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [selectedShift, setSelectedShift] = useState(null);

    // --- (All useEffect hooks and data fetching logic remain the same) ---
    // Sync suppliers prop
    useEffect(() => {
        setSuppliersData(suppliers);
    }, [suppliers]);

    const fetchShifts = async () => {
        if (shifts.length > 0) return; // Avoid refetching
        try {
            const shiftsQuery = query(collection(db, 'shifts'), orderBy('startTime', 'desc'));
            const shiftsSnap = await getDocs(shiftsQuery);
            const shiftsData = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setShifts(shiftsData);
        } catch (err) {
            message.error('Failed to fetch shifts: ' + err.message);
        }
    };

    useEffect(() => {
        if (isTransactionsModalVisible || receiptModalVisible) {
            fetchShifts();
        }
    }, [isTransactionsModalVisible, receiptModalVisible]);

    const fetchSupplierSummary = async (supplier) => {
        const q = query(
            collection(db, 'receipts'),
            where('accountId', '==', supplier.id),
            orderBy('createdAt', 'asc') // Fetch oldest first for correct calculation
        );
        const snap = await getDocs(q);

        const receiptsData = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                date: data.date && data.date.toDate ? data.date.toDate() : new Date(),
                amount: Number(data.amount || 0),
            };
        });

        const initialBalance = Number(supplier.initialBalance || 0);
        let runningBalance = initialBalance;

        const processedReceipts = receiptsData.map(tx => {
            if (tx.transactionType === 'odhar') {
                runningBalance += tx.amount;
            } else if (tx.transactionType === 'wasooli') {
                runningBalance -= tx.amount;
            }
            return { ...tx, runningBalance };
        });

        const initialRecord = {
            id: 'initial',
            date: supplier.createdAt?.toDate ? supplier.createdAt.toDate() : new Date(0),
            transactionType: 'Initial Balance',
            note: 'Opening Balance',
            runningBalance: initialBalance,
        };

        const totalPayments = processedReceipts
            .filter(t => t.transactionType === 'wasooli')
            .reduce((sum, t) => sum + t.amount, 0);
        const totalPurchases = processedReceipts
            .filter(t => t.transactionType === 'odhar')
            .reduce((sum, t) => sum + t.amount, 0);

        const currentBalance = runningBalance;
        const transactions = [...processedReceipts.reverse(), initialRecord];

        return { transactions, totalPayments, totalPurchases, currentBalance };
    };

    useEffect(() => {
        if (!suppliersData?.length) return;
        const loadSummaries = async () => {
            setReceiptsLoading(true);
            const sums = {};
            await Promise.all(
                suppliersData.map(async (sup) => {
                    sums[sup.id] = await fetchSupplierSummary(sup);
                })
            );
            setSupplierSummaries(sums);
            setReceiptsLoading(false);
        };
        loadSummaries();
    }, [suppliersData]);

    useEffect(() => {
        const totals = Object.values(supplierSummaries).reduce(
            (acc, s) => {
                acc.totalPayments += s.totalPayments || 0;
                acc.totalPurchases += s.totalPurchases || 0;
                acc.netPayable += s.currentBalance || 0;
                return acc;
            },
            { totalPayments: 0, totalPurchases: 0, netPayable: 0 }
        );
        setGrandTotals(totals);
    }, [supplierSummaries]);

    const showModal = record => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue({
                ...record,
                initialBalance: Number(record.initialBalance || 0),
                creditLimit: Number(record.creditLimit || 0),
            });
        } else {
            setEditingId(null);
            form.resetFields();
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingId(null);
        form.resetFields();
    };

    const handleSubmit = async values => {
        setSubmitLoading(true);
        const now = serverTimestamp();
        const supplierData = {
            ...values,
            accountType: 'supplier',
            initialBalance: Number(values.initialBalance || 0),
            creditLimit: Number(values.creditLimit || 0),
            updatedAt: now,
        };

        try {
            if (editingId) {
                const supplierRef = doc(db, 'accounts', editingId);
                await updateDoc(supplierRef, supplierData);
                // **FIX: Removed local state update. The change will come from props.**
                // setSuppliersData(prev => prev.map(s => s.id === editingId ? { ...s, ...values } : s));
                message.success('Supplier updated successfully');
            } else {
                const newSupplier = {
                    ...supplierData,
                    createdAt: now,
                    currentBalance: Number(values.initialBalance || 0),
                };
                await addDoc(collection(db, 'accounts'), newSupplier);
                // **FIX: Removed local state update. The change will come from props.**
                // const docRef = await addDoc(collection(db, 'accounts'), newSupplier);
                // setSuppliersData(prev => [{ ...newSupplier, id: docRef.id, createdAt: new Date() }, ...prev]);
                message.success('Supplier created successfully');
            }
            setIsModalVisible(false);
            setEditingId(null);
        } catch (err) {
            message.error('Operation failed: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async (id) => {
        const receiptsQuery = query(collection(db, 'receipts'), where('accountId', '==', id), limit(1));
        const receiptSnap = await getDocs(receiptsQuery);

        if (!receiptSnap.empty) {
            message.error("Cannot delete supplier with existing transactions. Please clear their record first.");
            return;
        }

        try {
            await deleteDoc(doc(db, 'accounts', id));
            // **FIX: Removed local state update. The change will come from props.**
            // setSuppliersData(prev => prev.filter(s => s.id !== id));
            message.success('Supplier deleted successfully');
        } catch (err) {
            message.error('Delete failed: ' + err.message);
        }
    };


    const exportSuppliersToPDF = () => {
        const title = 'Suppliers List';
        const columns = ['Name', 'Phone', 'Balance (Payable)'];
        const data = filteredSuppliers.map(sup => {
            const summary = supplierSummaries[sup.id];
            return [
                sup.accountName,
                sup.phoneNumber || '-',
                summary ? summary.currentBalance.toFixed(2) : '0.00'
            ];
        });
        data.push(['', 'Grand Total Payable:', grandTotals.netPayable.toFixed(2)]);
        const filename = `Suppliers_List_${moment().format('YYYY-MM-DD')}.pdf`;
        generatePDF(title, columns, data, filename, {}, settings);
    };

    const handleViewReceipts = sup => {
        setSelectedSupplier(sup);
        setReceiptModalVisible(true);
        setReceipts(supplierSummaries[sup.id]?.transactions || []);
    };

    const handleCloseReceiptsModal = () => {
        setReceiptModalVisible(false);
        setSelectedSupplier(null);
        setReceipts([]);
        setReceiptDateRange({ start: '', end: '' });
    };

    const filteredReceipts = useMemo(() => {
        const { start, end } = receiptDateRange;
        if (!start || !end) {
            return receipts;
        }
        return receipts.filter(r => {
            if (r.id === 'initial') return true;
            return moment(r.date).isBetween(moment(start), moment(end).add(1, 'day'));
        });
    }, [receipts, receiptDateRange]);


    const exportReceiptsToPDF = () => {
        if (!selectedSupplier) return;

        const title = `Transaction History for ${selectedSupplier.accountName}`;
        const columns = ['Date', 'Type', 'Purchase', 'Payment', 'Balance After', 'Note'];
        const data = filteredReceipts.map(r => [
            r.id === 'initial' ? 'Initial Balance' : moment(r.date).format('DD-MM-YYYY'),
            r.transactionType,
            r.transactionType === 'odhar' ? r.amount.toFixed(2) : '0.00',
            r.transactionType === 'wasooli' ? r.amount.toFixed(2) : '0.00',
            r.runningBalance.toFixed(2),
            r.note || '-'
        ]);

        // *** NEW: Calculate summary for the PDF header ***
        const periodSummary = filteredReceipts.reduce((acc, r) => {
            if (r.id === 'initial') return acc;
            const amount = Number(r.amount || 0);
            if (r.transactionType === 'wasooli') { // Payment
                acc.payments += amount;
            } else if (r.transactionType === 'odhar') { // Purchase
                acc.purchases += amount;
            }
            return acc;
        }, { purchases: 0, payments: 0 });

        const finalBalance = supplierSummaries[selectedSupplier.id]?.currentBalance || 0;

        // Create summaryData object for generatePDF (using Odhar/Wasooli keys)
        const summaryData = {
            odhar: periodSummary.purchases,     // Total Purchases for the period
            wasooli: periodSummary.payments,    // Total Payments for the period
            remaining: finalBalance             // Final outstanding balance
        };

        const filename = `Receipts_${selectedSupplier.accountName}_${moment().format('YYYY-MM-DD')}.pdf`;

        // *** MODIFIED: Pass the new summaryData to generatePDF ***
        generatePDF(title, columns, data, filename, summaryData, {}, settings);
    };

    const showReceiptModal = (sup, type) => {
        setSelectedSupplierForReceipt(sup);
        setReceiptType(type);
        receiptForm.setFieldsValue({
            date: moment().format('YYYY-MM-DD'),
            amount: null,
            note: '',
            transactionType: type,
        });
        setIsReceiptModalVisible(true);
    };

    const handleAddReceipt = async (values) => {
        setSubmitLoading(true);
        try {
            const amount = Number(values.amount || 0);
            if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount.');

            const receiptDate = moment(values.date, 'YYYY-MM-DD').toDate();

            const activeShiftQuery = query(collection(db, 'shifts'), where('status', '==', 'active'), limit(1));
            const shiftSnap = await getDocs(activeShiftQuery);
            if (shiftSnap.empty) {
                message.error('No active shift found. Please start a new shift.');
                setSubmitLoading(false);
                return;
            }
            const shiftId = shiftSnap.docs[0].id;

            const supplierRef = doc(db, 'accounts', selectedSupplierForReceipt.id);
            const supplierDoc = await getDoc(supplierRef);
            const currentBalance = Number(supplierDoc.data().currentBalance || 0);

            const balanceChange = receiptType === 'odhar' ? amount : -amount;
            const newBalance = currentBalance + balanceChange;

            const cashflowType = receiptType === 'odhar' ? 'cashOut' : 'cashIn';
            const cashflowCategory = receiptType === 'odhar' ? 'purchase' : 'supplier_payment';

            const batch = writeBatch(db);
            const receiptDocRef = doc(collection(db, 'receipts'));
            const cashflowDocRef = doc(collection(db, 'cashflow'));
            const globalSummaryRef = doc(db, 'summaries', 'global');

            batch.set(receiptDocRef, {
                accountId: selectedSupplierForReceipt.id,
                accountType: 'supplier',
                date: Timestamp.fromDate(receiptDate),
                amount,
                note: values.note || '',
                transactionType: receiptType,
                balanceAfter: newBalance,
                createdAt: serverTimestamp(),
                shiftId,
                cashflowId: cashflowDocRef.id,
            });

            batch.set(cashflowDocRef, {
                amount,
                type: cashflowType,
                category: cashflowCategory,
                description: `Receipt for ${selectedSupplierForReceipt.accountName}`,
                date: Timestamp.fromDate(receiptDate),
                createdAt: serverTimestamp(),
                shiftId,
            });

            batch.update(supplierRef, { currentBalance: newBalance });

            if (receiptType === 'odhar') {
                batch.update(globalSummaryRef, { totalPurchases: increment(amount) });
            } else {
                batch.update(globalSummaryRef, { totalPayments: increment(amount) });
            }

            await batch.commit();
            message.success('Receipt added successfully');

            const updatedSummary = await fetchSupplierSummary({ ...selectedSupplierForReceipt, currentBalance: newBalance });
            setSupplierSummaries(prev => ({ ...prev, [selectedSupplierForReceipt.id]: updatedSummary }));
            // **FIX: Removed local state update. The change will come from props.**
            // setSuppliersData(prev => prev.map(s => s.id === selectedSupplierForReceipt.id ? { ...s, currentBalance: newBalance } : s));

            if (selectedSupplier && selectedSupplier.id === selectedSupplierForReceipt.id) {
                setReceipts(updatedSummary.transactions);
            }

            setIsReceiptModalVisible(false);
        } catch (err) {
            console.error(err);
            message.error('Failed to add receipt: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    // --- Start of Refactored Code for Suppliers ---
    const handleShareBalance = method => {
        if (!selectedSupplier?.phoneNumber) {
            return message.error("Supplier ka phone number mojood nahi hai.");
        }
        const summary = supplierSummaries[selectedSupplier.id];
        if (!summary) return;

        let text = '';
        const supplierName = selectedSupplier.accountName;
        const balance = summary.currentBalance;

        if (balance > 0) {
            // Scenario: Jab hamare zimme supplier ke paise hon
            text = `
Dear ${supplierName},

Hamare zimme aapke Rs ${balance.toFixed(0)} wajib-ul-ada hain. Ham jald hi iski adaeigi kar denge.

Aapke taawun ka shukriya.

${COMPANY_NAME}
${COMPANY_PHONE}
        `.trim();
        } else if (balance < 0) {
            // Scenario: Jab hamare paise supplier ke paas advance jama hon
            text = `
Dear ${supplierName},

Yeh hamari haal hi mein ki gayi payment ki tasdeeq hai.
Ab hamare Rs ${Math.abs(balance).toFixed(0)} aapke paas advance jama hain.

Shukriya.

${COMPANY_NAME}
${COMPANY_PHONE}
        `.trim();
        } else {
            // Scenario: Jab hisaab barabar ho
            text = `
Dear ${supplierName},

Aapka hisaab barabar (settled) ho gaya hai.
Aapke taawun ka shukriya.

${COMPANY_NAME}
${COMPANY_PHONE}
        `.trim();
        }

        const url = method === 'message'
            ? `sms:${selectedSupplier.phoneNumber}?body=${encodeURIComponent(text)}`
            : `https://wa.me/${selectedSupplier.phoneNumber}?text=${encodeURIComponent(text)}`;
        method === 'message' ? (window.location.href = url) : window.open(url, '_blank');
    };


    /**
     * Function #2: handleReceiptShare (Supplier Transaction Receipt Bhejne Ke Liye)
     * Yeh function bhi ab Roman Urdu templates ke mutabiq receipt banayega.
     */
    const handleReceiptShare = (record, method) => {
        if (!selectedSupplier?.phoneNumber) {
            return message.error("Supplier ka phone number mojood nahi hai.");
        }

        const supplierName = selectedSupplier.accountName;
        const transactionDate = moment(record.date).format('YYYY-MM-DD');
        const amount = Math.abs(record.amount).toFixed(0);
        const runningBalance = record.runningBalance;
        const totalCurrentBalance = supplierSummaries[selectedSupplier.id]?.currentBalance || 0;

        // Start of the message
        let text = `Dear ${supplierName},\n\n`;
        text += `Transaction on ${transactionDate}:\n`;

        // Transaction Type
        if (record.transactionType === 'odhar') {
            text += `Hamne aapse Rs ${amount} ka samaan udhaar par khareeda hai.\n`;
        } else { // 'wasooli' ya payment
            text += `Hamne aapko Rs ${amount} ki payment ki hai.\n`;
        }

        // Balance after that specific transaction
        if (runningBalance > 0) {
            text += `Is transaction ke baad, hamare zimme aapke Rs ${runningBalance.toFixed(0)} baqi thay.\n`;
        } else if (runningBalance < 0) {
            text += `Is transaction ke baad, hamare Rs ${Math.abs(runningBalance).toFixed(0)} aapke paas advance jama ho gaye thay.\n`;
        } else {
            text += `Is transaction ke baad, aapka hisaab barabar ho gaya tha.\n`;
        }

        // Current Total Balance summary
        if (totalCurrentBalance > 0) {
            text += `Ab hamare zimme aapke kul Rs ${totalCurrentBalance.toFixed(0)} wajib-ul-ada hain.`;
        } else if (totalCurrentBalance < 0) {
            text += `Ab hamare kul Rs ${Math.abs(totalCurrentBalance).toFixed(0)} aapke paas advance jama hain.`;
        } else {
            text += `Ab aapka kul hisaab barabar hai.`;
        }

        // Signature
        text += `\n\nShukriya,\n${COMPANY_NAME}\n${COMPANY_PHONE}`;

        const url = method === 'message'
            ? `sms:${selectedSupplier.phoneNumber}?body=${encodeURIComponent(text)}`
            : `https://wa.me/${selectedSupplier.phoneNumber}?text=${encodeURIComponent(text)}`;
        method === 'message' ? (window.location.href = url) : window.open(url, '_blank');
    };

    const fetchTransactions = async () => {
        setTransactionsLoading(true);
        try {
            const suppliersSnap = await getDocs(query(collection(db, 'accounts'), where('accountType', '==', 'supplier')));
            const suppliersMap = {};
            suppliersSnap.forEach(doc => {
                suppliersMap[doc.id] = doc.data().accountName;
            });

            let q = query(collection(db, 'receipts'), where('accountType', '==', 'supplier'));
            const { start, end } = transactionsDateRange;

            if (selectedShift) {
                q = query(q, where('shiftId', '==', selectedShift));
            } else if (start && end) {
                const startDate = moment(start, 'YYYY-MM-DD').startOf('day').toDate();
                const endDate = moment(end, 'YYYY-MM-DD').endOf('day').toDate();
                q = query(q, where('date', '>=', startDate), where('date', '<=', endDate));
            }
            q = query(q, orderBy('date', 'desc'), limit(50));

            const snap = await getDocs(q);
            const mappedReceipts = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    date: data.date && data.date.toDate ? data.date.toDate() : new Date(),
                    accountName: suppliersMap[data.accountId] || 'Unknown Supplier',
                };
            });
            setTransactionsList(mappedReceipts);
        } catch (err) {
            console.error('Error fetching transactions:', err);
            message.error('Failed to fetch transactions.');
        } finally {
            setTransactionsLoading(false);
        }
    };

    useEffect(() => {
        if (isTransactionsModalVisible) {
            fetchShifts();
            fetchTransactions();
        }
    }, [isTransactionsModalVisible, selectedShift, transactionsDateRange]);

    const filteredSuppliers = useMemo(() => {
        return suppliersData
            .filter(sup => sup.accountName && sup.accountName.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return dateB - dateA;
            });
    }, [suppliersData, searchTerm]);

    const columns = [
        { title: 'Name', dataIndex: 'accountName', key: 'accountName', sorter: (a, b) => a.accountName.localeCompare(b.accountName), render: (text, rec) => <Link to={`/dashboard/account-details/${rec.id}`}>{text}</Link> },
        { title: 'Phone', dataIndex: 'phoneNumber', key: 'phoneNumber' },
        {
            title: 'Balance (Payable)',
            key: 'balance',
            sorter: (a, b) => (supplierSummaries[a.id]?.currentBalance || 0) - (supplierSummaries[b.id]?.currentBalance || 0),
            render: (_, rec) => {
                const summary = supplierSummaries[rec.id];
                if (!summary) return <Spin size="small" />;
                const balance = summary.currentBalance;
                return <span style={{ color: balance > 0 ? '#cf1322' : '#3f8600', fontWeight: 'bold' }}>{balance.toFixed(2)}</span>;
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, rec) => (
                <Space>
                    {canEditSupplier && <Tooltip title="Edit"><Button icon={<EditOutlined />} size="small" onClick={() => showModal(rec)} /></Tooltip>}
                    {canDeleteSupplier && <Tooltip title="Delete"><Popconfirm title="Are you sure you want to delete this supplier?" onConfirm={() => handleDelete(rec.id)}><Button danger icon={<DeleteOutlined />} size="small" /></Popconfirm></Tooltip>}
                    {canViewReceipts && <Tooltip title="View History"><Button icon={<EyeOutlined />} size="small" onClick={() => handleViewReceipts(rec)} /></Tooltip>}
                    {canAddReceipt && (
                        <>
                            <Tooltip title="Add Purchase on Credit"><Button style={{ backgroundColor: '#cf1322', color: '#fff' }} size="small" onClick={() => showReceiptModal(rec, 'odhar')}>Purchase</Button></Tooltip>
                            <Tooltip title="Add Payment to Supplier"><Button style={{ backgroundColor: '#3f8600', color: '#fff' }} size="small" onClick={() => showReceiptModal(rec, 'wasooli')}>Payment</Button></Tooltip>
                        </>
                    )}
                </Space>
            ),
        },
    ];

    const receiptColumns = [
        { title: 'Date', dataIndex: 'date', key: 'date', render: (d, r) => (r.id === 'initial' ? 'Opening Balance' : moment(d).format('DD-MM-YYYY')) },
        { title: 'Note', dataIndex: 'note', key: 'note', render: n => n || '-' },
        {
            title: 'Purchase (Udhaar)',
            dataIndex: 'amount',
            key: 'purchase',
            align: 'right',
            render: (amount, r) => (r.transactionType === 'odhar' ? <span style={{ color: '#cf1322' }}>{Number(amount).toFixed(2)}</span> : '-'),
        },
        {
            title: 'Payment (Wasooli)',
            dataIndex: 'amount',
            key: 'payment',
            align: 'right',
            render: (amount, r) => (r.transactionType === 'wasooli' ? <span style={{ color: '#3f8600' }}>{Number(amount).toFixed(2)}</span> : '-'),
        },
        {
            title: 'Balance After',
            dataIndex: 'runningBalance',
            key: 'runningBalance',
            align: 'right',
            render: (balance) => <span style={{ fontWeight: 'bold', color: balance > 0 ? '#cf1322' : '#3f8600' }}>{Number(balance).toFixed(2)}</span>,
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, r) => r.id !== 'initial' && canShare && (
                <Space>
                    <Tooltip title="Send via SMS"><Button icon={<MessageOutlined />} size="small" onClick={() => handleReceiptShare(r, 'message')} /></Tooltip>
                    <Tooltip title="Send via WhatsApp"><Button icon={<WhatsAppOutlined />} size="small" onClick={() => handleReceiptShare(r, 'whatsapp')} /></Tooltip>
                </Space>
            ),
        },
    ];

    const transactionsColumns = [
        { title: 'Date', dataIndex: 'date', key: 'date', render: d => moment(d).format('DD-MM-YYYY') },
        { title: 'Supplier', dataIndex: 'accountName', key: 'accountName' },
        { title: 'Type', dataIndex: 'transactionType', key: 'transactionType', render: type => type === 'odhar' ? 'Purchase' : 'Payment' },
        { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: (a, r) => <span style={{ color: r.transactionType === 'odhar' ? '#cf1322' : '#3f8600' }}>{Number(a).toFixed(2)}</span> },
        { title: 'Balance After', dataIndex: 'balanceAfter', key: 'balanceAfter', align: 'right', render: b => Number(b).toFixed(2) },
        { title: 'Note', dataIndex: 'note', key: 'note' },
    ];

    const exportTransactionsToPDF = () => {
        const title = 'Recent Supplier Transactions';
        const columns = ['Date', 'Supplier', 'Type', 'Amount', 'Note'];
        const data = transactionsList.map(t => [
            moment(t.date).format('DD-MM-YYYY'),
            t.accountName,
            t.transactionType === 'odhar' ? 'Purchase' : 'Payment',
            t.amount.toFixed(2),
            t.note || '-'
        ]);

        // *** NEW: Calculate summary for the PDF header ***
        const periodSummary = transactionsList.reduce((acc, t) => {
            const amount = Number(t.amount || 0);
            if (t.transactionType === 'wasooli') { // Payment
                acc.payments += amount;
            } else if (t.transactionType === 'odhar') { // Purchase
                acc.purchases += amount;
            }
            return acc;
        }, { purchases: 0, payments: 0 });

        // Create summaryData object for generatePDF (using Odhar/Wasooli keys)
        const summaryData = {
            odhar: periodSummary.purchases,
            wasooli: periodSummary.payments,
            // "Remaining" here represents the net change in payables for the period
            remaining: periodSummary.purchases - periodSummary.payments
        };

        const filename = `Supplier_Transactions_${moment().format('YYYY-MM-DD')}.pdf`;

        // *** MODIFIED: Pass the new summaryData to generatePDF ***
        generatePDF(title, columns, data, filename, summaryData, {}, settings);
    };



    return (
        <div className="supplier-management-card">
            {/* --- Main Layout and Header --- */}
            <div className="supplier-header d-flex justify-content-between flex-wrap mb-3">
                <Title level={3}>Supplier Management</Title>
                <Space wrap style={{ marginTop: 10 }}>
                    <Input
                        placeholder="Search by name"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: 300 }}
                        prefix={<SearchOutlined />}
                    />
                    {canAddSupplier && (
                        <Button type="primary" icon={<UserAddOutlined />} onClick={() => showModal()}>
                            Add Supplier
                        </Button>
                    )}
                    {canExportPDF && (
                        <Button icon={<FilePdfOutlined />} onClick={exportSuppliersToPDF}>
                            Export List
                        </Button>
                    )}
                    <Button onClick={() => setIsTransactionsModalVisible(true)}>
                        Last Transactions
                    </Button>
                </Space>
            </div>

            {/* --- Grand Totals Card --- */}
            <Card
                type="inner"
                title="Grand Totals (Across All Suppliers)"
                style={{ marginBottom: 20, fontSize: 16 }}
            >
                <Space size="large" wrap>
                    <span>Total Purchases: <span style={{ fontWeight: 'bold' }}>{grandTotals.totalPurchases.toFixed(2)}</span></span>
                    <span>Total Payments: <span style={{ fontWeight: 'bold' }}>{grandTotals.totalPayments.toFixed(2)}</span></span>
                    <span>
                        Net Payable:{' '}
                        <span style={{ fontWeight: 'bold', color: grandTotals.netPayable > 0 ? '#cf1322' : '#3f8600' }}>
                            {grandTotals.netPayable.toFixed(2)}
                        </span>
                    </span>
                </Space>
            </Card>

            {/* --- Main Suppliers Table --- */}
            <Table
                columns={columns}
                dataSource={filteredSuppliers}
                rowKey="id"
                pagination={{ pageSize: 10, responsive: true }}
                bordered
                loading={receiptsLoading}
                scroll={{ x: 'max-content' }}
            />

            {/* --- Add/Edit Supplier Modal --- */}
            <Modal
                title={editingId ? 'Edit Supplier' : 'Add New Supplier'}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
                width={800}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    initialValues={{ status: 'active', creditLimit: 0, initialBalance: 0 }}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
                        <Form.Item name="accountName" label="Supplier Name" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="phoneNumber" label="Phone Number">
                            <Input />
                        </Form.Item>
                        <Form.Item name="cnic" label="CNIC">
                            <Input />
                        </Form.Item>
                        <Form.Item name="address" label="Address">
                            <Input.TextArea />
                        </Form.Item>
                        <Form.Item name="creditLimit" label="Credit Limit">
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="initialBalance" label="Initial Balance (Payable)" rules={[{ required: true }]}>
                            <InputNumber style={{ width: '100%' }} disabled={!!editingId} />
                        </Form.Item>
                        <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                            <Select>
                                <Option value="active">Active</Option>
                                <Option value="inactive">Inactive</Option>
                            </Select>
                        </Form.Item>
                    </div>
                    <Form.Item>
                        <Space style={{ float: 'right' }}>
                            <Button onClick={handleCancel}>Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={submitLoading}>
                                {editingId ? 'Update' : 'Create'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* --- Transaction History Modal (with HTML5 date inputs) --- */}
            <Modal
                title={`Transaction History for ${selectedSupplier?.accountName}`}
                open={receiptModalVisible}
                onCancel={handleCloseReceiptsModal}
                footer={
                    <Space>
                        {canShare && (
                            <>
                                <Button icon={<MessageOutlined />} onClick={() => handleShareBalance('message')}>Share Balance</Button>
                                <Button icon={<WhatsAppOutlined />} onClick={() => handleShareBalance('whatsapp')}>Share via WhatsApp</Button>
                            </>
                        )}
                        {canExportPDF && <Button icon={<FilePdfOutlined />} onClick={exportReceiptsToPDF}>Export PDF</Button>}
                        <Button onClick={handleCloseReceiptsModal}>Close</Button>
                    </Space>
                }
                width={1000}
                destroyOnClose
            >
                <div className="date-range-filter mb-0 pb-0">
                    <label className="date-range-label">From:</label>
                    <input
                        type="date"
                        className="date-input"
                        value={receiptDateRange.start}
                        onChange={(e) => setReceiptDateRange(prev => ({ ...prev, start: e.target.value }))}
                    />
                    <label className="date-range-label">To:</label>
                    <input
                        type="date"
                        className="date-input"
                        value={receiptDateRange.end}
                        onChange={(e) => setReceiptDateRange(prev => ({ ...prev, end: e.target.value }))}
                    />
                </div>
                <Table
                    dataSource={filteredReceipts}
                    columns={receiptColumns}
                    rowKey="id"
                    pagination={false}
                    bordered
                    size="small"
                    loading={receiptsLoading}
                    scroll={{ y: 400 }}
                />
            </Modal>

            {/* --- Add Receipt Modal (with HTML5 date input) --- */}
            <Modal
                title={`Add ${receiptType === 'odhar' ? 'Purchase' : 'Payment'} for ${selectedSupplierForReceipt?.accountName}`}
                open={isReceiptModalVisible}
                onCancel={() => setIsReceiptModalVisible(false)}
                footer={null}
                width={400}
                destroyOnClose
            >
                <Form
                    form={receiptForm}
                    layout="vertical"
                    onFinish={handleAddReceipt}
                >
                    <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                        <input type="date" className="date-input-form" />
                    </Form.Item>
                    <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
                        <InputNumber min={0.01} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="note" label="Note">
                        <Input.TextArea />
                    </Form.Item>
                    <Form.Item name="transactionType" hidden>
                        <Input />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ float: 'right' }}>
                            <Button onClick={() => setIsReceiptModalVisible(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={submitLoading}>Add Receipt</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* --- Recent Transactions Modal (with HTML5 date inputs) --- */}
            <Modal
                title="Recent Supplier Transactions"
                open={isTransactionsModalVisible}
                onCancel={() => setIsTransactionsModalVisible(false)}
                footer={<Button onClick={exportTransactionsToPDF} icon={<FilePdfOutlined />}>Export PDF</Button>}
                width={1200}
                destroyOnClose
            >
                <Space align="end" style={{ marginBottom: 16 }}>
                    <Select placeholder="Filter by Shift" style={{ width: 240 }} allowClear onChange={setSelectedShift} value={selectedShift}>
                        {shifts.map(shift => (
                            <Option key={shift.id} value={shift.id}>
                                {moment(shift.startTime.toDate()).format('DD-MM HH:mm')} - {shift.endTime ? moment(shift.endTime.toDate()).format('HH:mm') : 'Active'}
                            </Option>
                        ))}
                    </Select>
                    <div className="date-range-filter">
                        <label className="date-range-label">From:</label>
                        <input
                            type="date"
                            className="date-input"
                            value={transactionsDateRange.start}
                            onChange={(e) => setTransactionsDateRange(prev => ({ ...prev, start: e.target.value }))}
                        />
                        <label className="date-range-label">To:</label>
                        <input
                            type="date"
                            className="date-input"
                            value={transactionsDateRange.end}
                            onChange={(e) => setTransactionsDateRange(prev => ({ ...prev, end: e.target.value }))}
                        />
                    </div>
                </Space>
                <Table
                    loading={transactionsLoading}
                    dataSource={transactionsList}
                    columns={transactionsColumns}
                    rowKey="id"
                    bordered
                />
            </Modal>
        </div>
    );
}

export default Suppliers;