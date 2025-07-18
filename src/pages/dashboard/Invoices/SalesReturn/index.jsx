import React, { useState, useEffect } from 'react';
import {
    Table,
    Button,
    Modal,
    Form,
    message,
    Select,
    Spin,
    Row,
    InputNumber,
    DatePicker,
    TimePicker,
} from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    runTransaction,
    Timestamp,
    serverTimestamp,
    writeBatch,
    query,
    where,
    orderBy,
} from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { useAuth } from '../../../../context/AuthContext';

const { Option } = Select;

const SaleReturnInvoiceManagement = () => {
    const [invoices, setInvoices] = useState([]);
    const [products, setProducts] = useState([]);
    const [tanks, setTanks] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [currentPurchaseType, setCurrentPurchaseType] = useState('non-fuel');
    const [loading, setLoading] = useState(false);
    const [tableLoading, setTableLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [exporting, setExporting] = useState(false);

    const { user } = useAuth();
    useEffect(() => {
        fetchData();
        fetchTanks();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchInvoices(), fetchProducts()]);
        } finally {
            setLoading(false);
        }
    };

    const fetchInvoices = async () => {
        setTableLoading(true);
        try {
            const snap = await getDocs(collection(db, 'saleReturnInvoices'));
            const list = snap.docs.map(d => {
                const data = d.data();
                const toDate = v => (v?.toDate ? v.toDate() : new Date(v));
                return {
                    id: d.id,
                    ...data,
                    date: toDate(data.date),
                    remainingStockAfter: data.remainingStockAfter,
                    createdBy: data.createdBy,
                };
            });
            setInvoices(list);
        } catch (err) {
            message.error('Failed to fetch invoices: ' + err.message);
        } finally {
            setTableLoading(false);
        }
    };

    const fetchProducts = async () => {
        try {
            const snap = await getDocs(collection(db, 'products'));
            setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            message.error('Failed to fetch products: ' + err.message);
        }
    };

    const fetchTanks = async () => {
        try {
            const snap = await getDocs(collection(db, 'tanks'));
            setTanks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            message.error('Failed to fetch tanks: ' + err.message);
        }
    };

    // Utility: is this product a fuel product?
    const isFuelProduct = product => ['petrol', 'diesel'].includes(product.category);

    // Unified inventory updater: returns new remainingStock
    const updateInventory = async (productId, qtyDiff, tankId = null) => {
        const product = products.find(p => p.id === productId);
        if (!product) throw new Error('Product not found');

        // Fuel flow
        if (isFuelProduct(product)) {
            if (!tankId) throw new Error('Tank ID is required for fuel products');
            const tankRef = doc(db, 'tanks', tankId);
            const newStock = await runTransaction(db, async tx => {
                const snap = await tx.get(tankRef);
                if (!snap.exists()) throw new Error('Tank not found');
                const current = snap.data().remainingStock || 0;
                const updated = current + qtyDiff;
                if (updated < 0) throw new Error('Stock cannot be negative');
                tx.update(tankRef, { remainingStock: updated, lastUpdated: serverTimestamp() });
                return updated;
            });
            message.success('Tank stock updated');
            return newStock;
        }

        // Non-fuel flow
        const prodRef = doc(db, 'products', productId);
        const newInv = await runTransaction(db, async tx => {
            const snap = await tx.get(prodRef);
            if (!snap.exists()) throw new Error('Product not found');
            const current = snap.data().inventory || 0;
            const updated = current + qtyDiff;
            if (updated < 0) throw new Error('Stock cannot be negative');
            tx.update(prodRef, { inventory: updated });
            return updated;
        });
        message.success('Product inventory updated');
        return newInv;
    };

    const logProductTransaction = async ({
        productId,
        productName,
        eventType,
        quantity,
        unitPrice,
        customDate,
        tankId,
        tankName,
        remainingStockAfter,
    }) => {
        const payload = {
            productId,
            productName,
            eventType,
            quantity,
            unitPrice,
            total: parseFloat((quantity * unitPrice).toFixed(2)),
            date: customDate || Timestamp.now(),
            createdAt: Timestamp.now(),
            remainingStockAfter,
        };
        if (tankId) payload.tankId = tankId;
        if (tankName) payload.tankName = tankName;
        await addDoc(collection(db, 'productTransactions'), payload);
    };

    const showModal = record => {
        form.resetFields();
        if (record) {
            setEditingId(record.id);
            setCurrentPurchaseType(record.purchaseType);
            const mDate = moment(record.date);
            form.setFieldsValue({
                purchaseType: record.purchaseType,
                productId: record.productId,
                tankId: record.tankId,
                date: mDate,
                time: mDate,
                quantity: record.quantity,
                unitPrice: record.unitPrice,
            });
        } else {
            setEditingId(null);
            setCurrentPurchaseType('non-fuel');
            form.setFieldsValue({ purchaseType: 'non-fuel', date: moment(), time: moment() });
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        form.resetFields();
    };

    const handleSubmit = async values => {
        if (!user) {
            message.error('You must be logged in to perform this action.');
            return;
        }
        setSubmitting(true);
        try {
            // Combine date & time
            const combined = moment(values.date)
                .hour(values.time.hour())
                .minute(values.time.minute())
                .second(values.time.second())
                .toDate();
            const tsDate = Timestamp.fromDate(combined);

            // Find the appropriate shift
            const transactionDate = tsDate;
            const shiftsQuery = query(
                collection(db, 'shifts'),
                where('startTime', '<=', transactionDate),
                orderBy('startTime', 'desc')
            );
            const shiftsSnap = await getDocs(shiftsQuery);
            let selectedShift = null;

            for (const shiftDoc of shiftsSnap.docs) {
                const shift = shiftDoc.data();
                const shiftStartTime = shift.startTime.toDate();
                const shiftEndTime = shift.endTime ? shift.endTime.toDate() : null;
                const shiftStatus = shift.endTime ? 'ended' : 'active';

                if (shiftStatus === 'active' && transactionDate.toDate() >= shiftStartTime) {
                    selectedShift = { id: shiftDoc.id, ...shift };
                    break;
                } else if (shiftStatus === 'ended' && transactionDate.toDate() >= shiftStartTime && transactionDate.toDate() < shiftEndTime) {
                    selectedShift = { id: shiftDoc.id, ...shift };
                    break;
                }
            }

            if (!selectedShift) {
                message.error('No shift found for the selected date and time.');
                setSubmitting(false);
                return;
            }

            // Base payload
            const payload = {
                purchaseType: values.purchaseType,
                productId: values.productId,
                quantity: values.quantity,
                unitPrice: values.unitPrice,
                amount: values.quantity * values.unitPrice,
                date: tsDate,
                shiftId: selectedShift.id,
                updatedAt: serverTimestamp(),
            };

            // Find product for name
            const prod = products.find(p => p.id === values.productId);
            payload.productName = prod?.productName || 'Unknown';

            let updatedStock;

            if (editingId) {
                // Reverse original
                const existing = invoices.find(inv => inv.id === editingId);
                if (!existing) throw new Error('Invoice not found');
                if (!(user.role?.includes('admin') || existing.createdBy === user.uid)) {
                    message.error('Not authorized to update this invoice.');
                    setSubmitting(false);
                    return;
                }

                const revQty = existing.quantity;
                const revTankId = existing.purchaseType === 'fuel' ? existing.tankId : null;
                const revStock = await updateInventory(existing.productId, -revQty, revTankId);
                await logProductTransaction({
                    productId: existing.productId,
                    productName: existing.productName,
                    eventType: 'sale-return-reversal',
                    quantity: revQty,
                    unitPrice: existing.unitPrice,
                    customDate: tsDate,
                    tankId: revTankId,
                    tankName: existing.tankName,
                    remainingStockAfter: revStock,
                    shiftId: selectedShift.id,
                });

                // Apply new return
                const applyQty = values.quantity;
                const tankArg = values.purchaseType === 'fuel' ? values.tankId : null;
                updatedStock = await updateInventory(values.productId, applyQty, tankArg);
                if (values.purchaseType === 'fuel') {
                    payload.tankId = values.tankId;
                    payload.tankName = tanks.find(t => t.id === values.tankId)?.tankName || 'Unknown';
                } else {
                    payload.tankId = '';
                    payload.tankName = 'N/A';
                }
                payload.remainingStockAfter = updatedStock;

                // Use batch to update invoice and cashflow
                const batch = writeBatch(db);
                const invoiceRef = doc(db, 'saleReturnInvoices', editingId);

                if (existing.cashflowId) {
                    const cashflowRef = doc(db, 'cashflow', existing.cashflowId);
                    batch.update(cashflowRef, {
                        amount: payload.amount,
                        updatedAt: serverTimestamp(),
                        cashflowCategory: 'saleReturnInvoices',
                    });
                } else {
                    const cashflowRef = doc(collection(db, 'cashflow'));
                    const cashflowData = {
                        amount: payload.amount,
                        type: 'cashOut',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        invoiceId: editingId,
                        createdBy: user.uid,
                        cashflowCategory: 'saleReturnInvoices',
                    };
                    batch.set(cashflowRef, cashflowData);
                    batch.update(invoiceRef, { cashflowId: cashflowRef.id });
                }

                batch.update(invoiceRef, payload);
                await batch.commit();

                await logProductTransaction({
                    productId: values.productId,
                    productName: payload.productName,
                    eventType: 'sale-return',
                    quantity: applyQty,
                    unitPrice: values.unitPrice,
                    customDate: tsDate,
                    tankId: payload.tankId,
                    tankName: payload.tankName,
                    remainingStockAfter: updatedStock,
                    shiftId: selectedShift.id,
                });

                message.success('Sale return invoice updated');
            } else {
                // New return
                const retQty = values.quantity;
                const tankArg = values.purchaseType === 'fuel' ? values.tankId : null;
                updatedStock = await updateInventory(values.productId, retQty, tankArg);
                if (values.purchaseType === 'fuel') {
                    payload.tankId = values.tankId;
                    payload.tankName = tanks.find(t => t.id === values.tankId)?.tankName || 'Unknown';
                } else {
                    payload.tankId = '';
                    payload.tankName = 'N/A';
                }
                payload.remainingStockAfter = updatedStock;
                payload.createdAt = serverTimestamp();
                payload.createdBy = user.uid;

                // Use batch to create invoice and cashflow
                const batch = writeBatch(db);
                const invoiceRef = doc(collection(db, 'saleReturnInvoices'));
                const cashflowRef = doc(collection(db, 'cashflow'));

                const cashflowData = {
                    amount: payload.amount,
                    type: 'cashOut',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    invoiceId: invoiceRef.id,
                    createdBy: user.uid,
                    cashflowCategory: 'saleReturnInvoices',
                };

                const invoiceData = {
                    ...payload,
                    cashflowId: cashflowRef.id,
                };

                batch.set(invoiceRef, invoiceData);
                batch.set(cashflowRef, cashflowData);
                await batch.commit();

                await logProductTransaction({
                    productId: payload.productId,
                    productName: payload.productName,
                    eventType: 'sale-return',
                    quantity: retQty,
                    unitPrice: payload.unitPrice,
                    customDate: tsDate,
                    tankId: payload.tankId,
                    tankName: payload.tankName,
                    remainingStockAfter: updatedStock,
                    shiftId: selectedShift.id,
                });

                message.success('Sale return invoice created');
            }

            setIsModalVisible(false);
            fetchInvoices();
        } catch (err) {
            message.error('Operation failed: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = id => {
        if (!user) {
            message.error('You must be logged in to perform this action.');
            return;
        }
        Modal.confirm({
            title: 'Are you sure you want to delete this invoice?',
            okText: 'Yes',
            okType: 'danger',
            cancelText: 'No',
            onOk: async () => {
                setDeleting(id);
                try {
                    const inv = invoices.find(i => i.id === id);
                    if (!inv) throw new Error('Invoice not found');
                    if (!(user.role?.includes('admin') || inv.createdBy === user.uid)) {
                        message.error('Not authorized to delete this invoice.');
                        setDeleting(null);
                        return;
                    }

                    const cancelQty = inv.quantity;
                    const tankArg = inv.purchaseType === 'fuel' ? inv.tankId : null;
                    const revStock = await updateInventory(inv.productId, -cancelQty, tankArg);

                    // Use batch to delete invoice and cashflow
                    const batch = writeBatch(db);
                    const invoiceRef = doc(db, 'saleReturnInvoices', id);
                    if (inv.cashflowId) {
                        const cashflowRef = doc(db, 'cashflow', inv.cashflowId);
                        batch.delete(cashflowRef);
                    }
                    batch.delete(invoiceRef);
                    await batch.commit();

                    await logProductTransaction({
                        productId: inv.productId,
                        productName: inv.productName,
                        eventType: 'sale-return-delete',
                        quantity: cancelQty,
                        unitPrice: inv.unitPrice,
                        customDate: inv.date,
                        tankId: inv.tankId,
                        tankName: inv.tankName,
                        remainingStockAfter: revStock,
                    });

                    message.success('Sale return invoice deleted');
                    fetchInvoices();
                } catch (err) {
                    message.error('Delete failed: ' + err.message);
                } finally {
                    setDeleting(null);
                }
            },
        });
    };

    const exportToExcel = () => {
        setExporting(true);
        try {
            const data = invoices.map(inv => ({
                'Purchase Type': inv.purchaseType === 'fuel' ? 'Diesel/Petrol' : 'Mobiles/Other',
                Product: inv.productName,
                Tank: inv.purchaseType === 'fuel' ? inv.tankName : 'N/A',
                Date: moment(inv.date).format('YYYY-MM-DD'),
                Quantity: inv.quantity,
                'Unit Price': inv.unitPrice,
                Amount: inv.amount,
                'Remaining Stock After': inv.remainingStockAfter,
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sale Return Invoices');
            XLSX.writeFile(wb, 'sale_return_invoices.xlsx');
        } catch (err) {
            message.error('Export failed: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    const columns = [
        { title: 'Purchase Type', dataIndex: 'purchaseType', render: t => (t === 'fuel' ? 'Diesel/Petrol' : 'Mobiles/Other') },
        { title: 'Product', dataIndex: 'productName' },
        { title: 'Tank', dataIndex: 'tankName', render: (n, r) => (r.purchaseType === 'fuel' ? n : 'N/A') },
        { title: 'Date', dataIndex: 'date', render: d => moment(d).format('YYYY-MM-DD') },
        { title: 'Quantity', dataIndex: 'quantity' },
        { title: 'Unit Price', dataIndex: 'unitPrice' },
        { title: 'Amount', dataIndex: 'amount' },
        { title: 'Remaining Stock After', dataIndex: 'remainingStockAfter' },
        {
            title: 'Actions', render: (_, r) => {
                const canEdit = user && (user.role?.includes('admin') || r.createdBy === user.uid);
                return <>
                    {canEdit && <Button icon={<EditOutlined />} onClick={() => showModal(r)} disabled={tableLoading || deleting === r.id} />}
                    {canEdit && <Button icon={<DeleteOutlined />} danger onClick={() => confirmDelete(r.id)} loading={deleting === r.id} style={{ marginLeft: 8 }} disabled={tableLoading} />}
                </>;
            }
        }
    ];

    if (loading) return <div style={{ textAlign: 'center', padding: 50 }}><Spin size="large" tip="Loading data..." /></div>;

    return (
        <div>
            <Row justify="space-between" style={{ marginBottom: 20 }}>
                <h2>Sale Return Invoices</h2>
                <div style={{ display: 'flex', gap: 16 }}>
                    <Button type="primary" onClick={() => showModal()} disabled={tableLoading || !user}>Add Sale Return Invoice</Button>
                    <Button onClick={exportToExcel} loading={exporting} disabled={tableLoading || invoices.length === 0}>Export to Excel</Button>
                </div>
            </Row>
            <div style={{ overflowX: 'auto' }}>
                <Table dataSource={invoices} columns={columns} rowKey="id" loading={tableLoading} pagination={false} />
            </div>
            <Modal
                title={editingId ? 'Edit Sale Return Invoice' : 'Add Sale Return Invoice'}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
                maskClosable={!submitting}
                closable={!submitting}
            >
                <Form form={form} onFinish={handleSubmit} layout="vertical" onValuesChange={changed => {
                    if (changed.purchaseType) {
                        setCurrentPurchaseType(changed.purchaseType);
                        form.setFieldsValue({ productId: undefined, tankId: undefined });
                    }
                }}>
                    <Form.Item name="purchaseType" label="Purchase Type" rules={[{ required: true }]}>
                        <Select disabled={submitting}>
                            <Option value="fuel">Diesel/Petrol</Option>
                            <Option value="non-fuel">Mobiles/Other</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="productId" label="Product" rules={[{ required: true }]}>
                        <Select disabled={submitting} placeholder="Select a product">
                            {products.filter(p => currentPurchaseType === 'fuel'
                                ? ['diesel', 'petrol'].includes(p.category)
                                : !['diesel', 'petrol'].includes(p.category)
                            ).map(p => (
                                <Option key={p.id} value={p.id}>
                                    {p.productName}{currentPurchaseType === 'non-fuel' ? ` (Remaining: ${p.inventory ?? p.stock})` : ''}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    {currentPurchaseType === 'fuel' && (
                        <Form.Item name="tankId" label="Tank" rules={[{ required: true }]}>
                            <Select disabled={submitting} placeholder="Select tank">
                                {tanks.map(t => <Option key={t.id} value={t.id}>{t.tankName} (Remaining: {t.remainingStock})</Option>)}
                            </Select>
                        </Form.Item>
                    )}
                    <Form.Item name="date" label="Date" rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} disabled={submitting} />
                    </Form.Item>
                    <Form.Item name="time" label="Time" rules={[{ required: true }]}>
                        <TimePicker style={{ width: '100%' }} disabled={submitting} />
                    </Form.Item>
                    <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
                        <InputNumber min={0} style={{ width: '100%' }} disabled={submitting} />
                    </Form.Item>
                    <Form.Item name="unitPrice" label="Unit Price" rules={[{ required: true }]}>
                        <InputNumber min={0} style={{ width: '100%' }} disabled={submitting} />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
                            {editingId ? 'Update' : 'Create'}
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default SaleReturnInvoiceManagement;
