import React, { useState, useEffect } from 'react';
import {
    Table, Button, Modal, Form, Input, Select, Space,
    Typography, message, Tooltip, Popconfirm, InputNumber, Row, Col
} from 'antd';
import moment from 'moment';
import {
    PlusOutlined, EditOutlined, DeleteOutlined,
    FileExcelOutlined, FilePdfOutlined, LoadingOutlined, EyeOutlined
} from '@ant-design/icons';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy, where, query } from 'firebase/firestore';
import { exportToExcel } from '../../../../services/exportService';
import { useAuth } from '../../../../context/AuthContext';
import { db } from '../../../../config/firebase';
import { mmArray, ltrArray } from '../../../../data/dipdata';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { Title } = Typography;
const { Option } = Select;

// Helper to format a Date for datetime-local inputs. Now, it can accept both Date objects and Firebase Timestamps.
const formatDateTimeLocal = (dateInput) => {
    let date;
    // Check if dateInput is a Firestore Timestamp with a toDate() method
    if (dateInput && typeof dateInput.toDate === 'function') {
        date = dateInput.toDate();
    } else {
        date = new Date(dateInput);
    }
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    const hours = ('0' + date.getHours()).slice(-2);
    const minutes = ('0' + date.getMinutes()).slice(-2);
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

function getLiters(mm) {
    if (mm < mmArray[0]) {
        return 0;
    }
    if (mm > mmArray[mmArray.length - 1]) {
        return ltrArray[ltrArray.length - 1];
    }
    for (let i = 0; i < mmArray.length - 1; i++) {
        if (mm >= mmArray[i] && mm <= mmArray[i + 1]) {
            const slope = (ltrArray[i + 1] - ltrArray[i]) / (mmArray[i + 1] - mmArray[i]);
            const liters = ltrArray[i] + slope * (mm - mmArray[i]);
            return Number(liters.toFixed(1));
        }
    }
    return null;
}

const DipChartManagement = () => {
    const { user: currentUser, isAdmin } = useAuth();
    const [form] = Form.useForm();

    const [dipCharts, setDipCharts] = useState([]);
    const [tanks, setTanks] = useState([]);
    const [products, setProducts] = useState([]);
    const [selectedTankForCalc, setSelectedTankForCalc] = useState(null);
    const [historyModalVisible, setHistoryModalVisible] = useState(false);
    const [selectedTankHistory, setSelectedTankHistory] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [buttonLoading, setButtonLoading] = useState(false);

    console.log('dipCharts :>> ', dipCharts);
    useEffect(() => {
        fetchDipCharts();
        fetchTanks();
        fetchProducts();
    }, []);

    const fetchDipCharts = async () => {
        setLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "dipcharts"));
            const list = querySnapshot.docs.map(docSnap => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    ...data,
                    updatedAt: data.updatedAt || Timestamp.fromDate(new Date())
                };
            }).sort((a, b) => {
                const aDate = a.recordedAt && typeof a.recordedAt.toDate === 'function'
                    ? a.recordedAt.toDate()
                    : new Date(a.recordedAt);
                const bDate = b.recordedAt && typeof b.recordedAt.toDate === 'function'
                    ? b.recordedAt.toDate()
                    : new Date(b.recordedAt);
                return bDate - aDate; // Sort in descending order (newest first)
            });
            setDipCharts(list);
        } catch (error) {
            message.error("Failed to fetch dip charts: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchTanks = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "tanks"));
            const list = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            setTanks(list);
        } catch (error) {
            message.error("Failed to fetch tanks: " + error.message);
        }
    };

    const fetchProducts = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            const list = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            setProducts(list);
        } catch (error) {
            message.error("Failed to fetch products: " + error.message);
        }
    };

    const showModal = (record = null) => {
        if (record) {
            setEditingId(record.id);
            form.setFieldsValue({
                tankId: record.tankId,
                dipMm: record.dipMm || record.dipInches,
                dipLiters: getLiters(record.dipMm || record.dipInches),
                recordedAt: record.recordedAt ? formatDateTimeLocal(record.recordedAt) : formatDateTimeLocal(new Date())
            });
        } else {
            setEditingId(null);
            form.resetFields();
            form.setFieldsValue({ recordedAt: formatDateTimeLocal(new Date()) });
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        form.resetFields();
    };

    const handleSubmit = async (values) => {
        setButtonLoading(true);
        try {
            const timestamp = Timestamp.fromDate(new Date());
            let newRecordedAt;

            if (isAdmin) {
                newRecordedAt = Timestamp.fromDate(new Date(values.recordedAt));
            } else {
                if (!editingId) {
                    newRecordedAt = Timestamp.fromDate(new Date());
                } else {
                    const existing = dipCharts.find(d => d.id === editingId);
                    newRecordedAt = existing?.recordedAt || Timestamp.fromDate(new Date());
                }
            }

            const transactionDate = newRecordedAt;
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
                message.error('No shift found for the selected date.');
                setButtonLoading(false);
                return;
            }

            if (editingId) {
                await updateDoc(doc(db, "dipcharts", editingId), {
                    ...values,
                    recordedAt: newRecordedAt,
                    shiftId: selectedShift.id,
                    updatedAt: timestamp
                });
                message.success("Dip chart updated successfully");
            } else {
                await addDoc(collection(db, "dipcharts"), {
                    ...values,
                    recordedAt: newRecordedAt,
                    shiftId: selectedShift.id,
                    updatedAt: timestamp
                });
                message.success("Dip chart created successfully");
            }

            setIsModalVisible(false);
            fetchDipCharts();
        } catch (error) {
            message.error("Operation failed: " + error.message);
        } finally {
            setButtonLoading(false);
        }
    };

    const handleDelete = async (id) => {
        setButtonLoading(true);
        try {
            await deleteDoc(doc(db, "dipcharts", id));
            message.success("Dip chart deleted successfully");
            fetchDipCharts();
        } catch (error) {
            message.error("Delete failed: " + error.message);
        } finally {
            setButtonLoading(false);
        }
    };

    const handleExportToExcel = () => {
        setButtonLoading(true);
        try {
            exportToExcel(dipCharts, 'DipCharts');
            message.success("Exported successfully");
        } catch (error) {
            message.error("Export failed: " + error.message);
        } finally {
            setButtonLoading(false);
        }
    };

    const handleExportToPDF = () => {
        setButtonLoading(true);
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text("Dip Chart Report", pageWidth / 2, margin + 10, { align: 'center' });
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Generated: ${moment().format('DD/MM/YYYY HH:mm:ss')}`, margin, margin + 20);

            let yPosition = margin + 30;
            const tableData = (selectedTankForCalc ?
                dipCharts.filter(d => d.tankId === selectedTankForCalc) : dipCharts
            ).map(record => {
                const tank = tanks.find(t => t.id === record.tankId);
                const tankName = tank ? tank.tankName : 'Unknown';
                const recordedAtDate = record.recordedAt && typeof record.recordedAt.toDate === 'function'
                    ? record.recordedAt.toDate()
                    : new Date(record.recordedAt);
                const recordedAtStr = recordedAtDate.toLocaleString();
                return [
                    tankName,
                    record.dipMm,
                    record.dipLiters,
                    recordedAtStr
                ];
            });
            autoTable(pdf, {
                startY: yPosition,
                head: [['Tank', 'Dip (mm)', 'Volume (L)', 'Recorded Date/Time']],
                body: tableData,
                headStyles: {
                    fillColor: [60, 80, 140],
                    textColor: 255,
                    fontSize: 9,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: { fontSize: 8.5 },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                margin: { left: margin, right: margin },
                theme: 'grid'
            });
            const totalPages = pdf.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            }
            pdf.save(`DipChart_Report_${moment().format('YYYYMMDD')}.pdf`);
            message.success("PDF exported successfully");
        } catch (error) {
            message.error("PDF export failed: " + error.message);
        } finally {
            setButtonLoading(false);
        }
    };

    const columns = [
        {
            title: 'Tank',
            dataIndex: 'tankId',
            key: 'tankId',
            render: (tankId) => {
                const tank = tanks.find(t => t.id === tankId);
                return tank ? tank.tankName : 'Unknown';
            },
            filters: tanks.map(t => ({ text: t.tankName, value: t.id })),
            onFilter: (value, record) => record.tankId === value,
        },
        {
            title: 'Dip (mm)',
            dataIndex: 'dipMm',
            key: 'dipMm',
            sorter: (a, b) => (a.dipMm || 0) - (b.dipMm || 0),
        },
        {
            title: 'Volume (L)',
            dataIndex: 'dipLiters',
            key: 'dipLiters',
            sorter: (a, b) => a.dipLiters - b.dipLiters,
        },
        {
            title: 'Recorded Date/Time',
            dataIndex: 'recordedAt',
            key: 'recordedAt',
            render: (date) => {
                const dateObj = date && typeof date.toDate === 'function'
                    ? date.toDate()
                    : new Date(date);
                return dateObj ? dateObj.toLocaleString() : '-';
            },
            sorter: (a, b) => {
                const aDate = a.recordedAt && typeof a.recordedAt.toDate === 'function'
                    ? a.recordedAt.toDate()
                    : new Date(a.recordedAt);
                const bDate = b.recordedAt && typeof b.recordedAt.toDate === 'function'
                    ? b.recordedAt.toDate()
                    : new Date(b.recordedAt);
                return bDate - aDate; // Sort in descending order (newest first)
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title="Edit">
                        <Button
                            type="default"
                            icon={<EditOutlined />}
                            onClick={() => showModal(record)}
                            size="small"
                            loading={buttonLoading}
                            disabled={buttonLoading}
                        />
                    </Tooltip>
                    <Tooltip title="Delete">
                        <Popconfirm
                            title="Are you sure you want to delete this dip chart entry?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Yes"
                            cancelText="No"
                            okButtonProps={{ loading: buttonLoading }}
                        >
                            <Button
                                danger
                                icon={buttonLoading ? <LoadingOutlined /> : <DeleteOutlined />}
                                size="small"
                                disabled={buttonLoading}
                            />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div className="dipchart-management-container">
            <div className="dipchart-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div>
                    <Title level={3}>Dip Chart Management</Title>
                </div>
                <Space wrap style={{ marginTop: '10px' }}>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => showModal()}
                        loading={buttonLoading}
                        disabled={buttonLoading}
                    >
                        Add Entry
                    </Button>
                    <Button
                        type="default"
                        icon={<FileExcelOutlined />}
                        onClick={handleExportToExcel}
                        loading={buttonLoading}
                        disabled={buttonLoading}
                    >
                        Export to Excel
                    </Button>
                    <Button
                        type="default"
                        icon={<FilePdfOutlined />}
                        onClick={handleExportToPDF}
                        loading={buttonLoading}
                        disabled={buttonLoading}
                    >
                        Export to PDF
                    </Button>
                    <Button
                        type="default"
                        icon={<EyeOutlined />}
                        onClick={() => {
                            if (selectedTankForCalc) {
                                const history = dipCharts.filter(d => d.tankId === selectedTankForCalc);
                                setSelectedTankHistory(history);
                                setHistoryModalVisible(true);
                            } else {
                                message.warning("Please select a tank to view history");
                            }
                        }}
                        disabled={buttonLoading || !selectedTankForCalc}
                    >
                        View History
                    </Button>
                </Space>
            </div>

            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                    <Select
                        placeholder="Filter by tank"
                        style={{ width: '100%' }}
                        onChange={(value) => setSelectedTankForCalc(value)}
                        allowClear
                        disabled={buttonLoading}
                    >
                        {tanks.map(tank => (
                            <Option key={tank.id} value={tank.id}>{tank.tankName}</Option>
                        ))}
                    </Select>
                </Col>
            </Row>

            <div className="table-responsive">
                <Table
                    columns={columns}
                    dataSource={selectedTankForCalc ? dipCharts.filter(d => d.tankId === selectedTankForCalc) : dipCharts}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10, responsive: true }}
                    bordered
                    scroll={{ x: 'max-content' }}
                />
            </div>

            {/* Add/Edit Dip Chart Modal */}
            <Modal
                title={editingId ? "Edit Dip Chart Entry" : "Add New Dip Chart Entry"}
                open={isModalVisible}
                onCancel={handleCancel}
                footer={null}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onValuesChange={(changedValues) => {
                        if (changedValues.dipMm !== undefined) {
                            const liters = getLiters(changedValues.dipMm);
                            form.setFieldsValue({ dipLiters: liters });
                        }
                    }}
                    onFinish={handleSubmit}
                >
                    <Form.Item
                        name="tankId"
                        label="Tank"
                        rules={[{ required: true, message: 'Please select tank' }]}
                    >
                        <Select placeholder="Select tank">
                            {tanks.map(tank => (
                                <Option key={tank.id} value={tank.id}>{tank.tankName}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="dipMm"
                        label="Dip (mm)"
                        rules={[{ required: true, message: 'Please enter dip in mm' }]}
                    >
                        <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="Enter dip in mm" />
                    </Form.Item>
                    <Form.Item
                        name="dipLiters"
                        label="Volume (liters)"
                        rules={[{ required: true, message: 'Volume is required' }]}
                    >
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="Computed volume in liters" disabled />
                    </Form.Item>
                    <Form.Item
                        name="recordedAt"
                        label="Recorded Date/Time"
                        rules={[{ required: true, message: 'Recorded date/time is required' }]}
                    >
                        <Input type="datetime-local" readOnly={!isAdmin} />
                    </Form.Item>
                    <Form.Item>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <Button onClick={handleCancel} disabled={buttonLoading}>Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={buttonLoading} disabled={buttonLoading}>
                                {editingId ? 'Update' : 'Create'}
                            </Button>
                        </div>
                    </Form.Item>
                </Form>
            </Modal>

            {/* History Modal */}
            <Modal
                title={`Dip Chart History for ${tanks.find(t => t.id === selectedTankForCalc)?.tankName || 'Selected Tank'}`}
                open={historyModalVisible}
                onCancel={() => setHistoryModalVisible(false)}
                footer={null}
                width={1000}
            >
                <Table
                    columns={[
                        {
                            title: 'Date/Time',
                            dataIndex: 'recordedAt',
                            key: 'recordedAt',
                            render: (date) => {
                                const dateObj = date && typeof date.toDate === 'function'
                                    ? date.toDate()
                                    : new Date(date);
                                return dateObj ? dateObj.toLocaleString() : '-';
                            },
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
                        }
                    ]}
                    dataSource={selectedTankHistory}
                    rowKey="id"
                    pagination={false}
                    bordered
                    scroll={{ x: 'max-content' }}
                />
            </Modal>
        </div>
    );
};

export default DipChartManagement;