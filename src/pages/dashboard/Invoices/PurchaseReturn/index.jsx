import React, { useState, useEffect } from 'react';
import {
    Table,
    Button,
    Modal,
    Form,
    Input,
    InputNumber,
    message,
    Select,
    Row,
    Col,
    Typography,
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
    Timestamp, writeBatch, serverTimestamp,
    query,
    where,
    orderBy
} from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import * as XLSX from 'xlsx';
import { useAuth } from '../../../../context/AuthContext';

const { Title } = Typography;
const { Option } = Select;

const PurchaseReturnInvoiceManagement = () => {
    const [invoices, setInvoices] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [products, setProducts] = useState([]);
    const [tanks, setTanks] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [currentPurchaseType, setCurrentPurchaseType] = useState('fuel');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const { user } = useAuth();

    useEffect(() => {
        fetchInvoices();
        fetchSuppliers();
        fetchProducts();
        fetchTanks();
    }, []);

    // Fetch Functions
    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'purchaseReturnInvoices'));
            const list = snap.docs.map((d) => {
                const data = d.data();
                const parseDate = (val) => (val?.toDate ? val.toDate() : new Date(val));
                return {
                    id: d.id,
                    ...data,
                    purchaseType: data.purchaseType || 'fuel',
                    date: parseDate(data.date),
                    createdAt: data.createdAt ? parseDate(data.createdAt) : null,
                    updatedAt: data.updatedAt ? parseDate(data.updatedAt) : null,
                };
            });
            setInvoices(list);
        } catch (err) {
            message.error('Failed to fetch invoices: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const snap = await getDocs(collection(db, 'accounts'));
            const list = snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((a) => a.accountType === 'supplier');
            setSuppliers(list);
        } catch (err) {
            message.error('Failed to fetch suppliers: ' + err.message);
        }
    };

    const fetchProducts = async () => {
        try {
            const snap = await getDocs(collection(db, 'products'));
            setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (err) {
            message.error('Failed to fetch products: ' + err.message);
        }
    };

    const fetchTanks = async () => {
        try {
            const snap = await getDocs(collection(db, 'tanks'));
            setTanks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (err) {
            message.error('Failed to fetch tanks: ' + err.message);
        }
    };

    // Inventory Adjustment Helpers
    const updateTankRemainingStock = async (tankId, qtyDiff) => {
        const tankRef = doc(db, 'tanks', tankId);
        try {
            const newStock = await runTransaction(db, async (tx) => {
                const tankDoc = await tx.get(tankRef);
                if (!tankDoc.exists()) throw new Error('Tank not found');
                const current = tankDoc.data().remainingStock || 0;
                const newRemaining = current + qtyDiff;
                if (newRemaining < 0) throw new Error('Stock cannot be negative');
                tx.update(tankRef, { remainingStock: newRemaining, lastUpdated: new Date() });
                return newRemaining;
            });
            message.success('Tank stock updated');
            return newStock;
        } catch (err) {
            message.error('Failed to update tank stock: ' + err.message);
            throw err;
        }
    };

    const updateProductInventory = async (productId, qtyDiff) => {
        const productRef = doc(db, 'products', productId);
        try {
            const newStock = await runTransaction(db, async (tx) => {
                const productDoc = await tx.get(productRef);
                if (!productDoc.exists()) throw new Error('Product not found');
                const current = productDoc.data().inventory || 0;
                const newInventory = current + qtyDiff;
                if (newInventory < 0) throw new Error('Inventory cannot be negative');
                tx.update(productRef, { inventory: newInventory });
                return newInventory;
            });
            message.success('Product inventory updated');
            return newStock;
        } catch (err) {
            message.error('Failed to update product inventory: ' + err.message);
            throw err;
        }
    };

    // Product Transaction Logging Helper
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
            };
            if (tankId) {
                payload.tankId = tankId;
                payload.tankName = tankName;
            }
            if (remainingStockAfter !== undefined) {
                payload.remainingStockAfter = remainingStockAfter;
            }
            await addDoc(collection(db, 'productTransactions'), payload);
        } catch (err) {
            message.error('Transaction log error: ' + err.message);
        }
    };

    // Modal Handlers
    const showModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            setCurrentPurchaseType(record.purchaseType || 'fuel');
            const dt = record.date || new Date();
            form.setFieldsValue({
                supplierId: record.supplierId,
                purchaseType: record.purchaseType || 'fuel',
                date: dt.toISOString().slice(0, 10),
                time: dt.toTimeString().slice(0, 8),
                productId: record.productId,
                tankId: record.purchaseType === 'fuel' ? record.tankId : undefined,
                quantity: record.quantity,
                unitPrice: record.unitPrice,
            });
        } else {
            setEditingId(null);
            setCurrentPurchaseType('fuel');
            form.resetFields();
            const now = new Date();
            form.setFieldsValue({
                date: now.toISOString().slice(0, 10),
                time: now.toTimeString().slice(0, 8),
                purchaseType: 'fuel',
            });
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        form.resetFields();
    };

    // Submit Handler (Create/Update)
    const handleSubmit = async (values) => {
        if (!user) {
            message.error('You must be logged in to perform this action.');
            return;
        }
        setSubmitting(true);
        try {
            const dt = new Date(`${values.date}T${values.time}`);
            const ts = Timestamp.fromDate(dt);
            const sup = suppliers.find((s) => s.id === values.supplierId);
            const prod = products.find((p) => p.id === values.productId);
            const tank = values.purchaseType === 'fuel' ? tanks.find((t) => t.id === values.tankId) : null;

            // Find the appropriate shift
            const transactionDate = ts;
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

            const payload = {
                supplierId: values.supplierId,
                purchaseType: values.purchaseType,
                date: ts,
                productId: values.productId,
                tankId: values.purchaseType === 'fuel' ? values.tankId : '',
                quantity: values.quantity,
                unitPrice: values.unitPrice,
                amount: values.quantity * values.unitPrice,
                supplierName: sup?.accountName || 'Unknown',
                productName: prod?.productName || 'Unknown',
                tankName: values.purchaseType === 'fuel' ? (tank?.tankName || 'Unknown') : 'N/A',
                shiftId: selectedShift.id,
                updatedAt: Timestamp.now(),
            };

            let original = null;
            let newStock;

            if (editingId) {
                original = invoices.find((inv) => inv.id === editingId);
                if (!(user.role?.includes('admin') || original.createdBy === user.uid)) {
                    message.error('You are not authorized to update this invoice.');
                    setSubmitting(false);
                    return;
                }

                // Reverse original purchase return (increase stock)
                let intermediateStock;
                if (original.purchaseType === 'fuel') {
                    intermediateStock = await updateTankRemainingStock(original.tankId, original.quantity);
                } else {
                    intermediateStock = await updateProductInventory(original.productId, original.quantity);
                }

                // Log reversal transaction
                await logProductTransaction({
                    productId: original.productId,
                    productName: original.productName,
                    eventType: 'purchase-return-reversal',
                    quantity: original.quantity,
                    unitPrice: original.unitPrice,
                    customDate: ts,
                    tankId: original.purchaseType === 'fuel' ? original.tankId : undefined,
                    tankName: original.purchaseType === 'fuel' ? original.tankName : undefined,
                    remainingStockAfter: intermediateStock,
                    shiftId: selectedShift.id,
                });

                // Apply new purchase return (decrease stock)
                if (values.purchaseType === 'fuel') {
                    newStock = await updateTankRemainingStock(values.tankId, -values.quantity);
                } else {
                    newStock = await updateProductInventory(values.productId, -values.quantity);
                }

                // Log new purchase return transaction
                await logProductTransaction({
                    productId: values.productId,
                    productName: prod?.productName || 'Unknown',
                    eventType: 'purchase-return',
                    quantity: values.quantity,
                    unitPrice: values.unitPrice,
                    customDate: ts,
                    tankId: values.purchaseType === 'fuel' ? values.tankId : undefined,
                    tankName: values.purchaseType === 'fuel' ? payload.tankName : undefined,
                    remainingStockAfter: newStock,
                    shiftId: selectedShift.id,
                });

                // Update invoice and cashflow using batch
                const batch = writeBatch(db);
                const invoiceRef = doc(db, 'purchaseReturnInvoices', editingId);
                const totalAmount = values.quantity * values.unitPrice;

                if (original.cashflowId) {
                    const cashflowRef = doc(db, 'cashflow', original.cashflowId);
                    batch.update(cashflowRef, {
                        amount: totalAmount,
                        cashflowCategory: 'purchaseReturnInvoices',
                        updatedAt: serverTimestamp(),
                    });
                } else {
                    const cashflowRef = doc(collection(db, 'cashflow'));
                    const cashflowData = {
                        amount: totalAmount,
                        type: 'cashIn',
                        cashflowCategory: 'purchaseReturnInvoices',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        invoiceId: editingId,
                        createdBy: user.uid,
                    };
                    batch.set(cashflowRef, cashflowData);
                    batch.update(invoiceRef, { cashflowId: cashflowRef.id });
                }

                payload.remainingStockAfter = newStock;
                batch.update(invoiceRef, payload);
                await batch.commit();

                message.success('Purchase return invoice updated');
            } else {
                // Create new purchase return invoice
                const batch = writeBatch(db);
                const invoiceRef = doc(collection(db, 'purchaseReturnInvoices'));
                const cashflowRef = doc(collection(db, 'cashflow'));

                const totalAmount = values.quantity * values.unitPrice;

                const cashflowData = {
                    amount: totalAmount,
                    type: 'cashIn',
                    cashflowCategory: 'purchaseReturnInvoices',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    invoiceId: invoiceRef.id,
                    createdBy: user.uid,
                };

                // Update stock first
                if (values.purchaseType === 'fuel') {
                    newStock = await updateTankRemainingStock(values.tankId, -values.quantity);
                } else {
                    newStock = await updateProductInventory(values.productId, -values.quantity);
                }

                const invoiceData = {
                    ...payload,
                    remainingStockAfter: newStock,
                    cashflowId: cashflowRef.id,
                    createdAt: Timestamp.now(),
                    createdBy: user.uid,
                };

                batch.set(invoiceRef, invoiceData);
                batch.set(cashflowRef, cashflowData);
                await batch.commit();

                // Log transaction
                await logProductTransaction({
                    productId: values.productId,
                    productName: prod?.productName || 'Unknown',
                    eventType: 'purchase-return',
                    quantity: values.quantity,
                    unitPrice: values.unitPrice,
                    customDate: ts,
                    tankId: values.purchaseType === 'fuel' ? values.tankId : undefined,
                    tankName: values.purchaseType === 'fuel' ? payload.tankName : undefined,
                    remainingStockAfter: newStock,
                    shiftId: selectedShift.id,
                });

                message.success('Purchase return invoice created');
            }

            setIsModalVisible(false);
            fetchInvoices();
        } catch (err) {
            message.error('Operation failed: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    // Delete Handler
    const handleDelete = (id) => {
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
                setDeletingId(id);
                try {
                    const inv = invoices.find((i) => i.id === id);
                    if (!inv) throw new Error('Invoice not found');
                    if (!(user.role?.includes('admin') || inv.createdBy === user.uid)) {
                        message.error('You are not authorized to delete this invoice.');
                        setDeletingId(null);
                        return;
                    }

                    // Reverse purchase return (increase stock)
                    let newStock;
                    if (inv.purchaseType === 'fuel') {
                        newStock = await updateTankRemainingStock(inv.tankId, inv.quantity);
                    } else {
                        newStock = await updateProductInventory(inv.productId, inv.quantity);
                    }

                    // Delete invoice and cashflow using batch
                    const batch = writeBatch(db);
                    const invoiceRef = doc(db, 'purchaseReturnInvoices', id);
                    if (inv.cashflowId) {
                        const cashflowRef = doc(db, 'cashflow', inv.cashflowId);
                        batch.delete(cashflowRef);
                    }
                    batch.delete(invoiceRef);
                    await batch.commit();

                    // Log cancellation transaction
                    await logProductTransaction({
                        productId: inv.productId,
                        productName: inv.productName,
                        eventType: 'purchase-return-delete',
                        quantity: inv.quantity,
                        unitPrice: inv.unitPrice,
                        customDate: inv.date,
                        tankId: inv.purchaseType === 'fuel' ? inv.tankId : undefined,
                        tankName: inv.purchaseType === 'fuel' ? inv.tankName : undefined,
                        remainingStockAfter: newStock,
                    });

                    message.success('Purchase return invoice deleted');
                    fetchInvoices();
                } catch (err) {
                    message.error('Delete failed: ' + err.message);
                } finally {
                    setDeletingId(null);
                }
            },
        });
    };
    // Export to Excel
    const exportToExcel = () => {
        const ws = XLSX.utils.json_to_sheet(
            invoices.map((inv) => ({
                Supplier: suppliers.find((s) => s.id === inv.supplierId)?.accountName || 'Unknown',
                Date: inv.date ? inv.date.toLocaleString() : '',
                'Purchase Type': inv.purchaseType === 'fuel' ? 'Diesel/Petrol' : 'Mobiles/Other',
                Product: products.find((p) => p.id === inv.productId)?.productName || 'Unknown',
                Tank:
                    inv.purchaseType === 'fuel'
                        ? (tanks.find((t) => t.id === inv.tankId)?.tankName || 'Unknown')
                        : 'N/A',
                'Quantity (Liters)': inv.quantity,
                'Unit Price': inv.unitPrice,
                Amount: (inv.quantity * inv.unitPrice).toFixed(2),
                'Remaining Stock After':
                    inv.remainingStockAfter !== undefined ? inv.remainingStockAfter.toFixed(2) : 'N/A',
            }))
        );
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Purchase Return Invoices');
        XLSX.writeFile(wb, 'purchase_return_invoices.xlsx');
    };

    // Table Columns
    const columns = [
        {
            title: 'Supplier',
            dataIndex: 'supplierId',
            key: 'supplierId',
            render: (id) => suppliers.find((s) => s.id === id)?.accountName || 'Unknown',
        },
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: (d) => (d ? d.toLocaleString() : ''),
        },
        {
            title: 'Purchase Type',
            dataIndex: 'purchaseType',
            key: 'purchaseType',
            render: (t) => (t === 'fuel' ? 'Diesel/Petrol' : 'Mobiles/Other'),
        },
        {
            title: 'Product',
            dataIndex: 'productId',
            key: 'productId',
            render: (pid) => products.find((p) => p.id === pid)?.productName || 'Unknown',
        },
        {
            title: 'Tank',
            dataIndex: 'tankId',
            key: 'tankId',
            render: (tid, rec) =>
                rec.purchaseType === 'fuel'
                    ? (tanks.find((t) => t.id === tid)?.tankName || 'Unknown')
                    : 'N/A',
        },
        { title: 'Quantity (Liters)', dataIndex: 'quantity', key: 'quantity' },
        { title: 'Unit Price', dataIndex: 'unitPrice', key: 'unitPrice' },
        {
            title: 'Amount',
            key: 'amount',
            render: (_, rec) => (rec.quantity * rec.unitPrice).toFixed(2),
        },
        {
            title: 'Remaining Stock After',
            dataIndex: 'remainingStockAfter',
            key: 'remainingStockAfter',
            render: (stock) => (stock !== undefined ? stock.toFixed(2) : 'N/A'),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, rec) => {
                const canEdit = user && (user.role?.includes('admin') || rec.createdBy === user.uid);
                return (
                    <>
                        {canEdit && (
                            <Button
                                icon={<EditOutlined />}
                                onClick={() => showModal(rec)}
                                disabled={loading || submitting}
                            />
                        )}
                        {canEdit && (
                            <Button
                                icon={<DeleteOutlined />}
                                danger
                                onClick={() => handleDelete(rec.id)}
                                style={{ marginLeft: 8 }}
                                disabled={loading || submitting || deletingId === rec.id}
                                loading={deletingId === rec.id}
                            />
                        )}
                    </>
                );
            },
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Row justify="space-between" style={{ marginBottom: 16 }}>
                <Title level={2}>Purchase Return Invoices</Title>
                <div>
                    <Button
                        type="primary"
                        onClick={() => showModal()}
                        style={{ marginRight: 8 }}
                        disabled={loading || submitting || !user}
                    >
                        Add Purchase Return Invoice
                    </Button>
                    <Button onClick={exportToExcel} disabled={loading || submitting}>
                        Export to Excel
                    </Button>
                </div>
            </Row>
            <div style={{ overflowX: 'auto' }}>
                <Table dataSource={invoices} columns={columns} rowKey="id" loading={loading} />
            </div>
            <Modal
                title={editingId ? 'Edit Purchase Return Invoice' : 'Add Purchase Return Invoice'}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
            >
                <Form
                    form={form}
                    onFinish={handleSubmit}
                    layout="vertical"
                    onValuesChange={(changedValues) => {
                        if (changedValues.purchaseType) {
                            setCurrentPurchaseType(changedValues.purchaseType);
                            form.setFieldsValue({ productId: undefined, tankId: undefined });
                        }
                    }}
                >
                    <Form.Item
                        name="supplierId"
                        label="Supplier"
                        rules={[{ required: true, message: 'Please select a supplier' }]}
                    >
                        <Select placeholder="Select a supplier">
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
                        rules={[{ required: true, message: 'Please select a purchase type' }]}
                    >
                        <Select placeholder="Select purchase type">
                            <Option value="fuel">Diesel/Petrol</Option>
                            <Option value="non-fuel">Mobiles/Other</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="date"
                        label="Date"
                        rules={[{ required: true, message: 'Please select a date' }]}
                    >
                        <Input type="date" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        name="time"
                        label="Time"
                        rules={[{ required: true, message: 'Please select a time' }]}
                    >
                        <Input type="time" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        name="productId"
                        label="Product"
                        rules={[{ required: true, message: 'Please select a product' }]}
                    >
                        <Select placeholder="Select product">
                            {products
                                .filter((p) => {
                                    if (currentPurchaseType === 'fuel') {
                                        return p.category === 'petrol' || p.category === 'diesel';
                                    } else {
                                        return p.category !== 'petrol' && p.category !== 'diesel';
                                    }
                                })
                                .map((p) => (
                                    <Option key={p.id} value={p.id}>
                                        {p.productName}
                                    </Option>
                                ))}
                        </Select>
                    </Form.Item>
                    {currentPurchaseType === 'fuel' && (
                        <Form.Item
                            name="tankId"
                            label="Tank"
                            rules={[{ required: true, message: 'Please select a tank' }]}
                        >
                            <Select placeholder="Select tank">
                                {tanks.map((t) => (
                                    <Option key={t.id} value={t.id}>
                                        {t.tankName}
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                    )}
                    <Form.Item
                        name="quantity"
                        label="Quantity (Liters)"
                        rules={[{ required: true, message: 'Please enter quantity in liters' }]}
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        name="unitPrice"
                        label="Unit Price (per liter)"
                        rules={[{ required: true, message: 'Please enter price per liter' }]}
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
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

export default PurchaseReturnInvoiceManagement;
