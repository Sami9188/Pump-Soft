import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import {
  Card,
  Table,
  Typography,
  Button,
  Space,
  Statistic,
  Row,
  Col,
  DatePicker,
  Divider,
  Tag,
  message,
  Spin,
  Tooltip,
} from "antd";
import {
  ArrowLeftOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  limit,
} from "firebase/firestore";
import { db } from "../../../../config/firebase";
import moment from "moment";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { exportToExcel } from "../../../../services/exportService";
import TimezoneService from "../../../../services/timezoneService";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function TankDetails() {
  const { tankId } = useParams();
  const navigate = useNavigate();

  const [tank, setTank] = useState(null);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    console.log('🔄 TankDetails component mounted/updated with tankId:', tankId);
    fetchTankDetails();
    fetchAllTransactions();
  }, [tankId]);

  const fetchTankDetails = async () => {
    try {
      const tankDoc = await getDoc(doc(db, "tanks", tankId));
      if (tankDoc.exists()) {
        const tankData = { id: tankDoc.id, ...tankDoc.data() };
        setTank(tankData);

        // Fetch associated product
        if (tankData.product) {
          const productDoc = await getDoc(
            doc(db, "products", tankData.product)
          );
          if (productDoc.exists()) {
            setProduct({ id: productDoc.id, ...productDoc.data() });
          }
        }
      } else {
        message.error("Tank not found");
        navigate("/dashboard/registration/tanks");
      }
    } catch (error) {
      message.error("Failed to fetch tank details: " + error.message);
    }
  };

  const fetchAllTransactions = async () => {
    setLoading(true);
    try {
      const allTransactions = [];
      console.log(`🔍 Fetching transactions for tank: ${tankId}`);
      console.log(`🔍 Tank ID type: ${typeof tankId}, value: ${tankId}`);
      
      // Refresh tank details to get latest stock
      await fetchTankDetails();

      // 1. Fetch nozzle readings (sales through nozzles)
      try {
        console.log(`🔍 Fetching nozzle readings for tank: ${tankId}`);
        console.log(`🔍 Tank ID type: ${typeof tankId}, value: ${tankId}`);
        
        // First, let's check all readings to see what tankIds exist
        const allReadingsQuery = query(collection(db, "readings"), orderBy("timestamp", "desc"), limit(10));
        const allReadingsSnapshot = await getDocs(allReadingsQuery);
        console.log(`🔍 Total readings in collection: ${allReadingsSnapshot.docs.length}`);
        
        allReadingsSnapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          console.log(`🔍 Reading ${index + 1}:`, { 
            id: doc.id,
            tankId: data.tankId, 
            tankIdType: typeof data.tankId,
            matches: data.tankId === tankId,
            salesVolume: data.salesVolume,
            timestamp: data.timestamp?.toDate()
          });
        });
        
        // Try different approaches to match tankId
        let readingsQuery;
        try {
          // First try with string comparison
          readingsQuery = query(
            collection(db, "readings"),
            where("tankId", "==", tankId),
            orderBy("timestamp", "desc")
          );
        } catch (error) {
          console.log("❌ String comparison failed, trying without orderBy:", error.message);
          // If that fails, try without orderBy
          readingsQuery = query(
            collection(db, "readings"),
            where("tankId", "==", tankId)
          );
        }
        let readingsSnapshot;
        try {
          readingsSnapshot = await getDocs(readingsQuery);
          console.log(`🔍 Nozzle readings query result:`, readingsSnapshot.docs.length, 'documents');
        } catch (queryError) {
          console.log("❌ Query failed, fetching all readings and filtering client-side:", queryError.message);
          // Fallback: fetch all readings and filter client-side
          const allReadingsQuery = query(collection(db, "readings"), orderBy("timestamp", "desc"));
          const allReadingsSnapshot = await getDocs(allReadingsQuery);
          readingsSnapshot = {
            docs: allReadingsSnapshot.docs.filter(doc => {
              const data = doc.data();
              return data.tankId === tankId || data.tankId === tankId.toString();
            })
          };
          console.log(`🔍 Client-side filtered readings:`, readingsSnapshot.docs.length, 'documents');
        }
        
        const readings = readingsSnapshot.docs.map((doc) => {
          const data = doc.data();
          console.log(`🔍 Reading data:`, { 
            tankId: data.tankId, 
            type: typeof data.tankId, 
            matches: data.tankId === tankId,
            remainingStockAfter: data.remainingStockAfter,
            salesVolume: data.salesVolume
          });
          return {
            id: doc.id,
            ...data,
            type: "nozzle_sale",
            date: data.timestamp ? TimezoneService.fromFirebaseTimestamp(data.timestamp) : TimezoneService.createServerDate(),
            amount: data.salesAmount || 0,
            quantity: data.salesVolume || 0,
            remainingStockAfter: data.remainingStockAfter || 0, // Add this field for nozzle readings
            description: `Nozzle Sale - ${data.salesVolume || 0}L @ ${
              data.effectivePrice || 0
            }/L`,
          };
        });
        allTransactions.push(...readings);
        console.log(`✅ Found ${readings.length} nozzle readings for tank ${tankId}`);
      } catch (error) {
        console.error("❌ Failed to fetch nozzle readings:", error.message);
        console.error("❌ Error details:", error);
      }

             // 2. Fetch purchase invoices (fuel purchases into tank)
       try {
         console.log(`🔍 Fetching purchase invoices for tank: ${tankId}`);
         
         // First, let's check all purchase invoices to see what tankIds exist
         const allPurchaseQuery = query(collection(db, "purchaseInvoices"), orderBy("date", "desc"), limit(10));
         const allPurchaseSnapshot = await getDocs(allPurchaseQuery);
         console.log(`🔍 Total purchase invoices in collection: ${allPurchaseSnapshot.docs.length}`);
         
         allPurchaseSnapshot.docs.forEach((doc, index) => {
           const data = doc.data();
           console.log(`🔍 Purchase ${index + 1}:`, { 
             id: doc.id,
             tankId: data.tankId, 
             tankIdType: typeof data.tankId,
             matches: data.tankId === tankId,
             purchaseType: data.purchaseType, // Check if it's fuel type
             quantity: data.quantity,
             date: data.date?.toDate()
           });
         });
         
         // Only fetch fuel purchases (purchaseType === "fuel")
         let purchaseQuery;
         try {
           purchaseQuery = query(
             collection(db, "purchaseInvoices"),
             where("tankId", "==", tankId),
             where("purchaseType", "==", "fuel"), // Only fuel purchases
             orderBy("date", "desc")
           );
         } catch (queryError) {
           console.log("❌ Complex query failed, trying simpler approach:", queryError.message);
           // Fallback: fetch all purchases for this tank and filter client-side
           purchaseQuery = query(
             collection(db, "purchaseInvoices"),
             where("tankId", "==", tankId)
           );
         }
         
         let purchaseSnapshot;
         try {
           purchaseSnapshot = await getDocs(purchaseQuery);
         } catch (snapshotError) {
           console.log("❌ Purchase query failed, fetching all and filtering client-side:", snapshotError.message);
           // Final fallback: fetch all purchases and filter client-side
           const allPurchaseQuery = query(collection(db, "purchaseInvoices"), orderBy("date", "desc"));
           const allPurchaseSnapshot = await getDocs(allPurchaseQuery);
           purchaseSnapshot = {
             docs: allPurchaseSnapshot.docs.filter(doc => {
               const data = doc.data();
               return data.tankId === tankId && data.purchaseType === "fuel";
             })
           };
         }
         const purchases = purchaseSnapshot.docs
           .filter(doc => {
             const data = doc.data();
             // Only include fuel purchases
             return data.purchaseType === "fuel";
           })
           .map((doc) => {
             const data = doc.data();
             console.log(`🔍 Purchase data:`, { 
               id: doc.id, 
               tankId: data.tankId, 
               purchaseType: data.purchaseType,
               quantity: data.quantity,
               remainingStockAfter: data.remainingStockAfter
             });
             
             return {
               id: doc.id,
               ...data,
               type: "purchase",
               date: data.date ? TimezoneService.fromFirebaseTimestamp(data.date) : TimezoneService.createServerDate(),
               amount: data.amount || 0,
               quantity: data.quantity || 0,
               remainingStockAfter: data.remainingStockAfter || 0,
               description: `Purchase - ${data.quantity || 0}L @ ${
                 data.unitPrice || 0
               }/L from ${data.supplierName || "Unknown"}`,
             };
           });
         allTransactions.push(...purchases);
         console.log(`Found ${purchases.length} purchase invoices for tank ${tankId}`);
       } catch (error) {
         console.warn("Failed to fetch purchase invoices:", error.message);
       }

             // 3. Fetch sales invoices (fuel sales from tank)
       try {
         console.log(`🔍 Fetching sales invoices for tank: ${tankId}`);
         const salesQuery = query(
           collection(db, "saleInvoices"),
           where("tankId", "==", tankId),
           orderBy("date", "desc")
         );
         const salesSnapshot = await getDocs(salesQuery);
         const sales = salesSnapshot.docs.map((doc) => {
           const data = doc.data();
           console.log(`🔍 Sales data:`, { 
             id: doc.id, 
             tankId: data.tankId, 
             quantity: data.quantity,
             remainingStockAfter: data.remainingStockAfter
           });
           
           return {
             id: doc.id,
             ...data,
             type: "nozzle_sale", // Treat as nozzle sale since it's a fuel sale
             date: data.date ? TimezoneService.fromFirebaseTimestamp(data.date) : TimezoneService.createServerDate(),
             amount: data.amount || 0,
             quantity: data.quantity || 0,
             remainingStockAfter: data.remainingStockAfter || 0,
             description: `Sales Invoice - ${data.quantity || 0}L @ ${
               data.unitPrice || 0
             }/L`,
           };
         });
         allTransactions.push(...sales);
         console.log(`Found ${sales.length} sales invoices for tank ${tankId}`);
       } catch (error) {
         console.warn("Failed to fetch sales invoices:", error.message);
       }

       // 4. Fetch sales return invoices (fuel returned to tank)
       try {
         console.log(`🔍 Fetching sales return invoices for tank: ${tankId}`);
         const salesReturnQuery = query(
           collection(db, "saleReturnInvoices"),
           where("tankId", "==", tankId),
           orderBy("date", "desc")
         );
         const salesReturnSnapshot = await getDocs(salesReturnQuery);
         const salesReturns = salesReturnSnapshot.docs.map((doc) => {
           const data = doc.data();
           console.log(`🔍 Sales Return data:`, { 
             id: doc.id, 
             tankId: data.tankId, 
             quantity: data.quantity,
             remainingStockAfter: data.remainingStockAfter
           });
           
           return {
             id: doc.id,
             ...data,
             type: "sales_return",
             date: data.date ? TimezoneService.fromFirebaseTimestamp(data.date) : TimezoneService.createServerDate(),
             amount: data.amount || 0,
             quantity: data.quantity || 0,
             remainingStockAfter: data.remainingStockAfter || 0,
             description: `Sales Return - ${data.quantity || 0}L @ ${
               data.unitPrice || 0
             }/L to ${data.customerName || "Unknown"}`,
           };
         });
         allTransactions.push(...salesReturns);
         console.log(`Found ${salesReturns.length} sales return invoices for tank ${tankId}`);
       } catch (error) {
         console.warn("Failed to fetch sales return invoices:", error.message);
       }

             // 5. Fetch purchase return invoices (fuel returned from tank)
       try {
         console.log(`🔍 Fetching purchase return invoices for tank: ${tankId}`);
         const purchaseReturnQuery = query(
           collection(db, "purchaseReturnInvoices"),
           where("tankId", "==", tankId),
           orderBy("date", "desc")
         );
         const purchaseReturnSnapshot = await getDocs(purchaseReturnQuery);
         const purchaseReturns = purchaseReturnSnapshot.docs.map((doc) => {
           const data = doc.data();
           console.log(`🔍 Purchase Return data:`, { 
             id: doc.id, 
             tankId: data.tankId, 
             quantity: data.quantity,
             remainingStockAfter: data.remainingStockAfter
           });
           
           return {
             id: doc.id,
             ...data,
             type: "purchase_return",
             date: data.date ? TimezoneService.fromFirebaseTimestamp(data.date) : TimezoneService.createServerDate(),
             amount: data.amount || 0,
             quantity: data.quantity || 0,
             remainingStockAfter: data.remainingStockAfter || 0,
             description: `Purchase Return - ${data.quantity || 0}L @ ${
               data.unitPrice || 0
             }/L to ${data.supplierName || "Unknown"}`,
           };
         });
         allTransactions.push(...purchaseReturns);
         console.log(`Found ${purchaseReturns.length} purchase return invoices for tank ${tankId}`);
       } catch (error) {
         console.warn("Failed to fetch purchase return invoices:", error.message);
       }

       // 6. Fetch dip chart records
      try {
        const dipChartQuery = query(
          collection(db, "dipcharts"),
          where("tankId", "==", tankId),
          orderBy("recordedAt", "desc")
        );
        const dipChartSnapshot = await getDocs(dipChartQuery);
        const dipCharts = dipChartSnapshot.docs.map((doc) => {
          const data = doc.data();
          console.log(`🔍 Dip Chart data:`, { 
            id: doc.id, 
            tankId: data.tankId, 
            dipLiters: data.dipLiters,
            bookStock: data.bookStock,
            remainingStockAfter: data.dipLiters // Use dipLiters as remainingStockAfter for dip readings
          });
          
          return {
            id: doc.id,
            ...data,
            type: "dip_reading",
            date: data.recordedAt ? TimezoneService.fromFirebaseTimestamp(data.recordedAt) : TimezoneService.createServerDate(),
            amount: 0,
            quantity: data.dipLiters || 0,
            remainingStockAfter: data.dipLiters || 0, // Add this field for dip readings
            description: `Dip Reading - ${data.dipMm || 0}mm (${
              data.dipLiters || 0
            }L), Book Stock: ${data.bookStock || 0}L`,
          };
        });
        allTransactions.push(...dipCharts);
        console.log(`✅ Found ${dipCharts.length} dip chart records for tank ${tankId}`);
      } catch (error) {
        console.error("❌ Failed to fetch dip chart records:", error.message);
        console.error("❌ Error details:", error);
      }

      // Sort all transactions by date (newest first)
      allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
      
             // Calculate remaining stock for each transaction based on tank's current state
       if (tank && allTransactions.length > 0) {
         console.log(`🔍 Calculating remaining stock for transactions. Tank current stock: ${tank.remainingStock || tank.openingStock}L`);
         
         // Start with the tank's current remaining stock
         let runningStock = tank.remainingStock || tank.openingStock || 0;
         
         // Process transactions in reverse chronological order (oldest first) to calculate historical stock
         // When working backwards, we need to reverse the operations
         const transactionsWithStock = [...allTransactions].reverse().map((transaction, index) => {
           let stockBeforeTransaction = runningStock;
           let stockAfterTransaction = runningStock;
           
           switch (transaction.type) {
             case "purchase":
               // When working backwards: if current stock is X and purchase was +Q, then before purchase it was X-Q
               stockBeforeTransaction = runningStock - (transaction.quantity || 0);
               stockAfterTransaction = runningStock;
               runningStock = stockBeforeTransaction;
               break;
             case "nozzle_sale":
               // When working backwards: if current stock is X and sale was -Q, then before sale it was X+Q
               stockBeforeTransaction = runningStock + (transaction.quantity || 0);
               stockAfterTransaction = runningStock;
               runningStock = stockBeforeTransaction;
               break;
             case "sales_return":
               // When working backwards: if current stock is X and return was +Q, then before return it was X-Q
               stockBeforeTransaction = runningStock - (transaction.quantity || 0);
               stockAfterTransaction = runningStock;
               runningStock = stockBeforeTransaction;
               break;
             case "purchase_return":
               // When working backwards: if current stock is X and return was -Q, then before return it was X+Q
               stockBeforeTransaction = runningStock + (transaction.quantity || 0);
               stockAfterTransaction = runningStock;
               runningStock = stockBeforeTransaction;
               break;
             case "dip_reading":
               // Dip reading sets the stock to the measured value - this is the actual stock
               stockAfterTransaction = transaction.quantity || 0;
               runningStock = transaction.quantity || 0;
               break;
           }
           
           // Ensure stock doesn't go negative
           runningStock = Math.max(0, runningStock);
           stockAfterTransaction = Math.max(0, stockAfterTransaction);
           
           return {
             ...transaction,
             remainingStockAfter: stockAfterTransaction
           };
         });
         
         // Reverse back to newest first order
         allTransactions = transactionsWithStock.reverse();
         
         console.log(`✅ Calculated remaining stock for ${allTransactions.length} transactions`);
         
         // Debug: Show sample transactions with their calculated stock
         allTransactions.slice(0, 3).forEach((transaction, index) => {
           console.log(`🔍 Transaction ${index + 1}:`, {
             type: transaction.type,
             date: transaction.date,
             quantity: transaction.quantity,
             remainingStockAfter: transaction.remainingStockAfter
           });
         });
       }
      
      console.log(`Total transactions found for tank ${tankId}:`, allTransactions.length);
      console.log('Transaction types found:', [...new Set(allTransactions.map(t => t.type))]);
      
      // Debug: Show all transactions with their details
      allTransactions.forEach((transaction, index) => {
        console.log(`🔍 Transaction ${index + 1}:`, {
          id: transaction.id,
          type: transaction.type,
          date: transaction.date,
          quantity: transaction.quantity,
          amount: transaction.amount,
          description: transaction.description
        });
      });
      
      // If no transactions found, show a helpful message
      if (allTransactions.length === 0) {
        console.log('❌ No transactions found. This could mean:');
        console.log('1. No sales have been recorded yet');
        console.log('2. No purchases have been recorded yet');
        console.log('3. The tank is new and has no activity');
        console.log('4. There might be an issue with the data structure');
        
        // Debug: Check if there are any transactions at all in the collections
        try {
          console.log('🔍 Debug: Checking for any transactions in collections...');
          
          // Check readings collection
          const allReadingsQuery = query(collection(db, "readings"), orderBy("timestamp", "desc"), limit(5));
          const allReadingsSnapshot = await getDocs(allReadingsQuery);
          console.log(`🔍 Total readings in collection: ${allReadingsSnapshot.docs.length}`);
          allReadingsSnapshot.docs.forEach((doc, index) => {
            const data = doc.data();
            console.log(`🔍 Reading ${index + 1}:`, { 
              id: doc.id, 
              tankId: data.tankId, 
              tankIdType: typeof data.tankId,
              timestamp: data.timestamp?.toDate(),
              salesVolume: data.salesVolume 
            });
          });
          
          // Check dipcharts collection
          const allDipChartsQuery = query(collection(db, "dipcharts"), orderBy("recordedAt", "desc"), limit(5));
          const allDipChartsSnapshot = await getDocs(allDipChartsQuery);
          console.log(`🔍 Total dip charts in collection: ${allDipChartsSnapshot.docs.length}`);
          allDipChartsSnapshot.docs.forEach((doc, index) => {
            const data = doc.data();
            console.log(`🔍 Dip Chart ${index + 1}:`, { 
              id: doc.id, 
              tankId: data.tankId, 
              tankIdType: typeof data.tankId,
              recordedAt: data.recordedAt?.toDate(),
              dipLiters: data.dipLiters 
            });
          });
          
        } catch (debugError) {
          console.error('❌ Debug query failed:', debugError);
        }
      }
      
      setTransactions(allTransactions);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
      message.error("Failed to fetch transactions: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = (dateRange
    ? transactions.filter((transaction) => {
        const transactionDate = moment(transaction.date);
        return transactionDate.isBetween(
          dateRange[0],
          dateRange[1],
          "day",
          "[]"
        );
      })
    : transactions
  ).filter((transaction) => transaction.type !== "dip_reading"); // Exclude dip readings from transactions table

  const getTypeColor = (type) => {
    switch (type) {
      case "nozzle_sale":
        return "red";
      case "purchase":
        return "green";
      case "sales_return":
        return "blue";
      case "purchase_return":
        return "orange";
      case "dip_reading":
        return "purple";
      default:
        return "default";
    }
  };

  const getTypeText = (type) => {
    switch (type) {
      case "nozzle_sale":
        return "Nozzle Sale";
      case "purchase":
        return "Purchase";
      case "sales_return":
        return "Sales Return";
      case "purchase_return":
        return "Purchase Return";
      case "dip_reading":
        return "Dip Reading";
      default:
        return "Unknown";
    }
  };

  const calculateSummary = () => {
    const summary = {
      totalPurchases: 0,
      totalSales: 0,
      totalSalesReturns: 0,
      totalPurchaseReturns: 0,
      totalPurchaseQuantity: 0,
      totalSalesQuantity: 0,
      totalSalesReturnQuantity: 0,
      totalPurchaseReturnQuantity: 0,
      netQuantity: 0,
      netAmount: 0,
    };

    filteredTransactions.forEach((transaction) => {
      switch (transaction.type) {
        case "purchase":
          summary.totalPurchases += transaction.amount;
          summary.totalPurchaseQuantity += transaction.quantity;
          summary.netAmount -= transaction.amount; // Purchase is money out
          summary.netQuantity += transaction.quantity; // Purchase adds to tank
          break;
        case "nozzle_sale":
          summary.totalSales += transaction.amount;
          summary.totalSalesQuantity += transaction.quantity;
          summary.netAmount += transaction.amount; // Sale is money in
          summary.netQuantity -= transaction.quantity; // Sale removes from tank
          break;
        case "sales_return":
          summary.totalSalesReturns += transaction.amount;
          summary.totalSalesReturnQuantity += transaction.quantity;
          summary.netAmount -= transaction.amount; // Sales return is money out
          summary.netQuantity += transaction.quantity; // Sales return adds to tank
          break;
        case "purchase_return":
          summary.totalPurchaseReturns += transaction.amount;
          summary.totalPurchaseReturnQuantity += transaction.quantity;
          summary.netAmount += transaction.amount; // Purchase return is money in
          summary.netQuantity -= transaction.quantity; // Purchase return removes from tank
          break;
      }
    });

    return summary;
  };

  const summary = calculateSummary();
  
  // Calculate theoretical stock based on transactions
  const calculateTheoreticalStock = () => {
    if (!tank || transactions.length === 0) return null;
    
    // Start with opening stock
    let theoreticalStock = tank.openingStock || 0;
    
    // Process all transactions chronologically
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sortedTransactions.forEach((transaction) => {
      switch (transaction.type) {
        case "purchase":
          // Purchase adds to tank
          theoreticalStock += transaction.quantity || 0;
          break;
        case "nozzle_sale":
          // Sale removes from tank
          theoreticalStock -= transaction.quantity || 0;
          break;
        case "sales_return":
          // Sales return adds to tank
          theoreticalStock += transaction.quantity || 0;
          break;
        case "purchase_return":
          // Purchase return removes from tank
          theoreticalStock -= transaction.quantity || 0;
          break;
        case "dip_reading":
          // Dip reading doesn't change theoretical stock
          break;
      }
      
      // Ensure stock doesn't go negative
      theoreticalStock = Math.max(0, theoreticalStock);
    });
    
    return theoreticalStock;
  };
  
  const theoreticalStock = calculateTheoreticalStock();

  const columns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (date) => moment(date).format("DD/MM/YYYY HH:mm"),
      sorter: (a, b) => new Date(a.date) - new Date(b.date),
      width: 150,
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (type) => (
        <Tag color={getTypeColor(type)}>{getTypeText(type)}</Tag>
      ),
      filters: [
        { text: "Nozzle Sale", value: "nozzle_sale" },
        { text: "Purchase", value: "purchase" },
        { text: "Sales Return", value: "sales_return" },
        { text: "Purchase Return", value: "purchase_return" },
        { text: "Dip Reading", value: "dip_reading" },
      ],
      onFilter: (value, record) => record.type === value,
      width: 120,
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: {
        showTitle: false,
      },
      render: (description) => (
        <Tooltip placement="topLeft" title={description}>
          {description}
        </Tooltip>
      ),
    },
    {
      title: "Quantity (L)",
      dataIndex: "quantity",
      key: "quantity",
      render: (quantity, record) => {
        const color = ["purchase", "sales_return"].includes(record.type)
          ? "green"
          : "red";
        const sign = ["purchase", "sales_return"].includes(record.type)
          ? "+"
          : "-";
        return (
          <span style={{ color }}>
            {sign}
            {parseFloat(quantity).toFixed(2)}
          </span>
        );
      },
      align: "right",
      width: 120,
    },
    {
      title: "Amount (Rs)",
      dataIndex: "amount",
      key: "amount",
      render: (amount, record) => {
        const color = ["nozzle_sale", "purchase_return"].includes(record.type)
          ? "green"
          : "red";
        const sign = ["nozzle_sale", "purchase_return"].includes(record.type)
          ? "+"
          : "-";
        return (
          <span style={{ color }}>
            {sign}
            {parseFloat(amount).toFixed(2)}
          </span>
        );
      },
      align: "right",
      width: 130,
    },
    {
      title: "Remaining Stock (L)",
      dataIndex: "remainingStockAfter",
      key: "remainingStockAfter",
      render: (stock) =>
        stock !== undefined ? parseFloat(stock).toFixed(2) : "-",
      align: "right",
      width: 150,
    },
  ];

  const handleExportToExcel = () => {
    setExportLoading(true);
    try {
      const exportData = filteredTransactions.map((transaction) => ({
        Date: moment(transaction.date).format("DD/MM/YYYY HH:mm"),
        Type: getTypeText(transaction.type),
        Description: transaction.description,
        "Quantity (L)": parseFloat(transaction.quantity).toFixed(2),
        "Amount (Rs)": parseFloat(transaction.amount).toFixed(2),
        "Remaining Stock (L)":
          transaction.remainingStockAfter !== undefined
            ? parseFloat(transaction.remainingStockAfter).toFixed(2)
            : "-",
      }));

      exportToExcel(exportData, `Tank_${tank?.tankName}_Transactions`);
      message.success("Data exported to Excel successfully");
    } catch (error) {
      message.error("Export failed: " + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportToPDF = () => {
    setExportLoading(true);
    try {
      const doc = new jsPDF("l", "pt", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      doc.text(
        `Tank Transactions Report - ${tank?.tankName || "Unknown"}`,
        40,
        40
      );

      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`Product: ${product?.productName || "Unknown"}`, 40, 60);
      doc.text(
        `Capacity: ${tank ? parseFloat(tank.capacity).toFixed(2) : 0}L`,
        40,
        75
      );
      doc.text(
        `Current Stock: ${
          tank
            ? parseFloat(tank.remainingStock || tank.openingStock).toFixed(2)
            : 0
        }L`,
        40,
        90
      );
      doc.text(`Report Date: ${moment().format("DD/MM/YYYY HH:mm")}`, 40, 105);

      if (dateRange) {
        doc.text(
          `Date Range: ${dateRange[0].format(
            "DD/MM/YYYY"
          )} to ${dateRange[1].format("DD/MM/YYYY")}`,
          40,
          120
        );
      }

      // Summary
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("Summary:", 40, 150);

      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      const summaryY = 170;
      doc.text(
        `Total Purchases: ${summary.totalPurchases.toFixed(
          2
        )} Rs (${summary.totalPurchaseQuantity.toFixed(2)}L)`,
        40,
        summaryY
      );
      doc.text(
        `Total Sales: ${summary.totalSales.toFixed(
          2
        )} Rs (${summary.totalSalesQuantity.toFixed(2)}L)`,
        40,
        summaryY + 15
      );
      doc.text(
        `Sales Returns: ${summary.totalSalesReturns.toFixed(
          2
        )} Rs (${summary.totalSalesReturnQuantity.toFixed(2)}L)`,
        40,
        summaryY + 30
      );
      doc.text(
        `Purchase Returns: ${summary.totalPurchaseReturns.toFixed(
          2
        )} Rs (${summary.totalPurchaseReturnQuantity.toFixed(2)}L)`,
        40,
        summaryY + 45
      );
      doc.text(
        `Net Amount: ${summary.netAmount.toFixed(2)} Rs`,
        40,
        summaryY + 60
      );
      doc.text(
        `Net Quantity: ${summary.netQuantity.toFixed(2)}L`,
        40,
        summaryY + 75
      );

      // Table
      const tableData = filteredTransactions.map((transaction) => [
        moment(transaction.date).format("DD/MM/YYYY HH:mm"),
        getTypeText(transaction.type),
        transaction.description.length > 50
          ? transaction.description.substring(0, 47) + "..."
          : transaction.description,
        parseFloat(transaction.quantity).toFixed(2),
        parseFloat(transaction.amount).toFixed(2),
        transaction.remainingStockAfter !== undefined
          ? parseFloat(transaction.remainingStockAfter).toFixed(2)
          : "-",
      ]);

      doc.autoTable({
        startY: summaryY + 100,
        head: [
          [
            "Date",
            "Type",
            "Description",
            "Quantity (L)",
            "Amount (Rs)",
            "Stock (L)",
          ],
        ],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: "bold",
        },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 80 },
          2: { cellWidth: 250 },
          3: { cellWidth: 70, halign: "right" },
          4: { cellWidth: 80, halign: "right" },
          5: { cellWidth: 70, halign: "right" },
        },
        margin: { left: 40, right: 40 },
        didDrawPage: function (data) {
          // Footer
          doc.setFontSize(8);
          doc.text(
            "Generated by Pump Management System",
            40,
            doc.internal.pageSize.getHeight() - 30
          );
        },
      });

      doc.save(`Tank_${tank?.tankName}_Transactions.pdf`);
      message.success("PDF exported successfully");
    } catch (error) {
      message.error("PDF export failed: " + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!tank) {
    return (
      <div style={{ textAlign: "center", padding: "50px" }}>
        <Title level={4}>Tank not found</Title>
        <Link to="/dashboard/registration/tanks">
          <Button type="primary">Go Back to Tanks</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="tank-details-container">
      <style>
        {`
          .stock-variance-warning {
            background: linear-gradient(135deg, #fff2f0 0%, #ffccc7 100%);
            border: 1px solid #ff4d4f;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 16px;
          }
          .stock-balanced {
            background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%);
            border: 1px solid #52c41a;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 16px;
          }
          .tank-details-container .ant-statistic-content {
            font-weight: 600;
          }
          .tank-details-container .ant-card {
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
        `}
      </style>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space size="middle">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/dashboard/registration/tanks")}
          >
            Back to Tanks
          </Button>
          <Title level={2} style={{ margin: 0 }}>
            Tank Details - {tank.tankName}
          </Title>
        </Space>
      </div>

             {/* Tank Information */}
       <Card style={{ marginBottom: 24 }}>
         <Row gutter={16}>
           <Col span={6}>
             <Statistic
               title="Product"
               value={product?.productName || "Unknown"}
               valueStyle={{ fontSize: "16px" }}
             />
           </Col>
           <Col span={6}>
             <Statistic
               title="Capacity"
               value={parseFloat(tank.capacity).toFixed(2)}
               suffix="L"
             />
           </Col>
           <Col span={6}>
             <Statistic
               title="Current Stock"
               value={parseFloat(
                 tank.remainingStock || tank.openingStock
               ).toFixed(2)}
               suffix="L"
               valueStyle={{ 
                 color: (tank.remainingStock || tank.openingStock) <= (tank.alertThreshold || 0) ? "#ff4d4f" : "#52c41a" 
               }}
             />
           </Col>
           <Col span={6}>
             <Statistic
               title="Alert Threshold"
               value={parseFloat(tank.alertThreshold).toFixed(2)}
               suffix="L"
             />
           </Col>
         </Row>
         
         {/* Stock Status */}
         <Divider />
         <Row gutter={16}>
           <Col span={24}>
             <Text strong>Stock Status: </Text>
             {theoreticalStock !== null ? (
               <Text type={Math.abs((tank.remainingStock || tank.openingStock) - theoreticalStock) < 0.01 ? "success" : "danger"}>
                 {Math.abs((tank.remainingStock || tank.openingStock) - theoreticalStock) < 0.01 ? 
                   "✅ Stock is balanced (Physical = Theoretical)" : 
                   `⚠️ Stock variance detected (Physical: ${parseFloat(tank.remainingStock || tank.openingStock).toFixed(2)}L, Theoretical: ${parseFloat(theoreticalStock).toFixed(2)}L)`
                 }
               </Text>
             ) : (
               <Text type="secondary">No transactions available for stock calculation</Text>
             )}
           </Col>
         </Row>
       </Card>

      {/* Summary Statistics */}
      <Card title="Transaction Summary" style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Total Purchases"
              value={summary.totalPurchases.toFixed(2)}
              suffix="Rs"
              valueStyle={{ color: "#52c41a" }}
            />
            <Text type="secondary">
              {summary.totalPurchaseQuantity.toFixed(2)}L
            </Text>
          </Col>
          <Col span={6}>
            <Statistic
              title="Total Sales"
              value={summary.totalSales.toFixed(2)}
              suffix="Rs"
              valueStyle={{ color: "#1890ff" }}
            />
            <Text type="secondary">
              {summary.totalSalesQuantity.toFixed(2)}L
            </Text>
          </Col>
          <Col span={6}>
            <Statistic
              title="Net Amount"
              value={summary.netAmount.toFixed(2)}
              suffix="Rs"
              valueStyle={{
                color: summary.netAmount >= 0 ? "#52c41a" : "#ff4d4f",
              }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Net Quantity"
              value={summary.netQuantity.toFixed(2)}
              suffix="L"
              valueStyle={{
                color: summary.netQuantity >= 0 ? "#52c41a" : "#ff4d4f",
              }}
            />
          </Col>
        </Row>
        
                 {/* Stock Reconciliation */}
         <Divider />
         <Row gutter={16}>
           <Col span={8}>
             <Statistic
               title="Current Physical Stock"
               value={parseFloat(tank.remainingStock || tank.openingStock).toFixed(2)}
               suffix="L"
               valueStyle={{ color: "#1890ff" }}
             />
           </Col>
           <Col span={8}>
             <Statistic
               title="Theoretical Stock"
               value={theoreticalStock ? parseFloat(theoreticalStock).toFixed(2) : "N/A"}
               suffix="L"
               valueStyle={{ 
                 color: theoreticalStock !== null ? 
                   (Math.abs(theoreticalStock - (tank.remainingStock || tank.openingStock)) < 0.01 ? "#52c41a" : "#ff4d4f") : 
                   "#8c8c8c" 
               }}
             />
           </Col>
           <Col span={8}>
             <Statistic
               title="Variance"
               value={theoreticalStock !== null ? 
                 parseFloat((tank.remainingStock || tank.openingStock) - theoreticalStock).toFixed(2) : 
                 "N/A"
               }
               suffix="L"
               valueStyle={{ 
                 color: theoreticalStock !== null ? 
                   (Math.abs((tank.remainingStock || tank.openingStock) - theoreticalStock) < 0.01 ? "#52c41a" : "#ff4d4f") : 
                   "#8c8c8c" 
               }}
             />
           </Col>
         </Row>
         
         {/* Debug Information */}
         <Divider />
         <Row gutter={16}>
           <Col span={24}>
             <Text type="secondary">
               Debug Info: Found {transactions.length} total transactions | 
               Types: {[...new Set(transactions.map(t => t.type))].join(', ')} | 
               Tank ID: {tankId}
             </Text>
           </Col>
         </Row>
      </Card>

      {/* Filters and Actions */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={12}>
            <Space>
              <Text strong>Date Range Filter:</Text>
              <RangePicker
                value={dateRange}
                onChange={setDateRange}
                format="DD/MM/YYYY"
                placeholder={["Start Date", "End Date"]}
              />
              {dateRange && (
                <Button onClick={() => setDateRange(null)}>Clear Filter</Button>
              )}
            </Space>
          </Col>
          <Col span={12} style={{ textAlign: "right" }}>
            <Space>
                             <Button
                 icon={<ReloadOutlined />}
                 onClick={() => {
                   console.log('🔄 Manual refresh triggered for tank:', tankId);
                   fetchAllTransactions();
                 }}
                 loading={loading}
               >
                 Refresh
               </Button>
               {theoreticalStock !== null && Math.abs((tank.remainingStock || tank.openingStock) - theoreticalStock) > 0.01 && (
                 <Button
                   type="dashed"
                   onClick={() => {
                     console.log('🔄 Stock reconciliation needed');
                     message.info('Stock variance detected. Check transactions for discrepancies.');
                   }}
                   style={{ borderColor: '#ff4d4f', color: '#ff4d4f' }}
                 >
                   ⚠️ Stock Variance
                 </Button>
               )}
              <Button
                icon={<FileExcelOutlined />}
                onClick={handleExportToExcel}
                loading={exportLoading}
              >
                Export Excel
              </Button>
              <Button
                icon={<FilePdfOutlined />}
                onClick={handleExportToPDF}
                loading={exportLoading}
                type="primary"
              >
                Export PDF
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

             {/* Transaction Types Legend */}
       <Card style={{ marginBottom: 16 }} size="small">
         <Row gutter={16}>
           <Col span={24}>
             <Text strong>Fuel Transaction Types & Stock Impact (shown in table):</Text>
             <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
               <li><Text type="success">🟢 Purchase:</Text> Adds fuel to tank (+)</li>
               <li><Text type="danger">🔴 Nozzle Sale:</Text> Removes fuel from tank (-)</li>
               <li><Text type="success">🟢 Sales Return:</Text> Adds fuel back to tank (+)</li>
               <li><Text type="danger">🔴 Purchase Return:</Text> Removes fuel from tank (-)</li>
             </ul>
             <Text type="secondary" style={{ fontSize: '12px' }}>
               Note: Dip readings are used for stock calculations but are not shown in the transactions table.
             </Text>
           </Col>
         </Row>
       </Card>
       
       {/* Transactions Table */}
       <Card title={`Fuel Transactions (${filteredTransactions.length} records)`}>
        {filteredTransactions.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }}>📊</div>
            <p style={{ color: '#8c8c8c', fontSize: '16px', marginBottom: '8px' }}>No fuel transactions found for this tank</p>
            <p style={{ color: '#bfbfbf', fontSize: '14px' }}>
              This could mean:
            </p>
            <ul style={{ color: '#bfbfbf', fontSize: '14px', textAlign: 'left', display: 'inline-block' }}>
              <li>No fuel sales have been recorded yet</li>
              <li>No fuel purchases have been recorded yet</li>
              <li>No sales returns or purchase returns recorded</li>
              <li>The tank is new and has no fuel activity</li>
              <li>Only dip readings are available (not shown in this table)</li>
            </ul>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredTransactions}
            rowKey="id"
            loading={loading}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} transactions`,
              pageSizeOptions: ["10", "25", "50", "100"],
              defaultPageSize: 25,
            }}
            scroll={{ x: 800 }}
            size="small"
          />
        )}
      </Card>
    </div>
  );
}