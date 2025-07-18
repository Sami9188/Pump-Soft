import React, { useState, useEffect, useMemo } from 'react';
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
    query,
    orderBy,
    writeBatch,
    where,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import * as XLSX from 'xlsx';
import { useAuth } from '../../../../context/AuthContext';

const { Option } = Select;

const PurchaseInvoiceManagement = () => {
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
    const [selectedSupplier, setSelectedSupplier] = useState('all');

    // Compute filtered invoices based on selected supplier
    const filteredInvoices = useMemo(() => {
        return selectedSupplier === 'all'
            ? invoices
            : invoices.filter((inv) => inv.supplierId === selectedSupplier);
    }, [invoices, selectedSupplier]);

    // Data Fetching
    useEffect(() => {
        fetchInvoices();
        fetchSuppliers();
        fetchProducts();
        fetchTanks();
    }, []);

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'purchaseInvoices'),
                orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);
            const list = snap.docs.map((d) => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    date: data.date?.toDate() || null,
                    createdAt: data.createdAt?.toDate() || null,
                    updatedAt: data.updatedAt?.toDate() || null,
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

    // Stock Management Functions
    const updateTankRemainingStock = async (tankId, qtyDiff) => {
        const tankRef = doc(db, 'tanks', tankId);
        try {
            const newStock = await runTransaction(db, async (tx) => {
                const tankDoc = await tx.get(tankRef);
                if (!tankDoc.exists()) throw new Error('Tank not found');
                const current = tankDoc.data().remainingStock || 0;
                const newRemaining = current + qtyDiff;
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
                const data = productDoc.data();
                const current = data.remainingStockAfter !== undefined
                    ? data.remainingStockAfter
                    : (data.inventory || 0);
                const updated = current + qtyDiff;
                tx.update(productRef, {
                    inventory: updated,
                    remainingStockAfter: updated,
                    lastUpdated: Timestamp.now()
                });
                return updated;
            });
            message.success('Product inventory updated');
            return newStock;
        } catch (err) {
            message.error('Failed to update product inventory: ' + err.message);
            throw err;
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

    // Modal and Form Handling
    const showModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            const dt = record.date || new Date();
            const dateStr = dt.toISOString().slice(0, 10);
            const timeStr = dt.toTimeString().slice(0, 8);
            form.setFieldsValue({
                supplierId: record.supplierId,
                purchaseType: record.purchaseType,
                date: dateStr,
                time: timeStr,
                productId: record.productId,
                tankId: record.purchaseType === 'fuel' ? record.tankId : undefined,
                quantity: record.quantity,
                unitPrice: record.unitPrice,
            });
            setCurrentPurchaseType(record.purchaseType);
        } else {
            setEditingId(null);
            form.resetFields();
            const now = new Date();
            form.setFieldsValue({
                date: now.toISOString().slice(0, 10),
                time: now.toTimeString().slice(0, 8),
                purchaseType: 'fuel',
            });
            setCurrentPurchaseType('fuel');
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        form.resetFields();
    };

    const handleSubmit = async (values) => {
        if (!user) {
            message.error('You must be logged in to perform this action.');
            return;
        }
        setSubmitting(true);
        try {
            const dt = new Date(`${values.date}T${values.time}`);
            const ts = Timestamp.fromDate(dt);
            const payload = {
                ...values,
                date: ts,
                updatedAt: Timestamp.now(),
            };
            delete payload.time;

            const sup = suppliers.find((s) => s.id === values.supplierId);
            payload.supplierName = sup?.accountName || 'Unknown';
            const prod = products.find((p) => p.id === values.productId);
            payload.productName = prod?.productName || 'Unknown';

            if (values.purchaseType === 'fuel') {
                const tank = tanks.find((t) => t.id === values.tankId);
                payload.tankName = tank?.tankName || 'Unknown';
            } else {
                payload.tankId = '';
                payload.tankName = 'N/A';
            }

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

            payload.shiftId = selectedShift.id;

            const original = editingId ? invoices.find((inv) => inv.id === editingId) : null;
            let newStock;

            if (editingId) {
                if (!(user.role?.includes('admin') || original.createdBy === user.uid)) {
                    message.error('You are not authorized to update this invoice.');
                    setSubmitting(false);
                    return;
                }

                const totalAmount = values.quantity * values.unitPrice;
                const deltaQuantity = values.quantity - original.quantity;
                if (deltaQuantity !== 0) {
                    if (values.purchaseType === 'fuel') {
                        newStock = await updateTankRemainingStock(values.tankId, deltaQuantity);
                    } else {
                        newStock = await updateProductInventory(values.productId, deltaQuantity);
                    }
                    payload.remainingStockAfter = newStock;
                } else {
                    payload.remainingStockAfter = original.remainingStockAfter;
                }

                const batch = writeBatch(db);
                const invoiceRef = doc(db, 'purchaseInvoices', editingId);
                batch.update(invoiceRef, payload);

                if (original.cashflowId) {
                    const cashflowRef = doc(db, 'cashflow', original.cashflowId);
                    batch.update(cashflowRef, {
                        amount: totalAmount,
                        updatedAt: serverTimestamp()
                    });
                } else {
                    const cashflowRef = doc(collection(db, 'cashflow'));
                    const cashflowData = {
                        amount: totalAmount,
                        type: 'cashOut',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        invoiceId: editingId,
                        cashflowCategory: 'purchaseInoices',
                    };
                    batch.set(cashflowRef, cashflowData);
                    batch.update(invoiceRef, { cashflowId: cashflowRef.id });
                }

                await batch.commit();
                message.success('Invoice updated');
            } else {
                const totalAmount = values.quantity * values.unitPrice;

                if (values.purchaseType === 'fuel') {
                    newStock = await updateTankRemainingStock(values.tankId, values.quantity);
                } else {
                    newStock = await updateProductInventory(values.productId, values.quantity);
                }
                payload.remainingStockAfter = newStock;

                const batch = writeBatch(db);
                const invoiceRef = doc(collection(db, 'purchaseInvoices'));
                const cashflowRef = doc(collection(db, 'cashflow'));

                const cashflowData = {
                    amount: totalAmount,
                    type: 'cashOut',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    invoiceId: invoiceRef.id,
                    cashflowCategory: 'purchaseInvoices',
                };

                const invoiceData = {
                    ...payload,
                    cashflowId: cashflowRef.id,
                    createdAt: Timestamp.now(),
                    createdBy: user.uid,
                };

                batch.set(invoiceRef, invoiceData);
                batch.set(cashflowRef, cashflowData);
                await batch.commit();

                await logProductTransaction({
                    productId: values.productId,
                    productName: payload.productName,
                    eventType: 'purchase',
                    quantity: values.quantity,
                    unitPrice: values.unitPrice,
                    customDate: ts,
                    tankId: values.purchaseType === 'fuel' ? values.tankId : undefined,
                    tankName: values.purchaseType === 'fuel' ? payload.tankName : undefined,
                    remainingStockAfter: newStock,
                    shiftId: selectedShift.id,
                });

                message.success('Invoice created');
            }

            setIsModalVisible(false);
            fetchInvoices();
        } catch (err) {
            message.error('Operation failed: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (!user) {
            message.error('You must be logged in to perform this action.');
            return;
        }
        setDeletingId(id);
        try {
            const inv = invoices.find((i) => i.id === id);
            if (!inv) throw new Error('Invoice not found');
            if (!(user.role?.includes('admin') || inv.createdBy === user.uid)) {
                message.error('You are not authorized to delete this invoice.');
                setDeletingId(null);
                return;
            }

            await deleteDoc(doc(db, 'purchaseInvoices', id));
            if (inv.cashflowId) {
                await deleteDoc(doc(db, 'cashflow', inv.cashflowId));
            }

            let newStock;
            if (inv.purchaseType === 'fuel') {
                newStock = await updateTankRemainingStock(inv.tankId, -inv.quantity);
                await logProductTransaction({
                    productId: inv.productId,
                    productName: inv.productName,
                    eventType: 'purchase-return-delete',
                    quantity: inv.quantity,
                    unitPrice: inv.unitPrice,
                    customDate: inv.date,
                    tankId: inv.tankId,
                    tankName: inv.tankName,
                    remainingStockAfter: newStock,
                });
            } else {
                newStock = await updateProductInventory(inv.productId, -inv.quantity);
                await logProductTransaction({
                    productId: inv.productId,
                    productName: inv.productName,
                    eventType: 'purchase-return-delete',
                    quantity: inv.quantity,
                    unitPrice: inv.unitPrice,
                    customDate: inv.date,
                    remainingStockAfter: newStock,
                });
            }

            message.success('Invoice deleted');
            fetchInvoices();
        } catch (err) {
            message.error('Delete failed: ' + err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const confirmDelete = (id) => {
        Modal.confirm({
            title: 'Delete this invoice?',
            okText: 'Yes',
            okType: 'danger',
            cancelText: 'No',
            onOk: () => handleDelete(id),
        });
    };

    // Export to Excel
    const exportToExcel = () => {
        const ws = XLSX.utils.json_to_sheet(
            filteredInvoices.map((inv) => ({
                Supplier: suppliers.find((s) => s.id === inv.supplierId)?.accountName || 'Unknown',
                Date: inv.date ? inv.date.toLocaleDateString() : '',
                'Purchase Type': inv.purchaseType === 'fuel' ? 'Diesel/Petrol' : 'Mobiles/Other',
                Product: products.find((p) => p.id === inv.productId)?.productName || 'Unknown',
                Tank:
                    inv.purchaseType === 'fuel'
                        ? tanks.find((t) => t.id === inv.tankId)?.tankName || 'Unknown'
                        : 'N/A',
                'Quantity (Liters)': inv.quantity,
                'Unit Price': inv.unitPrice,
                Total: (inv.quantity * inv.unitPrice).toFixed(2),
                'Remaining Stock After': inv.remainingStockAfter !== undefined ? inv.remainingStockAfter.toFixed(2) : 'N/A',
            }))
        );
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Purchase Invoices');
        XLSX.writeFile(wb, 'purchase_invoices.xlsx');
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
            render: (d) => (d ? d.toLocaleDateString() : ''),
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
                    ? tanks.find((t) => t.id === tid)?.tankName || 'Unknown'
                    : 'N/A',
        },
        { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
        { title: 'Unit Price', dataIndex: 'unitPrice', key: 'unitPrice' },
        {
            title: 'Total',
            key: 'total',
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
                                onClick={() => confirmDelete(rec.id)}
                                loading={deletingId === rec.id}
                                style={{ marginLeft: 8 }}
                                disabled={loading || submitting}
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
                <Col>
                    <h2>Purchase Invoices</h2>
                </Col>
                <Col>
                    <Select
                        style={{ width: 200, marginRight: 16 }}
                        placeholder="Select supplier"
                        onChange={(value) => setSelectedSupplier(value || 'all')}
                        value={selectedSupplier}
                    >
                        <Option value="all">All Suppliers</Option>
                        {suppliers.map((s) => (
                            <Option key={s.id} value={s.id}>
                                {s.accountName}
                            </Option>
                        ))}
                    </Select>
                    <Button
                        type="primary"
                        onClick={() => showModal()}
                        style={{ marginRight: 8 }}
                        disabled={loading || submitting || !user}
                    >
                        Add Purchase Invoice
                    </Button>
                    <Button onClick={exportToExcel} disabled={loading || submitting}>
                        Export to Excel
                    </Button>
                </Col>
            </Row>
            <div style={{ overflowX: 'auto' }}>
                <Table dataSource={filteredInvoices} columns={columns} rowKey="id" loading={loading} />
            </div>

            <Modal
                title={editingId ? 'Edit Purchase Invoice' : 'Add Purchase Invoice'}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
            >
                <Form
                    form={form}
                    onFinish={handleSubmit}
                    layout="vertical"
                    onValuesChange={(changed) => {
                        if (changed.purchaseType) {
                            setCurrentPurchaseType(changed.purchaseType);
                            form.setFieldsValue({ productId: undefined, tankId: undefined });
                        }
                    }}
                >
                    <Form.Item
                        name="supplierId"
                        label="Supplier"
                        rules={[{ required: true, message: 'Please select a supplier' }]}
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
                                        {p.productName || p.name || 'Unnamed Product'}
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
                        rules={[{ required: true, message: 'Please enter quantity' }]}
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                        name="unitPrice"
                        label="Unit Price"
                        rules={[{ required: true, message: 'Please enter unit price' }]}
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

export default PurchaseInvoiceManagement;