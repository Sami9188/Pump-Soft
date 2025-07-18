import React, { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Form, Input, Space, Card,
    Typography, message, Tooltip, Popconfirm, InputNumber, Select, Statistic, Row, Col
} from 'antd';
import moment from 'moment';
import {
    PlusOutlined, EditOutlined, DeleteOutlined,
    FileExcelOutlined, DashboardOutlined, HistoryOutlined, LoadingOutlined
} from '@ant-design/icons';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, Timestamp, query, where, orderBy, limit, runTransaction } from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import { exportToExcel } from '../../../../services/exportService';
import { useAuth } from '../../../../context/AuthContext';

const { Title } = Typography;
const { Option } = Select;

const NozzleManagement = () => {
    const [nozzles, setNozzles] = useState([]);
    const [dispensers, setDispensers] = useState([]);
    const [products, setProducts] = useState([]);
    const [tanks, setTanks] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [categories] = useState([
        { id: 'petrol', name: 'Petrol' },
        { id: 'diesel', name: 'Diesel' },
    ]);

    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
    const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);

    const [selectedNozzle, setSelectedNozzle] = useState(null);
    const [readingHistory, setReadingHistory] = useState([]);
    const [readingDeleteLoading, setReadingDeleteLoading] = useState(null);
    const [editingReading, setEditingReading] = useState(null);
    const [readingSubmitting, setReadingSubmitting] = useState(false);

    const [form] = Form.useForm();
    const [readingForm] = Form.useForm();

    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [recordReadingLoading, setRecordReadingLoading] = useState(false);
    const [exporting, setExporting] = useState(false);

    // New states for shift filtering
    const [selectedShiftId, setSelectedShiftId] = useState('all');
    const [isFilteringByShift, setIsFilteringByShift] = useState(false);
    const [displayData, setDisplayData] = useState({ nozzles: [], totalSales: 0, totalVolume: 0 });


    const { user } = useAuth();
    const isAdmin = user?.role?.includes("admin");

    useEffect(() => {
        fetchAllData();
    }, []);

    // Effect to calculate and update display data when master nozzles or shift filter changes
    useEffect(() => {
        const calculateDisplayData = async () => {
            if (selectedShiftId === 'all') {
                const totalSales = nozzles.reduce((sum, n) => sum + (n.totalSales || 0), 0);
                const totalVolume = nozzles.reduce((sum, n) => sum + (n.totalVolume || 0), 0);
                setDisplayData({ nozzles, totalSales, totalVolume });
                return;
            }

            setIsFilteringByShift(true);
            try {
                const q = query(collection(db, "readings"), where("shiftId", "==", selectedShiftId));
                const readingsSnap = await getDocs(q);
                const shiftReadings = readingsSnap.docs.map(doc => doc.data());

                const salesByNozzle = shiftReadings.reduce((acc, reading) => {
                    if (!acc[reading.nozzleId]) {
                        acc[reading.nozzleId] = { sales: 0, volume: 0 };
                    }
                    acc[reading.nozzleId].sales += reading.salesAmount;
                    acc[reading.nozzleId].volume += reading.salesVolume;
                    return acc;
                }, {});

                let totalShiftSales = 0;
                let totalShiftVolume = 0;

                const shiftNozzleData = nozzles.map(nozzle => {
                    const shiftData = salesByNozzle[nozzle.id] || { sales: 0, volume: 0 };
                    totalShiftSales += shiftData.sales;
                    totalShiftVolume += shiftData.volume;
                    return {
                        ...nozzle,
                        totalSales: shiftData.sales,
                        totalVolume: shiftData.volume,
                    };
                }).filter(n => n.totalVolume > 0); // Only show nozzles with sales in that shift

                setDisplayData({
                    nozzles: shiftNozzleData,
                    totalSales: totalShiftSales,
                    totalVolume: totalShiftVolume,
                });

            } catch (error) {
                message.error("Failed to filter by shift: " + error.message);
                setSelectedShiftId('all'); // Revert to all if filtering fails
            } finally {
                setIsFilteringByShift(false);
            }
        };

        calculateDisplayData();

    }, [nozzles, selectedShiftId]);

    const fetchAllData = () => {
        Promise.all([
            fetchNozzles(),
            fetchDispensers(),
            fetchProducts(),
            fetchTanks(),
            fetchShifts()
        ]).catch(err => message.error("Failed to fetch data: " + err.message));
    };

    const fetchNozzles = async () => {
        setLoading(true);
        try {
            const nozzleQuery = query(collection(db, "nozzles"), orderBy("nozzleName"));
            const querySnapshot = await getDocs(nozzleQuery);
            const nozzleList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setNozzles(nozzleList);
        } finally {
            setLoading(false);
        }
    };

    const fetchDispensers = async () => {
        const querySnapshot = await getDocs(collection(db, "dispensers"));
        setDispensers(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };

    const fetchProducts = async () => {
        const querySnapshot = await getDocs(collection(db, "products"));
        setProducts(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };

    const fetchTanks = async () => {
        const querySnapshot = await getDocs(collection(db, "tanks"));
        setTanks(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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

    const findShiftForTimestamp = (timestamp) => {
        const date = timestamp.toDate();
        for (const shift of shifts) {
            const start = shift.startTime.toDate();
            const end = shift.endTime ? shift.endTime.toDate() : null;
            if (end) {
                if (date >= start && date <= end) {
                    return shift.id;
                }
            } else { // For ongoing shifts
                if (date >= start) {
                    return shift.id;
                }
            }
        }
        return null;
    };

    const fetchReadingHistory = async (nozzleId) => {
        try {
            const q = query(
                collection(db, "readings"),
                where("nozzleId", "==", nozzleId),
                orderBy("timestamp", "desc")
            );
            const querySnapshot = await getDocs(q);
            const readings = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setReadingHistory(readings);
            setIsHistoryModalVisible(true);
        } catch (error) {
            message.error(`Failed to fetch reading history: ${error.message}`);
        }
    };

    const updateNozzleLastReading = async (nozzleId) => {
        const q = query(
            collection(db, "readings"),
            where("nozzleId", "==", nozzleId),
            orderBy("timestamp", "desc"),
            limit(1)
        );
        const querySnapshot = await getDocs(q);
        const nozzleRef = doc(db, "nozzles", nozzleId);

        if (!querySnapshot.empty) {
            const latestReading = querySnapshot.docs[0].data();
            await updateDoc(nozzleRef, { lastReading: latestReading.currentReading });
        } else {
            const nozzleDoc = await getDoc(nozzleRef);
            if (nozzleDoc.exists()) {
                const openingReading = nozzleDoc.data().openingReading || 0;
                await updateDoc(nozzleRef, { lastReading: openingReading });
            }
        }
    };

    const handleUpdateReading = async (vals) => {
        setReadingSubmitting(true);
        try {
            const { currentReading, previousReading, tankId, newPrice, recordedAt, fuelType } = vals;
            const readingId = editingReading.id;
            const originalReading = editingReading;

            if (!(user && (user.role?.includes("admin") || originalReading.createdBy === user.uid))) {
                message.error("You are not authorized to update this reading.");
                return;
            }

            const newSalesVolume = currentReading - previousReading;
            if (newSalesVolume < 0) {
                message.error("Current reading must be ≥ previous reading");
                setReadingSubmitting(false); return;
            }

            const effectivePrice = newPrice != null ? newPrice : originalReading.effectivePrice;
            const newSalesAmount = newSalesVolume * effectivePrice;
            const timestamp = Timestamp.fromDate(new Date(recordedAt));

            const newShiftId = findShiftForTimestamp(timestamp);
            if (!newShiftId) {
                message.error('No shift found for the selected date and time.');
                setReadingSubmitting(false); return;
            }

            const originalTankId = originalReading.tankId;
            const newTankId = tankId;

            await runTransaction(db, async (transaction) => {
                const originalTankRef = doc(db, "tanks", originalTankId);
                const originalTankDoc = await transaction.get(originalTankRef);
                if (!originalTankDoc.exists()) throw new Error("Original tank not found");
                const originalTankData = originalTankDoc.data();

                let newTankData;
                if (originalTankId !== newTankId) {
                    const newTankRef = doc(db, "tanks", newTankId);
                    const newTankDoc = await transaction.get(newTankRef);
                    if (!newTankDoc.exists()) throw new Error("New tank not found");
                    newTankData = newTankDoc.data();
                } else {
                    newTankData = originalTankData;
                }

                const stockAfterRevertingOldSale = (originalTankData.remainingStock || 0) + originalReading.salesVolume;
                const stockInNewTank = (originalTankId === newTankId) ? stockAfterRevertingOldSale : (newTankData.remainingStock || 0);

                if (stockInNewTank < newSalesVolume) {
                    throw new Error(`Not enough stock in "${newTankData.tankName}". Available: ${stockInNewTank}, Required: ${newSalesVolume}`);
                }
                const finalStockInNewTank = stockInNewTank - newSalesVolume;

                if (originalTankId === newTankId) {
                    transaction.update(originalTankRef, { remainingStock: finalStockInNewTank, lastUpdated: new Date() });
                } else {
                    transaction.update(originalTankRef, { remainingStock: stockAfterRevertingOldSale, lastUpdated: new Date() });
                    transaction.update(doc(db, "tanks", newTankId), { remainingStock: finalStockInNewTank, lastUpdated: new Date() });
                }

                const readingRef = doc(db, "readings", readingId);
                transaction.update(readingRef, { currentReading, previousReading, tankId, effectivePrice, salesVolume: newSalesVolume, salesAmount: newSalesAmount, timestamp, fuelType, shiftId: newShiftId });

                const nozzleRef = doc(db, "nozzles", originalReading.nozzleId);
                const nozzleDoc = await transaction.get(nozzleRef);
                if (!nozzleDoc.exists()) throw new Error("Nozzle not found");
                const nozzleData = nozzleDoc.data();

                const salesDifference = newSalesAmount - originalReading.salesAmount;
                const volumeDifference = newSalesVolume - originalReading.salesVolume;
                const updatedTotalSales = (nozzleData.totalSales || 0) + salesDifference;
                const updatedTotalVolume = (nozzleData.totalVolume || 0) + volumeDifference;

                transaction.update(nozzleRef, { totalSales: updatedTotalSales, totalVolume: updatedTotalVolume, lastUpdated: new Date() });
            });

            await updateNozzleLastReading(originalReading.nozzleId);

            message.success("Reading updated successfully");
            setEditingReading(null);
            readingForm.resetFields();
            setIsReadingModalOpen(false);
            await fetchAllData();
            if (selectedNozzle) await fetchReadingHistory(selectedNozzle.id);
        } catch (err) {
            console.error("Update failed:", err);
            message.error("Failed to update reading: " + err.message);
        } finally {
            setReadingSubmitting(false);
        }
    };

    const handleDeleteReading = async (record) => {
        setReadingDeleteLoading(record.id);
        try {
            await runTransaction(db, async (transaction) => {
                const tankRef = doc(db, "tanks", record.tankId);
                const tankDoc = await transaction.get(tankRef);
                if (!tankDoc.exists()) throw new Error("Tank not found");
                const tankData = tankDoc.data();
                const updatedStock = (tankData.remainingStock || 0) + record.salesVolume;

                const nozzleRef = doc(db, "nozzles", record.nozzleId);
                const nozzleDoc = await transaction.get(nozzleRef);
                if (!nozzleDoc.exists()) throw new Error("Nozzle not found");
                const nozzleData = nozzleDoc.data();
                const updatedTotalSales = (nozzleData.totalSales || 0) - record.salesAmount;
                const updatedTotalVolume = (nozzleData.totalVolume || 0) - record.salesVolume;

                transaction.update(tankRef, { remainingStock: updatedStock, lastUpdated: new Date() });
                transaction.update(nozzleRef, { totalSales: updatedTotalSales, totalVolume: updatedTotalVolume, lastUpdated: new Date() });
                transaction.delete(doc(db, "readings", record.id));

                const transactionRef = doc(collection(db, "productTransactions"));
                transaction.set(transactionRef, {
                    productId: record.productId,
                    productName: products.find(p => p.id === record.productId)?.productName || "Unknown",
                    eventType: 'sale-cancellation',
                    quantity: record.salesVolume,
                    unitPrice: record.effectivePrice,
                    totalAmount: record.salesAmount,
                    tankId: record.tankId,
                    tankName: tankData.tankName,
                    remainingStockAfter: updatedStock,
                    timestamp: record.timestamp,
                    createdAt: new Date(),
                    createdBy: user?.uid
                });
            });

            await updateNozzleLastReading(record.nozzleId);

            message.success("Reading deleted successfully. Stock and sales reverted.");
            if (selectedNozzle) await fetchReadingHistory(selectedNozzle.id);
            await fetchAllData();
        } catch (error) {
            message.error(`Failed to delete reading: ${error.message}`);
        } finally {
            setReadingDeleteLoading(null);
        }
    };

    const handleReadingSubmit = async (values) => {
        setRecordReadingLoading(true);
        try {
            const { currentReading, previousReading, tankId, newPrice, recordedAt, fuelType } = values;
            const salesVolume = currentReading - previousReading;

            if (salesVolume < 0) {
                message.error("Current reading cannot be less than previous reading");
                setRecordReadingLoading(false); return;
            }

            const product = products.find(p => p.id === selectedNozzle.productId);
            const timestamp = Timestamp.fromDate(new Date(recordedAt));

            const shiftId = findShiftForTimestamp(timestamp);
            if (!shiftId) {
                message.error('No shift found for the selected date and time.');
                setRecordReadingLoading(false); return;
            }

            const effectivePrice = newPrice ?? product.salesPrice;
            const salesAmount = salesVolume * effectivePrice;
            const readingData = {
                nozzleId: selectedNozzle.id, dispenserId: selectedNozzle.dispenserId, productId: selectedNozzle.productId,
                tankId, previousReading, currentReading, salesVolume, salesAmount, effectivePrice,
                timestamp, fuelType, createdBy: user?.uid, shiftId
            };

            await runTransaction(db, async (transaction) => {
                const tankRef = doc(db, "tanks", tankId);
                const tankDoc = await transaction.get(tankRef);
                if (!tankDoc.exists()) throw new Error("Tank not found");
                const tankData = tankDoc.data();
                const currentStock = tankData.remainingStock || 0;

                const nozzleRef = doc(db, "nozzles", selectedNozzle.id);
                const nozzleDoc = await transaction.get(nozzleRef);
                if (!nozzleDoc.exists()) throw new Error("Nozzle not found");
                const nozzleData = nozzleDoc.data();

                if (currentStock < salesVolume) {
                    throw new Error(`Not enough stock in "${tankData.tankName}". Available: ${currentStock}`);
                }
                const updatedStock = currentStock - salesVolume;
                const updatedTotalSales = (nozzleData.totalSales || 0) + salesAmount;
                const updatedTotalVolume = (nozzleData.totalVolume || 0) + salesVolume;


                transaction.update(tankRef, { remainingStock: updatedStock, lastUpdated: new Date() });
                transaction.set(doc(collection(db, "readings")), readingData);
                transaction.update(nozzleRef, { totalSales: updatedTotalSales, totalVolume: updatedTotalVolume, lastReading: currentReading, lastUpdated: new Date() });

                if (newPrice !== undefined && newPrice !== null) {
                    transaction.update(doc(db, "products", selectedNozzle.productId), { salesPrice: newPrice, lastUpdated: new Date() });
                }

                transaction.set(doc(collection(db, "productTransactions")), {
                    productId: selectedNozzle.productId, productName: product.productName, eventType: 'sale',
                    quantity: salesVolume, unitPrice: effectivePrice, totalAmount: salesAmount, tankId,
                    tankName: tankData.tankName, remainingStockAfter: updatedStock, timestamp, createdAt: new Date(), createdBy: user?.uid
                });
            });

            await fetchAllData();
            message.success("Reading recorded successfully");
            setIsReadingModalOpen(false);
        } catch (error) {
            message.error(`Operation failed: ${error.message}`);
        } finally {
            setRecordReadingLoading(false);
        }
    };

    const showModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue(record);
        } else {
            setEditingId(null);
            form.resetFields();
            form.setFieldsValue({ openingReading: 0, category: 'petrol' });
        }
        setIsModalVisible(true);
    };

    const showReadingModal = (nozzleRecord, readingRecord = null) => {
        setSelectedNozzle(nozzleRecord);
        if (readingRecord) { // Editing an existing reading
            setEditingReading(readingRecord);
            readingForm.setFieldsValue({
                previousReading: readingRecord.previousReading,
                currentReading: readingRecord.currentReading,
                tankId: readingRecord.tankId,
                newPrice: readingRecord.effectivePrice,
                recordedAt: moment(readingRecord.timestamp.toDate()).format("YYYY-MM-DDTHH:mm"),
                fuelType: readingRecord.fuelType || 'Fuel',
            });
        } else { // Recording a new reading
            setEditingReading(null);
            getDoc(doc(db, "nozzles", nozzleRecord.id)).then(snap => {
                const latestNozzleData = snap.exists() ? snap.data() : nozzleRecord;
                readingForm.setFieldsValue({
                    previousReading: latestNozzleData.lastReading || 0,
                    currentReading: '',
                    tankId: undefined, newPrice: undefined,
                    recordedAt: moment().format("YYYY-MM-DDTHH:mm"),
                    fuelType: 'Fuel',
                });
            });
        }
        setIsReadingModalOpen(true);
    };

    const handleCancel = () => setIsModalVisible(false);
    const handleReadingCancel = () => { setIsReadingModalOpen(false); setEditingReading(null); };
    const handleHistoryCancel = () => setIsHistoryModalVisible(false);

    const handleSubmit = async (values) => {
        setSubmitLoading(true);
        try {
            const currentTime = new Date();
            const formattedValues = { ...values, lastUpdated: currentTime };
            if (editingId) {
                const { openingReading, ...updateValues } = formattedValues;
                await updateDoc(doc(db, "nozzles", editingId), updateValues);
                message.success("Nozzle updated successfully");
            } else {
                await addDoc(collection(db, "nozzles"), {
                    ...formattedValues,
                    openingReading: values.openingReading,
                    lastReading: values.openingReading,
                    totalSales: 0,
                    totalVolume: 0, // Initialize totalVolume
                    createdAt: currentTime,
                });
                message.success("Nozzle created successfully");
            }
            setIsModalVisible(false);
            fetchNozzles();
        } catch (error) {
            message.error(`Operation failed: ${error.message}`);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async (id) => {
        setDeleteLoading(id);
        try {
            await deleteDoc(doc(db, "nozzles", id));
            message.success("Nozzle deleted successfully");
            fetchNozzles();
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleExportToExcel = () => {
        setExporting(true);
        try {
            const dataToExport = displayData.nozzles.map(n => ({
                'Dispenser': dispensers.find(d => d.id === n.dispenserId)?.dispenserName || 'N/A',
                'Product': products.find(p => p.id === n.productId)?.productName || 'N/A',
                'Nozzle Name': n.nozzleName,
                'Category': categories.find(c => c.id === n.category)?.name || 'N/A',
                'Last Reading': n.lastReading,
                'Total Volume (Ltr)': selectedShiftId === 'all' ? n.totalVolume?.toFixed(2) : n.totalVolume,
                'Total Sales (PKR)': selectedShiftId === 'all' ? n.totalSales?.toFixed(2) : n.totalSales,
                'Last Updated': n.lastUpdated ? moment(n.lastUpdated.toDate()).format('YYYY-MM-DD HH:mm:ss') : 'N/A'
            }));
            const fileName = selectedShiftId === 'all' ? 'Nozzles_All_Shifts' : `Nozzles_Shift_${moment(shifts.find(s => s.id === selectedShiftId)?.startTime.toDate()).format('YYYYMMDD')}`;
            exportToExcel(dataToExport, fileName);
            message.success("Data exported successfully");
        } finally {
            setExporting(false);
        }
    };

    const columns = [
        { title: 'Dispenser', dataIndex: 'dispenserId', key: 'dispenserId', render: id => dispensers.find(d => d.id === id)?.dispenserName || 'Unknown', filters: dispensers.map(d => ({ text: d.dispenserName, value: d.id })), onFilter: (value, record) => record.dispenserId === value },
        { title: 'Product', dataIndex: 'productId', key: 'productId', render: id => products.find(p => p.id === id)?.productName || 'Unknown', filters: products.map(p => ({ text: p.productName, value: p.id })), onFilter: (value, record) => record.productId === value },
        { title: 'Nozzle Name', dataIndex: 'nozzleName', key: 'nozzleName', sorter: (a, b) => a.nozzleName.localeCompare(b.nozzleName) },
        { title: 'Category', dataIndex: 'category', key: 'category', render: id => categories.find(c => c.id === id)?.name || 'Unknown', filters: categories.map(c => ({ text: c.name, value: c.id })), onFilter: (value, record) => record.category === value },
        { title: 'Last Reading', dataIndex: 'lastReading', key: 'lastReading', sorter: (a, b) => a.lastReading - b.lastReading, render: val => selectedShiftId === 'all' ? val : 'N/A' },
        { title: 'Total Volume (Ltr)', dataIndex: 'totalVolume', key: 'totalVolume', render: vol => `${vol?.toFixed(2) || '0.00'}`, sorter: (a, b) => (a.totalVolume || 0) - (b.totalVolume || 0) },
        { title: 'Total Sales (PKR)', dataIndex: 'totalSales', key: 'totalSales', render: sales => `₨${sales?.toFixed(2) || '0.00'}`, sorter: (a, b) => (a.totalSales || 0) - (b.totalSales || 0) },
        { title: 'Last Updated', dataIndex: 'lastUpdated', key: 'lastUpdated', render: date => selectedShiftId === 'all' && date ? moment(date.toDate()).format('DD/MM/YYYY HH:mm:ss') : 'N/A', sorter: (a, b) => (a.lastUpdated?.toDate() || 0) - (b.lastUpdated?.toDate() || 0) },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title="Record Reading"><Button type="primary" icon={<DashboardOutlined />} onClick={() => showReadingModal(record)} size="small" /></Tooltip>
                    <Tooltip title="View History"><Button icon={<HistoryOutlined />} onClick={() => fetchReadingHistory(record.id)} size="small" /></Tooltip>
                    <Tooltip title="Edit"><Button icon={<EditOutlined />} onClick={() => showModal(record)} size="small" disabled={!isAdmin} /></Tooltip>
                    <Popconfirm title="Are you sure?" onConfirm={() => handleDelete(record.id)} disabled={!isAdmin}>
                        <Button danger icon={deleteLoading === record.id ? <LoadingOutlined /> : <DeleteOutlined />} size="small" disabled={!isAdmin || deleteLoading} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const readingHistoryColumns = [
        { title: 'Date', dataIndex: 'timestamp', key: 'timestamp', render: ts => moment(ts.toDate()).format('DD/MM/YYYY HH:mm'), sorter: (a, b) => a.timestamp.seconds - b.timestamp.seconds, defaultSortOrder: 'descend' },
        { title: 'Prev Reading', dataIndex: 'previousReading', key: 'previousReading' },
        { title: 'Curr Reading', dataIndex: 'currentReading', key: 'currentReading' },
        { title: 'Sales Volume', dataIndex: 'salesVolume', key: 'salesVolume', render: vol => vol.toFixed(2) },
        { title: 'Sales (PKR)', dataIndex: 'salesAmount', key: 'salesAmount', render: amount => `₨${amount?.toFixed(2)}` },
        { title: 'Tank', dataIndex: 'tankId', key: 'tankId', render: id => tanks.find(t => t.id === id)?.tankName || 'Unknown' },
        { title: 'Shift', dataIndex: 'shiftId', key: 'shiftId', render: id => { const shift = shifts.find(s => s.id === id); return shift ? `${moment(shift.startTime.toDate()).format('DD/MM HH:mm')}` : 'N/A'; } },
        {
            title: 'Actions', key: 'actions', render: (_, record) => (
                <Space size="small">
                    <Tooltip title="Edit Reading"><Button icon={<EditOutlined />} onClick={() => showReadingModal(selectedNozzle, record)} size="small" disabled={!isAdmin || readingSubmitting} /></Tooltip>
                    <Popconfirm title="Delete this reading? This will revert stock and sales." onConfirm={() => handleDeleteReading(record)} disabled={!isAdmin || readingDeleteLoading}>
                        <Button danger icon={readingDeleteLoading === record.id ? <LoadingOutlined /> : <DeleteOutlined />} size="small" disabled={!isAdmin || readingDeleteLoading} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="nozzle-management-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <Title level={3} style={{ margin: 0 }}>Nozzle Management</Title>
                <Space wrap>
                    <Select
                        value={selectedShiftId}
                        onChange={setSelectedShiftId}
                        style={{ width: 220 }}
                        loading={!shifts.length}
                    >
                        <Option value="all">All Shifts (Cumulative)</Option>
                        {shifts.map(shift => (
                            <Option key={shift.id} value={shift.id}>
                                {`Shift: ${moment(shift.startTime.toDate()).format('DD MMM, hh:mm A')}`}
                            </Option>
                        ))}
                    </Select>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()} disabled={!isAdmin}>Add Nozzle</Button>
                    <Button icon={<FileExcelOutlined />} onClick={handleExportToExcel} loading={exporting}>Export</Button>
                </Space>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={12} md={8}>
                    <Statistic title="Total Sales (PKR)" value={displayData.totalSales} precision={2} prefix="₨" />
                </Col>
                <Col xs={24} sm={12} md={8}>
                    <Statistic title="Total Volume (Liters)" value={displayData.totalVolume} precision={2} suffix=" Ltr" />
                </Col>
            </Row>

            <Table columns={columns} dataSource={displayData.nozzles} rowKey="id" loading={loading || isFilteringByShift} pagination={{ pageSize: 10 }} bordered scroll={{ x: 'max-content' }} />

            <Modal title={editingId ? "Edit Nozzle" : "Add New Nozzle"} open={isModalVisible} onCancel={handleCancel} footer={null}>
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item name="dispenserId" label="Dispenser" rules={[{ required: true }]}><Select placeholder="Select dispenser">{dispensers.map(d => <Option key={d.id} value={d.id}>{d.dispenserName}</Option>)}</Select></Form.Item>
                    <Form.Item name="productId" label="Product" rules={[{ required: true }]}><Select placeholder="Select product">{products.map(p => <Option key={p.id} value={p.id}>{p.productName}</Option>)}</Select></Form.Item>
                    <Form.Item name="nozzleName" label="Nozzle Name" rules={[{ required: true }]}><Input placeholder="Enter nozzle name" /></Form.Item>
                    <Form.Item name="category" label="Category" rules={[{ required: true }]}><Select placeholder="Select category">{categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}</Select></Form.Item>
                    <Form.Item name="openingReading" label="Opening Reading" rules={[{ required: true }, { type: 'number', min: 0 }]}><InputNumber min={0} style={{ width: '100%' }} placeholder="Enter opening reading" disabled={!!editingId || !isAdmin} /></Form.Item>
                    <Form.Item><Space style={{ float: 'right' }}><Button onClick={handleCancel}>Cancel</Button><Button type="primary" htmlType="submit" loading={submitLoading}>{editingId ? 'Update' : 'Create'}</Button></Space></Form.Item>
                </Form>
            </Modal>

            <Modal title={editingReading ? "Edit Reading" : "Record Reading"} open={isReadingModalOpen} onCancel={handleReadingCancel} footer={null}>
                {selectedNozzle && (
                    <Form form={readingForm} layout="vertical" onFinish={editingReading ? handleUpdateReading : handleReadingSubmit}>
                        <Form.Item name="previousReading" label="Previous Reading" rules={[{ required: true }, { type: 'number', min: 0 }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
                        <Form.Item name="currentReading" label="Current Reading" rules={[{ required: true }, { type: 'number', min: 0 }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
                        <Form.Item name="tankId" label="Select Tank" rules={[{ required: true }]}><Select placeholder="Select tank">{tanks.map(tank => <Option key={tank.id} value={tank.id}>{tank.tankName} (Stock: {tank.remainingStock?.toFixed(2) || 0})</Option>)}</Select></Form.Item>
                        <Form.Item name="newPrice" label="Effective Price (PKR) - Optional"><InputNumber min={0} style={{ width: '100%' }} formatter={v => `₨ ${v}`} parser={v => v.replace(/₨\s?|(,*)/g, '')} /></Form.Item>
                        <Form.Item name="recordedAt" label="Recorded At" rules={[{ required: true }]}><Input type="datetime-local" disabled={!isAdmin && !!editingReading} /></Form.Item>
                        <Form.Item name="fuelType" label="Fuel Type" rules={[{ required: true }]}><Select placeholder="Select fuel type"><Option value="Fuel">Fuel</Option><Option value="Non-Fuel">Non-Fuel</Option></Select></Form.Item>
                        <Form.Item><Space style={{ float: 'right' }}><Button onClick={handleReadingCancel}>Cancel</Button><Button type="primary" htmlType="submit" loading={editingReading ? readingSubmitting : recordReadingLoading}>{editingReading ? 'Update' : 'Record'}</Button></Space></Form.Item>
                    </Form>
                )}
            </Modal>

            <Modal title={`Reading History for ${selectedNozzle?.nozzleName || ''}`} open={isHistoryModalVisible} onCancel={handleHistoryCancel} footer={null} width={1000}>
                <Table dataSource={readingHistory} columns={readingHistoryColumns} rowKey="id" pagination={{ pageSize: 5 }} scroll={{ x: 'max-content' }} />
            </Modal>
        </div>
    );
};

export default NozzleManagement;