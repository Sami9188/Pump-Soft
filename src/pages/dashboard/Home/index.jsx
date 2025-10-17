import React, { useState, useEffect } from 'react';
import {
    Card, Row, Col, Statistic, Button, Table, Space,
    Typography, Select, message
} from 'antd';
import { collection, getDocs, query, where, orderBy, Timestamp, limit } from 'firebase/firestore';
import moment from 'moment';
// Import recharts components
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { db } from '../../../config/firebase';

const { Title } = Typography;
const { Option } = Select;

// Colors for the Pie Chart slices
const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF1943'];

const Dashboard = () => {
    // State variables
    const [tanks, setTanks] = useState([]);
    const [dispensers, setDispensers] = useState([]);
    const [products, setProducts] = useState([]);
    const [readings, setReadings] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [adjustments, setAdjustments] = useState([]);
    const [dipCharts, setDipCharts] = useState([]); // New state for historical dipcharts
    const [latestDipCharts, setLatestDipCharts] = useState({});
    const [loading, setLoading] = useState(false);
    const [selectedDateRange, setSelectedDateRange] = useState({
        start: moment().subtract(7, 'days').format('YYYY-MM-DD'),
        end: moment().format('YYYY-MM-DD')
    });
    const [selectedProduct, setSelectedProduct] = useState('all');

    // State for chart data
    const [dailySalesData, setDailySalesData] = useState([]);
    const [dailyVolumeData, setDailyVolumeData] = useState([]); // New state for volume chart
    const [dailyGainLossData, setDailyGainLossData] = useState([]); // New state for gain/loss chart
    const [productSalesData, setProductSalesData] = useState([]);


    // Fetch master data on component mount
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const productSnapshot = await getDocs(collection(db, 'products'));
                const productList = productSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setProducts(productList);

                const dispenserSnapshot = await getDocs(collection(db, 'dispensers'));
                const dispenserList = dispenserSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setDispensers(dispenserList);
            } catch (error) {
                console.error('Error fetching initial data:', error);
                message.error('Failed to load initial product/dispenser data');
            }
        };
        fetchInitialData();
    }, []);

    // Main data fetching effect based on filters
    useEffect(() => {
        fetchDashboardData();
    }, [selectedDateRange, selectedProduct]);


    // Effect to process data for charts whenever readings or products change
    useEffect(() => {
        if (readings.length > 0) {
            // Process data for daily sales (amount) line chart
            const salesByDay = readings.reduce((acc, reading) => {
                const date = moment(reading.timestamp).format('YYYY-MM-DD');
                acc[date] = (acc[date] || 0) + (reading.salesAmount || 0);
                return acc;
            }, {});
            const processedDailyData = Object.keys(salesByDay).map(date => ({ date, sales: salesByDay[date] })).sort((a, b) => moment(a.date).diff(moment(b.date)));
            setDailySalesData(processedDailyData);

            // Process data for daily sales (volume) line chart
            const volumeByDay = readings.reduce((acc, reading) => {
                const date = moment(reading.timestamp).format('YYYY-MM-DD');
                acc[date] = (acc[date] || 0) + (reading.salesVolume || 0);
                return acc;
            }, {});
            const processedDailyVolumeData = Object.keys(volumeByDay).map(date => ({ date, volume: volumeByDay[date] })).sort((a, b) => moment(a.date).diff(moment(b.date)));
            setDailyVolumeData(processedDailyVolumeData);

            // Process data for daily gain/loss line chart
            if (dipCharts.length > 0 && tanks.length > 0) {
                const gainLossByDay = dipCharts.reduce((acc, dipChart) => {
                    const date = moment(dipChart.recordedAt.toDate()).format('YYYY-MM-DD');
                    const tank = tanks.find(t => t.id === dipChart.tankId);
                    if (tank) {
                        const gainLoss = (dipChart.dipLiters || 0) - (tank.remainingStock || 0);
                        acc[date] = (acc[date] || 0) + gainLoss;
                    }
                    return acc;
                }, {});
                const processedGainLossData = Object.keys(gainLossByDay).map(date => ({ 
                    date, 
                    gainLoss: gainLossByDay[date] 
                })).sort((a, b) => moment(a.date).diff(moment(b.date)));
                setDailyGainLossData(processedGainLossData);
            }

            // Process data for product sales pie chart
            if (products.length > 0) {
                const salesByProduct = readings.reduce((acc, reading) => {
                    const product = products.find(p => p.id === reading.productId);
                    if (product) {
                        const productName = product.productName;
                        acc[productName] = (acc[productName] || 0) + (reading.salesAmount || 0);
                    }
                    return acc;
                }, {});
                const processedProductData = Object.keys(salesByProduct).map(name => ({ name, value: salesByProduct[name] }));
                setProductSalesData(processedProductData);
            }
        } else {
            setDailySalesData([]);
            setDailyVolumeData([]);
            setDailyGainLossData([]);
            setProductSalesData([]);
        }
    }, [readings, products, dipCharts, tanks]);


    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const startDate = Timestamp.fromDate(moment(selectedDateRange.start).startOf('day').toDate());
            const endDate = Timestamp.fromDate(moment(selectedDateRange.end).endOf('day').toDate());

            const tankSnapshot = await getDocs(collection(db, 'tanks'));
            const tankList = tankSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTanks(tankList);

            const latestDipChartsPromises = tankList.map(tank =>
                getDocs(query(collection(db, 'dipcharts'), where('tankId', '==', tank.id), orderBy('recordedAt', 'desc'), limit(1)))
            );
            const latestDipChartsResults = await Promise.all(latestDipChartsPromises);
            const latestDipChartsData = {};
            latestDipChartsResults.forEach((snapshot, index) => {
                if (!snapshot.empty) {
                    latestDipChartsData[tankList[index].id] = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                }
            });
            setLatestDipCharts(latestDipChartsData);

            const purchaseQuery = query(collection(db, 'purchaseInvoices'), where('date', '>=', startDate), where('date', '<=', endDate));
            const purchaseSnapshot = await getDocs(purchaseQuery);
            setPurchases(purchaseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            const adjustmentQuery = query(collection(db, 'adjustments'), where('date', '>=', startDate), where('date', '<=', endDate));
            const adjustmentSnapshot = await getDocs(adjustmentQuery);
            setAdjustments(adjustmentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            // Fetch historical dipcharts data within date range for gain/loss chart
            const dipChartsQuery = query(collection(db, 'dipcharts'), where('recordedAt', '>=', startDate), where('recordedAt', '<=', endDate), orderBy('recordedAt', 'desc'));
            const dipChartsSnapshot = await getDocs(dipChartsQuery);
            setDipCharts(dipChartsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            let readingsQuery;
            const baseReadingsQuery = [where('timestamp', '>=', startDate), where('timestamp', '<=', endDate)];
            if (selectedProduct !== 'all') {
                readingsQuery = query(collection(db, 'readings'), ...baseReadingsQuery, where('productId', '==', selectedProduct), orderBy('timestamp', 'desc'));
            } else {
                readingsQuery = query(collection(db, 'readings'), ...baseReadingsQuery, orderBy('timestamp', 'desc'));
            }

            const readingsSnapshot = await getDocs(readingsQuery);
            setReadings(readingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp.toDate() })));
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            message.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    // Metrics Calculations
    const totalSales = readings.reduce((sum, reading) => sum + (reading.salesAmount || 0), 0);
    const totalPurchaseAmount = purchases.reduce((sum, purchase) => sum + (purchase.amount || 0), 0);
    const totalAllExpenses = adjustments.reduce((sum, adj) => sum + (adj.expenses || 0) + (adj.salary || 0) + (adj.karaya || 0) + (adj.advanceCash || 0) + (adj.bankPayment || 0) + (adj.odhar || 0), 0);
    const netProfit = totalSales - totalPurchaseAmount - totalAllExpenses;
    const { totalRemainingStock, totalGainLoss } = tanks.reduce((acc, tank) => {
        const remainingStock = tank.remainingStock || 0;
        acc.totalRemainingStock += remainingStock;
        const latestDipChart = latestDipCharts[tank.id];
        if (latestDipChart) {
            acc.totalGainLoss += ((latestDipChart.dipLiters || 0) - remainingStock);
        }
        return acc;
    }, { totalRemainingStock: 0, totalGainLoss: 0 });
    const recentTransactions = readings.slice(0, 10).map(reading => ({
        id: reading.id,
        date: moment(reading.timestamp).format('YYYY-MM-DD HH:mm'),
        product: products.find(p => p.id === reading.productId)?.productName || 'Unknown',
        dispenser: dispensers.find(d => d.id === reading.dispenserId)?.dispenserName || 'Unknown',
        volume: (reading.salesVolume || 0).toFixed(2),
        amount: `₨${(reading.salesAmount || 0).toFixed(2)}`,
    }));
    const tankTableData = tanks.map(tank => ({
        ...tank,
        remainingStock: tank.remainingStock || 0,
        physicalVolume: latestDipCharts[tank.id]?.dipLiters ?? null,
        gainLoss: latestDipCharts[tank.id] ? (latestDipCharts[tank.id].dipLiters - (tank.remainingStock || 0)) : null,
        latestDipDate: latestDipCharts[tank.id]?.recordedAt ?? null,
    }));

    return (
        <div className="dashboard-container" style={{ padding: '24px' }}>
            <div className="dashboard-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <Title level={3}>Dashboard</Title>
                <Space size="middle" wrap>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <label style={{ marginRight: 8 }}>From:</label>
                        <input type="date" value={selectedDateRange.start} onChange={(e) => setSelectedDateRange(p => ({ ...p, start: e.target.value }))} style={{ marginRight: 16, padding: '4px 8px', borderRadius: '4px', border: '1px solid #d9d9d9' }} />
                        <label style={{ marginRight: 8 }}>To:</label>
                        <input type="date" value={selectedDateRange.end} onChange={(e) => setSelectedDateRange(p => ({ ...p, end: e.target.value }))} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d9d9d9' }} />
                    </div>
                    <Select style={{ width: 180 }} placeholder="Select Product" value={selectedProduct} onChange={(v) => setSelectedProduct(v)}>
                        <Option value="all">All Products</Option>
                        {products.map(p => (<Option key={p.id} value={p.id}>{p.productName}</Option>))}
                    </Select>
                </Space>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}><Card hoverable><Statistic title="Total Sales (PKR)" value={totalSales} precision={2} valueStyle={{ color: '#3f8600' }} prefix="₨" /></Card></Col>
                <Col xs={24} sm={12} lg={6}><Card hoverable><Statistic title="Net Profit (PKR)" value={netProfit} precision={2} valueStyle={{ color: netProfit >= 0 ? '#3f8600' : '#cf1322' }} prefix="₨" /></Card></Col>
                <Col xs={24} sm={12} lg={6}><Card hoverable><Statistic title="Total Remaining Stock (L)" value={totalRemainingStock} precision={2} valueStyle={{ color: '#1890ff' }} /></Card></Col>
                <Col xs={24} sm={12} lg={6}><Card hoverable><Statistic title="Total Gain/Loss (L)" value={totalGainLoss} precision={2} valueStyle={{ color: totalGainLoss >= 0 ? 'green' : 'red' }} prefix={totalGainLoss > 0 ? '+' : ''} /></Card></Col>
            </Row>

            {/* Tank Details Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {tanks.map(tank => {
                    const latestDip = latestDipCharts[tank.id];
                    const physicalVolume = latestDip ? latestDip.dipLiters : null;
                    const gainLoss = physicalVolume !== null ? physicalVolume - tank.remainingStock : null;

                    return (
                        <Col xs={24} sm={12} md={8} key={tank.id}>
                            <Card title={tank.tankName} hoverable>
                                <Row gutter={[16, 16]}>
                                    <Col span={12}><Statistic title="Capacity" value={tank.capacity} suffix="L" /></Col>
                                    <Col span={12}><Statistic title="Remaining Stock" value={(tank.remainingStock || 0).toFixed(2)} suffix="L" /></Col>
                                    {latestDip && (
                                        <>
                                            <Col span={12}><Statistic title="Latest Dip Volume" value={physicalVolume.toFixed(2)} suffix="L" /></Col>
                                            <Col span={12}><Statistic title="Gain/Loss" value={gainLoss.toFixed(2)} suffix="L" valueStyle={{ color: gainLoss > 0 ? 'green' : gainLoss < 0 ? 'red' : 'inherit' }} /></Col>
                                        </>
                                    )}
                                </Row>
                            </Card>
                        </Col>
                    );
                })}
            </Row>

            {/* Daily Trend Charts Section */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} lg={12}>
                    <Card title="Daily Sales Trend (PKR)" hoverable>
                        <ResponsiveContainer width="100%" height={300}>
                            {dailySalesData.length > 0 ? (
                                <LineChart data={dailySalesData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tickFormatter={(tick) => moment(tick).format('MMM DD')} />
                                    <YAxis tickFormatter={(tick) => `₨${(tick / 1000).toFixed(0)}k`} />
                                    <Tooltip formatter={(value) => [`₨${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Sales']} />
                                    <Legend />
                                    <Line type="monotone" dataKey="sales" name="Sales (PKR)" stroke="#8884d8" strokeWidth={2} activeDot={{ r: 8 }} />
                                </LineChart>
                            ) : (<div style={{ textAlign: 'center', color: '#aaa', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No sales data for the selected period.</div>)}
                        </ResponsiveContainer>
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card title="Daily Sales Trend (Liters)" hoverable>
                        <ResponsiveContainer width="100%" height={300}>
                            {dailyVolumeData.length > 0 ? (
                                <LineChart data={dailyVolumeData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tickFormatter={(tick) => moment(tick).format('MMM DD')} />
                                    <YAxis tickFormatter={(tick) => `${tick.toLocaleString()} L`} />
                                    <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} L`, 'Volume']} />
                                    <Legend />
                                    <Line type="monotone" dataKey="volume" name="Volume (L)" stroke="#82ca9d" strokeWidth={2} activeDot={{ r: 8 }} />
                                </LineChart>
                            ) : (<div style={{ textAlign: 'center', color: '#aaa', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No volume data for the selected period.</div>)}
                        </ResponsiveContainer>
                    </Card>
                </Col>
            </Row>

            {/* Daily Gain/Loss Chart Section */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24}>
                    <Card title="Daily Gain/Loss Trend (Liters)" hoverable>
                        <ResponsiveContainer width="100%" height={300}>
                            {dailyGainLossData.length > 0 ? (
                                <LineChart data={dailyGainLossData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tickFormatter={(tick) => moment(tick).format('MMM DD')} />
                                    <YAxis tickFormatter={(tick) => `${tick.toFixed(2)} L`} />
                                    <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} L`, value >= 0 ? 'Gain' : 'Loss']} />
                                    <Legend />
                                    <Line 
                                        type="monotone" 
                                        dataKey="gainLoss" 
                                        name="Gain/Loss (L)" 
                                        stroke="#ff7300" 
                                        strokeWidth={2} 
                                        activeDot={{ r: 8 }} 
                                        dot={(props) => {
                                            const { cx, cy, payload } = props;
                                            const color = payload.gainLoss >= 0 ? '#52c41a' : '#ff4d4f';
                                            return <circle cx={cx} cy={cy} r={3} fill={color} />;
                                        }}
                                    />
                                </LineChart>
                            ) : (<div style={{ textAlign: 'center', color: '#aaa', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No gain/loss data for the selected period.</div>)}
                        </ResponsiveContainer>
                    </Card>
                </Col>
            </Row>

            {/* Product Sales & Recent Transactions */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} lg={8}>
                    <Card title="Sales by Product" hoverable>
                        <ResponsiveContainer width="100%" height={300}>
                            {productSalesData.length > 0 ? (
                                <PieChart>
                                    <Pie data={productSalesData} cx="50%" cy="50%" labelLine={false} outerRadius={80} fill="#8884d8" dataKey="value" nameKey="name">
                                        {productSalesData.map((entry, index) => (<Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />))}
                                    </Pie>
                                    <Tooltip formatter={(value) => `₨${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                    <Legend />
                                </PieChart>
                            ) : (<div style={{ textAlign: 'center', color: '#aaa', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No product sales data.</div>)}
                        </ResponsiveContainer>
                    </Card>
                </Col>
                <Col xs={24} lg={16}>
                    <Card title="Recent Transactions" hoverable>
                        <Table dataSource={recentTransactions} rowKey="id" pagination={false} size="small" scroll={{ x: true, y: 240 }}
                            columns={[
                                { title: 'Date & Time', dataIndex: 'date', key: 'date' },
                                { title: 'Product', dataIndex: 'product', key: 'product' },
                                { title: 'Dispenser', dataIndex: 'dispenser', key: 'dispenser' },
                                { title: 'Volume (L)', dataIndex: 'volume', key: 'volume' },
                                { title: 'Amount (PKR)', dataIndex: 'amount', key: 'amount' },
                            ]}
                        />
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24}>
                    <Card title="Tanks Stock Details" hoverable>
                        <Table dataSource={tankTableData} rowKey="id" pagination={false} scroll={{ x: true }}>
                            <Table.Column title="Tank Name" dataIndex="tankName" key="tankName" />
                            <Table.Column title="Opening Stock (L)" dataIndex="openingStock" key="openingStock" render={value => value ? Number(value).toFixed(2) : '-'} />
                            <Table.Column title="Remaining Stock (L)" dataIndex="remainingStock" key="remainingStock" render={value => Number(value).toFixed(2)} />
                            <Table.Column title="Latest Dip Volume (L)" dataIndex="physicalVolume" key="physicalVolume" render={v => v !== null ? Number(v).toFixed(2) : '-'} />
                            <Table.Column title="Gain/Loss (L)" dataIndex="gainLoss" key="gainLoss" render={v => v !== null ? (<span style={{ color: v > 0 ? 'green' : v < 0 ? 'red' : 'inherit' }}>{v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)}</span>) : '-'} />
                            <Table.Column title="Latest Dip Date" dataIndex="latestDipDate" key="latestDipDate" render={date => date ? moment(date.toDate()).format('YYYY-MM-DD HH:mm') : '-'} />
                        </Table>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Dashboard;