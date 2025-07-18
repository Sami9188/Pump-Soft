import React, { useState, useEffect } from 'react';
import {
    Table,
    Button,
    Modal,
    Form,
    Input,
    Space,
    Card,
    Typography,
    message,
    Tooltip,
    Popconfirm,
    InputNumber,
    Select,
    Statistic,
    Row,
    Col,
    DatePicker,
    Tag
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    FileExcelOutlined,
    SearchOutlined,
    EyeOutlined
} from '@ant-design/icons';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import { exportToExcel } from '../../../../services/exportService';
import { useAuth } from '../../../../context/AuthContext';
import moment from 'moment';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const ProductManagement = () => {
    const [products, setProducts] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);

    const [historyModalVisible, setHistoryModalVisible] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [selectedProductHistory, setSelectedProductHistory] = useState([]);
    const [historyDateRange, setHistoryDateRange] = useState(null);
    const [historyExportLoading, setHistoryExportLoading] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');

    const { isAdmin, currentUser } = useAuth();
    const [form] = Form.useForm();

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, 'products'));
            const productList = querySnapshot.docs
                .map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        ...data,
                        remainingStockAfter: data.remainingStockAfter !== undefined ? data.remainingStockAfter : (data.openingQuantity || 0),
                        createdAt: data.createdAt || new Date() // Ensure we have a createdAt field
                    };
                })
                .sort((a, b) => {
                    // Sort by createdAt in descending order (newest first)
                    const dateA = a.createdAt instanceof Date ? a.createdAt : a.createdAt?.toDate?.() || new Date(0);
                    const dateB = b.createdAt instanceof Date ? b.createdAt : b.createdAt?.toDate?.() || new Date(0);
                    return dateB - dateA;
                });
            setProducts(productList);
        } catch (error) {
            message.error('Failed to fetch products: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const calculateTotalValue = () => {
        return products.reduce((sum, product) => {
            return sum + (product.salesPrice * (product.remainingStockAfter || 0));
        }, 0);
    };

    const showModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue(record);
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

    const handleSubmit = async (values) => {
        setSubmitLoading(true);
        try {
            if (values.openingQuantity === undefined) values.openingQuantity = 0;

            if (editingId) {
                const currentProduct = products.find(p => p.id === editingId);
                if (currentProduct) {
                    const oldQty = currentProduct.openingQuantity || 0;
                    const newQty = values.openingQuantity;
                    const diff = newQty - oldQty;
                    const currentInv = currentProduct.remainingStockAfter || oldQty;
                    const newRemaining = currentInv + diff;

                    await updateDoc(doc(db, 'products', editingId), {
                        ...values,
                        remainingStockAfter: newRemaining
                    });

                    if (diff !== 0) {
                        await addDoc(collection(db, 'productTransactions'), {
                            productId: editingId,
                            productName: currentProduct.productName,
                            eventType: 'manual',
                            quantity: diff,
                            unitPrice: 0,
                            total: 0,
                            date: new Date(),
                            createdAt: new Date(),
                            remainingStockAfter: newRemaining
                        });
                    }

                    message.success('Product updated successfully');
                } else {
                    message.error('Product not found');
                }
            } else {
                const now = new Date();
                const payload = {
                    ...values,
                    remainingStockAfter: values.openingQuantity || 0,
                    createdAt: now // Add creation timestamp
                };
                const docRef = await addDoc(collection(db, 'products'), payload);
                await addDoc(collection(db, 'productTransactions'), {
                    productId: docRef.id,
                    productName: values.productName,
                    eventType: 'manual',
                    quantity: values.openingQuantity || 0,
                    unitPrice: 0,
                    total: 0,
                    date: now,
                    createdAt: now,
                    remainingStockAfter: values.openingQuantity || 0
                });
                message.success('Product created successfully');
            }

            setIsModalVisible(false);
            fetchProducts();
        } catch (error) {
            message.error('Operation failed: ' + error.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleDelete = async (id) => {
        setDeleteLoading(true);
        try {
            await deleteDoc(doc(db, 'products', id));
            message.success('Product deleted successfully');
            fetchProducts();
        } catch (error) {
            message.error('Delete failed: ' + error.message);
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleExportToExcel = () => {
        setExportLoading(true);
        try {
            exportToExcel(products.map(p => ({
                ...p,
                remainingStockAfter: p.remainingStockAfter
            })), 'Products');
            message.success('Exported successfully');
        } catch (error) {
            message.error('Export failed: ' + error.message);
        } finally {
            setExportLoading(false);
        }
    };

    const showHistoryModal = async (productId) => {
        try {
            const q = query(
                collection(db, 'productTransactions'),
                where('productId', '==', productId),
                orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);
            const history = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const product = products.find(p => p.id === productId);
            if (!product) throw new Error('Product not found');
            setSelectedProduct(product);
            setSelectedProductHistory(history);
            setHistoryDateRange(null);
            setHistoryModalVisible(true);
        } catch (error) {
            message.error(`Failed to fetch product history: ${error.message}`);
        }
    };

    const filteredHistory = historyDateRange
        ? selectedProductHistory.filter(record => {
            const rd = moment(record.date.toDate ? record.date.toDate() : record.date);
            return rd.isBetween(historyDateRange[0], historyDateRange[1], 'day', '[]');
        })
        : selectedProductHistory;

    const handleExportHistory = () => {
        setHistoryExportLoading(true);
        try {
            const exportData = filteredHistory.map(record => ({
                Date: moment(record.date.toDate ? record.date.toDate() : record.date).format('DD/MM/YYYY HH:mm'),
                'Event Type': record.eventType,
                Quantity: Number(record.quantity).toFixed(2),
                'Unit Price (PKR)': record.unitPrice ? `₨${Number(record.unitPrice).toFixed(2)}` : '-',
                'Total (PKR)': record.total ? `₨${Number(record.total).toFixed(2)}` : '-',
            }));
            exportToExcel(exportData, 'ProductHistory');
            message.success('History exported successfully');
        } catch (error) {
            message.error('Export failed: ' + error.message);
        } finally {
            setHistoryExportLoading(false);
        }
    };

    const filteredProducts = products.filter(p =>
        p.productName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const columns = [
        {
            title: 'Product Name',
            dataIndex: 'productName',
            key: 'productName',
            sorter: (a, b) => a.productName.localeCompare(b.productName),
        },
        {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            sorter: (a, b) => a.category.localeCompare(b.category),
        },
        {
            title: 'Purchase Price (PKR)',
            dataIndex: 'purchasePrice',
            key: 'purchasePrice',
            render: price => `₨${price?.toFixed(2)}`,
            sorter: (a, b) => a.purchasePrice - b.purchasePrice,
        },
        {
            title: 'Sales Price (PKR)',
            dataIndex: 'salesPrice',
            key: 'salesPrice',
            render: price => `₨${price?.toFixed(2)}`,
            sorter: (a, b) => a.salesPrice - b.salesPrice,
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title="View History">
                        <Button icon={<EyeOutlined />} onClick={() => showHistoryModal(record.id)} size="small" />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button type="primary" icon={<EditOutlined />} onClick={() => showModal(record)} size="small" />
                    </Tooltip>
                    <Tooltip title="Delete">
                        <Popconfirm
                            title="Are you sure want to delete?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Yes"
                            cancelText="No"
                        >
                            <Button danger icon={<DeleteOutlined />} size="small" loading={deleteLoading} />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const historyColumns = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: date => moment(date.toDate ? date.toDate() : date).format('DD/MM/YYYY HH:mm'),
            defaultSortOrder: 'descend',
        },
        {
            title: 'Event Type',
            dataIndex: 'eventType',
            key: 'eventType',
            render: eventType => {
                let color = 'blue';
                switch (eventType) {
                    case 'purchase': color = 'green'; break;
                    case 'sale': color = 'red'; break;
                    case 'purchase-return': color = 'purple'; break;
                    case 'sale-return':
                    case 'sell-return': color = 'orange'; break;
                }
                return <Tag color={color}>{eventType}</Tag>;
            }
        },
        {
            title: 'Quantity',
            dataIndex: 'quantity',
            key: 'quantity',
            render: q => Number(q).toFixed(2),
        },
        {
            title: 'Unit Price (PKR)',
            dataIndex: 'unitPrice',
            key: 'unitPrice',
            render: price => price ? `₨${Number(price).toFixed(2)}` : '-',
        },
        {
            title: 'Total (PKR)',
            dataIndex: 'total',
            key: 'total',
            render: t => t ? `₨${Number(t).toFixed(2)}` : '-',
        },
        {
            title: 'Remaining Stock After',
            dataIndex: 'remainingStockAfter',
            key: 'remainingStockAfter',
            render: r => r !== undefined ? Number(r).toFixed(2) : '-',
        },
    ];

    // console.log(selectedProductHistory?.[selectedProductHistory.length - 1]?.remainingStockAfter);
    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Title level={3}>Product Management</Title>
                <Space>
                    <Input
                        placeholder="Search by product name"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        prefix={<SearchOutlined />}
                        allowClear
                        style={{ width: 250 }}
                    />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
                        Add Product
                    </Button>
                    <Button icon={<FileExcelOutlined />} onClick={handleExportToExcel} loading={exportLoading}>
                        Export to Excel
                    </Button>
                </Space>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={12} md={8}>
                    <Statistic title="Total Products" value={products.length} />
                </Col>
                <Col xs={24} sm={12} md={8}>
                    <Statistic
                        title="Total Inventory Value (PKR)"
                        value={calculateTotalValue()}
                        precision={2}
                        prefix="₨"
                    />
                </Col>
            </Row>

            <Table
                columns={columns}
                dataSource={filteredProducts}
                rowKey="id"
                loading={loading}
                pagination={false}
                bordered
                scroll={{ x: 'max-content' }}
            />

            <Modal
                title={editingId ? 'Edit Product' : 'Add New Product'}
                visible={isModalVisible}
                onCancel={handleCancel}
                footer={null}
                width={400}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item name="productName" label="Product Name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                        <Select>
                            <Option value="petrol">Petrol</Option>
                            <Option value="diesel">Diesel</Option>
                            <Option value="mobile">Mobile/Others</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="purchasePrice" label="Purchase Price (PKR)" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                    </Form.Item>
                    <Form.Item name="salesPrice" label="Sales Price (PKR)" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                    </Form.Item>
                    <Form.Item name="openingQuantity" label="Opening Quantity (Optional)">
                        <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item>
                        <div style={{ textAlign: 'right' }}>
                            <Space>
                                <Button onClick={handleCancel}>Cancel</Button>
                                <Button type="primary" htmlType="submit" loading={submitLoading}>
                                    {editingId ? 'Update' : 'Create'}
                                </Button>
                            </Space>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={`Update History for ${selectedProduct?.productName || ''}`}
                open={historyModalVisible}
                onCancel={() => setHistoryModalVisible(false)}
                footer={null}
                width={800}
            >
                {selectedProduct && (
                    <Card style={{ marginBottom: 16 }}>
                        <p><strong>Name:</strong> {selectedProduct.productName}</p>
                        <p><strong>Category:</strong> {selectedProduct.category}</p>
                        <p><strong>Purchase Price:</strong> ₨{selectedProduct.purchasePrice.toFixed(2)}</p>
                        <p><strong>Sales Price:</strong> ₨{selectedProduct.salesPrice.toFixed(2)}</p>
                        <p><strong>Current Remaining Stock:</strong> {selectedProductHistory?.[0]?.remainingStockAfter}</p>
                    </Card>
                )}

                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col span={6}><Statistic title="Total Sales" value={filteredHistory.filter(r => r.eventType === 'sale').reduce((s, r) => s + Number(r.quantity), 0)} suffix="units" /></Col>
                    <Col span={6}><Statistic title="Total Purchases" value={filteredHistory.filter(r => r.eventType === 'purchase').reduce((s, r) => s + Number(r.quantity), 0)} suffix="units" /></Col>
                    <Col span={6}><Statistic title="Total Sale Returns" value={filteredHistory.filter(r => ['sale-return', 'sell-return'].includes(r.eventType)).reduce((s, r) => s + Number(r.quantity), 0)} suffix="units" /></Col>
                    <Col span={6}><Statistic title="Total Purchase Returns" value={filteredHistory.filter(r => r.eventType === 'purchase-return').reduce((s, r) => s + Number(r.quantity), 0)} suffix="units" /></Col>
                </Row>

                <Space style={{ marginBottom: 16 }}>
                    <RangePicker value={historyDateRange} onChange={setHistoryDateRange} allowClear />
                    <Button icon={<FileExcelOutlined />} onClick={handleExportHistory} loading={historyExportLoading}>
                        Export Filtered History
                    </Button>
                </Space>

                <Table
                    columns={historyColumns}
                    dataSource={filteredHistory}
                    rowKey="id"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    bordered
                />
            </Modal>
        </div>
    );
};

export default ProductManagement;