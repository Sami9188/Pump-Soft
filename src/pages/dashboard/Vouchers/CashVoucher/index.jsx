import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, DatePicker, message } from 'antd';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase-config';

const CashVoucherManagement = () => {
    const [vouchers, setVouchers] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState(null);

    useEffect(() => {
        fetchVouchers();
    }, []);

    const fetchVouchers = async () => {
        const querySnapshot = await getDocs(collection(db, 'cashVouchers'));
        setVouchers(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };

    const showModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue({ ...record, date: record.date ? new Date(record.date) : null });
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
        try {
            const data = { ...values, date: values.date.toISOString() };
            if (editingId) {
                await updateDoc(doc(db, 'cashVouchers', editingId), data);
                message.success('Cash voucher updated');
            } else {
                await addDoc(collection(db, 'cashVouchers'), data);
                message.success('Cash voucher created');
            }
            setIsModalVisible(false);
            fetchVouchers();
        } catch (error) {
            message.error('Operation failed: ' + error.message);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteDoc(doc(db, 'cashVouchers', id));
            message.success('Cash voucher deleted');
            fetchVouchers();
        } catch (error) {
            message.error('Delete failed: ' + error.message);
        }
    };

    const columns = [
        { title: 'Voucher ID', dataIndex: 'voucherId', key: 'voucherId' },
        { title: 'Date', dataIndex: 'date', key: 'date', render: text => new Date(text).toLocaleDateString() },
        { title: 'Amount', dataIndex: 'amount', key: 'amount' },
        { title: 'Description', dataIndex: 'description', key: 'description' },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <>
                    <Button onClick={() => showModal(record)}>Edit</Button>
                    <Button danger onClick={() => handleDelete(record.id)} style={{ marginLeft: 8 }}>
                        Delete
                    </Button>
                </>
            ),
        },
    ];

    return (
        <div>
            <Button type="primary" onClick={() => showModal()} style={{ marginBottom: 16 }}>
                Add Cash Voucher
            </Button>
            <Table dataSource={vouchers} columns={columns} rowKey="id" />
            <Modal
                title={editingId ? 'Edit Cash Voucher' : 'Add Cash Voucher'}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
            >
                <Form form={form} onFinish={handleSubmit}>
                    <Form.Item name="voucherId" label="Voucher ID" rules={[{ required: true, message: 'Please enter Voucher ID' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Please select a date' }]}>
                        <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Please enter amount' }]}>
                        <Input type="number" />
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                        <Input />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit">
                            {editingId ? 'Update' : 'Create'}
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CashVoucherManagement;