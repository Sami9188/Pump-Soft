// User.jsx
import React, { useState, useEffect } from 'react';
import { Layout, Table, Button, Modal, Form, Input, Select, message, Card } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../../context/AuthContext';

const { Content } = Layout;

const User = () => {
    const { user, getAllUsers, createUserForAdmin, updateUserRole, deleteUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [searchText, setSearchText] = useState('');
    const [updatingUids, setUpdatingUids] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [deletingUids, setDeletingUids] = useState([]);

    useEffect(() => {
        const fetchUsers = async () => {
            if (user && user.role && user.role.includes("admin")) {
                const allUsers = await getAllUsers();
                setUsers(allUsers);
            }
        };
        fetchUsers();
    }, [user, getAllUsers]);

    if (!user || !user.role || !user.role.includes("admin")) {
        return (
            <Content style={{ margin: '16px', padding: 24, background: '#fff', minHeight: 360 }}>
                <p>You do not have permission to view this page.</p>
            </Content>
        );
    }

    const handleRoleChange = async (uid, newRoles) => {
        setUpdatingUids((prev) => [...prev, uid]);
        try {
            await updateUserRole(uid, newRoles);
            setUsers(users.map((u) => (u.uid === uid ? { ...u, role: newRoles } : u)));
            window.toastify('Role updated successfully', "success");
        } catch (error) {
            message.error(error.message);
        } finally {
            setUpdatingUids((prev) => prev.filter((id) => id !== uid));
        }
    };

    const handleDelete = (uid) => {
        Modal.confirm({
            title: 'Are you sure you want to delete this user?',
            content: 'This will permanently delete the user from both the database and Firebase Authentication.',
            onOk: async () => {
                setDeletingUids((prev) => [...prev, uid]);
                try {
                    await deleteUser(uid); // Ensure this function deletes from both Firebase Auth and your database
                    setUsers(users.filter((u) => u.uid !== uid));
                    window.toastify('User deleted successfully', "success");
                } catch (error) {
                    message.error(error.message || 'Failed to delete user');
                } finally {
                    setDeletingUids((prev) => prev.filter((id) => id !== uid));
                }
            },
        });
    };

    const handleAddUser = async (values) => {
        setIsLoading(true);
        try {
            const roles = Array.isArray(values.role) ? values.role : [values.role];
            const newUser = await createUserForAdmin(values.email, values.password, { role: roles });
            setUsers([...users, newUser]);
            setModalVisible(false);
            form.resetFields();
            window.toastify('User created successfully. Please manually send the credentials to the user.', "success");
        } catch (error) {
            message.error(error.message || 'Failed to create user');
        } finally {
            setIsLoading(false);
        }
    };

    const columns = [
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            sorter: (a, b) => a.email.localeCompare(b.email),
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role, record) => (
                <Select
                    mode="multiple"
                    value={role || []}
                    onChange={(newRoles) => handleRoleChange(record.uid, newRoles)}
                    disabled={updatingUids.includes(record.uid) || !user.role.includes('admin')}
                    className="w-100"
                    placeholder="Select roles"
                >
                    <Select.Option value="user">User</Select.Option>
                    <Select.Option value="admin">Admin</Select.Option>
                    <Select.Option value="salesman">Salesman</Select.Option>
                    <Select.Option value="manager">Manager</Select.Option>
                </Select>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Button
                    type="danger"
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(record.uid)}
                    disabled={!user.role.includes('admin') || deletingUids.includes(record.uid)}
                    loading={deletingUids.includes(record.uid)}
                />
            ),
        },
    ];

    const filteredUsers = users.filter((u) =>
        u.email.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
        <Content style={{ margin: '16px', padding: 24, background: '#fff', minHeight: 360 }}>
            <Card
                title="User Management"
                extra={
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setModalVisible(true)}
                    >
                        Add User
                    </Button>
                }
            >
                <Input.Search
                    placeholder="Search by email"
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ marginBottom: 16, maxWidth: 300 }}
                />
                <Table
                    dataSource={filteredUsers}
                    columns={columns}
                    rowKey="uid"
                    className="table table-striped"
                />
            </Card>
            <Modal
                title="Add New User"
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                footer={[
                    <Button key="cancel" onClick={() => setModalVisible(false)}>
                        Cancel
                    </Button>,
                    <Button key="submit" type="primary" onClick={() => form.submit()} disabled={isLoading} loading={isLoading}>
                        Create User
                    </Button>,
                ]}
            >
                <Form form={form} onFinish={handleAddUser} layout="vertical">
                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[{ required: true, type: 'email', message: 'Please enter a valid email' }]}
                    >
                        <Input placeholder="Enter email" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[{ required: true, min: 6, message: 'Password must be at least 6 characters' }]}
                    >
                        <Input.Password placeholder="Enter password" />
                    </Form.Item>
                    <Form.Item
                        name="role"
                        label="Role"
                        rules={[{ required: true, message: 'Please select at least one role' }]}
                    >
                        <Select mode="multiple" placeholder="Select roles">
                            <Select.Option value="user">User</Select.Option>
                            <Select.Option value="admin">Admin</Select.Option>
                            <Select.Option value="salesman">Salesman</Select.Option>
                            <Select.Option value="manager">Manager</Select.Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </Content>
    );
};

export default User;