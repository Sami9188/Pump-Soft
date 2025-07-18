import React, { useState, useEffect } from 'react';
import {
    Form,
    Input,
    Button,
    message,
    Space,
    Typography,
    InputNumber,
    Row,
    Col,
    Card,
    Modal,
    Table,
    Divider,
    Statistic,
    Popconfirm,
    Select,
    DatePicker,
} from 'antd';
import {
    EditOutlined,
    DeleteOutlined,
    FilePdfOutlined,
    ClearOutlined,
    DownloadOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { Title } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

// --- Placeholder for Company Information ---
// Replace with your actual company details. This could also come from a config file or context.
const COMPANY_INFO = {
    name: 'Your Company Name',
    address: '123 Business Avenue, City, Country',
    phone: '+1 (555) 123-4567',
    email: 'contact@yourcompany.com',
};


// Helper function to consistently convert Firebase Timestamps or other date formats to a JS Date object.
const getJsDate = (timestamp) => {
    if (!timestamp) return null;
    if (timestamp.toDate) { // Firebase v9 Timestamp
        return timestamp.toDate();
    }
    if (timestamp.seconds) { // Older Firebase Timestamp format
        return new Date(timestamp.seconds * 1000);
    }
    if (timestamp instanceof Date) { // Already a JS Date
        return timestamp;
    }
    return null; // Return null for invalid formats
};


function CashflowPage() {
    const [allCashflows, setAllCashflows] = useState([]);
    const [filteredCashflows, setFilteredCashflows] = useState([]);
    const [totalCashIn, setTotalCashIn] = useState(0);
    const [totalCashOut, setTotalCashOut] = useState(0);

    // State for Add/Edit Modal
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [modalType, setModalType] = useState(null);
    const [selectedCashflow, setSelectedCashflow] = useState(null);

    // --- State for Export Modal ---
    const [isExportModalVisible, setIsExportModalVisible] = useState(false);
    const [exportPreviewData, setExportPreviewData] = useState([]);
    const [exportPreviewTotals, setExportPreviewTotals] = useState({ cashIn: 0, cashOut: 0, net: 0 });

    // State for Date Filter
    const [dateFilterRange, setDateFilterRange] = useState([null, null]);
    const [isFiltered, setIsFiltered] = useState(false);

    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const [exportForm] = Form.useForm();

    useEffect(() => {
        fetchCashflows();
    }, []);

    useEffect(() => {
        if (selectedCashflow) {
            form.setFieldsValue({
                amount: selectedCashflow.amount,
                description: selectedCashflow.description,
                cashflowCategory: selectedCashflow.cashflowCategory || undefined,
            });
        }
    }, [selectedCashflow, form]);

    const fetchCashflows = async () => {
        setLoading(true);
        try {
            const cashflowsQuery = query(collection(db, 'cashflow'), orderBy('createdAt', 'desc'));
            const cashflowsSnap = await getDocs(cashflowsQuery);
            const cashflowsData = cashflowsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setAllCashflows(cashflowsData);
            setFilteredCashflows(cashflowsData);
            calculateTotals(cashflowsData);
        } catch (err) {
            message.error('Failed to fetch cashflows: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const calculateTotals = (cashflowsData) => {
        const cashInTotal = cashflowsData.filter(cf => cf.type === 'cashIn').reduce((acc, cf) => acc + (cf.amount || 0), 0);
        const cashOutTotal = cashflowsData.filter(cf => cf.type === 'cashOut').reduce((acc, cf) => acc + (cf.amount || 0), 0);
        setTotalCashIn(cashInTotal);
        setTotalCashOut(cashOutTotal);
    };

    const handleDateFilter = (dates) => {
        setDateFilterRange(dates);
        if (!dates || !dates[0] || !dates[1]) {
            setFilteredCashflows(allCashflows);
            setIsFiltered(false);
            calculateTotals(allCashflows);
            return;
        }
        const [startDate, endDate] = dates;
        const startDateObj = startDate.startOf('day').toDate();
        const endDateObj = endDate.endOf('day').toDate();
        const filtered = allCashflows.filter(cf => {
            const cfDate = getJsDate(cf.createdAt);
            if (!cfDate) return false;
            return cfDate >= startDateObj && cfDate <= endDateObj;
        });
        setFilteredCashflows(filtered);
        setIsFiltered(true);
        calculateTotals(filtered);
        message.success(`Found ${filtered.length} records for the selected date range.`);
    };

    const clearFilter = () => {
        setDateFilterRange([null, null]);
        setFilteredCashflows(allCashflows);
        setIsFiltered(false);
        calculateTotals(allCashflows);
        message.success('Filter cleared. Showing all records.');
    };

    const handleAddCashIn = () => { setModalType('cashIn'); setSelectedCashflow(null); form.resetFields(); setIsModalVisible(true); };
    const handleAddCashOut = () => { setModalType('cashOut'); setSelectedCashflow(null); form.resetFields(); setIsModalVisible(true); };
    const handleEdit = (record) => { setSelectedCashflow(record); setModalType(record.type); setIsModalVisible(true); };

    const handleDelete = async (id) => {
        try {
            await deleteDoc(doc(db, 'cashflow', id));
            message.success('Cashflow deleted successfully');
            await fetchCashflows();
        } catch (err) {
            message.error('Failed to delete cashflow: ' + err.message);
        }
    };

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const data = {
                amount: values.amount,
                description: values.description || '',
                cashflowCategory: values.cashflowCategory || '',
                updatedAt: serverTimestamp(),
            };
            if (selectedCashflow) {
                await updateDoc(doc(db, 'cashflow', selectedCashflow.id), data);
                message.success('Cashflow updated successfully');
            } else {
                await addDoc(collection(db, 'cashflow'), { ...data, type: modalType, createdAt: serverTimestamp() });
                message.success('Cashflow entry added successfully');
            }
            setIsModalVisible(false);
            setSelectedCashflow(null);
            await fetchCashflows();
        } catch (err) {
            message.error('Failed to save cashflow: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- EXPORT MODAL LOGIC ---

    const calculatePreviewTotals = (data) => {
        const cashIn = data.filter(cf => cf.type === 'cashIn').reduce((sum, cf) => sum + (cf.amount || 0), 0);
        const cashOut = data.filter(cf => cf.type === 'cashOut').reduce((sum, cf) => sum + (cf.amount || 0), 0);
        setExportPreviewTotals({ cashIn, cashOut, net: cashIn - cashOut });
    };

    const handleExportClick = () => {
        exportForm.resetFields();
        setExportPreviewData(allCashflows); // Show all records initially
        calculatePreviewTotals(allCashflows); // Calculate totals for all records
        setIsExportModalVisible(true);
    };

    const handleExportFormChange = (_, allValues) => {
        const { dateRange } = allValues;

        if (dateRange && dateRange[0] && dateRange[1]) {
            const [startDate, endDate] = dateRange;
            const startDateObj = startDate.startOf('day').toDate();
            const endDateObj = endDate.endOf('day').toDate();

            const filtered = allCashflows.filter(cf => {
                const cfDate = getJsDate(cf.createdAt);
                if (!cfDate) return false;
                return cfDate >= startDateObj && cfDate <= endDateObj;
            });
            setExportPreviewData(filtered);
            calculatePreviewTotals(filtered);
        } else {
            // If dates are cleared or invalid, show all records
            setExportPreviewData(allCashflows);
            calculatePreviewTotals(allCashflows);
        }
    };

    /**
     * **REWRITTEN & CORRECTED**
     * Generates a professional PDF for the Cashflow Report.
     * @param {string} title - The main title of the report.
     * @param {Array<string>} columns - An array of column headers.
     * @param {Array<Array<string>>} bodyData - The table data (array of rows).
     * @param {string} fileName - The name of the file to save.
     * @param {object} summary - An object containing summary data for the report.
     * @param {object} companyInfo - An object with company details.
     */
    const generateCashflowPDF = (title, columns, bodyData, fileName, summary, companyInfo) => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.width;
        const margin = 15;
        let currentY = margin;

        // --- 1. Company Header ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(41, 128, 185); // Professional Blue
        doc.text(companyInfo.name, pageWidth / 2, currentY, { align: 'center' });
        currentY += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(companyInfo.address, pageWidth / 2, currentY, { align: 'center' });
        currentY += 5;
        doc.setDrawColor(41, 128, 185);
        doc.setLineWidth(0.5);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 10;

        // --- 2. Report Title ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text(title, pageWidth / 2, currentY, { align: 'center' });
        currentY += 12;

        // --- 3. Report Summary Box ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Report Summary', margin, currentY);
        currentY += 5;

        // Summary content
        const summaryBody = [
            ['Report Period:', summary.period],
            ['Total Records:', summary.totalRecords],
            ['Total Cash In:', { content: summary.cashIn, styles: { textColor: [39, 174, 96] } }], // Green
            ['Total Cash Out:', { content: summary.cashOut, styles: { textColor: [231, 76, 60] } }], // Red
            ['Net Balance:', { content: summary.net, styles: { fontStyle: 'bold' } }],
        ];
        autoTable(doc, {
            startY: currentY,
            body: summaryBody,
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 1.5 },
            columnStyles: { 0: { fontStyle: 'bold' } }
        });

        currentY = doc.lastAutoTable.finalY + 10;

        // --- 4. Main Data Table ---
        autoTable(doc, {
            startY: currentY,
            head: [columns],
            body: bodyData,
            theme: 'grid',
            headStyles: {
                fillColor: [41, 128, 185],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
            },
            styles: {
                fontSize: 9,
                cellPadding: 2,
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245],
            },
            columnStyles: {
                0: { cellWidth: 25, halign: 'center' }, // Date
                1: { cellWidth: 20, halign: 'center' }, // Type
                2: { cellWidth: 30, halign: 'left' },   // Category
                3: { cellWidth: 'auto', halign: 'left' }, // Description
                4: { cellWidth: 30, halign: 'right' },  // Amount
            },
            didDrawPage: (data) => {
                // Footer
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
                doc.text(`Generated on: ${moment().format('YYYY-MM-DD HH:mm')}`, margin, doc.internal.pageSize.height - 10);
            },
        });

        doc.save(fileName);
    };

    /**
     * **REWRITTEN & CORRECTED**
     * Prepares data and triggers the generation of the cashflow PDF report.
     */
    const handleProfessionalExport = async (values) => {
        const dataToExport = exportPreviewData;

        if (dataToExport.length === 0) {
            message.warning('No data to export for the selected criteria.');
            return;
        }

        const { cashIn, cashOut, net } = exportPreviewTotals;
        const reportPeriod = (values.dateRange && values.dateRange.length === 2)
            ? `${values.dateRange[0].format('MMM DD, YYYY')} - ${values.dateRange[1].format('MMM DD, YYYY')}`
            : 'All Records';

        const title = 'Cashflow Report';
        const columns = ['Date', 'Type', 'Category', 'Description', 'Amount (Rs)'];

        const tableData = dataToExport.map(item => [
            getJsDate(item.createdAt) ? moment(getJsDate(item.createdAt)).format('YYYY-MM-DD HH:mm') : 'N/A',
            item.type === 'cashIn' ? 'Cash In' : 'Cash Out',
            item.cashflowCategory || '-',
            item.description || '-',
            (item.amount || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ]);

        const summaryData = {
            period: reportPeriod,
            totalRecords: dataToExport.length.toString(),
            cashIn: `Rs ${cashIn.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            cashOut: `Rs ${cashOut.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            net: `Rs ${net.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        };

        const fileName = `Cashflow-Report-${moment().format('YYYYMMDD-HHmm')}.pdf`;

        generateCashflowPDF(title, columns, tableData, fileName, summaryData, COMPANY_INFO);

        setIsExportModalVisible(false);
        message.success(`PDF exported successfully! (${dataToExport.length} records)`);
    };

    const mainColumns = [
        { title: 'Date', dataIndex: 'createdAt', key: 'createdAt', render: (ts) => (getJsDate(ts) ? moment(getJsDate(ts)).format('YYYY-MM-DD HH:mm') : '-') },
        { title: 'Type', dataIndex: 'type', key: 'type', render: (type) => (<span style={{ color: type === 'cashIn' ? '#52c41a' : '#f5222d', fontWeight: 'bold' }}>{type === 'cashIn' ? 'Cash In' : 'Cash Out'}</span>) },
        { title: 'Category', dataIndex: 'cashflowCategory', key: 'cashflowCategory', render: (cat) => cat || '-' },
        { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (amount, record) => (<span style={{ color: record.type === 'cashIn' ? '#52c41a' : '#f5222d', fontWeight: 'bold' }}>Rs {(amount || 0).toLocaleString()}</span>) },
        { title: 'Description', dataIndex: 'description', key: 'description' },
        { title: 'Actions', key: 'actions', render: (_, record) => (<Space size="middle"><Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} /><Popconfirm title="Are you sure?" onConfirm={() => handleDelete(record.id)} okText="Yes" cancelText="No"><Button type="link" icon={<DeleteOutlined />} danger /></Popconfirm></Space>) },
    ];

    const previewColumns = mainColumns.slice(0, -1); // Columns for the preview table inside the modal (no actions)

    return (
        <div className="cashflow-page" style={{ padding: '20px' }}>
            <Card>
                <Title level={3}>Cashflow Management</Title>
                <Row gutter={16} style={{ marginBottom: 16 }} align="middle">
                    <Col xs={24} md={12}>
                        <Space wrap>
                            <RangePicker value={dateFilterRange} onChange={handleDateFilter} style={{ minWidth: '250px' }} />
                            {isFiltered && (<Button icon={<ClearOutlined />} onClick={clearFilter}>Clear Filter</Button>)}
                        </Space>
                    </Col>
                    <Col xs={24} md={12} style={{ textAlign: 'right', marginTop: '10px' }}>
                        <Space wrap>
                            <Button type="primary" onClick={handleAddCashIn}>Add Cash In</Button>
                            <Button type="primary" danger onClick={handleAddCashOut}>Add Cash Out</Button>
                            <Button icon={<FilePdfOutlined />} onClick={handleExportClick} disabled={allCashflows.length === 0}>Export PDF</Button>
                        </Space>
                    </Col>
                </Row>
                <Divider />
                <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col xs={24} sm={8}><Card bordered={false}><Statistic title="Total Cash In (Filtered)" value={totalCashIn} precision={2} prefix="Rs" valueStyle={{ color: '#52c41a' }} /></Card></Col>
                    <Col xs={24} sm={8}><Card bordered={false}><Statistic title="Total Cash Out (Filtered)" value={totalCashOut} precision={2} prefix="Rs" valueStyle={{ color: '#f5222d' }} /></Card></Col>
                    <Col xs={24} sm={8}><Card bordered={false}><Statistic title="Net Balance (Filtered)" value={totalCashIn - totalCashOut} precision={2} prefix="Rs" valueStyle={{ color: totalCashIn - totalCashOut >= 0 ? '#52c41a' : '#f5222d' }} /></Card></Col>
                </Row>
                <Divider />
                <Table columns={mainColumns} dataSource={filteredCashflows} rowKey="id" loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items` }} scroll={{ x: 'max-content' }} />
            </Card>

            <Modal title={selectedCashflow ? `Edit ${selectedCashflow.type === 'cashIn' ? 'Cash In' : 'Cash Out'}` : `Add ${modalType === 'cashIn' ? 'Cash In' : 'Cash Out'}`} open={isModalVisible} onCancel={() => setIsModalVisible(false)} footer={null} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ amount: 0, cashflowCategory: 'manual' }}>
                    <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Please enter an amount' }]}><InputNumber min={0} style={{ width: '100%' }} formatter={v => `Rs ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/Rs\s?|(,*)/g, '')} /></Form.Item>
                    <Form.Item name="cashflowCategory" label="Category" rules={[{ required: true, message: 'Please select a category' }]}><Select placeholder="Select a category"><Option value="adjustment">Adjustment</Option><Option value="salary">Salary</Option><Option value="expense">Expense</Option><Option value="purchase">Purchase</Option><Option value="sale">Sale</Option><Option value="manual">Manual</Option></Select></Form.Item>
                    <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
                    <Form.Item><Space><Button type="primary" htmlType="submit" loading={loading}>{selectedCashflow ? 'Update' : 'Submit'}</Button><Button onClick={() => setIsModalVisible(false)}>Cancel</Button></Space></Form.Item>
                </Form>
            </Modal>

            {/* --- ENHANCED EXPORT MODAL WITH PREVIEW TABLE --- */}
            <Modal
                title="Export Cashflow Report"
                open={isExportModalVisible}
                onCancel={() => setIsExportModalVisible(false)}
                width="80%"
                footer={null}
                destroyOnClose
            >
                <Form form={exportForm} layout="vertical" onFinish={handleProfessionalExport} onValuesChange={handleExportFormChange}>
                    <Row gutter={24} align="bottom">
                        <Col xs={24} md={10}>
                            <Form.Item name="dateRange" label="Filter by Date (Leave blank for all records)">
                                <RangePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>

                        <Col xs={24} md={14}>
                            <Row gutter={16}>
                                <Col xs={24} sm={8}><Statistic title="Preview Cash In" value={exportPreviewTotals.cashIn} precision={2} prefix="Rs" valueStyle={{ color: '#52c41a', fontSize: '1.2em' }} /></Col>
                                <Col xs={24} sm={8}><Statistic title="Preview Cash Out" value={exportPreviewTotals.cashOut} precision={2} prefix="Rs" valueStyle={{ color: '#f5222d', fontSize: '1.2em' }} /></Col>
                                <Col xs={24} sm={8}><Statistic title="Preview Net Balance" value={exportPreviewTotals.net} precision={2} prefix="Rs" valueStyle={{ color: exportPreviewTotals.net >= 0 ? '#52c41a' : '#f5222d', fontSize: '1.2em' }} /></Col>
                            </Row>
                        </Col>
                    </Row>

                    <Divider>Preview ({exportPreviewData.length} Records)</Divider>

                    <Table
                        columns={previewColumns}
                        dataSource={exportPreviewData}
                        rowKey="id"
                        size="small"
                        loading={loading}
                        pagination={false}
                        scroll={{ x: 'max-content', y: 300 }}
                    />

                    <Form.Item style={{ marginTop: 24, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setIsExportModalVisible(false)}>Cancel</Button>
                            <Button type="primary" htmlType="submit" icon={<DownloadOutlined />} loading={loading} disabled={exportPreviewData.length === 0}>Generate PDF Report</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default CashflowPage;