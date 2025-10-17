import React, { useState, useEffect, useMemo } from 'react';
import moment from 'moment';
import { Link } from 'react-router-dom';
import { Table, Button, Modal, Form, Input, message, Space, Typography, Tooltip, Popconfirm, InputNumber, Select, Spin, Card } from 'antd';
import { UserAddOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EyeOutlined, FilePdfOutlined, WhatsAppOutlined, MessageOutlined } from '@ant-design/icons';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy, limit, writeBatch, getDoc, Timestamp, serverTimestamp, increment } from 'firebase/firestore';

import { useAuth } from '../../../../../context/AuthContext';
import { db } from '../../../../../config/firebase';
import { generatePDF } from '../../../../../services/pdfHelpers';
import { useSettings } from '../../../../../context/SettingsContext';
import TimezoneService from '../../../../../services/timezoneService';
import { clone } from 'chart.js/helpers';

const { Title } = Typography;
const { Option } = Select;

const COMPANY_NAME = 'TOOR FILLING STATION';
const COMPANY_PHONE = '03466315255';
const RAAST_ID = '03100276969';

const MESSAGES = {
    REQUEST_PAYMENT: (customerName, balance) => `
${COMPANY_NAME}
${COMPANY_PHONE}

Dear ${customerName},
Your outstanding balance is Rs ${balance.toFixed(0)}. Please make the payment at your earliest convenience.

Account details:
RAAST ID: ${RAAST_ID}
TITLE: ${COMPANY_NAME}
    `.trim(),
    THANK_YOU: (customerName, balance) => `
${COMPANY_NAME}
${COMPANY_PHONE}

Dear ${customerName},
Thank you for your payment. You have a credit balance of Rs ${balance.toFixed(0)} with us.
    `.trim(),
};

// Custom DateInput component for forms
const DateInput = ({ value, onChange }) => {
    const dateString = value ? moment(value).format('YYYY-MM-DD') : '';
    const handleChange = e => {
        const newValue = e.target.value ? moment(e.target.value).toDate() : null;
        onChange(newValue);
    };
    return <input type="date" value={dateString} onChange={handleChange} className="date-input w-100" />;
};

    // CSS styles
    const styles = `
        .date-range-container {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            flex-wrap: wrap;
        }

        .date-range-container label {
            margin-right: 8px;
            font-weight: 500;
            white-space: nowrap;
        }

        /* Custom class for date inputs in modals for better control */
        .modal-date-input {
            padding: 4px 11px;
            border: 1px solid #d9d9d9;
            border-radius: 6px;
            transition: all 0.3s;
            min-width: 120px;
        }
        .modal-date-input:hover {
            border-color: #40a9ff;
        }

        /* Customer Summary Card Styles */
        .customer-summary-card {
            margin-bottom: 24px;
            background-color: #fafafa;
            border-radius: 8px;
        }

        .customer-summary-card .ant-card-head {
            background-color: #f0f0f0;
            border-bottom: 1px solid #d9d9d9;
        }

        .customer-summary-card .ant-card-body {
            padding: 20px;
        }

        .summary-metric {
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid;
            transition: all 0.3s ease;
        }

        .summary-metric:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .summary-metric-small {
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid;
            transition: all 0.3s ease;
        }

        .summary-metric-small:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .customer-info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }

        /* Mobile Responsiveness */
        @media (max-width: 768px) {
            .date-range-container {
                flex-direction: column;
                align-items: stretch;
                gap: 12px;
            }
            
            .date-range-container label {
                margin-bottom: 4px;
                margin-right: 0;
            }
            
            .modal-date-input {
                width: 100% !important;
                min-width: unset;
            }
            
            .customer-summary-card .ant-card-body {
                padding: 16px;
            }
            
            .summary-metric, .summary-metric-small {
                margin-bottom: 8px;
            }

            .customer-info-grid {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 480px) {
            .customer-header {
                flex-direction: column;
                align-items: stretch;
            }
            
            .customer-header .ant-space {
                margin-top: 16px;
                justify-content: center;
            }
            
            .customer-header .ant-input {
                width: 100% !important;
            }

            /* Fix for blank white screen issue */
            .ant-modal-content {
                max-height: 90vh;
                overflow-y: auto;
            }

            .ant-table {
                font-size: 12px;
            }

            .ant-table .ant-table-thead > tr > th,
            .ant-table .ant-table-tbody > tr > td {
                padding: 8px 4px;
            }
        }

        /* Additional mobile fixes */
        @media (max-width: 768px) {
            .ant-modal {
                margin: 16px;
            }

            .ant-modal-content {
                border-radius: 8px;
            }

            .ant-table-scroll {
                overflow-x: auto;
            }

            /* Ensure modals don't cause blank screens */
            .ant-modal-body {
                max-height: 70vh;
                overflow-y: auto;
            }
        }
    `;

function Customers({ customers }) {
    const { user } = useAuth();
    const { settings } = useSettings();
    const roles = Array.isArray(user?.role) ? user.role : [];
    const isAdmin = roles.includes('admin');
    const isManager = roles.includes('manager');
    const isSalesman = roles.includes('salesman');

    const canAddCustomer = isAdmin;
    const canEditCustomer = isAdmin;
    const canDeleteCustomer = isAdmin;
    const canShare = isAdmin || isManager;
    const canViewReceipts = isAdmin || isManager || isSalesman; // Allow salesman to view receipts
    const canAddReceipt = isAdmin || isManager; // Remove salesman access to receipts (Udhar/Wasooli)
    const canExportPDF = isAdmin || isManager;

    // State Variables
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [customersData, setCustomersData] = useState(customers);
    const [customerSummaries, setCustomerSummaries] = useState({});
    const [grandTotals, setGrandTotals] = useState({ totalWasooli: 0, totalOdhar: 0, remaining: 0 });
    const [receiptModalVisible, setReceiptModalVisible] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [receipts, setReceipts] = useState([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);
    const [receiptDateRange, setReceiptDateRange] = useState(['', '']);
    const [vehicleNumberFilter, setVehicleNumberFilter] = useState('');
    const [isReceiptModalVisible, setIsReceiptModalVisible] = useState(false);
    const [receiptForm] = Form.useForm();
    const [selectedCustomerForReceipt, setSelectedCustomerForReceipt] = useState(null);
    const [receiptType, setReceiptType] = useState(null);
    const [isTransactionsModalVisible, setIsTransactionsModalVisible] = useState(false);
    const [transactionsDateRange, setTransactionsDateRange] = useState([
        moment().subtract(30, 'days').format('YYYY-MM-DD'),
        moment().format('YYYY-MM-DD')
    ]);
    const [transactionsList, setTransactionsList] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [selectedShift, setSelectedShift] = useState(null);

    // Sync customers prop
    useEffect(() => {
        setCustomersData(customers);
    }, [customers]);

    // Calculate summary of transactions
    const calculateSummary = (transactions, openingBalance) => {
        const totalWasooli = transactions
            .filter(t => t.transactionType === 'wasooli')
            .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);
        const totalOdhar = transactions
            .filter(t => t.transactionType === 'odhar')
            .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);
        const remaining = openingBalance + totalWasooli - totalOdhar;
        return { totalWasooli, totalOdhar, remaining };
    };

    // Fetch transactions for a specific customer
    const fetchCustomerSummary = async customer => {
        const q = query(
            collection(db, 'receipts'),
            where('accountId', '==', customer.id),
            orderBy('createdAt', 'asc')
        );
        const snap = await getDocs(q);
        const receipts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        let running = parseFloat(customer.initialBalance || 0);
        const initialRecord = {
            id: 'initial',
            date: Timestamp.fromDate(new Date(0)),
            transactionType: 'Initial Balance',
            note: 'Opening Balance',
            runningBalance: running,
        };

        const processed = receipts.map(tx => {
            let amt = parseFloat(tx.amount || 0);
            if (tx.transactionType === 'wasooli') {
                running += Math.abs(amt);
            } else if (tx.transactionType === 'odhar') {
                running -= Math.abs(amt);
            }
            return { ...tx, runningBalance: running };
        });

        const transactions = [...processed.reverse(), initialRecord];
        const summary = calculateSummary(processed, parseFloat(customer.initialBalance || 0));
        return { transactions, ...summary };
    };

    // Load summaries for all customers
    useEffect(() => {
        if (!customersData?.length) return;
        const load = async () => {
            const sums = {};
            await Promise.all(
                customersData.map(async cust => {
                    sums[cust.id] = await fetchCustomerSummary(cust);
                })
            );
            setCustomerSummaries(sums);
        };
        load();
    }, [customersData]);

    // Calculate grand totals across all customers
    useEffect(() => {
        const totals = Object.values(customerSummaries).reduce(
            (acc, s) => {
                acc.totalWasooli += s.totalWasooli;
                acc.totalOdhar += s.totalOdhar;
                acc.remaining += s.remaining;
                return acc;
            },
            { totalWasooli: 0, totalOdhar: 0, remaining: 0 }
        );
        setGrandTotals(totals);
    }, [customerSummaries]);

    // Fetch shifts for transaction filtering
    const fetchShifts = async () => {
        try {
            const shiftsQuery = query(collection(db, 'shifts'), orderBy('startTime', 'desc'));
            const shiftsSnap = await getDocs(shiftsQuery);
            const shiftsData = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setShifts(shiftsData);
        } catch (err) {
            message.error('Failed to fetch shifts: ' + err.message);
        }
    };

    // Customer CRUD Handlers
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
        const prev = [...customersData];
        const { nextCollectionDate, ...restValues } = values;
        const now = Timestamp.now();
        const nextCollectionTimestamp = nextCollectionDate ? Timestamp.fromDate(moment(nextCollectionDate).toDate()) : null;

        const customerData = {
            ...restValues,
            accountType: 'customer',
            phoneNumber: values.phoneNumber || '',
            cnic: values.cnic || '',
            address: values.address || '',
            creditLimit: values.creditLimit || 0,
            status: values.status || 'active',
            nextCollectionDate: nextCollectionTimestamp,
        };

        try {
            if (editingId) {
                const updated = {
                    ...customerData,
                    id: editingId,
                    updatedAt: now,
                };
                setCustomersData(a => a.map(x => (x.id === editingId ? updated : x)));
                await updateDoc(doc(db, 'accounts', editingId), {
                    ...customerData,
                    updatedAt: now,
                });
                message.success('Customer updated');
            } else {
                const tempId = 'temp-' + TimezoneService.createServerDate().getTime();
                const newCust = {
                    ...customerData,
                    id: tempId,
                    createdAt: now,
                    updatedAt: now,
                    currentBalance: parseFloat(values.initialBalance || 0),
                };
                setCustomersData(a => [newCust, ...a]);
                const ref = await addDoc(collection(db, 'accounts'), {
                    ...customerData,
                    createdAt: now,
                    updatedAt: now,
                    currentBalance: parseFloat(values.initialBalance || 0),
                });
                setCustomersData(a => a.map(x => (x.id === tempId ? { ...x, id: ref.id } : x)));
                message.success('Customer created');
            }
            setIsModalVisible(false);
            form.resetFields();
        } catch (err) {
            setCustomersData(prev);
            message.error('Operation failed: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async id => {
        const prev = [...customersData];
        setCustomersData(a => a.filter(x => x.id !== id));
        try {
            const accountRef = doc(db, 'accounts', id);
            const receiptsQuery = query(collection(db, 'receipts'), where('accountId', '==', id));
            const receiptsSnap = await getDocs(receiptsQuery);
            const batch = writeBatch(db);
            const globalSummaryRef = doc(db, 'summaries', 'global');

            const wasooliToDecrement = receiptsSnap.docs
                .filter(doc => doc.data().transactionType === 'wasooli')
                .reduce((sum, doc) => sum + parseFloat(doc.data().amount || 0), 0);
            const odharToDecrement = receiptsSnap.docs
                .filter(doc => doc.data().transactionType === 'odhar')
                .reduce((sum, doc) => sum + parseFloat(doc.data().amount || 0), 0);

            if (wasooliToDecrement > 0) {
                batch.update(globalSummaryRef, { totalWasooli: increment(-wasooliToDecrement) });
            }
            if (odharToDecrement > 0) {
                batch.update(globalSummaryRef, { totalOdhar: increment(-odharToDecrement) });
            }

            receiptsSnap.docs.forEach(receiptDoc => {
                batch.delete(receiptDoc.ref);
            });
            batch.delete(accountRef);
            await batch.commit();
            message.success('Customer and associated receipts deleted');
        } catch (err) {
            setCustomersData(prev);
            message.error('Delete failed: ' + err.message);
        }
    };

    // Export customer list to PDF
    const handleExportToPDF = () => {
        const columns = ['Name', 'Phone', 'Balance', 'Next Collection Date'];
        const data = filteredCustomers.map(cust => {
            const sum = customerSummaries[cust.id];
            return [
                cust.accountName,
                cust.phoneNumber || '-',
                sum ? sum.remaining.toFixed(2) : '-',
                cust.nextCollectionDate ? moment(cust.nextCollectionDate.toDate()).format('YYYY-MM-DD') : '-',
            ];
        });
        data.push(['Grand Total', '', grandTotals.remaining.toFixed(2), '']);
        generatePDF('Customers List', columns, data, `Customers_List_${moment().format('YYYYMMDD')}.pdf`, {}, settings);
        message.success('Exported to PDF');
    };

    // Receipt Handlers
    const handleViewReceipts = cust => {
        try {
            console.log('Opening receipts modal for customer:', cust);
            setSelectedCustomer(cust);
            setReceiptModalVisible(true);
            setReceiptDateRange(['', '']);
            const transactions = customerSummaries[cust.id]?.transactions || [];
            console.log('Setting receipts:', transactions.length);
            setReceipts(transactions);
        } catch (error) {
            console.error('Error opening receipts modal:', error);
            message.error('Failed to open receipts modal');
        }
    };

    const handleCloseReceiptsModal = () => {
        setReceiptModalVisible(false);
        setSelectedCustomer(null);
        setReceipts([]);
        setVehicleNumberFilter('');
    };

    const filteredReceipts = useMemo(() => {
        let filtered = receipts;
        
        // Filter by date range
        if (receiptDateRange[0] && receiptDateRange[1]) {
            const start = moment(receiptDateRange[0]).startOf('day');
            const end = moment(receiptDateRange[1]).endOf('day');
            filtered = filtered.filter(r => {
                // Always exclude initial balance row when date filters are applied
                if (r.id === 'initial') return false;
                
                let receiptDate;
                if (r.date && typeof r.date.toDate === 'function') {
                    // Handle Firestore Timestamp
                    receiptDate = moment(r.date.toDate());
                } else if (r.date && typeof r.date === 'string') {
                    // Handle legacy string dates
                    try {
                        receiptDate = moment(r.date);
                    } catch (err) {
                        console.warn('Invalid date string for filtering:', r.date);
                        return false;
                    }
                } else if (r.date instanceof Date) {
                    // Handle JavaScript Date objects
                    receiptDate = moment(r.date);
                } else {
                    console.warn('Unknown date format for filtering:', r.id, 'date:', r.date, 'type:', typeof r.date);
                    return false;
                }
                
                return receiptDate.isBetween(start, end, null, '[]');
            });
        }
        
        // Filter by vehicle number
        if (vehicleNumberFilter) {
            filtered = filtered.filter(r => {
                // Always exclude initial balance row when vehicle filters are applied
                if (r.id === 'initial') return false;
                return r.vehicleNumber && r.vehicleNumber.toLowerCase().includes(vehicleNumberFilter.toLowerCase());
            });
        }
        
        return filtered;
    }, [receipts, receiptDateRange, vehicleNumberFilter]);

    const exportReceiptsToPDF = () => {
        if (!selectedCustomer) return;
        setReceiptsLoading(true);
        try {
            const columns = ['Date', 'Vehicle Number', 'Transaction Type', 'Amount', 'Running Balance', 'Note'];
            
            // Always exclude initial balance row from PDF export, regardless of filters
            const pdfData = filteredReceipts.filter(r => r.id !== 'initial').map(r => {
                let formattedDate;
                try {
                    if (r.date && typeof r.date.toDate === 'function') {
                        // Handle Firestore Timestamp
                        formattedDate = moment(r.date.toDate()).format('YYYY-MM-DD');
                    } else if (r.date && typeof r.date === 'string') {
                        // Handle legacy string dates
                        formattedDate = moment(r.date).format('YYYY-MM-DD');
                    } else if (r.date instanceof Date) {
                        // Handle JavaScript Date objects
                        formattedDate = moment(r.date).format('YYYY-MM-DD');
                    } else {
                        console.warn('Unknown date format for receipt:', r.id, 'date:', r.date, 'type:', typeof r.date);
                        formattedDate = 'Invalid Date';
                    }
                } catch (dateError) {
                    console.error('Error formatting date for receipt:', r.id, 'date:', r.date, 'error:', dateError);
                    formattedDate = 'Error';
                }

                return [
                    formattedDate,
                    r.vehicleNumber || '-',
                    r.transactionType === 'wasooli' ? 'Wasooli (Payment)' : 'Odhar (Credit)',
                    parseFloat(r.amount || 0).toFixed(2),
                    r.runningBalance.toFixed(2),
                    r.note || '-',
                ];
            });

            // *** NEW: Calculate summary for the PDF header ***
            const periodSummary = filteredReceipts.reduce((acc, r) => {
                if (r.id === 'initial') return acc; // Don't include initial balance in period summary
                const amount = Math.abs(parseFloat(r.amount || 0));
                if (r.transactionType === 'wasooli') {
                    acc.wasooli += amount;
                } else if (r.transactionType === 'odhar') {
                    acc.odhar += amount;
                }
                return acc;
            }, { wasooli: 0, odhar: 0 });

            // Get the customer's final outstanding balance
            const finalRemaining = customerSummaries[selectedCustomer.id]?.remaining || 0;

            const summaryData = {
                wasooli: periodSummary.wasooli,
                odhar: periodSummary.odhar,
                remaining: finalRemaining,
            };

            const options = {
                didParseCell: d => {
                    if (d.section === 'body' && d.column.index === 3 && d.cell.text !== '-') {
                        // Get the transaction type from the filtered data (excluding initial balance)
                        const filteredData = filteredReceipts.filter(r => r.id !== 'initial');
                        const txType = filteredData[d.row.index]?.transactionType;
                        d.cell.styles.textColor = txType === 'odhar' ? [207, 19, 34] : [63, 134, 0];
                    }
                    if (d.section === 'body' && d.column.index === 4) {
                        const val = parseFloat(d.cell.text);
                        d.cell.styles.textColor = val >= 0 ? [63, 134, 0] : [207, 19, 34];
                    }
                },
            };

            // *** MODIFIED: Pass the new summaryData object to generatePDF ***
            generatePDF(
                `Receipts for ${selectedCustomer?.accountName}`,
                columns,
                pdfData,
                `Receipts_${selectedCustomer?.accountName}_${moment().format('YYYYMMDD')}.pdf`,
                summaryData, // 5th argument: summary object
                options,     // 6th argument: options object
                settings
            );
            message.success('PDF exported');
        } catch (err) {
            message.error('PDF export failed: ' + err.message);
        } finally {
            setReceiptsLoading(false);
        }
    };

    const showReceiptModal = (cust, type) => {
        setSelectedCustomerForReceipt(cust);
        setReceiptType(type);
        receiptForm.resetFields();
        receiptForm.setFieldsValue({ date: moment(), transactionType: type });
        setIsReceiptModalVisible(true);
    };

    const handleAddReceipt = async values => {
        setSubmitLoading(true);
        try {
            const customerRef = doc(db, 'accounts', selectedCustomerForReceipt.id);
            const customerSnap = await getDoc(customerRef);
            if (!customerSnap.exists()) {
                throw new Error('Customer not found');
            }
            const currentBalance = customerSnap.data().currentBalance || 0;

            let amount = parseFloat(values.amount || 0);
            amount = Math.abs(amount);

            let balanceChange = 0;
            if (receiptType === 'wasooli') {
                balanceChange = amount;
            } else if (receiptType === 'odhar') {
                balanceChange = -amount;
            }

            const newBalance = currentBalance + balanceChange;

            const transactionDate = Timestamp.fromDate(moment(values.date).toDate());
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
                message.error('No active shift found for the selected date.');
                setSubmitLoading(false);
                return;
            }

            const cashflowType = receiptType === 'wasooli' ? 'cashIn' : 'cashOut';

            const getCashflowCategory = (receiptType) => {
                switch (receiptType) {
                    case 'wasooli':
                        return 'wasooli';
                    case 'odhar':
                        return 'odhar';
                    default:
                        return 'other';
                }
            };

            const cashflowCategory = getCashflowCategory(receiptType);

            const batch = writeBatch(db);
            const receiptDocRef = doc(collection(db, 'receipts'));
            const cashflowDocRef = doc(collection(db, 'cashflow'));
            const globalSummaryRef = doc(db, 'summaries', 'global');

            const newReceipt = {
                accountId: selectedCustomerForReceipt.id,
                accountType: 'customer',
                date: transactionDate,
                amount: amount,
                vehicleNumber: values.vehicleNumber || '',
                note: values.note || '',
                transactionType: receiptType,
                balanceAfter: newBalance,
                createdAt: serverTimestamp(),
                shiftId: selectedShift.id,
                cashflowId: cashflowDocRef.id,
            };

            const cashflowData = {
                amount: amount,
                type: cashflowType,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                receiptId: receiptDocRef.id,
                cashflowCategory: cashflowCategory
            };

            batch.set(receiptDocRef, newReceipt);
            batch.set(cashflowDocRef, cashflowData);
            batch.update(customerRef, { currentBalance: newBalance });

            if (receiptType === 'wasooli') {
                batch.update(globalSummaryRef, { totalWasooli: increment(amount) });
            } else if (receiptType === 'odhar') {
                batch.update(globalSummaryRef, { totalOdhar: increment(amount) });
            }

            await batch.commit();

            message.success('Receipt added');

            const updatedSummary = await fetchCustomerSummary(selectedCustomerForReceipt);
            setCustomerSummaries(prev => ({
                ...prev,
                [selectedCustomerForReceipt.id]: updatedSummary,
            }));

            if (selectedCustomer && selectedCustomer.id === selectedCustomerForReceipt.id) {
                setReceipts(updatedSummary.transactions);
            }

            setIsReceiptModalVisible(false);
        } catch (err) {
            message.error('Failed to add receipt: ' + err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleShareBalance = method => {
        if (!selectedCustomer?.phoneNumber) {
            return message.error('Phone number mojood nahi hai.');
        }

        const sum = customerSummaries[selectedCustomer.id];
        const rem = sum.remaining;
        let text = '';
        const customerName = selectedCustomer.accountName;
        const balance = Math.abs(rem).toFixed(0);

        if (rem > 0) {
            // Scenario: Jab customer ke paise jama hon (Credit Balance)
            text = `
Dear ${customerName},

Aapke Rs ${balance} hamare paas jama hain.
Aapke aetimad ka shukriya.

${COMPANY_NAME}
${COMPANY_PHONE}
        `.trim();
        } else if (rem < 0) {
            // Scenario: Jab customer se payment request karni ho (Dues)
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
            // Scenario: Jab hisaab barabar ho
            text = `
Dear ${customerName},

Aapka hisaab barabar (settled) hai.
Aapke taawun ka shukriya.

${COMPANY_NAME}
${COMPANY_PHONE}
        `.trim();
        }

        const url =
            method === 'message'
                ? `sms:${selectedCustomer.phoneNumber}?body=${encodeURIComponent(text)}`
                : `https://wa.me/${selectedCustomer.phoneNumber}?text=${encodeURIComponent(text)}`;
        method === 'message' ? (window.location.href = url) : window.open(url, '_blank');
    };


    /**
     * Function #2: handleReceiptShare (Customer Ledger se Receipt Bhejne Ke Liye)
     * Yeh function bhi ab naye Roman Urdu templates ke mutabiq receipt banayega.
     */
    const handleReceiptShare = (record, method) => {
        if (!selectedCustomer?.phoneNumber) {
            return message.error('Phone number mojood nahi hai.');
        }

        const amt = Math.abs(parseFloat(record.amount || 0)).toFixed(0);
        const remaining = customerSummaries[selectedCustomer.id]?.remaining || 0;
        const transactionDate = moment(record.date.toDate()).format('YYYY-MM-DD');
        const customerName = selectedCustomer.accountName;

        // Start of the message
        let text = `Dear ${customerName},\n\n`;
        text += `Transaction on ${transactionDate}:\n`;

        // Transaction Type
        if (record.transactionType === 'odhar') {
            text += `Aapko ${COMPANY_NAME}(${COMPANY_PHONE}) ne Rs ${amt} ka saman udhaar diya.\n`;
        } else if (record.transactionType === 'wasooli') {
            text += `Aapne ${COMPANY_NAME}(${COMPANY_PHONE}) ko Rs ${amt} ka payment kiya.\n`;
        }

        // Balance at that time ("Us waqt...")
        if (record.runningBalance > 0) {
            text += `Us waqt aapke account mein Rs ${record.runningBalance.toFixed(0)} jama thay.\n`;
        } else if (record.runningBalance < 0) {
            text += `Us waqt aapke zimme Rs ${Math.abs(record.runningBalance).toFixed(0)} thay.\n`;
        } else {
            text += `Us waqt aapka hisaab barabar tha.\n`;
        }

        // Current Balance ("Ab...")
        const currentBalance = Math.abs(remaining).toFixed(0);
        if (remaining > 0) {
            text += `Ab aapke account mein Rs ${currentBalance} jama hain.`;
        } else if (remaining < 0) {
            text += `Ab aapke zimme Rs ${currentBalance} wajib-ul-ada hain.`;
        } else {
            text += `Ab aapka hisaab barabar hai. Shukriya.`;
        }

        // Signature and Payment Details
        text += `\n\n${COMPANY_NAME}\n${COMPANY_PHONE}`;
        if (remaining < 0) {
            text += `\n\nAccount Details:\nRAAST ID: ${RAAST_ID}\nTITLE: ${COMPANY_NAME}`;
        }

        const url =
            method === 'message'
                ? `sms:${selectedCustomer.phoneNumber}?body=${encodeURIComponent(text)}`
                : `https://wa.me/${selectedCustomer.phoneNumber}?text=${encodeURIComponent(text)}`;
        method === 'message' ? (window.location.href = url) : window.open(url, '_blank');
    };


    /**
     * Function #3: handleTransactionShare (General Transaction Log se Receipt Bhejne Ke Liye)
     * Isko bhi `handleReceiptShare` ki tarah hi update kiya gaya hai.
     */
    const handleTransactionShare = (record, method) => {
        const customer = customersData.find(c => c.id === record.accountId);
        if (!customer || !customer.phoneNumber) {
            return message.error('Is customer ka phone number mojood nahi hai.');
        }

        const sum = customerSummaries[customer.id];
        if (!sum) {
            return message.error('Is customer ki summary calculate nahi ho saki.');
        }

        const currentBalance = sum.remaining;
        const transactionDate = moment(record.date.toDate()).format('YYYY-MM-DD');
        const amt = Math.abs(parseFloat(record.amount || 0)).toFixed(0);
        const customerName = customer.accountName;

        // Start of the message
        let text = `Dear ${customerName},\n\n`;
        text += `Transaction on ${transactionDate}:\n`;

        // Transaction Type
        if (record.transactionType === 'odhar') {
            text += `Aapko ${COMPANY_NAME}(${COMPANY_PHONE}) ne Rs ${amt} ka saman udhaar diya.\n`;
        } else if (record.transactionType === 'wasooli') {
            text += `Aapne ${COMPANY_NAME}(${COMPANY_PHONE}) ko Rs ${amt} ka payment kiya.\n`;
        }

        // Balance at that time, using `balanceAfter` field
        if (record.balanceAfter !== undefined) {
            const balanceAfter = parseFloat(record.balanceAfter);
            if (balanceAfter > 0) {
                text += `Us waqt aapke account mein Rs ${balanceAfter.toFixed(0)} jama thay.\n`;
            } else if (balanceAfter < 0) {
                text += `Us waqt aapke zimme Rs ${Math.abs(balanceAfter).toFixed(0)} thay.\n`;
            } else {
                text += `Us waqt aapka hisaab barabar tha.\n`;
            }
        }

        // Current Balance ("Ab...")
        const finalBalance = Math.abs(currentBalance).toFixed(0);
        if (currentBalance > 0) {
            text += `Ab aapke account mein Rs ${finalBalance} jama hain.`;
        } else if (currentBalance < 0) {
            text += `Ab aapke zimme Rs ${finalBalance} wajib-ul-ada hain.`;
        } else {
            text += `Ab aapka hisaab barabar hai. Shukriya.`;
        }

        // Signature and Payment Details
        text += `\n\n${COMPANY_NAME}\n${COMPANY_PHONE}`;
        if (currentBalance < 0) {
            text += `\n\nAccount Details:\nRAAST ID: ${RAAST_ID}\nTITLE: ${COMPANY_NAME}`;
        }

        const url =
            method === 'message'
                ? `sms:${customer.phoneNumber}?body=${encodeURIComponent(text)}`
                : `https://wa.me/${customer.phoneNumber}?text=${encodeURIComponent(text)}`;
        method === 'message' ? (window.location.href = url) : window.open(url, '_blank');
    };

    // Fetch recent transactions for all customers
    const fetchTransactions = async () => {
        setTransactionsLoading(true);
        try {
            const customersSnap = await getDocs(
                query(collection(db, 'accounts'), where('accountType', '==', 'customer'))
            );

            const customersMap = {};
            customersSnap.forEach(doc => {
                customersMap[doc.id] = doc.data().accountName;
            });

            let q;
            if (selectedShift) {
                q = query(
                    collection(db, 'receipts'),
                    where('shiftId', '==', selectedShift.id),
                    orderBy('date', 'desc'),
                    limit(100)
                );
            } else if (transactionsDateRange[0] && transactionsDateRange[1]) {
                const startDate = new Date(transactionsDateRange[0]);
                startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(transactionsDateRange[1]);
                endDate.setHours(23, 59, 59, 999);
                const start = Timestamp.fromDate(startDate);
                const end = Timestamp.fromDate(endDate);
                q = query(
                    collection(db, 'receipts'),
                    where('date', '>=', start),
                    where('date', '<=', end),
                    orderBy('date', 'desc'),
                    limit(100)
                );
            } else {
                q = query(
                    collection(db, 'receipts'),
                    orderBy('date', 'desc'),
                    limit(100)
                );
            }

            const snap = await getDocs(q);
            const receipts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const customerReceipts = receipts.filter(r => customersMap[r.accountId]);

            const mappedReceipts = customerReceipts.map(r => ({
                ...r,
                accountName: customersMap[r.accountId] || 'Unknown',
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
            fetchTransactions();
        }
    }, [isTransactionsModalVisible, selectedShift, transactionsDateRange]);

    // Calculate totals for the filtered transactions shown in the "Last Transactions" modal
    const filteredTransactionsSummary = useMemo(() => {
        return transactionsList.reduce(
            (acc, tx) => {
                const amount = parseFloat(tx.amount || 0);
                if (tx.transactionType === 'wasooli') {
                    acc.totalWasooli += amount;
                } else if (tx.transactionType === 'odhar') {
                    acc.totalOdhar += amount;
                }
                return acc;
            },
            { totalWasooli: 0, totalOdhar: 0 }
        );
    }, [transactionsList]);

    // START: MODIFIED SECTION
    const exportTransactionsToPDF = () => {
        const columns = ['Date', 'Shift', 'Customer', 'Vehicle', 'Type', 'Amount', 'Balance After', 'Note'];
        const data = transactionsList.map(tx => {
            let formattedDate = 'Invalid Date';
            let shiftText = 'Unknown';
            
            try {
                // Format transaction date
                if (tx.date && typeof tx.date.toDate === 'function') {
                    formattedDate = moment(tx.date.toDate()).format('YYYY-MM-DD');
                } else if (tx.date && typeof tx.date === 'string') {
                    formattedDate = moment(tx.date).format('YYYY-MM-DD');
                } else if (tx.date instanceof Date) {
                    formattedDate = moment(tx.date).format('YYYY-MM-DD');
                }
                
                // Format shift time
                const shift = shifts.find(s => s.id === tx.shiftId);
                if (shift) {
                    let start = 'Unknown';
                    let end = 'Ongoing';
                    
                    if (shift.startTime && typeof shift.startTime.toDate === 'function') {
                        start = moment(shift.startTime.toDate()).format('YYYY-MM-DD HH:mm');
                    } else if (shift.startTime && typeof shift.startTime === 'string') {
                        start = moment(shift.startTime).format('YYYY-MM-DD HH:mm');
                    } else if (shift.startTime instanceof Date) {
                        start = moment(shift.startTime).format('YYYY-MM-DD HH:mm');
                    }
                    
                    if (shift.endTime && typeof shift.endTime.toDate === 'function') {
                        end = moment(shift.endTime.toDate()).format('HH:mm');
                    } else if (shift.endTime && typeof shift.endTime === 'string') {
                        end = moment(shift.endTime).format('HH:mm');
                    } else if (shift.endTime instanceof Date) {
                        end = moment(shift.endTime).format('HH:mm');
                    }
                    
                    shiftText = `${start} - ${end}`;
                }
            } catch (dateError) {
                console.error('Error formatting transaction data for export:', dateError);
            }
            
            return [
                formattedDate,
                shiftText,
                tx.accountName,
                tx.vehicleNumber || '-',
                tx.transactionType === 'wasooli' ? 'Wasooli' : 'Odhar',
                parseFloat(tx.amount || 0).toFixed(2),
                tx.balanceAfter !== undefined ? parseFloat(tx.balanceAfter).toFixed(2) : '-',
                tx.note || '-',
            ];
        });

        // Create summaryData object for the PDF header using the pre-calculated summary
        const summaryData = {
            wasooli: filteredTransactionsSummary.totalWasooli,
            odhar: filteredTransactionsSummary.totalOdhar,
            // "Remaining" here means the net change for the period
            remaining: filteredTransactionsSummary.totalWasooli - filteredTransactionsSummary.totalOdhar
        };

        // Call generatePDF with the new summaryData object
        generatePDF(
            'Last Customer Transactions',
            columns,
            data,
            `Transactions_${moment().format('YYYYMMDD')}.pdf`,
            summaryData, // Pass the summary object for the header
            {},           // No special table options needed
            settings
        );
        message.success('Exported to PDF');
    };

    // Filtered customers for display
    const filteredCustomers = useMemo(() => {
        return customersData
            .filter(cust => cust.accountName.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => {
                const dateA = a.createdAt?.toDate() || 0;
                const dateB = b.createdAt?.toDate() || 0;
                return dateB - dateA;
            });
    }, [customersData, searchTerm]);

    // Table Columns
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
            title: 'Balance',
            key: 'balance',
            render: (_, rec) => {
                const sum = customerSummaries[rec.id];
                return sum ? (
                    <span style={{ color: sum.remaining >= 0 ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
                        {sum.remaining.toFixed(2)}
                    </span>
                ) : <Spin size="small" />;
            },
            sorter: (a, b) =>
                (customerSummaries[a.id]?.remaining || 0) - (customerSummaries[b.id]?.remaining || 0),
        },
        {
            title: 'Next Collection Date',
            dataIndex: 'nextCollectionDate',
            key: 'nextCollectionDate',
            render: date => {
                if (!date) return '-';
                try {
                    if (date && typeof date.toDate === 'function') {
                        return moment(date.toDate()).format('YYYY-MM-DD');
                    } else if (date && typeof date === 'string') {
                        return moment(date).format('YYYY-MM-DD');
                    } else if (date instanceof Date) {
                        return moment(date).format('YYYY-MM-DD');
                    } else {
                        console.warn('Unknown date format for next collection date:', date, 'type:', typeof date);
                        return 'Invalid Date';
                    }
                } catch (dateError) {
                    console.error('Error formatting next collection date:', date, 'error:', dateError);
                    return 'Error';
                }
            },
            sorter: (a, b) => {
                try {
                    let dateA = 0;
                    let dateB = 0;
                    
                    if (a.nextCollectionDate) {
                        if (typeof a.nextCollectionDate.toDate === 'function') {
                            dateA = a.nextCollectionDate.toDate().getTime();
                        } else if (typeof a.nextCollectionDate === 'string') {
                            dateA = moment(a.nextCollectionDate).valueOf();
                        } else if (a.nextCollectionDate instanceof Date) {
                            dateA = a.nextCollectionDate.getTime();
                        }
                    }
                    
                    if (b.nextCollectionDate) {
                        if (typeof b.nextCollectionDate.toDate === 'function') {
                            dateB = b.nextCollectionDate.toDate().getTime();
                        } else if (typeof b.nextCollectionDate === 'string') {
                            dateB = moment(b.nextCollectionDate).valueOf();
                        } else if (b.nextCollectionDate instanceof Date) {
                            dateB = b.nextCollectionDate.getTime();
                        }
                    }
                    
                    return dateA - dateB;
                } catch (dateError) {
                    console.error('Error sorting next collection dates:', dateError);
                    return 0;
                }
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, rec) => {
                const summary = customerSummaries[rec.id];
                const isCreditLimitExceeded = summary && rec.creditLimit > 0 && summary.remaining < -Math.abs(rec.creditLimit);
                const isInactive = rec.status === 'inactive';
                const disableUdhaar = (isInactive || isCreditLimitExceeded);

                let tooltipTitle = "Add Udhaar";
                if (isInactive) tooltipTitle = "Customer is inactive";
                else if (isCreditLimitExceeded) tooltipTitle = "Credit limit exceeded";

                return (
                    <Space size="small">
                        {canEditCustomer && (
                            <Tooltip title="Edit">
                                <Button
                                    type="primary"
                                    icon={<EditOutlined />}
                                    onClick={() => showModal(rec)}
                                    size="small"
                                />
                            </Tooltip>
                        )}
                        {canDeleteCustomer && (
                            <Tooltip title="Delete">
                                <Popconfirm
                                    title="Delete this customer and all associated receipts?"
                                    onConfirm={() => handleDelete(rec.id)}
                                    okText="Yes"
                                    cancelText="No"
                                >
                                    <Button danger icon={<DeleteOutlined />} size="small" />
                                </Popconfirm>
                            </Tooltip>
                        )}
                        {canViewReceipts && (
                            <Tooltip title="View Receipts">
                                <Button
                                    icon={<EyeOutlined />}
                                    onClick={() => handleViewReceipts(rec)}
                                    size="small"
                                />
                            </Tooltip>
                        )}
                        {canAddReceipt && (
                            <>
                                <Tooltip title={disableUdhaar ? tooltipTitle : "Add Udhaar"}>
                                    <span>
                                        <Button
                                            style={{ backgroundColor: '#cf1322', color: '#fff' }}
                                            size="small"
                                            onClick={() => showReceiptModal(rec, 'odhar')}
                                            disabled={disableUdhaar}
                                        >
                                            Udhaar
                                        </Button>
                                    </span>
                                </Tooltip>
                                <Tooltip title="Add Wasooli">
                                    <Button
                                        style={{ backgroundColor: '#3f8600', color: '#fff' }}
                                        size="small"
                                        onClick={() => showReceiptModal(rec, 'wasooli')}
                                    >
                                        Wasooli
                                    </Button>
                                </Tooltip>
                            </>
                        )}
                    </Space>
                )
            },
        },
    ];

    const receiptColumns = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: (d, r) => {
                if (r.id === 'initial') return 'Initial Balance';
                if (d && typeof d.toDate === 'function') {
                    // Handle Firestore Timestamp
                    return moment(d.toDate()).format('YYYY-MM-DD');
                } else if (d && typeof d === 'string') {
                    // Handle legacy string dates
                    try {
                        return moment(d).format('YYYY-MM-DD');
                    } catch (err) {
                        console.warn('Invalid date string:', d);
                        return '-';
                    }
                } else if (d instanceof Date) {
                    // Handle JavaScript Date objects
                    return moment(d).format('YYYY-MM-DD');
                }
                // Fallback for invalid/missing date
                console.warn('Unknown date format for receipt:', r.id, 'date:', d, 'type:', typeof d);
                return '-';
            },
        },
        {
            title: 'Vehicle Number',
            dataIndex: 'vehicleNumber',
            key: 'vehicleNumber',
            render: (vehicleNumber, r) => {
                if (r.id === 'initial') return '-';
                return vehicleNumber || '-';
            },
        },
        {
            title: 'Transaction Type',
            key: 'transactionType',
            render: (_, r) => {
                if (r.id === 'initial') return 'Initial Balance';
                return r.transactionType === 'wasooli' ? 'Wasooli (Payment)' : 'Odhar (Credit)';
            },
        },
        {
            title: 'Amount',
            dataIndex: 'amount',
            key: 'amount',
            render: (amount, r) => {
                if (r.id === 'initial') return '-';
                const value = parseFloat(amount || 0);
                const color = r.transactionType === 'odhar' ? '#cf1322' : '#3f8600';
                return <span style={{ color }}>{Math.abs(value).toFixed(2)}</span>;
            },
        },
        {
            title: 'Running Balance',
            key: 'runningBalance',
            render: (_, r) => (
                <span style={{ color: r.runningBalance >= 0 ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
                    {r.runningBalance.toFixed(2)}
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
            render: (_, r) => {
                if (r.id === 'initial') return null;
                return (
                    <Space>
                        <Button size="small" onClick={() => handleReceiptShare(r, 'message')}>
                            Message
                        </Button>
                        <Button size="small" onClick={() => handleReceiptShare(r, 'whatsapp')}>
                            WhatsApp
                        </Button>
                    </Space>
                );
            },
        },
    ];

    const transactionsColumns = [
        { 
            title: 'Date', 
            dataIndex: 'date', 
            key: 'date', 
            render: d => {
                if (!d) return '-';
                try {
                    if (d && typeof d.toDate === 'function') {
                        // Handle Firestore Timestamp
                        return moment(d.toDate()).format('YYYY-MM-DD');
                    } else if (d && typeof d === 'string') {
                        // Handle legacy string dates
                        return moment(d).format('YYYY-MM-DD');
                    } else if (d instanceof Date) {
                        // Handle JavaScript Date objects
                        return moment(d).format('YYYY-MM-DD');
                    } else {
                        console.warn('Unknown date format for transaction:', d, 'type:', typeof d);
                        return 'Invalid Date';
                    }
                } catch (dateError) {
                    console.error('Error formatting transaction date:', d, 'error:', dateError);
                    return 'Error';
                }
            }
        },
        {
            title: 'Shift',
            key: 'shift',
            render: (_, record) => {
                const shift = shifts.find(s => s.id === record.shiftId);
                if (shift) {
                    try {
                        let start = 'Unknown';
                        let end = 'Ongoing';
                        
                        if (shift.startTime && typeof shift.startTime.toDate === 'function') {
                            start = moment(shift.startTime.toDate()).format('YYYY-MM-DD HH:mm');
                        } else if (shift.startTime && typeof shift.startTime === 'string') {
                            start = moment(shift.startTime).format('YYYY-MM-DD HH:mm');
                        } else if (shift.startTime instanceof Date) {
                            start = moment(shift.startTime).format('YYYY-MM-DD HH:mm');
                        }
                        
                        if (shift.endTime && typeof shift.endTime.toDate === 'function') {
                            end = moment(shift.endTime.toDate()).format('HH:mm');
                        } else if (shift.endTime && typeof shift.endTime === 'string') {
                            end = moment(shift.endTime).format('HH:mm');
                        } else if (shift.endTime instanceof Date) {
                            end = moment(shift.endTime).format('HH:mm');
                        }
                        
                        return `${start} - ${end}`;
                    } catch (dateError) {
                        console.error('Error formatting shift time:', dateError);
                        return 'Date Error';
                    }
                } else {
                    return 'Unknown';
                }
            },
        },
        { title: 'Customer', dataIndex: 'accountName', key: 'accountName' },
        { title: 'Vehicle', dataIndex: 'vehicleNumber', key: 'vehicleNumber', render: v => v || '-' },
        { title: 'Type', dataIndex: 'transactionType', key: 'transactionType' },
        { title: 'Amount', dataIndex: 'amount', key: 'amount', render: a => parseFloat(a).toFixed(2) },
        {
            title: 'Balance After',
            dataIndex: 'balanceAfter',
            key: 'balanceAfter',
            render: b => (b !== undefined ? parseFloat(b).toFixed(2) : '-'),
        },
        { title: 'Note', dataIndex: 'note', key: 'note', render: n => n || '-' },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Tooltip title="Send via SMS">
                        <Button
                            icon={<MessageOutlined />}
                            size="small"
                            onClick={() => handleTransactionShare(record, 'message')}
                        />
                    </Tooltip>
                    <Tooltip title="Send via WhatsApp">
                        <Button
                            icon={<WhatsAppOutlined />}
                            size="small"
                            onClick={() => handleTransactionShare(record, 'whatsapp')}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div className="customer-management-card">
            <style>{styles}</style>
            <div className="customer-header d-flex justify-content-between flex-wrap mb-3">
                <Title level={3}>Customer Management</Title>
                <Space wrap style={{ marginTop: 10 }}>
                    <Input
                        placeholder="Search by name"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: 300 }}
                        prefix={<SearchOutlined />}
                    />
                    {canAddCustomer && (
                        <Button type="primary" icon={<UserAddOutlined />} onClick={() => showModal()}>
                            Add Customer
                        </Button>
                    )}
                    {canExportPDF && (
                        <Button icon={<FilePdfOutlined />} onClick={handleExportToPDF}>
                            Export to PDF
                        </Button>
                    )}
                    <Button onClick={() => setIsTransactionsModalVisible(true)}>
                        Last Transactions
                    </Button>
                </Space>
            </div>

            {/* Overall Customer Summary Card */}
            <Card 
                type="inner" 
                title="Overall Customer Summary" 
                className="customer-summary-card"
                size="small"
            >
                {/* First Row - Financial Summary */}
                <Space size="large" wrap style={{ marginBottom: '16px' }}>
                    <div className="summary-metric" style={{ 
                        backgroundColor: '#f6ffed', 
                        border: '1px solid #b7eb8f'
                    }}>
                        <Typography.Text strong style={{ color: '#52c41a' }}>Total Wasooli (Payments):</Typography.Text>
                        <br />
                        <span style={{ marginLeft: '8px', fontSize: '16px', fontWeight: 'bold', color: '#52c41a' }}>
                            Rs {grandTotals.totalWasooli.toFixed(2)}
                        </span>
                    </div>
                    <div className="summary-metric" style={{ 
                        backgroundColor: '#fff2e8', 
                        border: '1px solid #ffbb96'
                    }}>
                        <Typography.Text strong style={{ color: '#fa8c16' }}>Total Odhar (Credit):</Typography.Text>
                        <br />
                        <span style={{ marginLeft: '8px', fontSize: '16px', fontWeight: 'bold', color: '#fa8c16' }}>
                            Rs {grandTotals.totalOdhar.toFixed(2)}
                        </span>
                    </div>
                    <div className="summary-metric" style={{ 
                        backgroundColor: grandTotals.remaining >= 0 ? '#f6ffed' : '#fff2e8', 
                        border: `1px solid ${grandTotals.remaining >= 0 ? '#b7eb8f' : '#ffbb96'}`
                    }}>
                        <Typography.Text strong style={{ color: grandTotals.remaining >= 0 ? '#52c41a' : '#fa8c16' }}>
                            Net Balance:
                        </Typography.Text>
                        <br />
                        <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '16px', 
                            fontWeight: 'bold', 
                            color: grandTotals.remaining >= 0 ? '#52c41a' : '#fa8c16' 
                        }}>
                            Rs {grandTotals.remaining.toFixed(2)}
                        </span>
                        <br />
                        <small style={{ color: grandTotals.remaining >= 0 ? '#52c41a' : '#fa8c16' }}>
                            {grandTotals.remaining >= 0 ? '(Company owes customers)' : '(Customers owe company)'}
                        </small>
                    </div>
                </Space>

                {/* Second Row - Customer Counts and Additional Metrics */}
                <Space size="large" wrap>
                    <div className="summary-metric-small" style={{ 
                        backgroundColor: '#f0f5ff', 
                        border: '1px solid #91d5ff'
                    }}>
                        <Typography.Text strong style={{ color: '#1890ff' }}>Total Customers:</Typography.Text>
                        <br />
                        <span style={{ marginLeft: '8px', fontSize: '14px', fontWeight: 'bold', color: '#1890ff' }}>
                            {customersData.length}
                        </span>
                    </div>
                    <div className="summary-metric-small" style={{ 
                        backgroundColor: '#f9f0ff', 
                        border: '1px solid #d3adf7'
                    }}>
                        <Typography.Text strong style={{ color: '#722ed1' }}>Active Customers:</Typography.Text>
                        <br />
                        <span style={{ marginLeft: '8px', fontSize: '14px', fontWeight: 'bold', color: '#722ed1' }}>
                            {customersData.filter(c => c.status === 'active').length}
                        </span>
                    </div>
                    <div className="summary-metric-small" style={{ 
                        backgroundColor: '#fff7e6', 
                        border: '1px solid #ffd591'
                    }}>
                        <Typography.Text strong style={{ color: '#d46b08' }}>Customers with Dues:</Typography.Text>
                        <br />
                        <span style={{ marginLeft: '8px', fontSize: '14px', fontWeight: 'bold', color: '#d46b08' }}>
                            {Object.values(customerSummaries).filter(summary => summary.remaining < 0).length}
                        </span>
                    </div>
                    <div className="summary-metric-small" style={{ 
                        backgroundColor: '#f6ffed', 
                        border: '1px solid #b7eb8f'
                    }}>
                        <Typography.Text strong style={{ color: '#52c41a' }}>Customers with Credit:</Typography.Text>
                        <br />
                        <span style={{ marginLeft: '8px', fontSize: '14px', fontWeight: 'bold', color: '#52c41a' }}>
                            {Object.values(customerSummaries).filter(summary => summary.remaining > 0).length}
                        </span>
                    </div>
                </Space>
            </Card>

            <Table
                columns={columns}
                dataSource={filteredCustomers}
                rowKey="id"
                pagination={{ pageSize: 10, responsive: true }}
                bordered
                scroll={{ x: 'max-content' }}
            />

            <Modal
                title={editingId ? 'Edit Customer' : 'Add New Customer'}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
                width={800}
                style={{ maxWidth: '95vw' }}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: 16,
                        }}
                    >
                        <Form.Item
                            name="accountName"
                            label="Customer Name"
                            rules={[{ required: true, message: 'Please enter customer name' }]}
                        >
                            <Input placeholder="Enter customer name" />
                        </Form.Item>
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
                        <Form.Item
                            name="initialBalance"
                            label="Initial Balance"
                            rules={[{ required: !editingId, message: 'Please enter initial balance' }]}
                            help="Positive for advance payment, negative for outstanding dues"
                            // Initial balance can't be edited after creation
                            hidden={!!editingId}
                        >
                            <InputNumber
                                style={{ width: '100%' }}
                                placeholder="0.00 (use negative for dues)"
                                formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={value => value.replace(/\$\s?|(,*)/g, '')}
                            />
                        </Form.Item>
                        <Form.Item name="nextCollectionDate" label="Next Collection Date">
                            <DateInput />
                        </Form.Item>
                        <Form.Item name="status" label="Status">
                            <Select placeholder="Select status" defaultValue="active">
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

            <Modal
                title={`Receipts for ${selectedCustomer?.accountName}`}
                open={receiptModalVisible}
                onCancel={handleCloseReceiptsModal}
                footer={
                    <Space wrap>
                        {canShare && (
                            <>
                                <Button icon={<MessageOutlined />} onClick={() => handleShareBalance('message')}>
                                    Message
                                </Button>
                                <Button icon={<WhatsAppOutlined />} onClick={() => handleShareBalance('whatsapp')}>
                                    WhatsApp
                                </Button>
                            </>
                        )}
                        {canExportPDF && (
                            <Button icon={<FilePdfOutlined />} onClick={exportReceiptsToPDF} loading={receiptsLoading}>
                                Download PDF
                            </Button>
                        )}
                        <Button onClick={handleCloseReceiptsModal}>Close</Button>
                    </Space>
                }
                width="90%"
                style={{ maxWidth: '800px' }}
                destroyOnClose
            >
                {/* Customer Information Card */}
                <Card 
                    type="inner" 
                    title="Customer Information" 
                    style={{ marginBottom: '1rem' }}
                    size="small"
                >
                    <div className="customer-info-grid">
                        <div>
                            <Typography.Text strong>Contact Number:</Typography.Text>
                            <br />
                            <Typography.Text>{selectedCustomer?.phoneNumber || 'Not provided'}</Typography.Text>
                        </div>
                        <div>
                            <Typography.Text strong>Credit Limit:</Typography.Text>
                            <br />
                            <Typography.Text>
                                {selectedCustomer?.creditLimit ? `Rs ${selectedCustomer.creditLimit.toFixed(2)}` : 'Not set'}
                            </Typography.Text>
                        </div>
                        <div>
                            <Typography.Text strong>Next Collection Date:</Typography.Text>
                            <br />
                            <Typography.Text>
                                {selectedCustomer?.nextCollectionDate 
                                    ? moment(selectedCustomer.nextCollectionDate.toDate()).format('YYYY-MM-DD')
                                    : 'Not set'
                                }
                            </Typography.Text>
                        </div>
                    </div>
                </Card>

                <div className="date-range-container" style={{ marginBottom: '1rem' }}>
                    <label>From:</label>
                    <input
                        type="date"
                        value={receiptDateRange[0]}
                        onChange={e => setReceiptDateRange([e.target.value, receiptDateRange[1]])}
                        className="modal-date-input"
                    />
                    <label>To:</label>
                    <input
                        type="date"
                        value={receiptDateRange[1]}
                        onChange={e => setReceiptDateRange([receiptDateRange[0], e.target.value])}
                        className="modal-date-input"
                    />
                    <label>Vehicle:</label>
                    <Input
                        placeholder="Filter by vehicle number"
                        value={vehicleNumberFilter}
                        onChange={e => setVehicleNumberFilter(e.target.value)}
                        style={{ width: '100%', minWidth: '200px' }}
                        allowClear
                    />
                </div>

                {receiptsLoading ? (
                    <Spin size="large" tip="Loading receipts..." />
                ) : !filteredReceipts || filteredReceipts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        <p>No receipts found for this date range.</p>
                        {receipts.length > 0 && (
                            <p style={{ fontSize: '12px', color: '#666' }}>
                                Try adjusting your filters or date range.
                            </p>
                        )}
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <Table
                            dataSource={filteredReceipts}
                            columns={receiptColumns}
                            rowKey="id"
                            pagination={false}
                            bordered
                            size="small"
                            scroll={{ x: 'max-content' }}
                            locale={{
                                emptyText: 'No receipts found'
                            }}
                        />
                    </div>
                )}
            </Modal>

            <Modal
                title={`Add ${receiptType === 'odhar' ? 'Udhaar' : 'Wasooli'} for ${selectedCustomerForReceipt?.accountName}`}
                open={isReceiptModalVisible}
                onCancel={() => setIsReceiptModalVisible(false)}
                footer={null}
                width="90%"
                style={{ maxWidth: '400px' }}
                destroyOnClose
            >
                <Form form={receiptForm} layout="vertical" onFinish={handleAddReceipt}>
                    <Form.Item
                        name="date"
                        label="Date"
                        rules={[{ required: true, message: 'Please select date' }]}
                    >
                        <DateInput />
                    </Form.Item>
                    <Form.Item
                        name="amount"
                        label="Amount"
                        rules={[{ required: true, message: 'Please enter amount' }]}
                    >
                        <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="0.00" />
                    </Form.Item>
                    <Form.Item name="vehicleNumber" label="Vehicle Number">
                        <Input placeholder="Enter vehicle number" />
                    </Form.Item>
                    <Form.Item name="note" label="Note">
                        <Input.TextArea />
                    </Form.Item>
                    <Form.Item name="transactionType" label="Transaction Type">
                        <Input disabled />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ float: 'right' }}>
                            <Button onClick={() => setIsReceiptModalVisible(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={submitLoading}>
                                Add Receipt
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Last Transactions"
                open={isTransactionsModalVisible}
                onCancel={() => setIsTransactionsModalVisible(false)}
                footer={null}
                width="95%"
                style={{ maxWidth: '1200px' }}
                destroyOnClose
            >
                <Space wrap style={{ marginBottom: 16, alignItems: 'center' }}>
                    <Select
                        style={{ width: 250 }}
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
                                {moment(shift.startTime.toDate()).format('YYYY-MM-DD HH:mm')} -{' '}
                                {shift.endTime ? moment(shift.endTime.toDate()).format('HH:mm') : 'Ongoing'}
                            </Option>
                        ))}
                    </Select>
                    <label>From:</label>
                    <input
                        type="date"
                        value={transactionsDateRange[0]}
                        onChange={e => setTransactionsDateRange([e.target.value, transactionsDateRange[1]])}
                        className="modal-date-input"
                    />
                    <label>To:</label>
                    <input
                        type="date"
                        value={transactionsDateRange[1]}
                        onChange={e => setTransactionsDateRange([transactionsDateRange[0], e.target.value])}
                        className="modal-date-input"
                    />
                    <Button icon={<FilePdfOutlined />} onClick={exportTransactionsToPDF}>
                        Export to PDF
                    </Button>
                </Space>
                {transactionsLoading ? (
                    <Spin size="large" tip="Loading transactions..." />
                ) : (
                    <>
                        <Card
                            type="inner"
                            title="Summary for Selected Period"
                            style={{ marginBottom: 16 }}
                        >
                            <Space size="large" wrap>
                                <Typography.Text>
                                    Total Wasooli: <Typography.Text strong style={{ color: '#3f8600' }}>{filteredTransactionsSummary.totalWasooli.toFixed(2)}</Typography.Text>
                                </Typography.Text>
                                <Typography.Text>
                                    Total Odhar: <Typography.Text strong style={{ color: '#cf1322' }}>{filteredTransactionsSummary.totalOdhar.toFixed(2)}</Typography.Text>
                                </Typography.Text>
                                <Typography.Text>
                                    Net Change: <Typography.Text strong style={{ color: (filteredTransactionsSummary.totalWasooli - filteredTransactionsSummary.totalOdhar) >= 0 ? '#3f8600' : '#cf1322' }}>
                                        {(filteredTransactionsSummary.totalWasooli - filteredTransactionsSummary.totalOdhar).toFixed(2)}
                                    </Typography.Text>
                                </Typography.Text>
                            </Space>
                        </Card>
                        <Table
                            dataSource={transactionsList}
                            columns={transactionsColumns}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                            bordered
                            scroll={{ x: 'max-content' }}
                        />
                    </>
                )}
            </Modal>
        </div>
    );
}

export default Customers;