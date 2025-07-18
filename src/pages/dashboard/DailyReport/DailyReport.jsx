import React, { useState, useEffect, useRef } from "react";
import { Table, Button, Typography, Select, Space, Row, Col, Statistic, Divider, message, Spin, Modal, Form, InputNumber, Input, Popconfirm, } from "antd";
import { FilePdfOutlined, EditOutlined, DeleteOutlined, } from "@ant-design/icons";
import moment from "moment";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, getDoc, runTransaction, query, where, orderBy, limit, startAfter, writeBatch, serverTimestamp, onSnapshot, } from "firebase/firestore";
import { db } from "../../../config/firebase";
import exportReportToPDF from "../../../services/exportService";
import { useSettings } from "../../../context/SettingsContext";
import { useFirebaseData } from "../../../context/FirebaseDataContext";
import { useAuth } from "../../../context/AuthContext";

const { Title: TitleTypography } = Typography;
const { Option } = Select;

const categories = [
    { id: 'petrol', name: 'Petrol' },
    { id: 'diesel', name: 'Diesel' },
];

const SalesReportPage = () => {
    const { settings } = useSettings();
    const { user } = useAuth();
    const { overallTotalsofOdharAndWasooli } = useFirebaseData();
    const [loading, setLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [reportData, setReportData] = useState({
        readingsByCategory: [],
        totalNozzleSales: 0,
        salesInvoicesTotal: 0,
        salesReturnInvoicesTotal: 0,
        purchaseInvoicesTotal: 0,
        grandTotal: 0,
        adjustments: {
            advanceCash: 0,
            bankPayment: 0,
            karaya: 0,
            salary: 0,
            expenses: 0,
            wasooli: 0,
            odhar: 0,
        },
    });

    const [products, setProducts] = useState([]);
    const [tanks, setTanks] = useState([]);
    const [readings, setReadings] = useState([]);
    const [nozzles, setNozzles] = useState([]);
    const [dipChartData, setDipChartData] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [salesInvoices, setSalesInvoices] = useState([]);
    const [salesReturnInvoices, setSalesReturnInvoices] = useState([]);
    const [purchaseInvoices, setPurchaseInvoices] = useState([]);
    const [adjustments, setAdjustments] = useState([]);

    const [editingAdjustment, setEditingAdjustment] = useState(null);
    const [editingReading, setEditingReading] = useState(null);

    const [isSalesInvoiceModalOpen, setIsSalesInvoiceModalOpen] = useState(false);
    const [isSalesReturnInvoiceModalOpen, setIsSalesReturnInvoiceModalOpen] = useState(false);
    const [isPurchaseInvoiceModalOpen, setIsPurchaseInvoiceModalOpen] = useState(false);
    const [isAdjustmentsModalOpen, setIsAdjustmentsModalOpen] = useState(false);
    const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
    const [isDipChartModalOpen, setIsDipChartModalOpen] = useState(false);
    const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");

    const [salesInvoiceForm] = Form.useForm();
    const [salesReturnInvoiceForm] = Form.useForm();
    const [purchaseInvoiceForm] = Form.useForm();
    const [adjustmentsForm] = Form.useForm();
    const [readingForm] = Form.useForm();
    const [dipChartForm] = Form.useForm();

    const [salesInvoiceSubmitting, setSalesInvoiceSubmitting] = useState(false);
    const [salesReturnInvoiceSubmitting, setSalesReturnInvoiceSubmitting] = useState(false);
    const [purchaseInvoiceSubmitting, setPurchaseInvoiceSubmitting] = useState(false);
    const [adjustmentsSubmitting, setAdjustmentsSubmitting] = useState(false);
    const [readingSubmitting, setReadingSubmitting] = useState(false);
    const [dipChartSubmitting, setDipChartSubmitting] = useState(false);

    const [editingSalesInvoice, setEditingSalesInvoice] = useState(null);
    const [editingSalesReturnInvoice, setEditingSalesReturnInvoice] = useState(null);
    const [editingPurchaseInvoice, setEditingPurchaseInvoice] = useState(null);

    const [purchaseType, setPurchaseType] = useState("fuel");
    const [salesTotal, setSalesTotal] = useState(0);
    const [purchaseTotal, setPurchaseTotal] = useState(0);

    const [currentShift, setCurrentShift] = useState(null);
    const [selectedShift, setSelectedShift] = useState(null);
    const [receipts, setReceipts] = useState([]);
    const [discounts, setDiscounts] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [shiftWiseSummaries, setShiftWiseSummaries] = useState({});
    const [lastVisibleShift, setLastVisibleShift] = useState(null);
    const [hasMoreShifts, setHasMoreShifts] = useState(true);

    const reportRef = useRef(null);
    const isAdmin = user?.role?.includes("admin") || false;

    useEffect(() => {
        fetchAllData();
        fetchShifts(3);
    }, []);

    useEffect(() => {
        if (selectedShift) {
            generateReport();
        }
    }, [selectedShift, products, tanks, readings, nozzles, adjustments, salesInvoices, salesReturnInvoices, purchaseInvoices]);

    // ** START: Centralized function for creating a new shift **
    const startNewShift = async () => {
        try {
            const newShiftData = {
                startTime: Timestamp.now(),
                status: "active",
                createdBy: user.uid,
            };
            const shiftRef = await addDoc(collection(db, "shifts"), newShiftData);
            const newShiftWithId = { id: shiftRef.id, ...newShiftData };

            setCurrentShift(newShiftWithId);
            setSelectedShift(newShiftWithId);
            setShifts(prev => [newShiftWithId, ...prev]);

            return newShiftWithId;
        } catch (err) {
            message.error("Failed to start new shift: " + err.message);
            throw err; // re-throw to be handled by caller if necessary
        }
    };
    // ** END: Centralized function for creating a new shift **

    const fetchShifts = async (limitNum, startAfterDoc = null) => {
        try {
            let q = query(
                collection(db, "shifts"),
                orderBy("startTime", "desc"),
                limit(limitNum)
            );
            if (startAfterDoc) {
                q = query(
                    collection(db, "shifts"),
                    orderBy("startTime", "desc"),
                    startAfter(startAfterDoc),
                    limit(limitNum)
                );
            }
            const shiftsSnap = await getDocs(q);
            const newShifts = shiftsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setShifts(prev => startAfterDoc ? [...prev, ...newShifts] : newShifts);
            if (newShifts.length > 0) {
                setLastVisibleShift(shiftsSnap.docs[shiftsSnap.docs.length - 1]);
            }
            setHasMoreShifts(newShifts.length === limitNum);

            if (!startAfterDoc) {
                // Find an existing active shift
                const activeShift = newShifts.find(shift => shift.status === "active");
                if (activeShift) {
                    setCurrentShift(activeShift);
                    setSelectedShift(activeShift);
                } else {
                    // ** FIX: Call the centralized function to create a new shift **
                    await startNewShift();
                }
            }
        } catch (err) {
            message.error("Failed to fetch shifts: " + err.message);
        }
    };

    const handleEndShift = async () => {
        if (!currentShift) return;
        try {
            // End the current shift
            await updateDoc(doc(db, "shifts", currentShift.id), {
                endTime: Timestamp.now(),
                status: "ended",
            });
            setShifts(prev =>
                prev.map(shift =>
                    shift.id === currentShift.id
                        ? { ...shift, status: "ended", endTime: Timestamp.now() }
                        : shift
                )
            );

            // ** FIX: Call the centralized function to start a new shift **
            await startNewShift();

            // Reset report data for the new shift
            setReportData({
                readingsByCategory: [],
                totalNozzleSales: 0,
                salesInvoicesTotal: 0,
                salesReturnInvoicesTotal: 0,
                purchaseInvoicesTotal: 0,
                grandTotal: 0,
                adjustments: {
                    advanceCash: 0, bankPayment: 0, karaya: 0, salary: 0,
                    expenses: 0, wasooli: 0, odhar: 0,
                },
            });
            message.success("Shift ended and new shift started successfully.");
        } catch (err) {
            message.error("Failed to end shift: " + err.message);
        }
    };


    const createCashflowEntry = async (batch, amount, type, date, referenceId, shiftId, category) => {
        const cashflowRef = doc(collection(db, 'cashflow'));
        const cashflowData = {
            amount,
            type, // 'cashIn' or 'cashOut'
            date,
            referenceId,
            shiftId,
            cashflowCategory: category, // ✅ NEW FIELD
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        batch.set(cashflowRef, cashflowData);
        return cashflowRef.id;
    };


    const fetchAllData = async () => {
        setLoading(true);
        try {
            const [
                productsData,
                tanksData,
                readingsData,
                nozzlesData,
                dipChartsData,
                accountsData,
                salesInvData,
                salesRetInvData,
                purchaseInvData,
                adjustmentsData,
            ] = await Promise.all([
                getDocs(collection(db, "products")),
                getDocs(collection(db, "tanks")),
                getDocs(collection(db, "readings")),
                getDocs(collection(db, "nozzles")),
                getDocs(collection(db, "dipcharts")),
                getDocs(collection(db, "accounts")),
                getDocs(collection(db, "saleInvoices")),
                getDocs(collection(db, "saleReturnInvoices")),
                getDocs(collection(db, "purchaseInvoices")),
                getDocs(collection(db, "adjustments")),
            ]);

            setProducts(productsData.docs.map((d) => ({ id: d.id, ...d.data() })));
            setTanks(tanksData.docs.map((d) => ({ id: d.id, ...d.data() })));
            setReadings(readingsData.docs.map((d) => ({ id: d.id, ...d.data() })));
            setNozzles(nozzlesData.docs.map((d) => ({ id: d.id, ...d.data() })));
            setDipChartData(dipChartsData.docs.map((d) => ({ id: d.id, ...d.data() })));

            const accounts = accountsData.docs.map((d) => ({ id: d.id, ...d.data() }));
            setCustomers(accounts.filter((a) => a.accountType === "customer"));
            setSuppliers(accounts.filter((a) => a.accountType === "supplier"));

            setSalesInvoices(salesInvData.docs.map((d) => ({ id: d.id, ...d.data() })));
            setSalesReturnInvoices(salesRetInvData.docs.map((d) => ({ id: d.id, ...d.data() })));
            setPurchaseInvoices(purchaseInvData.docs.map((d) => ({ id: d.id, ...d.data() })));
            setAdjustments(adjustmentsData.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (err) {
            message.error("Failed to fetch data: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const parseInvoiceDate = (date) => {
        if (date instanceof Date) return date;
        if (date?.toDate) return date.toDate();
        return moment(date).toDate();
    };

    const filterDataByShift = (data) => {
        if (!selectedShift || !selectedShift.id) return [];
        return data.filter(item => item.shiftId === selectedShift.id);
    };

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
                console.error("Firestore receipts error:", error);
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
                // console.log('discountsData :>> ', discountsData);
            },

            error => {
                console.error("Firestore discounts error:", error);
                message.error("Failed to fetch discounts: " + error.message);
            }
        );
        return () => unsubscribe();
    }, []);

    // Compute shift-wise summaries
    useEffect(() => {
        const calculateSummaries = async () => {
            if (!shifts || shifts.length === 0) {
                setShiftWiseSummaries({});
                return;
            }

            try {
                const shiftIds = shifts.map(shift => shift.id).filter(Boolean);

                if (shiftIds.length === 0) {
                    setShiftWiseSummaries({});
                    return;
                }

                const billsQuery = query(collection(db, 'bills'), where('shiftId', 'in', shiftIds));
                const billsSnapshot = await getDocs(billsQuery);
                const allRelevantBills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const summaries = {};
                shifts.forEach(shift => {
                    if (!shift || !shift.id) return;

                    const shiftId = shift.id;
                    const shiftReceipts = receipts ? receipts.filter(r => r && r.shiftId === shiftId) : [];
                    const shiftDiscountsFromCollection = discounts ? discounts.filter(d => d && d.shiftId === shiftId) : [];
                    const wasooli = shiftReceipts
                        .filter(r => r.transactionType === 'wasooli')
                        .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

                    const odharFromReceipts = shiftReceipts
                        .filter(r => r.transactionType === 'odhar')
                        .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
                    const discountsFromCollection = shiftDiscountsFromCollection
                        .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
                    const billsForThisShift = allRelevantBills.filter(b => b.shiftId === shiftId);
                    const odharFromBills = billsForThisShift
                        .filter(b => b.billType === 'odhar')
                        .reduce((sum, b) => sum + (parseFloat(b.originalAmount) || 0), 0);
                    const discountsFromBills = billsForThisShift
                        .filter(b => b.billType === 'cash' && b.discount > 0)
                        .reduce((sum, b) => sum + (parseFloat(b.discount) || 0), 0);

                    summaries[shiftId] = {
                        wasooli: wasooli,
                        odhar: odharFromBills + Math.abs(odharFromReceipts),
                        discounts: discountsFromBills,
                        shiftName: shift.name || `Shift ${shiftId}`,
                    };
                });

                setShiftWiseSummaries(summaries);

            } catch (error) {
                console.error("Failed to calculate shift-wise summaries:", error);
            }
        };

        calculateSummaries();

    }, [shifts, receipts, discounts]);// This effect runs whenever shifts, receipts, or discounts data changes
    console.log('shiftWiseSummaries :>> ', shiftWiseSummaries);
    const generateReport = () => {
        if (!selectedShift) return;
        setLoading(true);
        try {
            const filteredReadings = filterDataByShift(readings);
            const filteredSales = filterDataByShift(salesInvoices)
                .filter(invoice => invoice.source !== 'singlePage');
            const filteredSalesReturn = filterDataByShift(salesReturnInvoices).filter((invoice) => {
                console.log('invoice :>> ', invoice);
                return invoice.purchaseType === "fuel"
            }
            );
            const filteredPurchase = filterDataByShift(purchaseInvoices);
            const filteredAdjustments = filterDataByShift(adjustments);
            const filteredDip = filterDataByShift(dipChartData);

            const byCategory = {};
            filteredReadings.forEach((r) => {
                const nozzle = nozzles.find((n) => n.id === r.nozzleId);
                if (nozzle) {
                    const categoryId = nozzle.category || 'unknown';
                    const category = categories.find(c => c.id === categoryId) || { name: 'Unknown' };
                    const categoryName = category.name;
                    if (!byCategory[categoryId]) {
                        byCategory[categoryId] = { categoryId, categoryName, records: [] };
                    }
                    byCategory[categoryId].records.push({
                        key: r.id,
                        nozzleName: nozzle.nozzleName,
                        previousReading: r.previousReading,
                        currentReading: r.currentReading,
                        volume: r.salesVolume,
                        salesPrice: r.effectivePrice,
                        salesAmount: r.salesAmount,
                        createdBy: r.createdBy,
                        timestamp: r.timestamp,
                    });
                }
            });
            const readingsByCategory = Object.values(byCategory).map(group => {
                const sortedRecords = group.records.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
                return {
                    categoryId: group.categoryId,
                    categoryName: group.categoryName,
                    records: sortedRecords,
                    subtotalVolume: sortedRecords.reduce((s, x) => s + (x.volume || 0), 0),
                    subtotalAmount: sortedRecords.reduce((s, x) => s + (x.salesAmount || 0), 0),
                };
            });

            // START OF FIX: Corrected Grand Total Calculation Logic
            const totalNozzleSales = filteredReadings.reduce(
                (s, x) => s + (typeof x.salesAmount === 'number' ? x.salesAmount : 0),
                0
            );
            const salesInvoicesTotal = filteredSales
                .filter(i => i.source !== 'singlePage') // <-- This line filters out 'singlePage' invoices
                .reduce(
                    (s, i) => s + (typeof i.amount === 'number' ? i.amount : 0),
                    0
                );
            const salesReturnInvoicesTotal = filteredSalesReturn.reduce(
                (s, i) => s + (typeof i.amount === 'number' ? i.amount : 0),
                0
            );
            const purchaseInvoicesTotal = filteredPurchase
                .filter(i => i.purchaseType !== "fuel") // <-- This line keeps only fuel purchases
                .reduce(
                    (s, i) => s + (typeof i.amount === 'number' ? i.amount : 0),
                    0
                );

            // All adjustments (cash in and cash out)
            const adjSums = filteredAdjustments.reduce(
                (acc, a) => {
                    acc.advanceCash += a.advanceCash || 0;
                    acc.bankPayment += a.bankPayment || 0;
                    acc.karaya += a.karaya || 0;
                    acc.salary += a.salary || 0;
                    acc.expenses += a.expenses || 0;
                    acc.wasooli += a.wasooli || 0;
                    acc.odhar += a.odhar || 0;
                    return acc;
                },
                {
                    advanceCash: 0,
                    bankPayment: 0,
                    karaya: 0,
                    salary: 0,
                    expenses: 0,
                    wasooli: 0,
                    odhar: 0,
                }
            );

            // Corrected Grand Total Calculation
            // 1. Sum all cash inflows (all sales and wasooli)
            const totalCashIn =
                totalNozzleSales +
                salesInvoicesTotal +
                adjSums.wasooli;

            // 2. Sum all cash outflows (returns, all purchases, and all other expenses/adjustments)
            const totalCashOut =
                salesReturnInvoicesTotal +
                purchaseInvoicesTotal + // FIX: Now correctly deducts ALL purchases.
                adjSums.advanceCash +
                adjSums.bankPayment +
                adjSums.karaya +
                adjSums.salary +
                adjSums.expenses +
                adjSums.odhar;

            // 3. Calculate the final grand total (Net Cash for the shift)
            const grandTotal = totalCashIn - totalCashOut;

            setReportData({
                readingsByCategory,
                totalNozzleSales,
                salesInvoicesTotal,
                salesReturnInvoicesTotal,
                purchaseInvoicesTotal,
                grandTotal,
                adjustments: adjSums,
            });
            // END OF FIX
        } catch (err) {
            message.error("Error generating report: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // ... (The rest of your component code remains unchanged)
    // ... handleEditSalesInvoice, handleDeleteSalesInvoice, handleSalesInvoiceSubmit, etc.
    // ... all other functions and the entire return statement for rendering the JSX.

    const updateProductremainingStockAfter = async (productId, change) => {
        try {
            const productRef = doc(db, "products", productId);
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
                const currentRemaining = productSnap.data().remainingStockAfter || 0;
                const newRemaining = currentRemaining + change;
                await updateDoc(productRef, { remainingStockAfter: newRemaining });
                return newRemaining;
            } else {
                console.error("Product not found: " + productId);
                return null;
            }
        } catch (err) {
            console.error("Update remaining units error: " + err.message);
            return null;
        }
    };

    const logProductTransaction = async ({ productId, productName, eventType, quantity, unitPrice, customDate, tankId, tankName, remainingStockAfter }) => {
        try {
            const payload = {
                productId,
                productName,
                eventType,
                quantity: Number(quantity),
                unitPrice: Number(unitPrice),
                total: parseFloat((quantity * unitPrice).toFixed(2)),
                date: customDate || Timestamp.now(),
                createdAt: Timestamp.now(),
                remainingStockAfter,
                shiftId: currentShift.id,
            };
            if (tankId) {
                payload.tankId = tankId;
                payload.tankName = tankName;
            }
            await addDoc(collection(db, 'productTransactions'), payload);
        } catch (err) {
            message.error('Transaction log error: ' + err.message);
        }
    };

    const handleEditSalesInvoice = (rec) => {
        setEditingSalesInvoice(rec);
        const isFuel = !!rec.tankId;
        const recDate = parseInvoiceDate(rec.date);
        salesInvoiceForm.setFieldsValue({
            type: isFuel ? "fuel" : "non-fuel",
            date: moment(recDate).format("YYYY-MM-DD"),
            time: moment(recDate).format("HH:mm"),
            productId: rec.productId,
            quantity: rec.quantity,
            unitPrice: rec.unitPrice,
            tankId: rec.tankId,
        });
        setSalesTotal(rec.quantity * rec.unitPrice);
        setIsSalesInvoiceModalOpen(true);
    };

    const handleDeleteSalesInvoice = async (id, rec) => {
        if (!(user && (user.role?.includes("admin") || rec.createdBy === user.uid))) {
            message.error("You are not authorized to delete this entry.");
            return;
        }
        try {
            const batch = writeBatch(db);
            const product = products.find(p => p.id === rec.productId);
            const isFuel = ['petrol', 'diesel'].includes(product.category);
            let newRemaining;

            if (isFuel) {
                const tank = tanks.find(t => t.id === rec.tankId);
                newRemaining = tank.remainingStock + rec.quantity;
                batch.update(doc(db, "tanks", rec.tankId), { remainingStock: newRemaining });
            } else {
                newRemaining = await updateProductremainingStockAfter(rec.productId, +rec.quantity);
            }

            if (rec.cashflowId) {
                batch.delete(doc(db, "cashflow", rec.cashflowId));
            }
            batch.delete(doc(db, "saleInvoices", id));

            await batch.commit();

            await logProductTransaction({
                productId: rec.productId,
                productName: product?.productName || "Unknown",
                eventType: 'sale-cancellation',
                quantity: rec.quantity,
                unitPrice: rec.unitPrice,
                customDate: rec.date,
                tankId: isFuel ? rec.tankId : undefined,
                tankName: isFuel ? tanks.find(t => t.id === rec.tankId)?.tankName : undefined,
                remainingStockAfter: newRemaining,
            });
            message.success("Sales invoice deleted");
            fetchAllData();
        } catch (err) {
            message.error("Delete failed: " + err.message);
        }
    };

    const handleSalesInvoiceSubmit = async (vals) => {
        setSalesInvoiceSubmitting(true);
        try {
            const dt = moment(`${vals.date} ${vals.time}`, "YYYY-MM-DD HH:mm").toDate();
            const data = {
                date: Timestamp.fromDate(dt),
                productId: vals.productId,
                quantity: vals.quantity,
                unitPrice: vals.unitPrice,
                amount: vals.quantity * vals.unitPrice,
                shiftId: currentShift.id,
            };
            const product = products.find((p) => p.id === vals.productId);
            if (!product) {
                throw new Error('Product not found');
            }
            data.productName = product.productName || "Unknown";
            const isFuel = vals.type === "fuel";
            const tankId = isFuel ? vals.tankId : null;

            const batch = writeBatch(db);

            if (editingSalesInvoice) {
                if (!(user && (user.role?.includes("admin") || editingSalesInvoice.createdBy === user.uid))) {
                    message.error("You are not authorized to update this entry.");
                    setSalesInvoiceSubmitting(false);
                    return;
                }
                const original = editingSalesInvoice;
                const originalProduct = products.find(p => p.id === original.productId);
                const originalIsFuel = ['petrol', 'diesel'].includes(originalProduct.category);

                const { originalReversedStock, newRemainingStock } = await runTransaction(db, async (tx) => {
                    let originalReversedStock;
                    if (originalIsFuel) {
                        const originalTankRef = doc(db, 'tanks', original.tankId);
                        const originalTankDoc = await tx.get(originalTankRef);
                        if (!originalTankDoc.exists()) throw new Error('Original tank not found');
                        const originalTankStock = originalTankDoc.data().remainingStock || 0;
                        const reversedTankStock = originalTankStock + original.quantity;
                        tx.update(originalTankRef, { remainingStock: reversedTankStock });
                        originalReversedStock = { tankId: original.tankId, stock: reversedTankStock };
                    } else {
                        const originalProductRef = doc(db, 'products', original.productId);
                        const originalProductDoc = await tx.get(originalProductRef);
                        if (!originalProductDoc.exists()) throw new Error('Original product not found');
                        const originalProductStock = originalProductDoc.data().remainingStockAfter || 0;
                        const reversedProductStock = originalProductStock + original.quantity;
                        tx.update(originalProductRef, { remainingStockAfter: reversedProductStock });
                        originalReversedStock = { productId: original.productId, stock: reversedProductStock };
                    }

                    let newRemainingStock;
                    if (isFuel) {
                        if (!tankId) throw new Error('Tank ID is required for fuel products');
                        const tankRef = doc(db, 'tanks', tankId);
                        const tankDoc = await tx.get(tankRef);
                        if (!tankDoc.exists()) throw new Error('Tank not found');
                        const currentTankStock = tankDoc.data().remainingStock || 0;
                        if (currentTankStock < vals.quantity) {
                            throw new Error(`Insufficient stock in tank: available ${currentTankStock}, required ${vals.quantity}`);
                        }
                        const remainingTankStock = currentTankStock - vals.quantity;
                        tx.update(tankRef, { remainingStock: remainingTankStock });
                        newRemainingStock = { tankId: tankId, stock: remainingTankStock };
                    } else {
                        const productRef = doc(db, 'products', vals.productId);
                        const productDoc = await tx.get(productRef);
                        if (!productDoc.exists()) throw new Error('Product not found');
                        const currentProductStock = productDoc.data().remainingStockAfter || 0;
                        if (currentProductStock < vals.quantity) {
                            throw new Error(`Insufficient stock for product: available ${currentProductStock}, required ${vals.quantity}`);
                        }
                        const remainingProductStock = currentProductStock - vals.quantity;
                        tx.update(productRef, { remainingStockAfter: remainingProductStock });
                        newRemainingStock = { productId: vals.productId, stock: remainingProductStock };
                    }

                    return { originalReversedStock, newRemainingStock };
                });

                const invoiceRef = doc(db, 'saleInvoices', editingSalesInvoice.id);
                data.remainingStockAfter = newRemainingStock.stock;
                data.tankId = isFuel ? tankId : null;
                data.tankName = isFuel ? tanks.find(t => t.id === tankId)?.tankName || 'Unknown' : 'N/A';
                batch.update(invoiceRef, data);

                if (editingSalesInvoice.cashflowId) {
                    const cashflowRef = doc(db, 'cashflow', editingSalesInvoice.cashflowId);
                    batch.update(cashflowRef, {
                        amount: data.amount,
                        updatedAt: serverTimestamp(),
                    });
                } else {
                    const cashflowId = await createCashflowEntry(batch, data.amount, 'cashIn', data.date, editingSalesInvoice.id, currentShift.id, "SalesInvoice");
                    batch.update(invoiceRef, { cashflowId });
                }

                await batch.commit();

                if ('tankId' in originalReversedStock) {
                    const tank = tanks.find(t => t.id === originalReversedStock.tankId);
                    await logProductTransaction({
                        productId: editingSalesInvoice.productId,
                        productName: editingSalesInvoice.productName,
                        eventType: 'sale-reversal',
                        quantity: editingSalesInvoice.quantity,
                        unitPrice: editingSalesInvoice.unitPrice,
                        customDate: editingSalesInvoice.date,
                        tankId: originalReversedStock.tankId,
                        tankName: tank?.tankName || 'Unknown',
                        remainingStockAfter: originalReversedStock.stock,
                    });
                } else {
                    const product = products.find(p => p.id === originalReversedStock.productId);
                    await logProductTransaction({
                        productId: originalReversedStock.productId,
                        productName: product?.productName || 'Unknown',
                        eventType: 'sale-reversal',
                        quantity: editingSalesInvoice.quantity,
                        unitPrice: editingSalesInvoice.unitPrice,
                        customDate: editingSalesInvoice.date,
                        remainingStockAfter: originalReversedStock.stock,
                    });
                }

                if ('tankId' in newRemainingStock) {
                    const tank = tanks.find(t => t.id === newRemainingStock.tankId);
                    await logProductTransaction({
                        productId: vals.productId,
                        productName: data.productName,
                        eventType: 'sale',
                        quantity: vals.quantity,
                        unitPrice: vals.unitPrice,
                        customDate: data.date,
                        tankId: newRemainingStock.tankId,
                        tankName: tank?.tankName || 'Unknown',
                        remainingStockAfter: newRemainingStock.stock,
                    });
                } else {
                    const product = products.find(p => p.id === newRemainingStock.productId);
                    await logProductTransaction({
                        productId: newRemainingStock.productId,
                        productName: product?.productName || 'Unknown',
                        eventType: 'sale',
                        quantity: vals.quantity,
                        unitPrice: vals.unitPrice,
                        customDate: data.date,
                        remainingStockAfter: newRemainingStock.stock,
                    });
                }

                message.success("Sales invoice updated");
                setEditingSalesInvoice(null);
            } else {
                let remainingStockAfter;
                const invoiceRef = doc(collection(db, 'saleInvoices'));
                if (isFuel) {
                    if (!tankId) throw new Error('Tank ID is required for fuel products');
                    const tankRef = doc(db, 'tanks', tankId);
                    await runTransaction(db, async (tx) => {
                        const tankDoc = await tx.get(tankRef);
                        if (!tankDoc.exists()) throw new Error('Tank not found');
                        const currentStock = tankDoc.data().remainingStock || 0;
                        if (currentStock < vals.quantity) {
                            throw new Error(`Insufficient stock in tank: available ${currentStock}, required ${vals.quantity}`);
                        }
                        remainingStockAfter = currentStock - vals.quantity;
                        tx.update(tankRef, { remainingStock: remainingStockAfter });
                    });
                } else {
                    const productRef = doc(db, 'products', vals.productId);
                    await runTransaction(db, async (tx) => {
                        const productDoc = await tx.get(productRef);
                        if (!productDoc.exists()) throw new Error('Product not found');
                        const currentStock = productDoc.data().remainingStockAfter || 0;
                        if (currentStock < vals.quantity) {
                            throw new Error(`Insufficient stock for product: available ${currentStock}, required ${vals.quantity}`);
                        }
                        remainingStockAfter = currentStock - vals.quantity;
                        tx.update(productRef, { remainingStockAfter: remainingStockAfter });
                    });
                }
                data.remainingStockAfter = remainingStockAfter;
                data.tankId = tankId || null;
                data.tankName = isFuel ? tanks.find(t => t.id === tankId)?.tankName || 'Unknown' : 'N/A';
                data.createdBy = user.uid;
                data.createdAt = Timestamp.now();

                const cashflowId = await createCashflowEntry(batch, data.amount, 'cashIn', data.date, invoiceRef.id, currentShift.id, "SalesInvoice");
                batch.set(invoiceRef, { ...data, cashflowId });

                await batch.commit();

                await logProductTransaction({
                    productId: vals.productId,
                    productName: data.productName,
                    eventType: 'sale',
                    quantity: vals.quantity,
                    unitPrice: vals.unitPrice,
                    customDate: data.date,
                    tankId: isFuel ? tankId : undefined,
                    tankName: isFuel ? data.tankName : undefined,
                    remainingStockAfter: remainingStockAfter,
                });
                message.success("Sales invoice created");
            }

            salesInvoiceForm.resetFields();
            setIsSalesInvoiceModalOpen(false);
            setSalesTotal(0);
            fetchAllData();
        } catch (err) {
            message.error("Operation failed: " + err.message);
        } finally {
            setSalesInvoiceSubmitting(false);
        }
    };

    const handleEditSalesReturnInvoice = (rec) => {
        setEditingSalesReturnInvoice(rec);
        const isFuel = !!rec.tankId;
        const recDate = parseInvoiceDate(rec.date);
        salesReturnInvoiceForm.setFieldsValue({
            type: isFuel ? "fuel" : "non-fuel",
            date: moment(recDate).format("YYYY-MM-DD"),
            time: moment(recDate).format("HH:mm"),
            productId: rec.productId,
            tankId: rec.tankId,
            quantity: rec.quantity,
            unitPrice: rec.unitPrice,
        });
        setIsSalesReturnInvoiceModalOpen(true);
    };

    const handleDeleteSalesReturnInvoice = async (id, rec) => {
        if (!(user && (user.role?.includes("admin") || rec.createdBy === user.uid))) {
            message.error("You are not authorized to delete this entry.");
            return;
        }
        try {
            const batch = writeBatch(db);
            const product = products.find(p => p.id === rec.productId);
            const isFuel = ['petrol', 'diesel'].includes(product.category);
            let newRemaining;

            if (isFuel && rec.tankId) {
                const tank = tanks.find(t => t.id === rec.tankId);
                newRemaining = tank.remainingStock - rec.quantity;
                batch.update(doc(db, "tanks", rec.tankId), { remainingStock: newRemaining });
            } else {
                newRemaining = await updateProductremainingStockAfter(rec.productId, -rec.quantity);
            }

            if (rec.cashflowId) {
                batch.delete(doc(db, "cashflow", rec.cashflowId));
            }
            batch.delete(doc(db, "saleReturnInvoices", id));

            await batch.commit();

            await logProductTransaction({
                productId: rec.productId,
                productName: product?.productName || "Unknown",
                eventType: 'sale-return-cancellation',
                quantity: rec.quantity,
                unitPrice: rec.unitPrice,
                customDate: rec.date,
                tankId: isFuel ? rec.tankId : undefined,
                tankName: isFuel ? tanks.find(t => t.id === rec.tankId)?.tankName : undefined,
                remainingStockAfter: newRemaining,
            });
            message.success("Sales return invoice deleted");
            fetchAllData();
        } catch (err) {
            message.error("Delete failed: " + err.message);
        }
    };

    const handleSalesReturnInvoiceSubmit = async (vals) => {
        setSalesReturnInvoiceSubmitting(true);
        try {
            const dt = moment(`${vals.date} ${vals.time}`, "YYYY-MM-DD HH:mm").toDate();
            const data = {
                date: Timestamp.fromDate(dt),
                productId: vals.productId,
                quantity: vals.quantity,
                unitPrice: vals.unitPrice,
                amount: vals.quantity * vals.unitPrice,
                shiftId: currentShift.id,
            };
            const product = products.find((p) => p.id === vals.productId);
            if (!product) throw new Error('Product not found');
            data.productName = product.productName || "Unknown";
            const isFuel = vals.type === "fuel";
            let remainingStockAfter;

            const batch = writeBatch(db);

            if (isFuel) {
                if (!vals.tankId) throw new Error('Tank ID is required for fuel products');
                data.tankId = vals.tankId;
                data.tankName = tanks.find(t => t.id === vals.tankId)?.tankName || 'Unknown';
            } else {
                data.tankId = '';
                data.tankName = 'N/A';
            }

            if (editingSalesReturnInvoice) {
                if (!(user && (user.role?.includes("admin") || editingSalesReturnInvoice.createdBy === user.uid))) {
                    message.error("You are not authorized to update this entry.");
                    setSalesReturnInvoiceSubmitting(false);
                    return;
                }
                const original = editingSalesReturnInvoice;
                const originalIsFuel = ['petrol', 'diesel'].includes(products.find(p => p.id === original.productId).category);
                let reversalRemaining;
                if (originalIsFuel && original.tankId) {
                    const tank = tanks.find(t => t.id === original.tankId);
                    reversalRemaining = tank.remainingStock - original.quantity;
                    batch.update(doc(db, "tanks", original.tankId), { remainingStock: reversalRemaining });
                } else {
                    reversalRemaining = await updateProductremainingStockAfter(original.productId, -original.quantity);
                }
                await logProductTransaction({
                    productId: original.productId,
                    productName: original.productName || "Unknown",
                    eventType: 'sale-return-reversal',
                    quantity: original.quantity,
                    unitPrice: original.unitPrice,
                    customDate: original.date,
                    tankId: originalIsFuel ? original.tankId : undefined,
                    tankName: originalIsFuel ? original.tankName : undefined,
                    remainingStockAfter: reversalRemaining,
                });

                if (isFuel) {
                    const tankRef = doc(db, 'tanks', vals.tankId);
                    await runTransaction(db, async (tx) => {
                        const tankDoc = await tx.get(tankRef);
                        if (!tankDoc.exists()) throw new Error('Tank not found');
                        const currentStock = tankDoc.data().remainingStock || 0;
                        remainingStockAfter = currentStock + vals.quantity;
                        tx.update(tankRef, { remainingStock: remainingStockAfter });
                    });
                } else {
                    remainingStockAfter = await updateProductremainingStockAfter(vals.productId, +vals.quantity);
                }
                data.remainingStockAfter = remainingStockAfter;

                const invoiceRef = doc(db, "saleReturnInvoices", editingSalesReturnInvoice.id);
                batch.update(invoiceRef, data);

                if (editingSalesReturnInvoice.cashflowId) {
                    const cashflowRef = doc(db, 'cashflow', editingSalesReturnInvoice.cashflowId);
                    batch.update(cashflowRef, {
                        amount: data.amount,
                        updatedAt: serverTimestamp(),
                    });
                } else {
                    const cashflowId = await createCashflowEntry(batch, data.amount, 'cashOut', data.date, editingSalesReturnInvoice.id, currentShift.id, "SalesReturnInvoice");
                    batch.update(invoiceRef, { cashflowId });
                }

                await batch.commit();
                message.success("Sales return invoice updated");
                setEditingSalesReturnInvoice(null);
            } else {
                const invoiceRef = doc(collection(db, 'saleReturnInvoices'));
                if (isFuel) {
                    const tankRef = doc(db, 'tanks', vals.tankId);
                    await runTransaction(db, async (tx) => {
                        const tankDoc = await tx.get(tankRef);
                        if (!tankDoc.exists()) throw new Error('Tank not found');
                        const currentStock = tankDoc.data().remainingStock || 0;
                        remainingStockAfter = currentStock + vals.quantity;
                        tx.update(tankRef, { remainingStock: remainingStockAfter });
                    });
                } else {
                    remainingStockAfter = await updateProductremainingStockAfter(vals.productId, +vals.quantity);
                }
                data.remainingStockAfter = remainingStockAfter;
                data.createdBy = user.uid;
                data.createdAt = Timestamp.now();

                const cashflowId = await createCashflowEntry(batch, data.amount, 'cashOut', data.date, invoiceRef.id, currentShift.id, "SalesReturnInvoice");
                batch.set(invoiceRef, { ...data, cashflowId });

                await batch.commit();
                message.success("Sales return invoice created");
            }

            await logProductTransaction({
                productId: vals.productId,
                productName: data.productName,
                eventType: 'sale-return',
                quantity: vals.quantity,
                unitPrice: vals.unitPrice,
                customDate: data.date,
                tankId: isFuel ? vals.tankId : undefined,
                tankName: isFuel ? data.tankName : undefined,
                remainingStockAfter: remainingStockAfter,
            });

            salesReturnInvoiceForm.resetFields();
            setIsSalesReturnInvoiceModalOpen(false);
            fetchAllData();
        } catch (err) {
            message.error("Operation failed: " + err.message);
        } finally {
            setSalesReturnInvoiceSubmitting(false);
        }
    };

    const handleEditPurchaseInvoice = (rec) => {
        setEditingPurchaseInvoice(rec);
        purchaseInvoiceForm.setFieldsValue({
            supplierId: rec.supplierId,
            purchaseType: rec.purchaseType,
            date: moment(parseInvoiceDate(rec.date)).format("YYYY-MM-DD"),
            time: moment(parseInvoiceDate(rec.date)).format("HH:mm"),
            productId: rec.productId,
            tankId: rec.tankId,
            quantity: rec.quantity,
            unitPrice: rec.unitPrice,
        });
        setPurchaseType(rec.purchaseType);
        setIsPurchaseInvoiceModalOpen(true);
    };

    const handleDeletePurchaseInvoice = async (id, rec) => {
        if (!(user && (user.role?.includes("admin") || rec.createdBy === user.uid))) {
            message.error("You are not authorized to delete this entry.");
            return;
        }
        try {
            const batch = writeBatch(db);
            let remainingStockAfter;
            const prod = products.find(p => p.id === rec.productId);

            if (rec.purchaseType === "fuel" && rec.tankId) {
                const tank = tanks.find(t => t.id === rec.tankId);
                remainingStockAfter = tank.remainingStock - rec.quantity;
                batch.update(doc(db, "tanks", rec.tankId), {
                    remainingStock: remainingStockAfter,
                    lastUpdated: new Date(),
                });
            } else {
                remainingStockAfter = await updateProductremainingStockAfter(rec.productId, -rec.quantity);
            }

            if (rec.cashflowId) {
                batch.delete(doc(db, "cashflow", rec.cashflowId));
            }
            batch.delete(doc(db, "purchaseInvoices", id));

            await batch.commit();

            if (rec.purchaseType === "fuel" && rec.tankId) {
                const tank = tanks.find(t => t.id === rec.tankId);
                await logProductTransaction({
                    productId: rec.productId,
                    productName: prod?.productName || "Unknown",
                    eventType: 'purchase-cancellation',
                    quantity: rec.quantity,
                    unitPrice: rec.unitPrice,
                    customDate: rec.date,
                    tankId: rec.tankId,
                    tankName: tank?.tankName || "Unknown",
                    remainingStockAfter: remainingStockAfter,
                });
            } else {
                await logProductTransaction({
                    productId: rec.productId,
                    productName: prod?.productName || "Unknown",
                    eventType: 'purchase-cancellation',
                    quantity: rec.quantity,
                    unitPrice: rec.unitPrice,
                    customDate: rec.date,
                    remainingStockAfter: remainingStockAfter,
                });
            }
            message.success("Purchase invoice deleted");
            fetchAllData();
        } catch (err) {
            message.error("Delete failed: " + err.message);
        }
    };


    const handlePurchaseInvoiceSubmit = async (vals) => {
        setPurchaseInvoiceSubmitting(true);
        const batch = writeBatch(db); // Initialize the batch operation

        try {
            const dt = moment(`${vals.date} ${vals.time}`, "YYYY-MM-DD HH:mm").toDate();

            // 1. Prepare the invoice data object.
            // As requested, 'purchaseType' from the form is included right here.
            const data = {
                supplierId: vals.supplierId,
                purchaseType: vals.purchaseType, // <-- purchaseType is added here
                date: Timestamp.fromDate(dt),
                productId: vals.productId,
                tankId: vals.purchaseType === "fuel" ? vals.tankId : "",
                quantity: Number(vals.quantity),
                unitPrice: Number(vals.unitPrice),
                amount: Number(vals.quantity) * Number(vals.unitPrice),
                shiftId: currentShift.id,
            };

            // Add supplier and product names for easier reporting
            const supplier = suppliers.find((s) => s.id === vals.supplierId);
            data.supplierName = supplier?.accountName || "Unknown";
            const product = products.find((p) => p.id === vals.productId);
            data.productName = product?.productName || "Unknown";

            let remainingStockAfter;

            // --- Helper function for reversing a previous stock update when editing ---
            const reverseOriginalStock = async (originalInvoice) => {
                if (originalInvoice.purchaseType === "fuel" && originalInvoice.tankId) {
                    const originalTank = tanks.find(t => t.id === originalInvoice.tankId);
                    const reversedStock = originalTank.remainingStock - originalInvoice.quantity;
                    batch.update(doc(db, "tanks", originalInvoice.tankId), {
                        remainingStock: reversedStock,
                        lastUpdated: serverTimestamp(),
                    });
                    await logProductTransaction({
                        productId: originalInvoice.productId, productName: originalInvoice.productName,
                        eventType: 'purchase-reversal', quantity: originalInvoice.quantity,
                        unitPrice: originalInvoice.unitPrice, customDate: originalInvoice.date,
                        tankId: originalInvoice.tankId, tankName: originalInvoice.tankName,
                        remainingStockAfter: reversedStock,
                    });
                } else {
                    const reversedStock = await updateProductremainingStockAfter(originalInvoice.productId, -originalInvoice.quantity);
                    await logProductTransaction({
                        productId: originalInvoice.productId, productName: originalInvoice.productName,
                        eventType: 'purchase-reversal', quantity: originalInvoice.quantity,
                        unitPrice: originalInvoice.unitPrice, customDate: originalInvoice.date,
                        remainingStockAfter: reversedStock,
                    });
                }
            };

            // --- Handle Editing vs. Creating ---
            if (editingPurchaseInvoice) {
                // A. LOGIC FOR UPDATING AN EXISTING INVOICE
                if (!(user?.role?.includes("admin") || editingPurchaseInvoice.createdBy === user.uid)) {
                    throw new Error("You are not authorized to update this entry.");
                }

                // First, reverse the stock changes from the original invoice
                await reverseOriginalStock(editingPurchaseInvoice);

                // Now, apply the new stock changes and update the invoice
                if (data.purchaseType === "fuel") {
                    const tank = tanks.find((t) => t.id === data.tankId);
                    data.tankName = tank?.tankName || "Unknown";
                    remainingStockAfter = tank.remainingStock - (editingPurchaseInvoice.tankId === data.tankId ? editingPurchaseInvoice.quantity : 0) + data.quantity;
                    batch.update(doc(db, "tanks", data.tankId), {
                        remainingStock: remainingStockAfter,
                        lastUpdated: serverTimestamp(),
                    });
                } else {
                    data.tankName = "N/A";
                    remainingStockAfter = await updateProductremainingStockAfter(data.productId, +data.quantity);
                }

                data.remainingStockAfter = remainingStockAfter;
                const invoiceRef = doc(db, "purchaseInvoices", editingPurchaseInvoice.id);
                batch.update(invoiceRef, data);

                // Update or create corresponding cashflow entry
                if (editingPurchaseInvoice.cashflowId) {
                    batch.update(doc(db, 'cashflow', editingPurchaseInvoice.cashflowId), {
                        amount: data.amount, updatedAt: serverTimestamp(),
                    });
                } else {
                    const cashflowId = await createCashflowEntry(batch, data.amount, 'cashOut', data.date, editingPurchaseInvoice.id, currentShift.id, "purchaseInvoice");
                    batch.update(invoiceRef, { cashflowId });
                }
                message.success("Purchase invoice updated successfully");

            } else {
                // B. LOGIC FOR CREATING A NEW INVOICE
                data.createdBy = user.uid;
                data.createdAt = serverTimestamp();

                if (data.purchaseType === "fuel") {
                    const tank = tanks.find((t) => t.id === data.tankId);
                    data.tankName = tank?.tankName || "Unknown";
                    remainingStockAfter = tank.remainingStock + data.quantity;
                    batch.update(doc(db, "tanks", data.tankId), {
                        remainingStock: remainingStockAfter,
                        lastUpdated: serverTimestamp(),
                    });
                } else {
                    data.tankName = "N/A";
                    remainingStockAfter = await updateProductremainingStockAfter(data.productId, +data.quantity);
                }

                data.remainingStockAfter = remainingStockAfter;
                const invoiceRef = doc(collection(db, 'purchaseInvoices'));
                const cashflowId = await createCashflowEntry(batch, data.amount, 'cashOut', data.date, invoiceRef.id, currentShift.id, "purchaseInvoice");
                batch.set(invoiceRef, { ...data, cashflowId });
                message.success("Purchase invoice created successfully");
            }

            // Log the final transaction (for both create and edit)
            await logProductTransaction({
                productId: data.productId, productName: data.productName,
                eventType: 'purchase', quantity: data.quantity, unitPrice: data.unitPrice,
                customDate: data.date, tankId: data.tankId, tankName: data.tankName,
                remainingStockAfter: remainingStockAfter,
            });

            // 2. Commit all batched operations to the database
            await batch.commit();

            // 3. Reset form and close modal
            purchaseInvoiceForm.resetFields();
            setIsPurchaseInvoiceModalOpen(false);
            setEditingPurchaseInvoice(null);
            fetchAllData();

        } catch (err) {
            message.error("Operation failed: " + err.message);
        } finally {
            setPurchaseInvoiceSubmitting(false);
        }
    };

    const handleAdjustmentsSubmit = async (vals) => {
        setAdjustmentsSubmitting(true);
        try {
            const data = {
                date: Timestamp.fromDate(new Date()),
                shiftId: currentShift.id,
                advanceCash: vals.advanceCash || 0,
                bankPayment: vals.bankPayment || 0,
                karaya: vals.karaya || 0,
                salary: vals.salary || 0,
                expenses: vals.expenses || 0,
                wasooli: vals.wasooli || 0,
                odhar: vals.odhar || 0,
            };
            if (editingAdjustment) {
                if (!(user && (user.role?.includes("admin") || editingAdjustment.createdBy === user.uid))) {
                    message.error("You are not authorized to update this entry.");
                    setAdjustmentsSubmitting(false);
                    return;
                }
                await updateDoc(doc(db, "adjustments", editingAdjustment.id), data);
                message.success("Adjustments updated successfully");
                setEditingAdjustment(null);
            } else {
                data.createdBy = user.uid;
                await addDoc(collection(db, "adjustments"), data);
                message.success("Adjustments applied successfully");
            }
            adjustmentsForm.resetFields();
            setIsAdjustmentsModalOpen(false);
            fetchAllData();
        } catch (err) {
            message.error("Operation failed: " + err.message);
        } finally {
            setAdjustmentsSubmitting(false);
        }
    };

    const handleEditAdjustment = (record) => {
        setEditingAdjustment(record);
        adjustmentsForm.setFieldsValue({
            advanceCash: record.advanceCash,
            bankPayment: record.bankPayment,
            karaya: record.karaya,
            salary: record.salary,
            expenses: record.expenses,
            wasooli: record.wasooli,
            odhar: record.odhar,
        });
        setIsAdjustmentsModalOpen(true);
    };

    const handleDeleteAdjustment = async (id, rec) => {
        if (!(user && (user.role?.includes("admin") || rec.createdBy === user.uid))) {
            message.error("You are not authorized to delete this entry.");
            return;
        }
        try {
            await deleteDoc(doc(db, "adjustments", id));
            message.success("Adjustment entry deleted");
            fetchAllData();
        } catch (err) {
            message.error("Delete failed: " + err.message);
        }
    };

    const openAdjustmentsModal = () => {
        const shiftAdjustment = adjustments.find((a) => a.shiftId === currentShift.id);
        if (shiftAdjustment) {
            setEditingAdjustment(shiftAdjustment);
            adjustmentsForm.setFieldsValue({
                advanceCash: shiftAdjustment.advanceCash,
                bankPayment: shiftAdjustment.bankPayment,
                karaya: shiftAdjustment.karaya,
                salary: shiftAdjustment.salary,
                expenses: shiftAdjustment.expenses,
                wasooli: shiftAdjustment.wasooli,
                odhar: shiftAdjustment.odhar,
            });
        } else {
            setEditingAdjustment(null);
            adjustmentsForm.resetFields();
        }
        setIsAdjustmentsModalOpen(true);
    };

    const handleNozzleChange = (nozzleId) => {
        const selected = nozzles.find((n) => n.id === nozzleId);
        if (selected) {
            readingForm.setFieldsValue({ previousReading: selected.lastReading || 0 });
        }
    };

    const handleReadingSubmit = async (vals) => {
        setReadingSubmitting(true);
        try {
            const { nozzleId, previousReading, currentReading, tankId, newPrice, recordedAt } = vals;
            if (currentReading < previousReading) {
                message.error("Current reading must be ≥ previous reading");
                setReadingSubmitting(false);
                return;
            }
            const volume = currentReading - previousReading;
            const nozzle = nozzles.find((n) => n.id === nozzleId);
            const tank = tanks.find((t) => t.id === tankId);
            const product = products.find((p) => p.id === nozzle.productId);
            if (!nozzle || !tank || !product) {
                throw new Error("Invalid selection");
            }
            if (tank.remainingStock < volume) {
                message.error(
                    `Not enough stock in "${tank.tankName}". Available: ${tank.remainingStock}`
                );
                setReadingSubmitting(false);
                return;
            }
            const price = newPrice != null ? newPrice : product.salesPrice;
            const amount = volume * price;
            const newRemaining = tank.remainingStock - volume;
            const timestamp = Timestamp.fromDate(new Date(recordedAt));

            const batch = writeBatch(db);

            const nozzleRef = doc(db, "nozzles", nozzleId);
            batch.update(nozzleRef, {
                lastReading: currentReading,
                totalSales: (nozzle.totalSales || 0) + amount,
                lastUpdated: new Date(),
            });

            const readingRef = doc(collection(db, "readings"));
            const readingData = {
                nozzleId,
                dispenserId: nozzle.dispenserId,
                productId: nozzle.productId,
                tankId,
                previousReading,
                currentReading,
                salesVolume: volume,
                salesAmount: amount,
                effectivePrice: price,
                timestamp: timestamp,
                createdBy: user.uid,
                shiftId: currentShift.id,
            };

            const tankRef = doc(db, "tanks", tankId);
            batch.update(tankRef, {
                remainingStock: newRemaining,
                lastUpdated: new Date(),
            });

            const cashflowId = await createCashflowEntry(batch, amount, 'cashIn', timestamp, readingRef.id, currentShift.id, "nozzelReading");
            batch.set(readingRef, { ...readingData, cashflowId });

            await batch.commit();

            await logProductTransaction({
                productId: nozzle.productId,
                productName: product.productName,
                eventType: 'sale',
                quantity: volume,
                unitPrice: price,
                customDate: timestamp,
                tankId: tankId,
                tankName: tank.tankName,
                remainingStockAfter: newRemaining,
            });

            message.success("Reading recorded successfully");
            readingForm.resetFields();
            setIsReadingModalOpen(false);
            fetchAllData();
        } catch (err) {
            message.error("Failed to record reading: " + err.message);
        } finally {
            setReadingSubmitting(false);
        }
    };

    const handleEditReading = (record) => {
        setEditingReading(record);
        readingForm.setFieldsValue({
            nozzleId: record.nozzleId,
            previousReading: record.previousReading,
            currentReading: record.currentReading,
            tankId: record.tankId,
            newPrice: record.effectivePrice,
            recordedAt: moment(record.timestamp.toDate()).format("YYYY-MM-DDTHH:mm"),
        });
        setIsReadingModalOpen(true);
    };

    const handleUpdateReading = async (vals) => {
        setReadingSubmitting(true);
        try {
            const { currentReading, tankId, newPrice, recordedAt } = vals;
            const readingId = editingReading.id;
            const originalReading = editingReading;

            if (!(user && (user.role?.includes("admin") || originalReading.createdBy === user.uid))) {
                message.error("You are not authorized to update this reading.");
                setReadingSubmitting(false);
                return;
            }

            const originalSalesVolume = originalReading.salesVolume;
            const newSalesVolume = currentReading - originalReading.previousReading;

            if (newSalesVolume < 0) {
                message.error("Current reading must be ≥ previous reading");
                setReadingSubmitting(false);
                return;
            }

            const effectivePrice = newPrice != null ? newPrice : originalReading.effectivePrice;
            const newSalesAmount = newSalesVolume * effectivePrice;
            const timestamp = Timestamp.fromDate(new Date(recordedAt));

            const originalTankId = originalReading.tankId;
            const newTankId = tankId;

            const batch = writeBatch(db);

            const transactionResult = await runTransaction(db, async (transaction) => {
                const originalTankRef = doc(db, "tanks", originalTankId);
                const originalTankDoc = await transaction.get(originalTankRef);
                if (!originalTankDoc.exists()) {
                    throw new Error("Original tank not found");
                }

                const newTankRef = doc(db, "tanks", newTankId);
                const newTankDoc = await transaction.get(newTankRef);
                if (!newTankDoc.exists()) {
                    throw new Error("New tank not found");
                }

                const currentOriginalStock = originalTankDoc.data().remainingStock || 0;
                const currentNewStock = newTankDoc.data().remainingStock || 0;

                const newOriginalStock = currentOriginalStock + originalSalesVolume;

                if (newTankId !== originalTankId || newSalesVolume > originalSalesVolume) {
                    const requiredStock = newTankId === originalTankId
                        ? newSalesVolume - originalSalesVolume
                        : newSalesVolume;
                    const checkStock = newTankId === originalTankId
                        ? newOriginalStock
                        : currentNewStock;
                    if (checkStock < requiredStock) {
                        throw new Error(`Insufficient stock in tank: available ${checkStock}, required ${requiredStock}`);
                    }
                }

                let newRemaining;
                if (newTankId === originalTankId) {
                    newRemaining = newOriginalStock - newSalesVolume;
                    transaction.update(originalTankRef, {
                        remainingStock: newRemaining,
                        lastUpdated: new Date()
                    });
                } else {
                    transaction.update(originalTankRef, {
                        remainingStock: newOriginalStock,
                        lastUpdated: new Date()
                    });
                    newRemaining = currentNewStock - newSalesVolume;
                    transaction.update(newTankRef, {
                        remainingStock: newRemaining,
                        lastUpdated: new Date()
                    });
                }

                return {
                    newOriginalStock,
                    newRemaining,
                    originalTankId,
                    newTankId
                };
            });

            const readingRef = doc(db, "readings", readingId);
            batch.update(readingRef, {
                currentReading,
                tankId: newTankId,
                effectivePrice,
                salesVolume: newSalesVolume,
                salesAmount: newSalesAmount,
                timestamp: timestamp,
                lastUpdated: new Date(),
                updatedBy: user.uid
            });

            if (originalReading.cashflowId) {
                const cashflowRef = doc(db, 'cashflow', originalReading.cashflowId);
                batch.update(cashflowRef, {
                    amount: newSalesAmount,
                    date: timestamp,
                    updatedAt: serverTimestamp(),
                });
            } else {
                const cashflowId = await createCashflowEntry(batch, newSalesAmount, 'cashIn', timestamp, readingId, currentShift.id, "nozzelReading");
                batch.update(readingRef, { cashflowId });
            }

            await batch.commit();

            const originalTank = tanks.find(t => t.id === transactionResult.originalTankId);
            const newTank = tanks.find(t => t.id === transactionResult.newTankId);
            const productInfo = products.find(p => p.id === originalReading.productId);

            await logProductTransaction({
                productId: originalReading.productId,
                productName: productInfo?.productName || "Unknown",
                eventType: 'sale-reversal',
                quantity: originalSalesVolume,
                unitPrice: originalReading.effectivePrice,
                customDate: originalReading.timestamp,
                tankId: transactionResult.originalTankId,
                tankName: originalTank?.tankName || "Unknown",
                remainingStockAfter: transactionResult.newOriginalStock,
                readingId: readingId,
                referenceId: `update-${readingId}`
            });

            await logProductTransaction({
                productId: originalReading.productId,
                productName: productInfo?.productName || "Unknown",
                eventType: 'sale',
                quantity: newSalesVolume,
                unitPrice: effectivePrice,
                customDate: timestamp,
                tankId: transactionResult.newTankId,
                tankName: newTank?.tankName || "Unknown",
                remainingStockAfter: transactionResult.newRemaining,
                readingId: readingId,
                referenceId: `update-${readingId}`
            });

            message.success("Reading updated successfully");
            setEditingReading(null);
            readingForm.resetFields();
            setIsReadingModalOpen(false);
            fetchAllData();
        } catch (err) {
            message.error("Failed to update reading: " + err.message);
            console.error("Update reading error:", err);
        } finally {
            setReadingSubmitting(false);
        }
    };

    const handleDeleteReading = async (id, record) => {
        if (!(user && (user.role?.includes("admin") || record.createdBy === user.uid))) {
            message.error("You are not authorized to delete this reading.");
            return;
        }

        setLoading(true);

        try {
            await runTransaction(db, async (transaction) => {
                const tankRef = doc(db, "tanks", record.tankId);
                const nozzleRef = doc(db, "nozzles", record.nozzleId);

                const tankDoc = await transaction.get(tankRef);
                const nozzleDoc = await transaction.get(nozzleRef);

                if (!tankDoc.exists() || !nozzleDoc.exists()) {
                    throw new Error("Tank or Nozzle document not found. Cannot proceed.");
                }

                const tankData = tankDoc.data();
                const nozzleData = nozzleDoc.data();

                const revertedStock = (tankData.remainingStock || 0) + record.salesVolume;
                const revertedTotalSales = (nozzleData.totalSales || 0) - record.salesAmount;

                transaction.update(tankRef, {
                    remainingStock: revertedStock,
                    lastUpdated: new Date(),
                });

                transaction.update(nozzleRef, {
                    totalSales: revertedTotalSales,
                    lastUpdated: new Date(),
                });

                transaction.delete(doc(db, "readings", id));

                if (record.cashflowId) {
                    transaction.delete(doc(db, "cashflow", record.cashflowId));
                }

                const logRef = doc(collection(db, "productTransactions"));
                transaction.set(logRef, {
                    productId: record.productId,
                    productName: products.find(p => p.id === record.productId)?.productName || "Unknown",
                    eventType: 'sale-cancellation',
                    quantity: record.salesVolume,
                    unitPrice: record.effectivePrice,
                    totalAmount: record.salesAmount,
                    tankId: record.tankId,
                    tankName: tankData.tankName,
                    remainingStockAfter: revertedStock,
                    timestamp: record.timestamp,
                    createdAt: new Date(),
                    createdBy: user?.uid,
                });
            });

            const nozzleRef = doc(db, "nozzles", record.nozzleId);
            const latestReadingQuery = query(
                collection(db, "readings"),
                where("nozzleId", "==", record.nozzleId),
                orderBy("timestamp", "desc"),
                limit(1)
            );
            const querySnapshot = await getDocs(latestReadingQuery);

            if (!querySnapshot.empty) {
                const mostRecentReading = querySnapshot.docs[0].data();
                await updateDoc(nozzleRef, { lastReading: mostRecentReading.currentReading });
            } else {
                const nozzleSnap = await getDoc(nozzleRef);
                if (nozzleSnap.exists()) {
                    const openingReading = nozzleSnap.data().openingReading || 0;
                    await updateDoc(nozzleRef, { lastReading: openingReading });
                }
            }

            message.success("Reading deleted successfully. Stock, sales, and last reading have been reverted.");
            fetchAllData();

        } catch (err) {
            console.error("Failed to delete reading:", err);
            message.error("Failed to delete reading: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDipChartSubmit = async (vals) => {
        setDipChartSubmitting(true);
        try {
            const { tankId, dipMm, recordedAt } = vals;

            // Calculate the volume from the dip measurement. This is the new stock level.
            const dipLiters = window.getLiters(dipMm);
            const newRemainingStock = dipLiters;

            // Fetch the tank's previous remainingStock to use as bookStock
            const tankRef = doc(db, "tanks", tankId);
            const tankSnap = await getDoc(tankRef);
            let bookStock = null;
            if (tankSnap.exists()) {
                bookStock = tankSnap.data().remainingStock ?? null;
            }

            // Add a record of the dip reading to the 'dipcharts' collection, including bookStock
            await addDoc(collection(db, "dipcharts"), {
                tankId,
                dipMm,
                dipLiters, // Storing the calculated liters for historical data is useful.
                bookStock,
                recordedAt: Timestamp.fromDate(new Date(recordedAt)),
                createdBy: user.uid,
                shiftId: currentShift.id,
            });

            // Update the tank's 'remainingStock' directly to the newly measured volume.
            await updateDoc(doc(db, "tanks", tankId), {
                remainingStock: newRemainingStock,
                lastUpdated: Timestamp.now(),
            });

            message.success("Dip chart recorded and tank stock updated successfully");
            dipChartForm.resetFields();
            setIsDipChartModalOpen(false);
            fetchAllData(); // Refresh data to show the updated stock.

        } catch (err) {
            message.error("Failed to record dip chart: " + err.message);
        } finally {
            setDipChartSubmitting(false);
        }
    };

    const shiftEndTime = selectedShift?.endTime
        ? selectedShift.endTime.toDate()
        : new Date();
    const handlePreviewPDF = async () => {
        setExportLoading(true);
        try {
            const filteredSales = filterDataByShift(salesInvoices);
            const filteredSalesReturn = filterDataByShift(salesReturnInvoices);
            const filteredPurchase = filterDataByShift(purchaseInvoices);
            const filteredDip = filterDataByShift(dipChartData);
            const cumulativeDipChartData = dipChartData.filter(
                (record) => record.recordedAt.toDate() <= shiftEndTime
            );
            const previewUrl = await exportReportToPDF({
                settings,
                reportType: 'shift',
                dateRange: [selectedShift.startTime.toDate(), selectedShift.endTime?.toDate() || new Date()],
                reportData,
                filteredDipChartData: filteredDip,
                filteredSalesInvoices: filteredSales,
                filteredSalesReturnInvoices: filteredSalesReturn,
                filteredPurchaseInvoices: filteredPurchase,
                tanks,
                preview: true, dipChartData: cumulativeDipChartData, shiftSummary: shiftWiseSummaries[selectedShift.id] || { odhar: 0, wasooli: 0, discounts: 0 },
            });
            setPdfPreviewUrl(previewUrl);
            setPdfPreviewVisible(true);
        } catch (err) {
            message.error("Preview failed: " + err.message);
        } finally {
            setExportLoading(false);
        }
    };

    return (
        <div className="sales-report-container">
            <div
                className="report-header"
                style={{
                    marginBottom: 20,
                    padding: "10px 20px",
                    background: "#fafafa",
                    borderRadius: 8,
                }}
            >
                <Row gutter={[16, 16]} align="middle" className="my-3">
                    <Col xs={24} sm={12} md={8}>
                        <TitleTypography level={3} style={{ color: "#1890ff" }}>
                            Sales & Inventory Reports
                        </TitleTypography>
                    </Col>
                    <Col xs={24} sm={12} md={16}>
                        <div
                            className="d-flex flex-wrap justify-content-center align-items-center"
                            style={{ gap: "8px" }}
                        >
                            <Button
                                type="primary"
                                style={{
                                    backgroundColor: "#13c2c2",
                                    borderColor: "#13c2c2",
                                    flex: "1 1 140px",
                                    maxWidth: "180px"
                                }}
                                onClick={() => setIsReadingModalOpen(true)}
                            >
                                Record Reading
                            </Button>
                            <Button
                                type="primary"
                                style={{
                                    backgroundColor: "#faad14",
                                    borderColor: "#faad14",
                                    flex: "1 1 140px",
                                    maxWidth: "180px"
                                }}
                                onClick={() => setIsDipChartModalOpen(true)}
                            >
                                Record Dip Chart
                            </Button>
                            <Button
                                type="primary"
                                style={{
                                    backgroundColor: "#1890ff",
                                    borderColor: "#1890ff",
                                    flex: "1 1 140px",
                                    maxWidth: "180px"
                                }}
                                onClick={() => {
                                    setEditingSalesInvoice(null);
                                    salesInvoiceForm.resetFields();
                                    setSalesTotal(0);
                                    setIsSalesInvoiceModalOpen(true);
                                }}
                            >
                                Add Sales Invoice
                            </Button>
                            <Button
                                type="primary"
                                style={{
                                    backgroundColor: "#52c41a",
                                    borderColor: "#52c41a",
                                    flex: "1 1 140px",
                                    maxWidth: "180px"
                                }}
                                onClick={() => {
                                    setEditingSalesReturnInvoice(null);
                                    salesReturnInvoiceForm.resetFields();
                                    setIsSalesReturnInvoiceModalOpen(true);
                                }}
                            >
                                Add Sales Return
                            </Button>
                            <Button
                                type="primary"
                                style={{
                                    backgroundColor: "#fa8c16",
                                    borderColor: "#fa8c16",
                                    flex: "1 1 140px",
                                    maxWidth: "180px"
                                }}
                                onClick={() => {
                                    setEditingPurchaseInvoice(null);
                                    purchaseInvoiceForm.resetFields();
                                    setIsPurchaseInvoiceModalOpen(true);
                                }}
                            >
                                Add Purchase Invoice
                            </Button>
                            <Button
                                type="primary"
                                style={{
                                    backgroundColor: "#eb2f96",
                                    borderColor: "#eb2f96",
                                    flex: "1 1 140px",
                                    maxWidth: "180px"
                                }}
                                onClick={openAdjustmentsModal}
                            >
                                Apply Adjustments
                            </Button>
                            <Button
                                type="primary"
                                style={{
                                    backgroundColor: "#8c8c8c",
                                    borderColor: "#8c8c8c",
                                    flex: "1 1 140px",
                                    maxWidth: "180px"
                                }}
                                onClick={handlePreviewPDF}
                                loading={exportLoading}
                            >
                                Preview PDF
                            </Button>
                            <Button
                                type="primary"
                                style={{
                                    backgroundColor: "#002140",
                                    borderColor: "#002140",
                                    flex: "1 1 140px",
                                    maxWidth: "180px"
                                }}
                                icon={<FilePdfOutlined />}
                                onClick={() => {
                                    setExportLoading(true);
                                    const filteredSales = filterDataByShift(salesInvoices);
                                    const filteredSalesReturn = filterDataByShift(salesReturnInvoices);
                                    const filteredPurchase = filterDataByShift(purchaseInvoices);
                                    const filteredDip = filterDataByShift(dipChartData);
                                    const cumulativeDipChartData = dipChartData.filter(
                                        (record) => record.recordedAt.toDate() <= shiftEndTime
                                    );
                                    exportReportToPDF({
                                        settings,
                                        reportType: 'shift',
                                        dateRange: [selectedShift.startTime.toDate(), selectedShift.endTime?.toDate() || new Date()],
                                        reportData,
                                        filteredDipChartData: filteredDip,
                                        filteredSalesInvoices: filteredSales,
                                        filteredSalesReturnInvoices: filteredSalesReturn,
                                        filteredPurchaseInvoices: filteredPurchase,
                                        tanks, preview: false, dipChartData: cumulativeDipChartData, shiftSummary: shiftWiseSummaries[selectedShift.id] || { odhar: 0, wasooli: 0, discounts: 0 },
                                    });
                                    setExportLoading(false);
                                }}
                                loading={exportLoading}
                            >
                                Export PDF
                            </Button>
                            <Button
                                type="primary"
                                style={{
                                    backgroundColor: "#f5222d",
                                    borderColor: "#f5222d",
                                    flex: "1 1 140px",
                                    maxWidth: "180px"
                                }}
                                onClick={handleEndShift}
                            >
                                End Shift
                            </Button>
                        </div>

                        <div className="d-flex flex-wrap justify-content-end align-items-center gap-2 mt-3">
                            <Space>
                                <Select
                                    value={selectedShift?.id}
                                    onChange={(value) => setSelectedShift(shifts.find(s => s.id === value))}
                                    style={{ width: 200 }}
                                    placeholder="Select Shift"
                                >
                                    {shifts.map(shift => (
                                        <Option key={shift.id} value={shift.id}>
                                            Shift starting at {moment(shift.startTime.toDate()).format("DD/MM/YYYY HH:mm")}
                                        </Option>
                                    ))}
                                </Select>
                                <Button
                                    onClick={() => fetchShifts(10, lastVisibleShift)}
                                    disabled={!hasMoreShifts}
                                >
                                    Load More Shifts
                                </Button>
                            </Space>
                        </div>
                    </Col>
                </Row>
            </div>

            <div id="report-content" ref={reportRef} style={{ padding: "0 20px" }}>
                <Spin spinning={loading}>
                    <Divider orientation="center">
                        Shift Totals for {selectedShift?.name || `Shift starting at ${moment(selectedShift?.startTime.toDate()).format("DD/MM/YYYY HH:mm")}`}
                    </Divider>
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={8}>
                            <Statistic
                                title="Odhar"
                                value={shiftWiseSummaries[selectedShift?.id]?.odhar || 0}
                                precision={2}
                            />
                        </Col>
                        <Col xs={24} sm={8}>
                            <Statistic
                                title="Wasooli"
                                value={shiftWiseSummaries[selectedShift?.id]?.wasooli || 0}
                                precision={2}
                            />
                        </Col>
                        <Col xs={24} sm={8}>
                            <Statistic
                                title="Discounts"
                                value={shiftWiseSummaries[selectedShift?.id]?.discounts || 0}
                                precision={2}
                            />
                        </Col>
                    </Row>
                    <Divider orientation="center">Adjustment Values</Divider>
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12} md={8}>
                            <Statistic
                                title="Wasooli (Adjustment)"
                                value={reportData.adjustments.wasooli}
                                precision={2}
                            />
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Statistic
                                title="Odhar (Adjustment)"
                                value={reportData.adjustments.odhar}
                                precision={2}
                            />
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Statistic
                                title="Advance Cash"
                                value={reportData.adjustments.advanceCash}
                                precision={2}
                            />
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Statistic
                                title="Bank Payment"
                                value={reportData.adjustments.bankPayment}
                                precision={2}
                            />
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Statistic
                                title="Karaya"
                                value={reportData.adjustments.karaya}
                                precision={2}
                            />
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Statistic
                                title="Salary"
                                value={reportData.adjustments.salary}
                                precision={2}
                            />
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Statistic
                                title="Expenses"
                                value={reportData.adjustments.expenses}
                                precision={2}
                            />
                        </Col>
                    </Row>

                    <Divider orientation="center">Adjustments Entries</Divider>
                    <div style={{ overflowX: "auto" }}>
                        <Table
                            dataSource={filterDataByShift(adjustments)}
                            rowKey="id"
                            pagination={false}
                            bordered
                            columns={[
                                {
                                    title: "Date",
                                    dataIndex: "date",
                                    key: "date",
                                    render: (d) => parseInvoiceDate(d).toLocaleDateString(),
                                },
                                { title: "Wasooli", dataIndex: "wasooli", key: "wasooli" },
                                { title: "Odhar", dataIndex: "odhar", key: "odhar" },
                                { title: "Advance Cash", dataIndex: "advanceCash", key: "advanceCash" },
                                { title: "Bank Payment", dataIndex: "bankPayment", key: "bankPayment" },
                                { title: "Karaya", dataIndex: "karaya", key: "karaya" },
                                { title: "Salary", dataIndex: "salary", key: "salary" },
                                { title: "Expenses", dataIndex: "expenses", key: "expenses" },
                                {
                                    title: "Actions",
                                    key: "actions",
                                    render: (_, record) =>
                                        user &&
                                        (user.role?.includes("admin") ||
                                            record.createdBy === user.uid) && (
                                            <Space>
                                                <Button
                                                    icon={<EditOutlined />}
                                                    onClick={() => handleEditAdjustment(record)}
                                                />
                                                <Popconfirm
                                                    title="Delete this entry?"
                                                    onConfirm={() =>
                                                        handleDeleteAdjustment(record.id, record)
                                                    }
                                                >
                                                    <Button icon={<DeleteOutlined />} danger />
                                                </Popconfirm>
                                            </Space>
                                        ),
                                },
                            ]}
                        />
                    </div>

                    <Divider orientation="center">Individual Readings by Category</Divider>
                    {reportData.readingsByCategory.map((group) => (
                        <div key={group.categoryId} style={{ marginBottom: 30 }}>
                            <Divider orientation="left">{group.categoryName}</Divider>
                            <div style={{ overflowX: "auto" }}>
                                <Table
                                    columns={[
                                        { title: "Nozzle", dataIndex: "nozzleName", key: "nozzleName" },
                                        {
                                            title: "Previous",
                                            dataIndex: "previousReading",
                                            key: "previousReading",
                                            render: (v) => (v != null ? v.toFixed(2) : "-"),
                                        },
                                        {
                                            title: "Current",
                                            dataIndex: "currentReading",
                                            key: "currentReading",
                                            render: (v) => (v != null ? v.toFixed(2) : "-"),
                                        },
                                        {
                                            title: "Volume (L)",
                                            dataIndex: "volume",
                                            key: "volume",
                                            render: (v) => (v != null ? v.toFixed(2) : "-"),
                                        },
                                        {
                                            title: "Price",
                                            dataIndex: "salesPrice",
                                            key: "salesPrice",
                                            render: (v) => (v != null ? v.toFixed(2) : "-"),
                                        },
                                        {
                                            title: "Amount",
                                            dataIndex: "salesAmount",
                                            key: "salesAmount",
                                            render: (v) => (v != null ? v.toFixed(2) : "-"),
                                        },
                                        {
                                            title: "Actions",
                                            key: "actions",
                                            render: (_, record) => {
                                                const fullRecord = readings.find(r => r.id === record.key);
                                                const canEdit = user && (user.role?.includes("admin") || fullRecord?.createdBy === user.uid);
                                                return canEdit ? (
                                                    <Space>
                                                        {/* <Button
                                                            icon={<EditOutlined />}
                                                            onClick={() => handleEditReading(fullRecord)}
                                                        /> */}
                                                        <Popconfirm
                                                            title="Delete this reading?"
                                                            onConfirm={() => handleDeleteReading(fullRecord.id, fullRecord)}
                                                        >
                                                            <Button icon={<DeleteOutlined />} danger />
                                                        </Popconfirm>
                                                    </Space>
                                                ) : null;
                                            },
                                        },
                                    ]}
                                    dataSource={group.records}
                                    pagination={false}
                                    rowKey="key"
                                    summary={() => (
                                        <Table.Summary.Row>
                                            <Table.Summary.Cell index={0}>
                                                <strong>Subtotal</strong>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={1} />
                                            <Table.Summary.Cell index={2} />
                                            <Table.Summary.Cell index={3}>
                                                <strong>{group.subtotalVolume != null ? group.subtotalVolume.toFixed(2) : "-"}</strong>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={4} />
                                            <Table.Summary.Cell index={5}>
                                                <strong>{group.subtotalAmount != null ? group.subtotalAmount.toFixed(2) : "-"}</strong>
                                            </Table.Summary.Cell>
                                            <Table.Summary.Cell index={6} />
                                        </Table.Summary.Row>
                                    )}
                                />
                            </div>
                        </div>
                    ))}

                    <Row style={{ marginBottom: 30 }}>
                        <Col xs={24} sm={12}>
                            <Statistic
                                title="Grand Total (Net Cash for Shift)"
                                value={reportData.grandTotal}
                                precision={2}
                            />
                        </Col>
                    </Row>

                    <Divider orientation="center">Dip Chart Data</Divider>
                    <div style={{ overflowX: "auto" }}>
                        <Table
                            columns={[
                                {
                                    title: "Tank",
                                    dataIndex: "tankId",
                                    key: "tankId",
                                    render: (id) =>
                                        tanks.find((t) => t.id === id)?.tankName || "Unknown",
                                },
                                { title: "Dip (mm)", dataIndex: "dipMm", key: "dipMm" },
                                { title: "Volume (L)", dataIndex: "dipLiters", key: "dipLiters" },
                                {
                                    title: "Gain/Loss (L)",
                                    key: "gainLoss",
                                    render: (_, r) =>
                                        r.bookStock !== undefined
                                            ? (r.dipLiters - r.bookStock)?.toFixed(2)
                                            : "-",
                                },
                                {
                                    title: "Recorded At",
                                    dataIndex: "recordedAt",
                                    key: "recordedAt",
                                    render: (d) => parseInvoiceDate(d).toLocaleString(),
                                },
                                {
                                    title: "Actions",
                                    key: "actions",
                                    render: (_, record) =>
                                        user &&
                                        (user.role?.includes("admin") ||
                                            record.createdBy === user.uid) && (
                                            <Space>
                                                <Button
                                                    icon={<EditOutlined />}
                                                    onClick={() => {
                                                        dipChartForm.setFieldsValue({
                                                            tankId: record.tankId,
                                                            dipMm: record.dipMm,
                                                            recordedAt: moment(
                                                                parseInvoiceDate(record.recordedAt)
                                                            ).format("YYYY-MM-DDTHH:mm"),
                                                        });
                                                        setIsDipChartModalOpen(true);
                                                    }}
                                                />
                                                <Popconfirm
                                                    title="Delete this entry?"
                                                    onConfirm={async () => {
                                                        await deleteDoc(doc(db, "dipcharts", record.id));
                                                        message.success("Dip entry deleted");
                                                        fetchAllData();
                                                    }}
                                                >
                                                    <Button icon={<DeleteOutlined />} danger />
                                                </Popconfirm>
                                            </Space>
                                        ),
                                },
                            ]}
                            dataSource={filterDataByShift(dipChartData)}
                            rowKey="id"
                            pagination={false}
                            bordered
                        />
                    </div>

                    <Divider orientation="center">Cumulative Tank Gain/Loss</Divider>
                    <div style={{ overflowX: "auto" }}>
                        <Table
                            dataSource={tanks.map((tank) => {
                                const tankDipRecords = dipChartData.filter(
                                    (record) =>
                                        record.tankId === tank.id && record.bookStock !== undefined
                                );
                                tankDipRecords.sort(
                                    (a, b) =>
                                        parseInvoiceDate(a.recordedAt) - parseInvoiceDate(b.recordedAt)
                                );
                                const cumulativeGainLoss = tankDipRecords.reduce(
                                    (acc, record) => acc + (record.dipLiters - record.bookStock),
                                    0
                                );
                                return {
                                    tankName: tank.tankName,
                                    cumulativeGainLoss,
                                };
                            })}
                            rowKey="tankName"
                            pagination={false}
                            bordered
                            columns={[
                                { title: "Tank", dataIndex: "tankName", key: "tankName" },
                                {
                                    title: "Cumulative Gain/Loss (L)",
                                    dataIndex: "cumulativeGainLoss",
                                    key: "cumulativeGainLoss",
                                    render: (value) => (
                                        <span style={{ color: value >= 0 ? "green" : "red" }}>
                                            {value?.toFixed(2)}
                                        </span>
                                    ),
                                },
                            ]}
                        />
                    </div>

                    <Divider orientation="center">Sales and Purchases</Divider>
                    <Row gutter={[16, 16]}>
                        <Col xs={24} md={12}>
                            <TitleTypography level={4}>Sales Invoices</TitleTypography>
                            <div style={{ overflowX: "auto" }}>
                                <Table
                                    dataSource={filterDataByShift(salesInvoices)}
                                    rowKey="id"
                                    pagination={false}
                                    bordered
                                    columns={[
                                        {
                                            title: "Date",
                                            dataIndex: "date",
                                            key: "date",
                                            render: (d) => parseInvoiceDate(d).toLocaleDateString(),
                                        },
                                        { title: "Product", dataIndex: "productName", key: "productName" },
                                        { title: "Tank", dataIndex: "tankName", key: "tankName", render: name => name || 'N/A' },
                                        { title: "Qty", dataIndex: "quantity", key: "quantity" },
                                        { title: "Unit Price", dataIndex: "unitPrice", key: "unitPrice" },
                                        {
                                            title: "Total",
                                            key: "total",
                                            render: (_, rec) => rec.amount?.toFixed(2),
                                        },
                                        {
                                            title: "Remaining Stock After",
                                            dataIndex: "remainingStockAfter",
                                            key: "remainingStockAfter",
                                            render: (stock) => stock !== undefined ? stock.toFixed(2) : 'N/A',
                                        },
                                        {
                                            title: "Actions",
                                            key: "actions",
                                            render: (_, rec) =>
                                                user &&
                                                (user.role?.includes("admin") ||
                                                    rec.createdBy === user.uid) && (
                                                    <Space>
                                                        <Button
                                                            icon={<EditOutlined />}
                                                            onClick={() => handleEditSalesInvoice(rec)}
                                                        />
                                                        <Popconfirm
                                                            title="Delete this invoice?"
                                                            onConfirm={() =>
                                                                handleDeleteSalesInvoice(rec.id, rec)
                                                            }
                                                        >
                                                            <Button icon={<DeleteOutlined />} danger />
                                                        </Popconfirm>
                                                    </Space>
                                                ),
                                        },
                                    ]}
                                    summary={() => {
                                        const sub = filterDataByShift(salesInvoices).filter(i => i.source !== "singlePage").reduce(
                                            (s, i) => s + (typeof i.amount === 'number' ? i.amount : 0),
                                            0
                                        );
                                        return (
                                            <Table.Summary.Row>
                                                <Table.Summary.Cell index={0} colSpan={5} style={{ textAlign: "right" }}>
                                                    <strong>Subtotal</strong>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={5}>
                                                    <strong>{sub?.toFixed(2)}</strong>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={6} />
                                                <Table.Summary.Cell index={7} />
                                            </Table.Summary.Row>
                                        );
                                    }}
                                />
                            </div>
                        </Col>
                        <Col xs={24} md={12}>
                            <TitleTypography level={4}>Purchase Invoices</TitleTypography>
                            <div style={{ overflowX: "auto" }}>
                                <Table
                                    dataSource={filterDataByShift(purchaseInvoices)}
                                    rowKey="id"
                                    pagination={false}
                                    bordered
                                    columns={[
                                        { title: "Supplier", dataIndex: "supplierName", key: "supplierName" },
                                        {
                                            title: "Date",
                                            dataIndex: "date",
                                            key: "date",
                                            render: (d) => parseInvoiceDate(d).toLocaleDateString(),
                                        },
                                        {
                                            title: "Type",
                                            dataIndex: "purchaseType",
                                            key: "purchaseType",
                                            render: (t) => (t === "fuel" ? "Diesel/Petrol" : "Other"),
                                        },
                                        { title: "Product", dataIndex: "productName", key: "productName" },
                                        {
                                            title: "Tank",
                                            key: "tankName",
                                            render: (_, rec) => (rec.purchaseType === "fuel" ? rec.tankName : "-"),
                                        },
                                        { title: "Qty", dataIndex: "quantity", key: "quantity" },
                                        { title: "Unit Price", dataIndex: "unitPrice", key: "unitPrice" },
                                        {
                                            title: "Total",
                                            key: "total",
                                            render: (_, rec) => rec.amount?.toFixed(2),
                                        },
                                        {
                                            title: "Remaining Stock After",
                                            dataIndex: "remainingStockAfter",
                                            key: "remainingStockAfter",
                                            render: (stock) => stock !== undefined ? stock.toFixed(2) : 'N/A',
                                        },
                                        {
                                            title: "Actions",
                                            key: "actions",
                                            render: (_, rec) =>
                                                user &&
                                                (user.role?.includes("admin") ||
                                                    rec.createdBy === user.uid) && (
                                                    <Space>
                                                        <Button
                                                            icon={<EditOutlined />}
                                                            onClick={() => handleEditPurchaseInvoice(rec)}
                                                        />
                                                        <Popconfirm
                                                            title="Delete this purchase?"
                                                            onConfirm={() =>
                                                                handleDeletePurchaseInvoice(rec.id, rec)
                                                            }
                                                        >
                                                            <Button icon={<DeleteOutlined />} danger />
                                                        </Popconfirm>
                                                    </Space>
                                                ),
                                        },
                                    ]}
                                    summary={() => {
                                        const sub = filterDataByShift(purchaseInvoices)
                                            .filter(i => i.purchaseType !== "fuel") // Correctly filter out 'fuel' purchases
                                            .reduce(
                                                (s, i) => s + (typeof i.amount === 'number' ? i.amount : 0),
                                                0
                                            );

                                        return (
                                            <Table.Summary.Row>
                                                <Table.Summary.Cell index={0} colSpan={7} style={{ textAlign: "right" }}>
                                                    <strong>Subtotal (Non-Fuel)</strong>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={7}>
                                                    <strong>{sub?.toFixed(2)}</strong>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={8} />
                                                <Table.Summary.Cell index={9} />
                                            </Table.Summary.Row>
                                        );
                                    }}
                                />
                            </div>
                        </Col>
                    </Row>

                    <Divider orientation="center">Sales Returns</Divider>
                    <Row gutter={[16, 16]}>
                        <Col xs={24}>
                            <TitleTypography level={4}>Sales Return Invoices</TitleTypography>
                            <div style={{ overflowX: "auto" }}>
                                <Table
                                    dataSource={filterDataByShift(salesReturnInvoices)}
                                    rowKey="id"
                                    pagination={false}
                                    bordered
                                    columns={[
                                        {
                                            title: "Date",
                                            dataIndex: "date",
                                            key: "date",
                                            render: (d) => parseInvoiceDate(d).toLocaleDateString(),
                                        },
                                        { title: "Product", dataIndex: "productName", key: "productName" },
                                        { title: "Tank", dataIndex: "tankName", key: "tankName", render: name => name || 'N/A' },
                                        { title: "Qty", dataIndex: "quantity", key: "quantity" },
                                        { title: "Unit Price", dataIndex: "unitPrice", key: "unitPrice" },
                                        {
                                            title: "Total",
                                            key: "total",
                                            render: (_, rec) => rec.amount?.toFixed(2),
                                        },
                                        {
                                            title: "Remaining Stock After",
                                            dataIndex: "remainingStockAfter",
                                            key: "remainingStockAfter",
                                            render: (stock) => stock !== undefined ? stock.toFixed(2) : 'N/A',
                                        },
                                        {
                                            title: "Actions",
                                            key: "actions",
                                            render: (_, rec) =>
                                                user &&
                                                (user.role?.includes("admin") ||
                                                    rec.createdBy === user.uid) && (
                                                    <Space>
                                                        <Button
                                                            icon={<EditOutlined />}
                                                            onClick={() => handleEditSalesReturnInvoice(rec)}
                                                        />
                                                        <Popconfirm
                                                            title="Delete this return?"
                                                            onConfirm={() =>
                                                                handleDeleteSalesReturnInvoice(rec.id, rec)
                                                            }
                                                        >
                                                            <Button icon={<DeleteOutlined />} danger />
                                                        </Popconfirm>
                                                    </Space>
                                                ),
                                        },
                                    ]}
                                    summary={() => {
                                        const sub = filterDataByShift(salesReturnInvoices)
                                            .filter(item => item.source !== 'singlePage') // Exclude items with source 'singlePage'
                                            .reduce(
                                                (s, i) => s + (typeof i.amount === 'number' ? i.amount : 0),
                                                0
                                            );
                                        return (
                                            <Table.Summary.Row>
                                                <Table.Summary.Cell index={0} colSpan={5} style={{ textAlign: "right" }}>
                                                    <strong>Subtotal</strong>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={5}>
                                                    <strong>{sub?.toFixed(2)}</strong>
                                                </Table.Summary.Cell>
                                                <Table.Summary.Cell index={6} />
                                                <Table.Summary.Cell index={7} />
                                            </Table.Summary.Row>
                                        );
                                    }}
                                />
                            </div>
                        </Col>
                    </Row>
                </Spin>
            </div>

            <Modal
                title={editingSalesInvoice ? "Edit Sales Invoice" : "Add Sales Invoice"}
                open={isSalesInvoiceModalOpen}
                onCancel={() => {
                    setIsSalesInvoiceModalOpen(false);
                    setEditingSalesInvoice(null);
                    setSalesTotal(0);
                }}
                footer={null}
                width={600}
            >
                <Form
                    form={salesInvoiceForm}
                    layout="vertical"
                    onFinish={handleSalesInvoiceSubmit}
                    initialValues={{
                        date: moment().format("YYYY-MM-DD"),
                        time: moment().format("HH:mm"),
                        type: "fuel",
                    }}
                    onValuesChange={(changed, all) => {
                        if (changed.quantity || changed.unitPrice) {
                            setSalesTotal((all.quantity || 0) * (all.unitPrice || 0));
                        }
                    }}
                >
                    <Form.Item
                        name="date"
                        label="Date"
                        rules={[{ required: true, message: "Please select date" }]}
                    >
                        <Input type="date" disabled={!isAdmin} />
                    </Form.Item>
                    <Form.Item
                        name="time"
                        label="Time"
                        rules={[{ required: true, message: "Please select time" }]}
                    >
                        <Input type="time" disabled={!isAdmin} />
                    </Form.Item>
                    <Form.Item
                        name="type"
                        label="Type"
                        rules={[{ required: true, message: "Please select type" }]}
                    >
                        <Select placeholder="Select type">
                            <Option value="fuel">Fuel</Option>
                            <Option value="non-fuel">Non-Fuel</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item shouldUpdate={(prev, curr) => prev.type !== curr.type}>
                        {({ getFieldValue }) => {
                            const type = getFieldValue('type');
                            const filteredProducts = products.filter((p) => {
                                if (type === "fuel") {
                                    return p.category === "petrol" || p.category === "diesel";
                                } else {
                                    return p.category !== "petrol" && p.category !== "diesel";
                                }
                            });
                            return (
                                <Form.Item
                                    name="productId"
                                    label="Product"
                                    rules={[{ required: true, message: "Please select a product" }]}
                                >
                                    <Select placeholder="Select product">
                                        {filteredProducts.map((p) => (
                                            <Option key={p.id} value={p.id}>
                                                {p.productName}
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                    <Form.Item shouldUpdate={(prev, curr) => prev.type !== curr.type}>
                        {({ getFieldValue }) => {
                            const type = getFieldValue('type');
                            return type === "fuel" ? (
                                <Form.Item
                                    name="tankId"
                                    label="Tank"
                                    rules={[{ required: true, message: "Please select a tank" }]}
                                >
                                    <Select placeholder="Select tank">
                                        {tanks.map(t => (
                                            <Option key={t.id} value={t.id}>
                                                {t.tankName}
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            ) : null;
                        }}
                    </Form.Item>
                    <Form.Item
                        name="quantity"
                        label="Quantity"
                        rules={[{ required: true, message: "Please enter quantity" }]}
                    >
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item
                        name="unitPrice"
                        label="Unit Price"
                        rules={[{ required: true, message: "Please enter unit price" }]}
                    >
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item label="Total">
                        <InputNumber value={salesTotal} disabled style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                            <Button onClick={() => setIsSalesInvoiceModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={salesInvoiceSubmitting}
                            >
                                {editingSalesInvoice ? "Update" : "Create"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={editingSalesReturnInvoice ? "Edit Sales Return" : "Add Sales Return"}
                open={isSalesReturnInvoiceModalOpen}
                onCancel={() => {
                    setIsSalesReturnInvoiceModalOpen(false);
                    setEditingSalesReturnInvoice(null);
                }}
                footer={null}
                width={600}
            >
                <Form
                    form={salesReturnInvoiceForm}
                    layout="vertical"
                    onFinish={handleSalesReturnInvoiceSubmit}
                    initialValues={{
                        date: moment().format("YYYY-MM-DD"),
                        time: moment().format("HH:mm"),
                        type: "fuel",
                    }}
                    onValuesChange={(changed, all) => {
                        if (changed.quantity || changed.unitPrice) {
                            setSalesTotal((all.quantity || 0) * (all.unitPrice || 0));
                        }
                    }}
                >
                    <Form.Item
                        name="date"
                        label="Date"
                        rules={[{ required: true, message: "Please select date" }]}
                    >
                        <Input type="date" disabled={!isAdmin} />
                    </Form.Item>
                    <Form.Item
                        name="time"
                        label="Time"
                        rules={[{ required: true, message: "Please select time" }]}
                    >
                        <Input type="time" disabled={!isAdmin} />
                    </Form.Item>
                    <Form.Item
                        name="type"
                        label="Type"
                        rules={[{ required: true, message: "Please select type" }]}
                    >
                        <Select placeholder="Select type">
                            <Option value="fuel">Fuel</Option>
                            <Option value="non-fuel">Non-Fuel</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item shouldUpdate={(prev, curr) => prev.type !== curr.type}>
                        {({ getFieldValue }) => {
                            const type = getFieldValue('type');
                            const filteredProducts = products.filter((p) => {
                                if (type === "fuel") {
                                    return p.category === "petrol" || p.category === "diesel";
                                } else {
                                    return p.category !== "petrol" && p.category !== "diesel";
                                }
                            });
                            return (
                                <Form.Item
                                    name="productId"
                                    label="Product"
                                    rules={[{ required: true, message: "Please select a product" }]}
                                >
                                    <Select placeholder="Select product">
                                        {filteredProducts.map((p) => (
                                            <Option key={p.id} value={p.id}>
                                                {p.productName}
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                    <Form.Item shouldUpdate={(prev, curr) => prev.type !== curr.type}>
                        {({ getFieldValue }) => {
                            const type = getFieldValue('type');
                            return type === "fuel" ? (
                                <Form.Item
                                    name="tankId"
                                    label="Tank"
                                    rules={[{ required: true, message: "Please select a tank" }]}
                                >
                                    <Select placeholder="Select tank">
                                        {tanks.map(t => (
                                            <Option key={t.id} value={t.id}>
                                                {t.tankName}
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            ) : null;
                        }}
                    </Form.Item>
                    <Form.Item
                        name="quantity"
                        label="Quantity"
                        rules={[{ required: true, message: "Please enter quantity" }]}
                    >
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item
                        name="unitPrice"
                        label="Unit Price"
                        rules={[{ required: true, message: "Please enter unit price" }]}
                    >
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item label="Total">
                        <InputNumber value={salesTotal} disabled style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                            <Button onClick={() => setIsSalesReturnInvoiceModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={salesReturnInvoiceSubmitting}
                            >
                                {editingSalesReturnInvoice ? "Update" : "Create"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={editingPurchaseInvoice ? "Edit Purchase Invoice" : "Add Purchase Invoice"}
                open={isPurchaseInvoiceModalOpen}
                onCancel={() => {
                    setIsPurchaseInvoiceModalOpen(false);
                    setEditingPurchaseInvoice(null);
                }}
                footer={null}
                width={600}
            >
                <Form
                    form={purchaseInvoiceForm}
                    layout="vertical"
                    onFinish={handlePurchaseInvoiceSubmit}
                    initialValues={{
                        purchaseType: "fuel",
                        date: moment().format("YYYY-MM-DD"),
                        time: moment().format("HH:mm"),
                    }}
                    onValuesChange={(changed, all) => {
                        if (changed.purchaseType) setPurchaseType(all.purchaseType);
                        if (changed.quantity || changed.unitPrice) {
                            setPurchaseTotal((all.quantity || 0) * (all.unitPrice || 0));
                        }
                    }}
                >
                    <Form.Item
                        name="supplierId"
                        label="Supplier"
                        rules={[{ required: true }]}
                    >
                        <Select placeholder="Select supplier">
                            {suppliers.map((s) => (
                                <Option key={s.id} value={s.id}>
                                    {s.accountName}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="purchaseType"
                        label="Purchase Type"
                        rules={[{ required: true }]}
                    >
                        <Select placeholder="Select type">
                            <Option value="fuel">Fuel</Option>
                            <Option value="non-fuel">Non-Fuel</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="date"
                        label="Date"
                        rules={[{ required: true }]}
                    >
                        <Input type="date" disabled={!isAdmin} />
                    </Form.Item>
                    <Form.Item
                        name="time"
                        label="Time"
                        rules={[{ required: true }]}
                    >
                        <Input type="time" disabled={!isAdmin} />
                    </Form.Item>
                    <Form.Item shouldUpdate={(prev, curr) => prev.purchaseType !== curr.purchaseType}>
                        {({ getFieldValue }) => {
                            const type = getFieldValue('purchaseType');
                            const filteredProducts = products.filter((p) => {
                                if (type === "fuel") {
                                    return p.category === "petrol" || p.category === "diesel";
                                } else {
                                    return p.category !== "petrol" && p.category !== "diesel";
                                }
                            });
                            return (
                                <Form.Item
                                    name="productId"
                                    label="Product"
                                    rules={[{ required: true }]}
                                >
                                    <Select placeholder="Select product">
                                        {filteredProducts.map((p) => (
                                            <Option key={p.id} value={p.id}>
                                                {p.productName}
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                    <Form.Item shouldUpdate={(prev, curr) => prev.purchaseType !== curr.purchaseType}>
                        {({ getFieldValue }) => {
                            const type = getFieldValue('purchaseType');
                            return type === "fuel" ? (
                                <Form.Item
                                    name="tankId"
                                    label="Tank"
                                    rules={[{ required: true }]}
                                >
                                    <Select placeholder="Select tank">
                                        {tanks.map((t) => (
                                            <Option key={t.id} value={t.id}>
                                                {t.tankName}
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            ) : null;
                        }}
                    </Form.Item>
                    <Form.Item
                        name="quantity"
                        label="Quantity"
                        rules={[{ required: true }]}
                    >
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item
                        name="unitPrice"
                        label="Unit Price"
                        rules={[{ required: true }]}
                    >
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item label="Total">
                        <InputNumber value={purchaseTotal} disabled style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                            <Button onClick={() => setIsPurchaseInvoiceModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={purchaseInvoiceSubmitting}
                            >
                                {editingPurchaseInvoice ? "Update" : "Create"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={editingAdjustment ? "Edit Adjustments" : "Apply Adjustments"}
                open={isAdjustmentsModalOpen}
                onCancel={() => {
                    setIsAdjustmentsModalOpen(false);
                    setEditingAdjustment(null);
                }}
                footer={null}
                width={500}
            >
                <Form
                    form={adjustmentsForm}
                    layout="vertical"
                    onFinish={handleAdjustmentsSubmit}
                >
                    <Form.Item name="wasooli" label="Wasooli (Manual Cash In)">
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="odhar" label="Odhar (Manual Cash Out)">
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="advanceCash" label="Advance Cash">
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="bankPayment" label="Bank Payment">
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="karaya" label="Karaya">
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="salary" label="Salary">
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="expenses" label="Expenses">
                        <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                            <Button onClick={() => setIsAdjustmentsModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={adjustmentsSubmitting}
                            >
                                {editingAdjustment ? "Update" : "Apply"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={editingReading ? "Edit Reading" : "Record Reading"}
                open={isReadingModalOpen}
                onCancel={() => {
                    setIsReadingModalOpen(false);
                    setEditingReading(null);
                }}
                footer={null}
            >
                <Form
                    form={readingForm}
                    layout="vertical"
                    onFinish={editingReading ? handleUpdateReading : handleReadingSubmit}
                    initialValues={editingReading ? {
                        nozzleId: editingReading.nozzleId,
                        previousReading: editingReading.previousReading,
                        currentReading: editingReading.currentReading,
                        tankId: editingReading.tankId,
                        newPrice: editingReading.effectivePrice,
                        recordedAt: moment(editingReading.timestamp.toDate()).format("YYYY-MM-DDTHH:mm"),
                    } : {
                        recordedAt: moment().format("YYYY-MM-DDTHH:mm"),
                    }}
                >
                    <Form.Item
                        name="nozzleId"
                        label="Select Nozzle"
                        rules={[{ required: true, message: "Please select a nozzle" }]}
                    >
                        <Select
                            placeholder="Select nozzle"
                            onChange={handleNozzleChange}
                            disabled={!!editingReading}
                        >
                            {nozzles
                                .sort((a, b) => a.nozzleName.localeCompare(b.nozzleName))
                                .map((nozzle) => (
                                    <Option key={nozzle.id} value={nozzle.id}>
                                        {nozzle.nozzleName}
                                    </Option>
                                ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="previousReading" label="Previous Reading">
                        <InputNumber disabled style={{ width: "100%" }} placeholder="Auto-filled" />
                    </Form.Item>
                    <Form.Item
                        name="currentReading"
                        label="Current Reading"
                        rules={[{ required: true, message: "Please enter current reading" }]}
                    >
                        <InputNumber min={0} style={{ width: "100%" }} placeholder="Enter current reading" />
                    </Form.Item>
                    <Form.Item
                        name="tankId"
                        label="Select Tank"
                        rules={[{ required: true, message: "Please select a tank" }]}
                    >
                        <Select placeholder="Select tank">
                            {tanks.map((tank) => (
                                <Option key={tank.id} value={tank.id}>
                                    {tank.tankName} (Available: {tank.remainingStock || 0})
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="newPrice" label="New Product Price - optional">
                        <InputNumber min={0} style={{ width: "100%" }} placeholder="Enter new price if updating" />
                    </Form.Item>
                    <Form.Item
                        name="recordedAt"
                        label="Recorded At"
                        rules={[{ required: true, message: "Please select date and time" }]}
                    >
                        <Input type="datetime-local" disabled={!isAdmin} />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                            <Button onClick={() => {
                                setIsReadingModalOpen(false);
                                setEditingReading(null);
                            }}>
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={readingSubmitting}
                            >
                                {editingReading ? "Update" : "Record"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Record Dip Chart Entry"
                open={isDipChartModalOpen}
                onCancel={() => setIsDipChartModalOpen(false)}
                footer={null}
            >
                <Form
                    form={dipChartForm}
                    layout="vertical"
                    onFinish={handleDipChartSubmit}
                    initialValues={{ recordedAt: moment().format("YYYY-MM-DDTHH:mm") }}
                    onValuesChange={(changedValues) => {
                        if (changedValues.dipMm !== undefined) {
                            const computedLiters = window.getLiters(changedValues.dipMm);
                            dipChartForm.setFieldsValue({ dipLiters: computedLiters });
                        }
                    }}
                >
                    <Form.Item
                        name="tankId"
                        label="Select Tank"
                        rules={[{ required: true, message: "Please select a tank" }]}
                    >
                        <Select placeholder="Select tank">
                            {tanks.map((tank) => (
                                <Option key={tank.id} value={tank.id}>
                                    {tank.tankName}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="dipMm"
                        label="Dip (mm)"
                        rules={[{ required: true, message: "Please enter dip in mm" }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item label="Dip (L)" name="dipLiters">
                        <InputNumber disabled style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item
                        name="recordedAt"
                        label="Recorded At"
                        rules={[{ required: true, message: "Please select date and time" }]}
                    >
                        <Input type="datetime-local" disabled={!isAdmin} />
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                            <Button onClick={() => setIsDipChartModalOpen(false)}>Cancel</Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={dipChartSubmitting}
                            >
                                Record Dip Chart
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {pdfPreviewVisible && (
                <Modal
                    title="PDF Preview"
                    open={pdfPreviewVisible}
                    onCancel={() => setPdfPreviewVisible(false)}
                    footer={null}
                    width="80%"
                >
                    <iframe
                        title="PDF Preview"
                        src={pdfPreviewUrl}
                        width="100%"
                        height="600px"
                    ></iframe>
                </Modal>
            )}
        </div>
    );
};

export default SalesReportPage;
