import React, { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Form, Input, Space, Card,
    Typography, message, Tooltip, Popconfirm, Progress, InputNumber, Select, DatePicker
} from 'antd';
import { EyeOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FileExcelOutlined } from '@ant-design/icons';
import moment from 'moment';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import { exportToExcel } from '../../../../services/exportService';
import { useAuth } from '../../../../context/AuthContext';

const { Title } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const TankManagement = () => {
    const [tanks, setTanks] = useState([]);
    const [productsList, setProductsList] = useState([]);
    const [dipCharts, setDipCharts] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [historyModalVisible, setHistoryModalVisible] = useState(false);
    const [selectedTankHistory, setSelectedTankHistory] = useState([]);
    const [historyDateRange, setHistoryDateRange] = useState(null);
    const [historyExportLoading, setHistoryExportLoading] = useState(false);

    const { isAdmin } = useAuth();

    useEffect(() => {
        fetchTanks();
        fetchProducts();
        fetchDipCharts();
    }, []);

    // Fetch tanks from Firestore
    const fetchTanks = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "tanks"));
            const tankList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTanks(tankList);
        } catch (error) {
            message.error(`Failed to fetch tanks: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Fetch products to link with tanks
    const fetchProducts = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            const products = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setProductsList(products);
        } catch (error) {
            message.error(`Failed to fetch products: ${error.message}`);
        }
    };

    // Fetch dip chart records
    const fetchDipCharts = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "dipcharts"));
            const charts = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setDipCharts(charts);
        } catch (error) {
            message.error(`Failed to fetch dip charts: ${error.message}`);
        }
    };

    const showModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue(record);
        } else {
            setEditingId(null);
            form.resetFields();
            form.setFieldsValue({ openingStock: 0 });
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        form.resetFields();
    };

    const handleSubmit = async (values) => {
        setSubmitLoading(true);
        try {
            values.openingStock = values.openingStock ?? 0;
            values.openingStock = parseFloat(values.openingStock.toFixed(2));
            values.capacity = parseFloat(values.capacity.toFixed(2));
            values.alertThreshold = parseFloat(values.alertThreshold.toFixed(2));

            if (values.openingStock > values.capacity) {
                message.error("Opening stock cannot exceed tank capacity.");
                setSubmitLoading(false);
                return;
            }

            if (editingId) {
                const { openingStock, ...otherValues } = values;
                await updateDoc(doc(db, "tanks", editingId), otherValues);
                message.success("Tank updated successfully");
            } else {
                await addDoc(collection(db, "tanks"), {
                    ...values,
                    remainingStock: values.openingStock,
                    createdAt: new Date()
                });
                message.success("Tank created successfully");
            }
            setIsModalVisible(false);
            fetchTanks();
        } catch (error) {
            message.error(`Operation failed: ${error.message}`);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async (id) => {
        setDeleteLoading(id);
        try {
            await deleteDoc(doc(db, "tanks", id));
            message.success("Tank deleted successfully");
            fetchTanks();
        } catch (error) {
            message.error(`Delete failed: ${error.message}`);
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleExportToExcel = () => {
        setExportLoading(true);
        try {
            if (tanks.length === 0) {
                message.warning("No tanks available to export.");
                setExportLoading(false);
                return;
            }
            const formattedTanks = tanks.map(tank => ({
                ...tank,
                capacity: parseFloat(tank.capacity.toFixed(2)),
                openingStock: parseFloat(tank.openingStock.toFixed(2)),
                alertThreshold: parseFloat(tank.alertThreshold.toFixed(2)),
                remainingStock: tank.remainingStock !== undefined ? parseFloat(tank.remainingStock.toFixed(2)) : parseFloat(tank.openingStock.toFixed(2))
            }));
            exportToExcel(formattedTanks, 'Tanks');
            message.success("Tanks exported successfully");
        } catch (error) {
            message.error(`Export failed: ${error.message}`);
        } finally {
            setExportLoading(false);
        }
    };

    const showHistoryModal = async (tankId) => {
        try {
            // Filter dip charts for given tankId
            const dipChartData = dipCharts.filter(record => record.tankId === tankId);
            const historyWithGainLoss = dipChartData.map(record => {
                const bookStock = Number(record.bookStock);
                const dipLiters = Number(record.dipLiters);
                const gain = dipLiters > bookStock ? (dipLiters - bookStock).toFixed(2) : "0.00";
                const loss = bookStock > dipLiters ? (bookStock - dipLiters).toFixed(2) : "0.00";
                return { ...record, gain, loss };
            });
            // Reset the date range on opening the modal
            setHistoryDateRange(null);
            setSelectedTankHistory(historyWithGainLoss);
            setHistoryModalVisible(true);
        } catch (error) {
            message.error(`Failed to fetch tank history: ${error.message}`);
        }
    };

    // New helper to filter history based on date range
    const filteredTankHistory = historyDateRange
        ? selectedTankHistory.filter(record => {
            const recordDate = moment(record.recordedAt.toDate());
            return recordDate.isBetween(historyDateRange[0], historyDateRange[1], 'day', '[]');
        })
        : selectedTankHistory;

    const handleExportHistory = () => {
        setHistoryExportLoading(true);
        try {
            exportToExcel(filteredTankHistory, 'TankHistory');
            message.success("History exported successfully");
        } catch (error) {
            message.error(`Export failed: ${error.message}`);
        } finally {
            setHistoryExportLoading(false);
        }
    };

    // New helper to compute net gain/loss for a given tank as a single value.
    const computeNetGainLoss = (tankId) => {
        const records = dipCharts.filter(record => record.tankId === tankId);
        let net = 0;
        records.forEach(record => {
            const bookStock = Number(record.bookStock);
            const dipLiters = Number(record.dipLiters);
            net += (dipLiters - bookStock);
        });
        if (net > 0) {
            return `${net.toFixed(2)} L gain`;
        } else if (net < 0) {
            return `${Math.abs(net).toFixed(2)} L loss`;
        } else {
            return "0.00 L";
        }
    };

    const columns = [
        {
            title: 'Tank Name',
            dataIndex: 'tankName',
            key: 'tankName',
            sorter: (a, b) => a.tankName.localeCompare(b.tankName),
        },
        {
            title: 'Product',
            dataIndex: 'product',
            key: 'product',
            render: (productId) => {
                const product = productsList.find(p => p.id === productId);
                return product ? product.productName : 'N/A';
            },
            sorter: (a, b) => {
                const productA = productsList.find(p => p.id === a.product)?.productName || '';
                const productB = productsList.find(p => p.id === b.product)?.productName || '';
                return productA.localeCompare(productB);
            }
        },
        {
            title: 'Capacity (Liters)',
            dataIndex: 'capacity',
            key: 'capacity',
            render: (capacity) => parseFloat(capacity).toFixed(2),
            sorter: (a, b) => a.capacity - b.capacity,
        },
        {
            title: 'Opening Stock (Liters)',
            dataIndex: 'openingStock',
            key: 'openingStock',
            render: (stock) => parseFloat(stock).toFixed(2),
            sorter: (a, b) => a.openingStock - b.openingStock,
        },
        {
            title: 'Remaining Stock (Liters)',
            dataIndex: 'remainingStock',
            key: 'remainingStock',
            render: (stock, record) => {
                const value = stock !== undefined ? stock : record.openingStock;
                return parseFloat(value).toFixed(2);
            },
            sorter: (a, b) => {
                const remA = a.remainingStock !== undefined ? a.remainingStock : a.openingStock;
                const remB = b.remainingStock !== undefined ? b.remainingStock : b.openingStock;
                return remA - remB;
            }
        },
        {
            title: 'Remaining Volume',
            key: 'remainingVolume',
            render: (text, record) => {
                const remaining = record.remainingStock !== undefined ? record.remainingStock : record.openingStock;
                const percent = record.capacity ? (remaining / record.capacity) * 100 : 0;
                return (
                    <Progress
                        percent={parseFloat(percent.toFixed(2))}
                        size="small"
                        status={record.capacity && (remaining / record.capacity) < 0.2 ? 'exception' : 'normal'}
                    />
                );
            },
            sorter: (a, b) => {
                const remA = a.remainingStock !== undefined ? a.remainingStock : a.openingStock;
                const remB = b.remainingStock !== undefined ? b.remainingStock : b.openingStock;
                return (remA / a.capacity) - (remB / b.capacity);
            }
        },
        {
            title: 'Low Level Alert Threshold (Liters)',
            dataIndex: 'alertThreshold',
            key: 'alertThreshold',
            render: (threshold) => parseFloat(threshold).toFixed(2),
            sorter: (a, b) => a.alertThreshold - b.alertThreshold,
        },
        {
            title: 'Net Gain/Loss',
            key: 'wholeGainLoss',
            render: (_, record) => computeNetGainLoss(record.id),
            sorter: (a, b) => {
                const netA = computeNetGainLoss(a.id).includes('gain')
                    ? parseFloat(computeNetGainLoss(a.id))
                    : -parseFloat(computeNetGainLoss(a.id));
                const netB = computeNetGainLoss(b.id).includes('gain')
                    ? parseFloat(computeNetGainLoss(b.id))
                    : -parseFloat(computeNetGainLoss(b.id));
                return netA - netB;
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title="View History">
                        <Button
                            type="default"
                            icon={<EyeOutlined />}
                            onClick={() => showHistoryModal(record.id)}
                            size="small"
                        />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={() => showModal(record)}
                            size="small"
                            disabled={!isAdmin}
                        />
                    </Tooltip>
                    <Tooltip title="Delete">
                        <Popconfirm
                            title="Are you sure you want to delete this tank?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Yes"
                            cancelText="No"
                            okButtonProps={{ loading: deleteLoading === record.id }}
                            disabled={!isAdmin}
                        >
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                size="small"
                                loading={deleteLoading === record.id}
                                disabled={!isAdmin}
                            />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const historyColumns = [
        {
            title: 'Date',
            dataIndex: 'recordedAt',
            key: 'recordedAt',
            render: (date) => moment(date.toDate()).format('DD/MM/YYYY HH:mm'),
            sorter: (a, b) => a.recordedAt.toDate() - b.recordedAt.toDate(),
        },
        {
            title: 'Dip (mm)',
            dataIndex: 'dipMm',
            key: 'dipMm',
        },
        {
            title: 'Volume (L)',
            dataIndex: 'dipLiters',
            key: 'dipLiters',
            render: (value) => parseFloat(value).toFixed(2),
        },
        {
            title: 'Book Stock (L)',
            dataIndex: 'bookStock',
            key: 'bookStock',
            render: (value) => parseFloat(value).toFixed(2),
        },
        {
            title: 'Daily Gain (L)',
            dataIndex: 'gain',
            key: 'gain',
        },
        {
            title: 'Daily Loss (L)',
            dataIndex: 'loss',
            key: 'loss',
        },
    ];

    const totalGain = selectedTankHistory.reduce((sum, record) => sum + parseFloat(record.gain), 0).toFixed(2);
    const totalLoss = selectedTankHistory.reduce((sum, record) => sum + parseFloat(record.loss), 0).toFixed(2);

    return (
        <div className="tank-management-container">
            <div className="tank-header d-flex justify-content-between flex-wrap mb-3">
                <Title level={3}>Tank Management</Title>
                <Space wrap>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => showModal()}
                        disabled={!isAdmin}
                    >
                        Add Tank
                    </Button>
                    <Button
                        type="default"
                        icon={<FileExcelOutlined />}
                        onClick={handleExportToExcel}
                        loading={exportLoading}
                    >
                        Export to Excel
                    </Button>
                </Space>
            </div>

            <div className="table-responsive">
                <Table
                    columns={columns}
                    dataSource={tanks}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10, responsive: true }}
                    bordered
                    scroll={{ x: 'max-content' }}
                />
            </div>

            <Modal
                title={editingId ? "Edit Tank" : "Add New Tank"}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
                width={800}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Form.Item
                            name="tankName"
                            label="Tank Name"
                            rules={[{ required: true, message: 'Please enter tank name' }]}
                        >
                            <Input placeholder="Enter tank name" />
                        </Form.Item>

                        <Form.Item
                            name="product"
                            label="Product"
                            rules={[{ required: true, message: 'Please select a product' }]}
                        >
                            <Select placeholder="Select product" disabled={productsList.length === 0}>
                                {productsList.length > 0 ? (
                                    productsList.map(product => (
                                        <Option key={product.id} value={product.id}>
                                            {product.productName}
                                        </Option>
                                    ))
                                ) : (
                                    <Option disabled>No products available</Option>
                                )}
                            </Select>
                        </Form.Item>

                        <Form.Item
                            name="capacity"
                            label="Capacity (Liters)"
                            rules={[
                                { required: true, message: 'Please enter tank capacity' },
                                { type: 'number', min: 0, message: 'Capacity must be a positive number' }
                            ]}
                        >
                            <InputNumber
                                min={0}
                                style={{ width: '100%' }}
                                placeholder="Enter capacity in liters"
                                precision={2}
                            />
                        </Form.Item>

                        <Form.Item
                            name="openingStock"
                            label="Opening Stock (Liters)"
                            rules={[
                                { required: true, message: 'Please enter opening stock' },
                                { type: 'number', min: 0, message: 'Opening stock must be a positive number' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('capacity') >= value) {
                                            return Promise.resolve();
                                        }
                                        return Promise.reject(new Error('Opening stock cannot exceed capacity'));
                                    },
                                }),
                            ]}
                        >
                            <InputNumber
                                min={0}
                                style={{ width: '100%' }}
                                placeholder="Enter opening stock in liters"
                                precision={2}
                                disabled={!!editingId}
                            />
                        </Form.Item>

                        <Form.Item
                            name="alertThreshold"
                            label="Low Level Alert Threshold (Liters)"
                            rules={[
                                { required: true, message: 'Please enter alert threshold' },
                                { type: 'number', min: 0, message: 'Threshold must be a positive number' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('capacity') >= value) {
                                            return Promise.resolve();
                                        }
                                        return Promise.reject(new Error('Threshold cannot exceed capacity'));
                                    },
                                }),
                            ]}
                        >
                            <InputNumber
                                min={0}
                                style={{ width: '100%' }}
                                placeholder="Enter threshold"
                                precision={2}
                            />
                        </Form.Item>
                    </div>

                    <Form.Item>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <Button onClick={handleCancel}>Cancel</Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={submitLoading}
                                disabled={submitLoading || !isAdmin}
                            >
                                {editingId ? 'Update' : 'Create'}
                            </Button>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Tank Update History"
                open={historyModalVisible}
                onCancel={() => setHistoryModalVisible(false)}
                footer={[
                    <div key="footer" style={{ textAlign: 'right' }}>
                        <span>Total Gain: {totalGain} L | Total Loss: {totalLoss} L</span>
                    </div>
                ]}
                width={1000}
            >
                <Space style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }} direction="horizontal">
                    <RangePicker
                        value={historyDateRange}
                        onChange={(dates) => setHistoryDateRange(dates)}
                        allowClear
                    />
                    <Button
                        type="primary"
                        icon={<FileExcelOutlined />}
                        onClick={handleExportHistory}
                        loading={historyExportLoading}
                    >
                        Export Filtered History
                    </Button>
                </Space>

                <Table
                    columns={historyColumns}
                    dataSource={filteredTankHistory}
                    rowKey="id"
                    pagination={false}
                    bordered
                    scroll={{ x: 'max-content' }}
                />
            </Modal>
        </div>
    );
};

export default TankManagement;
