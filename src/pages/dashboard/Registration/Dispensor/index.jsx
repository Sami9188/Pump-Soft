import React, { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Form, Input, Space, Card,
    Typography, message, Tooltip, Popconfirm, Select, Badge, Spin, DatePicker
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined,
    FileExcelOutlined, ApiOutlined, LoadingOutlined
} from '@ant-design/icons';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import { exportToExcel } from '../../../../services/exportService';
import moment from 'moment';

const { Title } = Typography;
const { Option } = Select;

const DispenserManagement = () => {
    const [dispensers, setDispensers] = useState([]);
    const [nozzles, setNozzles] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [deleting, setDeleting] = useState(null);

    useEffect(() => {
        fetchDispensers();
        fetchNozzles();
    }, []);

    const fetchDispensers = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "dispensers"));
            const dispenserList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setDispensers(dispenserList);
        } catch (error) {
            message.error("Failed to fetch dispensers: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchNozzles = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "nozzles"));
            const nozzleList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setNozzles(nozzleList);
        } catch (error) {
            message.error("Failed to fetch nozzles: " + error.message);
        }
    };

    const showModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            // Convert date string to moment object if exists
            const formData = { ...record };
            if (formData.lastMaintenance) {
                formData.lastMaintenance = moment(formData.lastMaintenance);
            }
            form.setFieldsValue(formData);
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
        setSubmitting(true);
        try {
            const formattedValues = { ...values };
            // Convert moment object to string for lastMaintenance if provided
            if (formattedValues.lastMaintenance) {
                formattedValues.lastMaintenance = formattedValues.lastMaintenance.format('YYYY-MM-DD');
            }
            if (editingId) {
                await updateDoc(doc(db, "dispensers", editingId), formattedValues);
                message.success("Dispenser updated successfully");
            } else {
                await addDoc(collection(db, "dispensers"), formattedValues);
                message.success("Dispenser created successfully");
            }
            setIsModalVisible(false);
            fetchDispensers();
        } catch (error) {
            message.error("Operation failed: " + error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        setDeleting(id);
        try {
            await deleteDoc(doc(db, "dispensers", id));
            message.success("Dispenser deleted successfully");
            fetchDispensers();
        } catch (error) {
            message.error("Delete failed: " + error.message);
        } finally {
            setDeleting(null);
        }
    };

    const handleExportToExcel = async () => {
        setExporting(true);
        try {
            await exportToExcel(dispensers, 'Dispensers');
            message.success("Exported successfully");
        } catch (error) {
            message.error("Export failed: " + error.message);
        } finally {
            setExporting(false);
        }
    };

    const columns = [
        {
            title: 'Dispenser Name',
            dataIndex: 'dispenserName',
            key: 'dispenserName',
            sorter: (a, b) => a.dispenserName.localeCompare(b.dispenserName),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => (
                <Badge
                    status={status === 'active' ? 'success' : status === 'maintenance' ? 'warning' : 'error'}
                    text={status.charAt(0).toUpperCase() + status.slice(1)}
                />
            ),
            filters: [
                { text: 'Active', value: 'active' },
                { text: 'Maintenance', value: 'maintenance' },
                { text: 'Inactive', value: 'inactive' },
            ],
            onFilter: (value, record) => record.status === value,
        },
        {
            title: 'Nozzles',
            key: 'nozzles',
            render: (_, record) => {
                const relatedNozzles = nozzles.filter(n => n.dispenserId === record.id);
                return relatedNozzles.length ? relatedNozzles.map(n => n.attachmentId).join(', ') : 'None';
            },
            responsive: ['xl'],
        },
        {
            title: 'Last Maintenance',
            dataIndex: 'lastMaintenance',
            key: 'lastMaintenance',
            responsive: ['lg'],
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title="Edit">
                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={() => showModal(record)}
                            size="small"
                        />
                    </Tooltip>
                    <Tooltip title="Delete">
                        <Popconfirm
                            title="Are you sure you want to delete this dispenser?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Yes"
                            cancelText="No"
                            okButtonProps={{ loading: deleting === record.id }}
                        >
                            <Button
                                danger
                                icon={deleting === record.id ? <LoadingOutlined /> : <DeleteOutlined />}
                                size="small"
                                disabled={deleting === record.id}
                            />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div className="dispenser-management-container shadow-sm">
            <div className="dispenser-header d-flex justify-content-between align-items-center flex-wrap mb-4">
                <Title level={3} className="mb-3 mb-md-0">Dispenser Management</Title>
                <Space wrap>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => showModal()}
                        className="mb-2 mb-md-0"
                    >
                        Add Dispenser
                    </Button>
                    <Button
                        type="default"
                        icon={exporting ? <LoadingOutlined /> : <FileExcelOutlined />}
                        onClick={handleExportToExcel}
                        disabled={exporting || loading || dispensers.length === 0}
                        className="mb-2 mb-md-0"
                    >
                        {exporting ? 'Exporting...' : 'Export to Excel'}
                    </Button>
                </Space>
            </div>

            <div className="table-responsive">
                <Table
                    columns={columns}
                    dataSource={dispensers}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        responsive: true,
                        showSizeChanger: true,
                        pageSizeOptions: ['5', '10', '20', '50']
                    }}
                    bordered
                    scroll={{ x: 'max-content' }}
                    size="middle"
                />
            </div>

            <Modal
                title={editingId ? "Edit Dispenser" : "Add New Dispenser"}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
                width={600}
            >
                <Spin spinning={submitting} tip="Processing...">
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={handleSubmit}
                        className="mt-3"
                    >
                        <div className="row">
                            <div className="col-12 col-md-6">
                                <Form.Item
                                    name="dispenserName"
                                    label="Dispenser Name"
                                    rules={[{ required: true, message: 'Please enter dispenser name' }]}
                                >
                                    <Input placeholder="Enter dispenser name" />
                                </Form.Item>
                            </div>
                            <div className="col-12 col-md-6">
                                <Form.Item
                                    name="status"
                                    label="Status"
                                    rules={[{ required: true, message: 'Please select status' }]}
                                >
                                    <Select placeholder="Select status">
                                        <Option value="active">Active</Option>
                                        <Option value="maintenance">Maintenance</Option>
                                        <Option value="inactive">Inactive</Option>
                                    </Select>
                                </Form.Item>
                            </div>
                        </div>

                        <Form.Item
                            name="lastMaintenance"
                            label="Last Maintenance Date"
                        >
                            <DatePicker
                                style={{ width: '100%' }}
                                format="YYYY-MM-DD"
                                allowClear
                            />
                        </Form.Item>

                        <Form.Item className="mb-0">
                            <div className="d-flex justify-content-end gap-2">
                                <Button onClick={handleCancel} disabled={submitting}>Cancel</Button>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={submitting}
                                    disabled={submitting}
                                >
                                    {editingId ? 'Update' : 'Create'}
                                </Button>
                            </div>
                        </Form.Item>
                    </Form>
                </Spin>
            </Modal>
        </div>
    );
};

export default DispenserManagement;
