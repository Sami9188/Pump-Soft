import React, { useState, useEffect } from 'react';
import {
    Form,
    Input,
    Select,
    Button,
    message,
    Space,
    Typography,
    InputNumber,
    Row,
    Col,
    Card,
    Modal,
    Table,
    Popconfirm,
    Tooltip,
    Divider,
    Statistic,
    Tag,
    DatePicker
} from 'antd';
import {
    PrinterOutlined,
    PlusOutlined,
    DeleteOutlined,
    EditOutlined,
    ReloadOutlined,
    DollarOutlined,
    CreditCardOutlined,
    FilterOutlined,
    DownloadOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import { collection, addDoc, getDocs, doc, updateDoc, getDoc, deleteDoc, query, orderBy, Timestamp, increment, writeBatch, where, limit, serverTimestamp, deleteField } from 'firebase/firestore';
import { useAuth } from '../../../context/AuthContext';
import { db } from '../../../config/firebase';
import { useSettings } from '../../../context/SettingsContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;
const { RangePicker } = DatePicker;

function BillingPage() {
    const { user } = useAuth();
    const { settings } = useSettings();
    const isAdmin = Array.isArray(user?.role) ? user.role.includes('admin') : user?.role === 'admin';
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();
    const [exportForm] = Form.useForm();

    const COMPANY_INFO = {
        name: settings?.name || "Your Company Name",
        phone: settings?.companyPhone,
        address: settings?.location
    };

    const [billType, setBillType] = useState('cash');
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [billAmount, setBillAmount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [tableLoading, setTableLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [bills, setBills] = useState([]);
    const [editingBill, setEditingBill] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [dateRange, setDateRange] = useState([null, null]);
    const [stats, setStats] = useState({ totalCash: 0, totalOdhar: 0, totalBills: 0 });
    const [isFilterVisible, setIsFilterVisible] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [isExportModalVisible, setIsExportModalVisible] = useState(false);
    const [exportPreviewData, setExportPreviewData] = useState([]);
    const [exportPreviewTotals, setExportPreviewTotals] = useState({ cash: 0, odhar: 0, total: 0 });

    useEffect(() => {
        fetchCustomers();
        fetchBills();
        fetchShifts();
    }, []);

    useEffect(() => {
        const filtered = handleFilterBills();
        calculateStats(filtered);
    }, [bills, searchText, filterType, dateRange]);

    const fetchCustomers = async () => {
        try {
            const customersSnap = await getDocs(collection(db, 'accounts'));
            const customersData = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomers(customersData.filter(acc => acc.accountType === 'customer'));
        } catch (err) {
            message.error('Failed to fetch customers: ' + err.message);
        }
    };

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

    /**
     * **MODIFIED FUNCTION**
     * Finds the single currently active shift by querying for a shift with `status === 'active'`.
     * This assumes that your system logic ensures only ONE shift is active at any time.
     * The bill's date is no longer used to find the shift.
     */
    const findActiveShift = async () => {
        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('status', '==', 'active'),
            limit(1)
        );

        const shiftsSnap = await getDocs(shiftsQuery);

        if (shiftsSnap.empty) {
            return null; // No active shift found.
        }

        const shiftDoc = shiftsSnap.docs[0];
        // console.log('shiftDoc :>> ', shiftDoc.data);
        return { id: shiftDoc.id, ...shiftDoc.data() };
    };

    const fetchBills = async () => {
        setTableLoading(true);
        try {
            let billsQuery = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
            const billsSnap = await getDocs(billsQuery);
            const billsData = billsSnap.docs.map(doc => {
                const data = doc.data();
                let billDate = null;
                if (data.date) {
                    if (data.date instanceof Timestamp) {
                        billDate = moment(data.date.toDate());
                    } else {
                        billDate = moment(data.date);
                    }
                }
                return {
                    id: doc.id,
                    ...data,
                    displayDate: billDate ? billDate.format('YYYY-MM-DD') : 'No Date',
                    momentDate: billDate,
                };
            });
            setBills(billsData);
        } catch (err) {
            message.error('Failed to fetch bills: ' + err.message);
        } finally {
            setTableLoading(false);
        }
    };

    const handleFilterBills = () => {
        let filteredBills = [...bills];
        if (searchText) {
            filteredBills = filteredBills.filter(bill =>
                (bill.customerName?.toLowerCase() || '').includes(searchText.toLowerCase()) ||
                (bill.vehicleNumber?.toLowerCase() || '').includes(searchText.toLowerCase())
            );
        }
        if (filterType !== 'all') {
            filteredBills = filteredBills.filter(bill => bill.billType === filterType);
        }
        if (dateRange && dateRange[0] && dateRange[1]) {
            const startDate = moment(dateRange[0]).startOf('day');
            const endDate = moment(dateRange[1]).endOf('day');
            filteredBills = filteredBills.filter(bill => {
                if (!bill.momentDate) return false;
                return bill.momentDate.isSameOrAfter(startDate) && bill.momentDate.isSameOrBefore(endDate);
            });
        }
        return filteredBills;
    };

    const calculateStats = (billsData) => {
        const totalCash = billsData
            .filter(bill => bill.billType === 'cash')
            .reduce((acc, bill) => acc + (bill.amount || 0), 0);
        const totalOdhar = billsData
            .filter(bill => bill.billType === 'odhar')
            .reduce((acc, bill) => acc + (bill.originalAmount || bill.amount || 0), 0);
        setStats({
            totalCash,
            totalOdhar,
            totalBills: billsData.length
        });
    };

    const handleNewBill = (type) => {
        setBillType(type);
        form.resetFields();
        const today = new Date().toISOString().split('T')[0];
        form.setFieldsValue({ date: today, productName: settings?.defaultProduct || 'Diesel' });
        setSelectedCustomer(null);
        setBillAmount(0);
        setIsModalVisible(true);
    };

    const handleCustomerSelect = (customerId) => {
        const customer = customers.find(c => c.id === customerId);
        setSelectedCustomer(customer);
    };

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const shift = await findActiveShift();
            if (!shift) {
                message.error('No active shift found. Please start a shift to create a bill.');
                setLoading(false);
                return;
            }

            const billMoment = moment(values.date, 'YYYY-MM-DD').hour(12).minute(0).second(0);
            const originalAmount = values.quantity * values.rate;
            const discount = billType === 'cash' ? (values.discount || 0) : 0;
            const finalAmount = originalAmount - discount;

            const billData = {
                billType,
                date: billMoment.toISOString(),
                originalAmount,
                amount: finalAmount,
                discount: billType === 'cash' ? discount : 0,
                createdAt: serverTimestamp(),
                quantity: values.quantity,
                rate: values.rate,
                vehicleNumber: values.vehicleNumber,
                productName: values.productName,
                shiftId: shift.id,
            };

            let billObject;

            if (billType === 'cash') {
                billData.customerName = values.customerName;
                const batch = writeBatch(db);
                const billRef = doc(collection(db, 'bills'));

                if (discount > 0) {
                    const discountRef = doc(collection(db, 'discounts'));
                    batch.set(discountRef, {
                        billId: billRef.id,
                        shiftId: shift.id,
                        amount: discount,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    });
                    billData.discountId = discountRef.id;
                }

                batch.set(billRef, billData);

                const globalSummaryRef = doc(db, 'summaries', 'global');
                batch.set(globalSummaryRef, { totalCash: increment(finalAmount) }, { merge: true });

                await batch.commit();
                billObject = { id: billRef.id, ...billData, displayDate: billMoment.format('YYYY-MM-DD') };

            } else if (billType === 'odhar') {
                if (!selectedCustomer) {
                    message.error('Please select a customer for an Odhar bill.');
                    setLoading(false);
                    return;
                }

                const customerRef = doc(db, 'accounts', selectedCustomer.id);
                const customerSnap = await getDoc(customerRef);

                if (!customerSnap.exists()) {
                    message.error('Selected customer does not exist.');
                    setLoading(false);
                    return;
                }

                const customerData = customerSnap.data();

                if (customerData.status === 'inactive') {
                    message.error(`This customer (${customerData.accountName}) is inactive. Cannot create odhar bill.`);
                    setLoading(false);
                    return;
                }

                const currentBalance = parseFloat(customerData.currentBalance || 0);
                const creditLimit = parseFloat(customerData.creditLimit || 0);
                const newBalance = currentBalance - originalAmount;

                if (newBalance < -creditLimit) {
                    message.error('Credit limit exceeded. Please increase the limit or settle previous dues.');
                    setLoading(false);
                    return;
                }

                const batch = writeBatch(db);
                const billRef = doc(collection(db, 'bills'));

                const cashflowRef = doc(collection(db, 'cashflow'));
                batch.set(cashflowRef, {
                    amount: originalAmount,
                    type: 'receivable',
                    cashflowCategory: "Odhar Bill",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    billId: billRef.id,
                    customerId: selectedCustomer.id
                });
                billData.cashflowId = cashflowRef.id;

                const receiptRef = doc(collection(db, 'receipts'));
                batch.set(receiptRef, {
                    accountId: selectedCustomer.id,
                    date: billMoment.toISOString(),
                    amount: -originalAmount,
                    transactionType: 'odhar',
                    note: `Bill on credit for ${values.productName}`,
                    createdAt: serverTimestamp(),
                    balanceAfter: newBalance,
                    billId: billRef.id,
                });

                batch.update(customerRef, {
                    currentBalance: newBalance,
                });

                const globalSummaryRef = doc(db, 'summaries', 'global');
                batch.set(globalSummaryRef, { totalOdhar: increment(originalAmount) }, { merge: true });

                billData.customerId = selectedCustomer.id;
                billData.customerName = selectedCustomer.accountName;
                billData.receiptId = receiptRef.id;

                batch.set(billRef, billData);
                await batch.commit();
                billObject = { id: billRef.id, ...billData, displayDate: billMoment.format('YYYY-MM-DD') };
            }

            message.success('Bill created successfully');
            form.resetFields();
            setIsModalVisible(false);
            fetchBills();
            if (billObject) {
                handlePrint(billObject);
            }

        } catch (err) {
            console.error('Failed to create bill:', err);
            message.error('Failed to create bill: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEditBill = (record) => {
        setEditingBill(record);
        editForm.setFieldsValue({
            ...record,
            date: record.displayDate,
            customerId: record.customerId || undefined,
            vehicleNumber: record.vehicleNumber,
            productName: record.productName,
            discount: record.discount || 0,
        });
        setIsEditModalVisible(true);
    };

    const handleUpdateBill = async (values) => {
        setLoading(true);
        try {
            // Any update will re-assign the bill to the currently active shift.
            const shift = await findActiveShift();
            if (!shift) {
                message.error('No active shift found. Cannot update bill without an active shift.');
                setLoading(false);
                return;
            }
            const shiftId = shift.id;

            const billDate = new Date(values.date);
            const originalAmount = values.quantity * values.rate;
            const discount = editingBill.billType === 'cash' ? (values.discount || 0) : 0;
            const finalAmount = editingBill.billType === 'cash' ? originalAmount - discount : originalAmount;

            const billData = {
                date: billDate.toISOString(),
                quantity: values.quantity,
                rate: values.rate,
                originalAmount,
                amount: finalAmount,
                discount: editingBill.billType === 'cash' ? discount : 0,
                vehicleNumber: values.vehicleNumber,
                productName: values.productName,
                shiftId, // Always use the currently active shift ID.
            };

            if (editingBill.billType === 'cash') {
                billData.customerName = values.customerName;
                const batch = writeBatch(db);
                const billRef = doc(db, 'bills', editingBill.id);
                batch.update(billRef, billData);

                if (editingBill.cashflowId) {
                    const cashflowRef = doc(db, 'cashflow', editingBill.cashflowId);
                    batch.update(cashflowRef, { amount: finalAmount, updatedAt: serverTimestamp() });
                }

                const globalSummaryRef = doc(db, 'summaries', 'global');
                const delta = finalAmount - editingBill.amount;
                batch.update(globalSummaryRef, { totalCash: increment(delta) }, { merge: true });

                const newDiscount = values.discount || 0;
                if (newDiscount > 0) {
                    if (editingBill.discountId) {
                        const discountRef = doc(db, 'discounts', editingBill.discountId);
                        batch.update(discountRef, {
                            amount: newDiscount,
                            shiftId: shiftId,
                            updatedAt: serverTimestamp(),
                        });
                    } else {
                        const discountRef = doc(collection(db, 'discounts'));
                        batch.set(discountRef, {
                            billId: editingBill.id,
                            shiftId: shiftId,
                            amount: newDiscount,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        });
                        batch.update(billRef, { discountId: discountRef.id });
                    }
                } else if (editingBill.discountId) {
                    const discountRef = doc(db, 'discounts', editingBill.discountId);
                    batch.delete(discountRef);
                    batch.update(billRef, { discountId: deleteField() });
                }

                await batch.commit();

            } else if (editingBill.billType === 'odhar') {
                const batch = writeBatch(db);
                const billRef = doc(db, 'bills', editingBill.id);
                const originalBillAmount = editingBill.originalAmount;

                const customerRef = doc(db, 'accounts', editingBill.customerId);
                batch.update(customerRef, { currentBalance: increment(originalBillAmount) });

                const globalSummaryRef = doc(db, 'summaries', 'global');
                batch.update(globalSummaryRef, { totalOdhar: increment(-originalBillAmount) }, { merge: true });

                const newCustomerRef = doc(db, 'accounts', values.customerId || editingBill.customerId);
                const newCustomerSnap = await getDoc(newCustomerRef);
                const newCustomerData = newCustomerSnap.data();
                const newCreditLimit = parseFloat(newCustomerData.creditLimit || 0);
                const newBalanceAfterUpdate = (parseFloat(newCustomerData.currentBalance || 0) + (editingBill.customerId === (values.customerId || editingBill.customerId) ? originalBillAmount : 0)) - originalAmount;

                if (newBalanceAfterUpdate < -newCreditLimit) {
                    message.error('Credit limit exceeded for the customer.');
                    setLoading(false);
                    return;
                }

                batch.update(newCustomerRef, { currentBalance: newBalanceAfterUpdate });
                batch.update(globalSummaryRef, { totalOdhar: increment(originalAmount) }, { merge: true });

                if (editingBill.receiptId) {
                    const receiptRef = doc(db, 'receipts', editingBill.receiptId);
                    batch.update(receiptRef, {
                        accountId: values.customerId || editingBill.customerId,
                        date: billDate.toISOString(),
                        amount: -originalAmount,
                        balanceAfter: newBalanceAfterUpdate,
                    });
                }

                billData.customerId = values.customerId || editingBill.customerId;
                billData.customerName = customers.find(c => c.id === (values.customerId || editingBill.customerId)).accountName;
                batch.update(billRef, billData);

                await batch.commit();
            }

            message.success('Bill updated successfully');
            setIsEditModalVisible(false);
            fetchBills();
        } catch (err) {
            console.error('Update bill failed:', err);
            message.error('Failed to update bill: ' + err.message);
        } finally {
            setLoading(false);
        }
    };


    const handleDeleteBill = async (record) => {
        try {
            setTableLoading(true);
            const batch = writeBatch(db);
            const billRef = doc(db, 'bills', record.id);
            const globalSummaryRef = doc(db, 'summaries', 'global');

            if (record.billType === 'odhar' && record.customerId && record.receiptId) {
                const receiptRef = doc(db, 'receipts', record.receiptId);
                const receiptSnap = await getDoc(receiptRef);
                if (receiptSnap.exists()) {
                    const receipt = receiptSnap.data();
                    const customerRef = doc(db, 'accounts', record.customerId);
                    batch.update(customerRef, {
                        currentBalance: increment(-receipt.amount)
                    });
                    batch.delete(receiptRef);
                    batch.update(globalSummaryRef, { totalOdhar: increment(-record.originalAmount) }, { merge: true });
                }

                if (record.cashflowId) {
                    const cashflowRef = doc(db, 'cashflow', record.cashflowId);
                    batch.delete(cashflowRef);
                }
            } else if (record.billType === 'cash') {
                if (record.cashflowId) {
                    const cashflowRef = doc(db, 'cashflow', record.cashflowId);
                    batch.delete(cashflowRef);
                }
                batch.update(globalSummaryRef, { totalCash: increment(-record.amount) }, { merge: true });
                if (record.discountId) {
                    const discountRef = doc(db, 'discounts', record.discountId);
                    batch.delete(discountRef);
                }
            }

            batch.delete(billRef);
            await batch.commit();
            message.success('Bill deleted successfully');
            fetchBills();
        } catch (err) {
            console.error('Delete failed:', err);
            message.error('Failed to delete bill: ' + err.message);
        } finally {
            setTableLoading(false);
        }
    };

    /**
     * **MODIFIED PRINT FUNCTION for 58mm THERMAL PRINTERS**
     * This CSS is optimized to prevent side cutoffs and remove extra top margins.
     */
    const handlePrint = (record) => {
        const printContent = `
        <html>
        <head>
            <title>Print Bill</title>
            <style>
                @media print {
                    @page {
                        /* Set paper size and remove all browser-added margins */
                        size: 58mm auto;
                        margin: 0; 
                    }
                    html, body {
                        /* Force removal of margin and padding */
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    /* Set a width equal to the paper width */
                    width: 58mm; 
                    /* Include padding within the 58mm width to prevent overflow */
                    box-sizing: border-box; 
                    /* Add padding: 3mm top, 2mm sides, 3mm bottom */
                    /* This controls the empty space around the content */
                    padding: 3mm 2mm; 
                    color: #000;
                }
                .receipt { 
                    width: 100%; 
                }
                .header { 
                    text-align: center; 
                    font-size: 11px; /* Slightly smaller for better fit */
                    font-weight: bold; 
                    margin-bottom: 2mm; 
                }
                .company { 
                    text-align: center; 
                    font-size: 9px; /* Smaller for sub-headings */
                    margin-bottom: 3mm; 
                    border-bottom: 1px dashed #000; 
                    padding-bottom: 2mm; 
                }
                .info { 
                    margin-bottom: 3mm; 
                    font-size: 9px; /* Smaller for itemized list */
                }
                .info-row {
                    /* Use grid for a stable two-column layout */
                    display: grid;
                    grid-template-columns: auto 1fr; /* Column 1 (label) is auto-sized, Column 2 (value) takes remaining space */
                    gap: 3mm; /* Space between label and value */
                    margin-bottom: 1.5mm;
                }
                .info-row span:last-child {
                    text-align: right; /* Align the value to the right */
                    word-break: break-word; /* Allow long text to wrap */
                }
                .amount { 
                    font-size: 12px; 
                    font-weight: bold; 
                    margin: 3mm 0; 
                    text-align: center; 
                    border-top: 1px dashed #000; 
                    border-bottom: 1px dashed #000; 
                    padding: 2mm 0; 
                }
                .footer { 
                    text-align: center; 
                    font-size: 9px; 
                    margin-top: 4mm; 
                    border-top: 1px dashed #000; 
                    padding-top: 2mm; 
                }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">${COMPANY_INFO.name || 'Your Company'}</div>
                <div class="company">
                    <div>${COMPANY_INFO.address || 'Company Address'}</div>
                    <div>Tel: ${COMPANY_INFO.phone || 'N/A'}</div>
                </div>
                <div class="info">
                    <div class="info-row"><span>Date:</span><span>${record.displayDate}</span></div>
                    <div class="info-row"><span>Bill No:</span><span>${record.id.substring(0, 8).toUpperCase()}</span></div>
                    <div class="info-row"><span>Customer:</span><span>${record.customerName}</span></div>
                    <div class="info-row"><span>Vehicle:</span><span>${record.vehicleNumber || 'N/A'}</span></div>
                    <div class="info-row"><span>Product:</span><span>${record.productName || 'N/A'}</span></div>
                    <div class="info-row"><span>Type:</span><span>${record.billType === 'cash' ? 'Cash' : 'Odhar'}</span></div>
                    <div class="info-row"><span>Quantity:</span><span>${(record.quantity || 0).toLocaleString()}</span></div>
                    <div class="info-row"><span>Rate:</span><span>RS ${(record.rate || 0).toLocaleString()}</span></div>
                    ${record.billType === 'cash' ? `
                    <div class="info-row"><span>Subtotal:</span><span>RS ${(record.originalAmount || 0).toLocaleString()}</span></div>
                    <div class="info-row"><span>Discount:</span><span>RS ${(record.discount || 0).toLocaleString()}</span></div>
                    ` : ''}
                    <div class="amount">Total: RS ${(record.amount || 0).toLocaleString()}</div>
                </div>
                <div class="footer">
                    <div>Thank you for your business!</div>
                    <div style="margin-top: 4mm; font-size: 8px;">Generated on ${moment().format('YYYY-MM-DD HH:mm')}</div>
                </div>
            </div>
        </body>
        </html>
    `;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(printContent);
        doc.close();

        iframe.onload = function () {
            setTimeout(() => {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 500);
            }, 200);
        };
    };

    const calculateExportPreviewTotals = (data) => {
        const cash = data.filter(b => b.billType === 'cash').reduce((sum, b) => sum + (b.amount || 0), 0);
        const odhar = data.filter(b => b.billType === 'odhar').reduce((sum, b) => sum + (b.originalAmount || b.amount || 0), 0);
        setExportPreviewTotals({ cash, odhar, total: cash + odhar });
    };

    const handleExportClick = () => {
        setExportPreviewData(bills);
        calculateExportPreviewTotals(bills);
        setIsExportModalVisible(true);
    };

    const handleExportFormChange = (_, allValues) => {
        const { dateRange: exportDateRange } = allValues;
        if (exportDateRange && exportDateRange[0] && exportDateRange[1]) {
            const [startDate, endDate] = exportDateRange;
            const startDateObj = startDate.startOf('day');
            const endDateObj = endDate.endOf('day');
            const filtered = bills.filter(bill => {
                if (!bill.momentDate) return false;
                return bill.momentDate.isBetween(startDateObj, endDateObj, null, '[]');
            });
            setExportPreviewData(filtered);
            calculateExportPreviewTotals(filtered);
        } else {
            setExportPreviewData(bills);
            calculateExportPreviewTotals(bills);
        }
    };

    const generatePDF = (title, columns, tableData, fileName, options, companyInfo) => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;

        let currentY = margin;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(41, 128, 185);
        doc.text(companyInfo.name, pageWidth / 2, currentY, { align: 'center' });
        currentY += 8;

        if (companyInfo.address) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(companyInfo.address, pageWidth / 2, currentY, { align: 'center' });
            currentY += 5;
        }

        doc.setDrawColor(41, 128, 185);
        doc.setLineWidth(0.5);
        doc.line(margin, currentY + 2, pageWidth - margin, currentY + 2);
        currentY += 10;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text(title, pageWidth / 2, currentY, { align: 'center' });
        currentY += 12;

        autoTable(doc, {
            startY: currentY,
            head: [columns],
            body: tableData,
            theme: 'grid',
            headStyles: {
                fillColor: [41, 128, 185],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
            },
            styles: {
                fontSize: 8,
                cellPadding: 3,
                halign: 'center',
            },
            alternateRowStyles: {
                fillColor: [248, 249, 250],
            },
            columnStyles: {
                1: { halign: 'left' },
                4: { halign: 'right' },
                5: { halign: 'right' },
                6: { halign: 'right' },
                7: { halign: 'right', fontStyle: 'bold' }
            },
            didDrawPage: (data) => {
                if (data.pageNumber > 1) {
                    doc.setFontSize(12);
                    doc.text(title + ' (Continued)', pageWidth / 2, 15, { align: 'center' });
                }
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
                doc.text(`Generated on: ${moment().format('YYYY-MM-DD HH:mm')}`, margin, pageHeight - 10);
            },
        });

        doc.save(fileName);
    };

    const handleProfessionalExport = async (values) => {
        const dataToExport = exportPreviewData;

        if (dataToExport.length === 0) {
            message.warning('No data to export for the selected criteria.');
            return;
        }

        const { cash: exportCash, odhar: exportOdhar, total: exportTotal } = exportPreviewTotals;
        const reportPeriod = (values.dateRange && values.dateRange.length === 2)
            ? `${values.dateRange[0].format('MMM DD, YYYY')} - ${values.dateRange[1].format('MMM DD, YYYY')}`
            : 'All Time';

        const title = 'BILLING REPORT';
        const columns = ['Date', 'Customer', 'Vehicle No.', 'Type', 'Qty', 'Rate (RS)', 'Discount (RS)', 'Amount (RS)'];

        const tableData = dataToExport.map(item => [
            item.displayDate || 'N/A',
            item.customerName || '-',
            item.vehicleNumber || '-',
            item.billType === 'cash' ? 'Cash' : 'Odhar',
            (item.quantity || 0).toLocaleString('en-PK'),
            (item.rate || 0).toLocaleString('en-PK'),
            (item.discount || 0).toLocaleString('en-PK'),
            (item.amount || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })
        ]);

        tableData.push(
            [],
            ['', '', '', '', '', '', 'TOTAL CASH:', exportCash.toLocaleString('en-PK', { minimumFractionDigits: 2 })],
            ['', '', '', '', '', '', 'TOTAL ODHAR:', exportOdhar.toLocaleString('en-PK', { minimumFractionDigits: 2 })],
            ['', '', '', '', '', '', 'NET TOTAL:', exportTotal.toLocaleString('en-PK', { minimumFractionDigits: 2 })]
        );

        const fileName = `Billing-Report-${moment().format('YYYYMMDD-HHmm')}.pdf`;

        const enhancedCompanyInfo = {
            ...COMPANY_INFO,
            title: title,
            reportPeriod: reportPeriod
        };

        generatePDF(title, columns, tableData, fileName, {}, enhancedCompanyInfo);

        setIsExportModalVisible(false);
        message.success(`PDF report generated successfully!`);
    };

    const columns = [
        { title: 'Date', dataIndex: 'displayDate', key: 'date', width: '10%', sorter: (a, b) => (a.momentDate && b.momentDate) ? a.momentDate.unix() - b.momentDate.unix() : 0, defaultSortOrder: 'descend' },
        {
            title: 'Shift', key: 'shift', width: '15%', render: (_, record) => {
                const shift = shifts.find(s => s.id === record.shiftId);
                if (shift) {
                    const start = moment(shift.startTime.toDate()).format('MM-DD HH:mm');
                    const end = shift.endTime ? moment(shift.endTime.toDate()).format('HH:mm') : 'Ongoing';
                    return <Tooltip title={`${moment(shift.startTime.toDate()).format('YYYY-MM-DD HH:mm')} - ${shift.endTime ? moment(shift.endTime.toDate()).format('YYYY-MM-DD HH:mm') : 'Ongoing'}`}>{`${start} - ${end}`}</Tooltip>;
                }
                return 'N/A';
            }, filters: shifts.slice(0, 10).map(shift => ({ text: `${moment(shift.startTime.toDate()).format('MM-DD HH:mm')} - ${shift.endTime ? moment(shift.endTime.toDate()).format('HH:mm') : 'Ongoing'}`, value: shift.id })), onFilter: (value, record) => record.shiftId === value,
        },
        { title: 'Customer', dataIndex: 'customerName', key: 'customerName', width: '15%', sorter: (a, b) => (a.customerName || '').localeCompare(b.customerName || '') },
        { title: 'Type', dataIndex: 'billType', key: 'billType', width: '8%', render: (type) => <Tag color={type === 'cash' ? 'green' : 'blue'}>{type === 'cash' ? 'Cash' : 'Odhar'}</Tag> },
        { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: '8%', align: 'right', render: (val) => val?.toLocaleString() },
        { title: 'Rate', dataIndex: 'rate', key: 'rate', width: '10%', align: 'right', render: (rate) => `RS ${rate?.toLocaleString() || 0}` },
        { title: 'Discount', dataIndex: 'discount', key: 'discount', width: '10%', align: 'right', render: (discount) => `RS ${discount?.toLocaleString() || 0}` },
        { title: 'Amount', dataIndex: 'amount', key: 'amount', width: '12%', align: 'right', render: (amount) => <strong>RS {amount?.toLocaleString() || 0}</strong>, sorter: (a, b) => a.amount - b.amount },
        {
            title: 'Actions', key: 'actions', width: '12%', fixed: 'right', render: (_, record) => (
                <Space size="small">
                    <Tooltip title="Print Bill"><Button icon={<PrinterOutlined />} onClick={() => handlePrint(record)} size="small" /></Tooltip>
                    <Tooltip title="Edit"><Button icon={<EditOutlined />} onClick={() => handleEditBill(record)} size="small" type="primary" ghost /></Tooltip>
                    <Tooltip title="Delete">
                        <Popconfirm title="Sure to delete? This is irreversible." onConfirm={() => handleDeleteBill(record)} okText="Yes" cancelText="No">
                            <Button icon={<DeleteOutlined />} size="small" danger />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const previewColumns = columns.filter(col => col.key !== 'actions');
    const filteredBills = handleFilterBills();

    return (
        <div className="billing-page" style={{ padding: '20px' }}>
            <Card>
                <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} sm={12}><Title level={3} style={{ margin: 0 }}>Billing Management</Title></Col>
                    <Col xs={24} sm={12} style={{ textAlign: 'right' }}>
                        <Space wrap>
                            <Button icon={<FilterOutlined />} onClick={() => setIsFilterVisible(!isFilterVisible)}>Filters</Button>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleNewBill('cash')}>Cash Bill</Button>
                            <Button type="primary" ghost icon={<CreditCardOutlined />} onClick={() => handleNewBill('odhar')}>Odhar Bill</Button>
                            <Button icon={<ReloadOutlined />} onClick={fetchBills}>Refresh</Button>
                            <Button icon={<DownloadOutlined />} onClick={handleExportClick} disabled={bills.length === 0}>Export PDF</Button>
                        </Space>
                    </Col>
                </Row>

                {isFilterVisible && (
                    <div style={{ marginTop: 16, padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}><Search placeholder="Search customer or vehicle" allowClear value={searchText} onChange={(e) => setSearchText(e.target.value)} style={{ width: '100%' }} /></Col>
                            <Col xs={24} md={8}>
                                <Select style={{ width: '100%' }} placeholder="Filter by type" value={filterType} onChange={setFilterType}>
                                    <Option value="all">All Types</Option>
                                    <Option value="cash">Cash</Option>
                                    <Option value="odhar">Odhar</Option>
                                </Select>
                            </Col>
                            <Col xs={24} md={8}><RangePicker style={{ width: '100%' }} value={dateRange} onChange={setDateRange} format="YYYY-MM-DD" allowClear /></Col>
                        </Row>
                    </div>
                )}

                <Divider />

                <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col xs={24} sm={8}><Card bordered={false} style={{ background: '#f6ffed' }}><Statistic title="Total Cash (Filtered)" value={stats.totalCash} precision={2} prefix={<DollarOutlined />} suffix="RS" /></Card></Col>
                    <Col xs={24} sm={8}><Card bordered={false} style={{ background: '#e6f7ff' }}><Statistic title="Total Odhar (Filtered)" value={stats.totalOdhar} precision={2} prefix={<CreditCardOutlined />} suffix="RS" /></Card></Col>
                    <Col xs={24} sm={8}><Card bordered={false} style={{ background: '#f9f0ff' }}><Statistic title="Total Bills (Filtered)" value={filteredBills.length} /></Card></Col>
                </Row>

                <Table columns={columns} dataSource={filteredBills} rowKey="id" loading={tableLoading} pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} bills` }} scroll={{ x: 'max-content' }} />
            </Card>

            <Modal title={`Create ${billType === 'cash' ? 'Cash' : 'Odhar'} Bill`} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null} width={700} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Row gutter={16}>
                        <Col xs={24} md={12}><Form.Item name="date" label="Date" rules={[{ required: true }]}><input type="date" style={{ width: '100%', padding: '4px 11px', border: '1px solid #d9d9d9', borderRadius: '2px' }} disabled={!isAdmin} /></Form.Item></Col>
                        {billType === 'cash' ? (
                            <Col xs={24} md={12}><Form.Item name="customerName" label="Customer Name" rules={[{ required: true }]}><Input placeholder="Walk-in Customer" /></Form.Item></Col>
                        ) : (
                            <Col xs={24} md={12}><Form.Item name="customerId" label="Select Customer" rules={[{ required: true }]}><Select placeholder="Select customer" onChange={handleCustomerSelect} showSearch optionFilterProp="children" filterOption={(input, option) => (option.children?.toLowerCase() ?? '').includes(input.toLowerCase())}>{customers.map(customer => <Option key={customer.id} value={customer.id}>{customer.accountName}</Option>)}</Select></Form.Item></Col>
                        )}
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} md={12}><Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} placeholder="e.g., 50" onChange={(quantity) => { const rate = form.getFieldValue('rate') || 0; const discount = form.getFieldValue('discount') || 0; setBillAmount(quantity * rate - discount); }} /></Form.Item></Col>
                        <Col xs={24} md={12}><Form.Item name="rate" label="Rate" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} placeholder="e.g., 270" onChange={(rate) => { const quantity = form.getFieldValue('quantity') || 0; const discount = form.getFieldValue('discount') || 0; setBillAmount(quantity * rate - discount); }} /></Form.Item></Col>
                    </Row>
                    {billType === 'cash' && (
                        <Row gutter={16}><Col xs={24} md={12}><Form.Item name="discount" label="Discount (PKR)"><InputNumber min={0} style={{ width: '100%' }} placeholder="Enter discount" onChange={(discount) => { const quantity = form.getFieldValue('quantity') || 0; const rate = form.getFieldValue('rate') || 0; setBillAmount(quantity * rate - (discount || 0)); }} /></Form.Item></Col></Row>
                    )}
                    <Row gutter={16}>
                        <Col xs={24} md={12}><Form.Item name="vehicleNumber" label="Vehicle Number"><Input placeholder="e.g., ABC-123" /></Form.Item></Col>
                        <Col xs={24} md={12}><Form.Item name="productName" label="Product Name" rules={[{ required: true }]}><Input placeholder="e.g., Diesel" /></Form.Item></Col>
                    </Row>
                    <Row><Col span={24}><Form.Item label="Total Amount"><InputNumber value={billAmount} disabled style={{ width: '100%' }} formatter={value => `RS ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value.replace(/RS\s?|(,*)/g, '')} /></Form.Item></Col></Row>
                    {billType === 'odhar' && selectedCustomer && (
                        <div style={{ marginBottom: 16, padding: 16, background: '#f6f6f6', borderRadius: 8 }}>
                            <Row gutter={16}><Col span={12}><Text strong>Current Balance:</Text><br /><Text>{selectedCustomer.currentBalance?.toLocaleString() || 0} RS</Text></Col><Col span={12}><Text strong>Credit Limit:</Text><br /><Text>{selectedCustomer.creditLimit?.toLocaleString() || 0} RS</Text></Col></Row>
                        </div>
                    )}
                    <Form.Item><div style={{ textAlign: 'right', marginTop: 16 }}><Space><Button onClick={() => setIsModalVisible(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={loading} icon={<PlusOutlined />}>Create Bill</Button></Space></div></Form.Item>
                </Form>
            </Modal>

            <Modal title="Edit Bill" open={isEditModalVisible} onCancel={() => setIsEditModalVisible(false)} footer={null} width={700} destroyOnClose>
                {editingBill && (
                    <Form form={editForm} layout="vertical" onFinish={handleUpdateBill} initialValues={editingBill}>
                        <Row gutter={16}>
                            <Col xs={24} md={12}><Form.Item name="date" label="Date" rules={[{ required: true }]}><input type="date" style={{ width: '100%', padding: '4px 11px', border: '1px solid #d9d9d9', borderRadius: '2px' }} disabled={!isAdmin} /></Form.Item></Col>
                            {editingBill.billType === 'cash' ? (
                                <Col xs={24} md={12}><Form.Item name="customerName" label="Customer Name" rules={[{ required: true }]}><Input placeholder="Enter customer name" /></Form.Item></Col>
                            ) : (
                                <Col xs={24} md={12}><Form.Item name="customerId" label="Select Customer" rules={[{ required: true }]}><Select placeholder="Select customer" showSearch optionFilterProp="children">{customers.map(customer => <Option key={customer.id} value={customer.id}>{customer.accountName}</Option>)}</Select></Form.Item></Col>
                            )}
                        </Row>
                        <Row gutter={16}>
                            <Col xs={24} md={12}><Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} placeholder="Enter quantity" /></Form.Item></Col>
                            <Col xs={24} md={12}><Form.Item name="rate" label="Rate" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} placeholder="Enter rate" /></Form.Item></Col>
                        </Row>
                        {editingBill.billType === 'cash' && (
                            <Row gutter={16}><Col xs={24} md={12}><Form.Item name="discount" label="Discount (PKR)"><InputNumber min={0} style={{ width: '100%' }} placeholder="Enter discount" /></Form.Item></Col></Row>
                        )}
                        <Row gutter={16}>
                            <Col xs={24} md={12}><Form.Item name="vehicleNumber" label="Vehicle Number"><Input placeholder="Enter vehicle number" /></Form.Item></Col>
                            <Col xs={24} md={12}><Form.Item name="productName" label="Product Name" rules={[{ required: true }]}><Input placeholder="Enter product name" /></Form.Item></Col>
                        </Row>
                        <Form.Item><div style={{ textAlign: 'right', marginTop: 16 }}><Space><Button onClick={() => setIsEditModalVisible(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={loading} icon={<EditOutlined />}>Update Bill</Button></Space></div></Form.Item>
                    </Form>
                )}
            </Modal>

            <Modal title="Export Billing Report" open={isExportModalVisible} onCancel={() => setIsExportModalVisible(false)} width="80%" footer={null} destroyOnClose>
                <Form form={exportForm} layout="vertical" onFinish={handleProfessionalExport} onValuesChange={handleExportFormChange}>
                    <Row gutter={24} align="bottom">
                        <Col xs={24} md={10}><Form.Item name="dateRange" label="Filter by Date (Leave blank for all records)"><RangePicker style={{ width: '100%' }} /></Form.Item></Col>
                        <Col xs={24} md={14}>
                            <Row gutter={16}>
                                <Col xs={24} sm={8}><Statistic title="Preview Cash Sales" value={exportPreviewTotals.cash} precision={2} prefix="RS " valueStyle={{ color: '#52c41a', fontSize: '1.2em' }} /></Col>
                                <Col xs={24} sm={8}><Statistic title="Preview Odhar Sales" value={exportPreviewTotals.odhar} precision={2} prefix="RS " valueStyle={{ color: '#1890ff', fontSize: '1.2em' }} /></Col>
                                <Col xs={24} sm={8}><Statistic title="Preview Net Sales" value={exportPreviewTotals.total} precision={2} prefix="RS " valueStyle={{ fontSize: '1.2em' }} /></Col>
                            </Row>
                        </Col>
                    </Row>
                    <Divider>Preview ({exportPreviewData.length} Records)</Divider>
                    <Table columns={previewColumns} dataSource={exportPreviewData} rowKey="id" size="small" loading={tableLoading} pagination={{ pageSize: 5, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items` }} scroll={{ x: 'max-content' }} />
                    <Form.Item style={{ marginTop: 24, textAlign: 'right' }}><Space><Button onClick={() => setIsExportModalVisible(false)}>Cancel</Button><Button type="primary" htmlType="submit" icon={<DownloadOutlined />} loading={loading} disabled={exportPreviewData.length === 0}>Generate PDF Report</Button></Space></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default BillingPage;