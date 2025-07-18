import React, { useState, useEffect } from 'react';
import {
    Table,
    Button,
    Modal,
    Form,
    DatePicker,
    TimePicker,
    message,
    Select,
    InputNumber,
    Row,
    Typography,
    Col,
    Space
} from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    Timestamp,
    serverTimestamp,
    runTransaction,
    query,
    orderBy,
    writeBatch, where
} from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import moment from 'moment';
import * as XLSX from 'xlsx';
import { useAuth } from '../../../../context/AuthContext';

const { Option } = Select;
const { Title } = Typography;

const SaleInvoiceManagement = () => {
    const [invoices, setInvoices] = useState([]);
    const [products, setProducts] = useState([]);
    const [tanks, setTanks] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [currentProductCategory, setCurrentProductCategory] = useState(null);

    const { user } = useAuth();
    const isAdmin = user && user.role?.includes('admin');

    useEffect(() => {
        fetchInvoices();
        fetchProducts();
        fetchTanks();
    }, []);

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'saleInvoices'),
                orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);
            // console.log('snap :>> ', snap);
            const list = snap.docs.map(d => {
                const data = d.data();
                const i = 0
                // console.log(`data :>>${i + 1}`, data);
                const parseTS = val => (val?.toDate ? val.toDate() : new Date(val));
                return {
                    id: d.id,
                    ...data,
                    date: parseTS(data.date),
                    createdAt: data.createdAt ? parseTS(data.createdAt) : null,
                    updatedAt: data.updatedAt ? parseTS(data.updatedAt) : null,
                };
            });
            // console.log('list :>> ', list);
            setInvoices(list);
        } catch (err) {
            message.error('Failed to fetch invoices: ' + err.message);
        } finally {
            setLoading(false);
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

    const isFuelProduct = product => {
        return product.category === 'petrol' || product.category === 'diesel';
    };

    const updateInventory = async (productId, qtyDiff, tankId = null) => {
        const product = products.find(p => p.id === productId);
        if (!product) throw new Error('Product not found');

        if (isFuelProduct(product)) {
            if (!tankId) throw new Error('Tank ID is required for fuel products');
            const tankRef = doc(db, 'tanks', tankId);
            try {
                const newStock = await runTransaction(db, async tx => {
                    const tankDoc = await tx.get(tankRef);
                    if (!tankDoc.exists()) throw new Error('Tank not found');
                    const current = tankDoc.data().remainingStock || 0;
                    console.log('current :>> ', tankDoc.data());
                    console.log('qtyDiff :>> ', qtyDiff);
                    const newStock = current + qtyDiff;
                    if (qtyDiff < 0 && newStock < 0) {
                        throw new Error(`Insufficient stock in tank: available ${current}, required ${-qtyDiff}`);
                    }
                    tx.update(tankRef, { remainingStockAfter: newStock });
                    return newStock;
                });
                message.success('Tank stock updated');
                return newStock;
            } catch (err) {
                message.error(err.message);
                throw err;
            }
        } else {
            const productRef = doc(db, 'products', productId);
            try {
                const newInv = await runTransaction(db, async tx => {
                    const productDoc = await tx.get(productRef);
                    if (!productDoc.exists()) throw new Error('Product not found');
                    const current = productDoc.data().remainingStockAfter || 0;
                    const newInv = current + qtyDiff;
                    if (qtyDiff < 0 && newInv < 0) {
                        throw new Error(`Insufficient stock for product: available ${current}, required ${-qtyDiff}`);
                    }
                    tx.update(productRef, { remainingStockAfter: newInv });
                    return newInv;
                });
                message.success('Product inventory updated');
                return newInv;
            } catch (err) {
                message.error(err.message);
                throw err;
            }
        }
    };

    const logProductTransaction = async ({ productId, productName, eventType, quantity, unitPrice, customDate, tankId, tankName, remainingStockAfter }) => {
        try {
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
            if (tankId && tankName) {
                payload.tankId = tankId;
                payload.tankName = tankName;
            }
            await addDoc(collection(db, 'productTransactions'), payload);
        } catch (err) {
            message.error('Transaction log error: ' + err.message);
        }
    };

    const showModal = record => {
        form.resetFields();
        if (record) {
            setEditingId(record.id);
            const product = products.find(p => p.id === record.productId);
            setCurrentProductCategory(product ? product.category : null);
            form.setFieldsValue({
                date: record.date ? moment(record.date) : null,
                time: record.date ? moment(record.date) : null,
                productId: record.productId,
                tankId: record.tankId || undefined,
                quantity: record.quantity,
                unitPrice: record.unitPrice,
            });
        } else {
            setEditingId(null);
            setCurrentProductCategory(null);
            form.setFieldsValue({
                date: moment(),
                time: moment(),
            });
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
            const date = values.date;
            const time = values.time;
            const combinedDate = date.clone().set({
                hour: time.hour(),
                minute: time.minute(),
                second: 0,
                millisecond: 0
            }).toDate();
            const tsDate = Timestamp.fromDate(combinedDate);
            const product = products.find(p => p.id === values.productId);
            const isFuel = isFuelProduct(product);
            const tankId = isFuel ? values.tankId : null;

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

            const payload = {
                productId: values.productId,
                quantity: values.quantity,
                unitPrice: values.unitPrice,
                amount: values.quantity * values.unitPrice,
                date: tsDate,
                shiftId: selectedShift.id,
                updatedAt: serverTimestamp(),
                tankId: tankId || null,
                source: "singlePage"
            };

            if (!editingId) {
                payload.createdAt = serverTimestamp();
                payload.createdBy = user.uid;
            }
            payload.productName = product?.productName || 'Unknown';
            if (isFuel) {
                const tank = tanks.find(t => t.id === tankId);
                payload.tankName = tank?.tankName || 'Unknown';
            }

            const original = editingId ? invoices.find(inv => inv.id === editingId) : null;

            if (editingId) {
                if (!(isAdmin || original.createdBy === user.uid)) {
                    message.error('You are not authorized to update this invoice.');
                    setSubmitting(false);
                    return;
                }
                const originalProduct = products.find(p => p.id === original.productId);
                const originalIsFuel = isFuelProduct(originalProduct);
                const reversedStock = await updateInventory(original.productId, original.quantity, originalIsFuel ? original.tankId : null);
                await logProductTransaction({
                    productId: original.productId,
                    productName: original.productName,
                    eventType: 'sale-reversal',
                    quantity: original.quantity,
                    unitPrice: original.unitPrice,
                    customDate: tsDate,
                    tankId: originalIsFuel ? original.tankId : undefined,
                    tankName: originalIsFuel ? original.tankName : undefined,
                    remainingStockAfter: reversedStock,
                    shiftId: selectedShift.id,
                });
                const newStock = await updateInventory(values.productId, -values.quantity, isFuel ? tankId : null);
                payload.remainingStockAfter = newStock;

                // Use batch to update invoice and cashflow
                const batch = writeBatch(db);
                const invoiceRef = doc(db, 'saleInvoices', editingId);

                if (original.cashflowId) {
                    const cashflowRef = doc(db, 'cashflow', original.cashflowId);
                    batch.update(cashflowRef, {
                        amount: payload.amount,
                        updatedAt: serverTimestamp(),
                        cashflowCategory: 'saleInvoices',
                    });
                } else {
                    const cashflowRef = doc(collection(db, 'cashflow'));
                    const cashflowData = {
                        amount: payload.amount,
                        type: 'cashIn',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        invoiceId: editingId,
                        cashflowCategory: 'saleInvoices',
                    };
                    batch.set(cashflowRef, cashflowData);
                    batch.update(invoiceRef, { cashflowId: cashflowRef.id });
                }

                batch.update(invoiceRef, payload);
                await batch.commit();

                await logProductTransaction({
                    productId: values.productId,
                    productName: payload.productName,
                    eventType: 'sale',
                    quantity: values.quantity,
                    unitPrice: values.unitPrice,
                    customDate: tsDate,
                    tankId: isFuel ? tankId : undefined,
                    tankName: isFuel ? payload.tankName : undefined,
                    remainingStockAfter: newStock,
                    shiftId: selectedShift.id,
                });

                message.success('Sale invoice updated');
            } else {
                const newStock = await updateInventory(values.productId, -values.quantity, isFuel ? tankId : null);
                payload.remainingStockAfter = newStock;

                // Use batch to create invoice and cashflow
                const batch = writeBatch(db);
                const invoiceRef = doc(collection(db, 'saleInvoices'));
                const cashflowRef = doc(collection(db, 'cashflow'));

                const cashflowData = {
                    amount: payload.amount,
                    type: 'cashIn',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    invoiceId: invoiceRef.id,
                    cashflowCategory: 'saleInvoices',
                };

                const invoiceData = {
                    ...payload,
                    cashflowId: cashflowRef.id,
                };

                batch.set(invoiceRef, invoiceData);
                batch.set(cashflowRef, cashflowData);
                await batch.commit();

                await logProductTransaction({
                    productId: values.productId,
                    productName: payload.productName,
                    eventType: 'sale',
                    quantity: values.quantity,
                    unitPrice: values.unitPrice,
                    customDate: tsDate,
                    tankId: isFuel ? tankId : undefined,
                    tankName: isFuel ? payload.tankName : undefined,
                    remainingStockAfter: newStock,
                    shiftId: selectedShift.id,
                });

                message.success('Sale invoice created');
            }

            setIsModalVisible(false);
            fetchInvoices();
        } catch (err) {
            message.error(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = id => {
        if (!user) {
            message.error('You must be logged in to perform this action.');
            return;
        }
        Modal.confirm({
            title: 'Are you sure you want to delete this invoice?',
            onOk: async () => {
                setDeletingId(id);
                try {
                    const inv = invoices.find(i => i.id === id);
                    if (!inv) throw new Error('Invoice not found');
                    if (!(isAdmin || inv.createdBy === user.uid)) {
                        message.error('You are not authorized to delete this invoice.');
                        setDeletingId(null);
                        return;
                    }
                    const product = products.find(p => p.id === inv.productId);
                    const isFuel = isFuelProduct(product);
                    const reversedStock = await updateInventory(inv.productId, inv.quantity, isFuel ? inv.tankId : null);

                    // Use batch to delete invoice and cashflow
                    const batch = writeBatch(db);
                    const invoiceRef = doc(db, 'saleInvoices', id);
                    if (inv.cashflowId) {
                        const cashflowRef = doc(db, 'cashflow', inv.cashflowId);
                        batch.delete(cashflowRef);
                    }
                    batch.delete(invoiceRef);
                    await batch.commit();

                    await logProductTransaction({
                        productId: inv.productId,
                        productName: inv.productName,
                        eventType: 'sale-delete',
                        quantity: inv.quantity,
                        unitPrice: inv.unitPrice,
                        customDate: inv.date,
                        tankId: isFuel ? inv.tankId : undefined,
                        tankName: isFuel ? inv.tankName : undefined,
                        remainingStockAfter: reversedStock,
                    });

                    message.success('Sale invoice deleted');
                    fetchInvoices();
                } catch (err) {
                    message.error('Delete failed: ' + err.message);
                } finally {
                    setDeletingId(null);
                }
            }
        });
    };

    const exportToExcel = () => {
        const exportData = invoices.map(inv => ({
            Date: inv.date.toLocaleDateString(),
            Product: products.find(p => p.id === inv.productId)?.productName || 'Unknown',
            'Sold Quantity (Liters)': inv.quantity,
            'Unit Price': parseFloat(inv.unitPrice).toFixed(2),
            Amount: parseFloat(inv.amount).toFixed(2),
            Tank: inv.tankName || 'N/A',
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sale Invoices');
        XLSX.writeFile(wb, 'sale_invoices.xlsx');
    };

    const columns = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: d => d.toLocaleDateString(),
            sorter: (a, b) => a.date - b.date,
            defaultSortOrder: 'descend',
        },
        {
            title: 'Product',
            dataIndex: 'productId',
            key: 'productId',
            render: pid => products.find(p => p.id === pid)?.productName || 'Unknown'
        },
        {
            title: 'Sold Quantity (Liters)',
            dataIndex: 'quantity',
            key: 'quantity',
            sorter: (a, b) => a.quantity - b.quantity,
        },
        {
            title: 'Unit Price',
            dataIndex: 'unitPrice',
            key: 'unitPrice',
            render: p => parseFloat(p).toFixed(2),
            sorter: (a, b) => a.unitPrice - b.unitPrice,
        },
        {
            title: 'Amount',
            dataIndex: 'amount',
            key: 'amount',
            render: a => parseFloat(a).toFixed(2),
            sorter: (a, b) => a.amount - b.amount,
        },
        {
            title: 'Tank',
            dataIndex: 'tankName',
            key: 'tankName',
            render: name => name || 'N/A',
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, rec) => {
                const canEdit = user && (isAdmin || rec.createdBy === user.uid);
                return (
                    <Space>
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
                                disabled={loading || submitting || deletingId === rec.id}
                                loading={deletingId === rec.id}
                            />
                        )}
                    </Space>
                );
            }
        }
    ];

    return (
        <div style={{ padding: 24 }}>
            <Row justify="space-between" style={{ marginBottom: 16 }}>
                <Title level={2}>Sale Invoices</Title>
                <Col>
                    <Button
                        type="primary"
                        onClick={() => showModal()}
                        disabled={loading || submitting || !user}
                        style={{ marginRight: 8 }}
                    >
                        Add Sale Invoice
                    </Button>
                    <Button onClick={exportToExcel} disabled={loading || invoices.length === 0}>
                        Export to Excel
                    </Button>
                </Col>
            </Row>
            <div style={{ overflowX: 'auto' }}>
                <Table
                    dataSource={invoices}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                />
            </div>
            <Modal
                title={editingId ? 'Edit Sale Invoice' : 'Add Sale Invoice'}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
                width={600}
            >
                <Form form={form} onFinish={handleSubmit} layout="vertical">
                    <Form.Item
                        name="date"
                        label="Date"
                        rules={[{ required: true, message: 'Please select a date' }]}
                    >
                        <DatePicker disabled={!isAdmin} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        name="time"
                        label="Time"
                        rules={[{ required: true, message: 'Please select a time' }]}
                    >
                        <TimePicker format="HH:mm" disabled={!isAdmin} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        name="productId"
                        label="Product"
                        rules={[{ required: true, message: 'Please select a product' }]}
                    >
                        <Select
                            placeholder="Select a product"
                            onChange={value => {
                                const product = products.find(p => p.id === value);
                                setCurrentProductCategory(product ? product.category : null);
                            }}
                        >
                            {products.map(p => (
                                <Option key={p.id} value={p.id}>
                                    {p.productName}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    {currentProductCategory && (currentProductCategory === 'petrol' || currentProductCategory === 'diesel') && (
                        <Form.Item
                            name="tankId"
                            label="Tank"
                            rules={[{ required: true, message: 'Please select a tank' }]}
                        >
                            <Select placeholder="Select a tank">
                                {tanks.map(t => (
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
                        rules={[
                            { required: true, message: 'Please enter quantity' },
                            { type: 'number', min: 0.001, message: 'Quantity must be greater than zero' }
                        ]}
                    >
                        <InputNumber min={0} step={0.001} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                        name="unitPrice"
                        label="Unit Price"
                        rules={[
                            { required: true, message: 'Please enter unit price' },
                            { type: 'number', min: 0.01, message: 'Unit price must be greater than zero' }
                        ]}
                    >
                        <InputNumber
                            min={0}
                            step={0.01}
                            style={{ width: '100%' }}
                            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={value => value.replace(/(,*)/g, '')}
                        />
                    </Form.Item>
                    <Form.Item shouldUpdate={(prev, curr) => prev.quantity !== curr.quantity || prev.unitPrice !== curr.unitPrice}>
                        {() => (
                            <Form.Item label="Total Amount">
                                <InputNumber
                                    value={(form.getFieldValue('quantity') || 0) * (form.getFieldValue('unitPrice') || 0)}
                                    disabled
                                    style={{ width: '100%' }}
                                />
                            </Form.Item>
                        )}
                    </Form.Item>
                    <Form.Item>
                        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                            <Button onClick={handleCancel}>
                                Cancel
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={submitting}
                                disabled={submitting}
                            >
                                {editingId ? 'Update' : 'Create'}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default SaleInvoiceManagement;