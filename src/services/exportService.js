import moment from 'moment';
import { message } from 'antd';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import autoTable from 'jspdf-autotable';

export const exportToExcel = (data, sheetName = 'Sheet1') => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    // Create blob and download
    const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8'
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sheetName}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
};

const exportReportToPDF = async ({
    settings,
    reportType,
    dateRange,
    reportData,
    filteredDipChartData,
    filteredSalesInvoices,
    filteredSalesReturnInvoices,
    filteredPurchaseInvoices,
    tanks,
    preview,
    dipChartData,
    shiftSummary
}) => {
    try {
        const doc = new jsPDF("p", "mm", "a4");
        const margin = 10;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const usableWidth = pageWidth - margin * 2;
        const sideBySideGap = 5;
        const sideBySideTableWidth = (usableWidth - sideBySideGap) / 2;

        const companyName = settings.name;
        const companyInfo = [
            `Address: ${settings.location}`,
            `Phone: ${settings.companyPhone}`,
        ];

        const parseDate = (d) => {
            if (d && typeof d.toDate === "function") return d.toDate();
            return new Date(d);
        };

        // Header
        try {
            doc.addImage(settings.logoUrl, "PNG", margin, margin, 30, 15);
        } catch (logoError) {
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(companyName, margin, margin + 10);
        }

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        companyInfo.forEach((line, i) => {
            doc.text(line, pageWidth - margin, margin + i * 5, { align: "right" });
        });

        // Title with a simple underline
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        const title = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Sales Report`;
        doc.text(title, pageWidth / 2, margin + 15, { align: "center" });

        doc.setLineWidth(0.3);
        doc.line(pageWidth / 2 - 40, margin + 17, pageWidth / 2 + 40, margin + 17);

        doc.setFontSize(9);
        doc.text(
            `Period: ${moment(dateRange[0]).format("DD/MM/YYYY")} - ${moment(dateRange[1]).format("DD/MM/YYYY")}`,
            margin,
            margin + 25
        );
        doc.text(
            `Generated: ${moment().format("DD/MM/YYYY HH:mm:ss")}`,
            pageWidth - margin,
            margin + 25,
            { align: "right" }
        );
        doc.line(margin, margin + 30, pageWidth - margin, margin + 30);

        let yPosition = margin + 35;

        // Shift Summary (Odhar, Wasooli, Discounts)
        if (shiftSummary) {
            yPosition += 3;
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");

            const odhar = shiftSummary.odhar || 0;
            const wasooli = shiftSummary.wasooli || 0;
            const discounts = shiftSummary.discounts || 0;

            const centerX = pageWidth / 2;

            doc.text(`Odhar: ${odhar.toFixed(2)}`, margin, yPosition);
            doc.text(`Discounts: ${discounts.toFixed(2)}`, centerX, yPosition, { align: "center" });
            doc.text(`Wasool: ${wasooli.toFixed(2)}`, pageWidth - margin, yPosition, { align: "right" });

            yPosition += 3;
            doc.line(margin, yPosition, pageWidth - margin, yPosition);
            yPosition += 3;
        }

        // Sales Summary and Adjustments using autoTable for clean alignment
        yPosition += 3;

        const summaryData = [
            ['Grand Total Sales:', (reportData.grandTotal ?? 0).toFixed(2)],
            ['Wasooli (Adjustment):', (reportData.adjustments.wasooli ?? 0).toFixed(2)],
            ['Odhar (Adjustment):', (reportData.adjustments.odhar ?? 0).toFixed(2)],
        ];

        const otherAdjustmentsData = [
            ['Advance Cash:', (reportData.adjustments.advanceCash ?? 0).toFixed(2)],
            ['Bank Payment:', (reportData.adjustments.bankPayment ?? 0).toFixed(2)],
            ['Karaya:', (reportData.adjustments.karaya ?? 0).toFixed(2)],
            ['Salary:', (reportData.adjustments.salary ?? 0).toFixed(2)],
            ['Expenses:', (reportData.adjustments.expenses ?? 0).toFixed(2)],
        ];

        autoTable(doc, {
            startY: yPosition,
            body: summaryData,
            tableWidth: sideBySideTableWidth,
            margin: { left: margin },
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: { top: 0.5, right: 2, bottom: 0.5, left: 0 } },
            columnStyles: {
                0: { fontStyle: 'bold' },
                1: { halign: 'right' },
            },
        });

        const summaryFinalY = doc.lastAutoTable.finalY;

        autoTable(doc, {
            startY: yPosition,
            body: otherAdjustmentsData,
            tableWidth: sideBySideTableWidth,
            margin: { left: margin + sideBySideTableWidth + sideBySideGap },
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: { top: 0.5, right: 2, bottom: 0.5, left: 0 } },
            columnStyles: {
                0: { fontStyle: 'normal' },
                1: { halign: 'right' },
            },
        });
        const adjFinalY = doc.lastAutoTable.finalY;

        yPosition = Math.max(summaryFinalY, adjFinalY) + 3;
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 3;


        // Nozzle Readings by Category
        if (reportData.readingsByCategory.length > 0) {
            yPosition += 3;
            for (const group of reportData.readingsByCategory) {
                doc.setFontSize(9);
                doc.setFont("helvetica", "bold");
                doc.text(group.categoryName.toUpperCase(), margin, yPosition);
                yPosition += 3;

                const sortedRecords = [...group.records].sort((a, b) => {
                    const getNozzleNumber = (name) => {
                        if (!name) return 0;
                        const match = name.match(/\d+/);
                        return match ? parseInt(match[0], 10) : 0;
                    };

                    const numA = getNozzleNumber(a.nozzleName);
                    const numB = getNozzleNumber(b.nozzleName);

                    return numB - numA;
                });

                const tableData = sortedRecords.map((r) => [
                    r.nozzleName || "Unknown",
                    (r.previousReading ?? 0).toFixed(2),
                    (r.currentReading ?? 0).toFixed(2),
                    (r.salesPrice ?? 0).toFixed(2),
                    (r.volume ?? 0).toFixed(2),
                    (r.salesAmount ?? 0).toFixed(2),
                ]);
                tableData.push([
                    "Subtotal",
                    "",
                    "",
                    "",
                    (group.subtotalVolume ?? 0).toFixed(2),
                    (group.subtotalAmount ?? 0).toFixed(2),
                ]);

                autoTable(doc, {
                    startY: yPosition,
                    head: [["Nozzle", "Previous", "Current", "Price", "Volume", "Amount"]],
                    body: tableData,
                    headStyles: {
                        fontSize: 9,
                        fontStyle: "bold",
                        halign: "center",
                        fillColor: [0, 0, 0],
                        textColor: [255, 255, 255],
                    },
                    bodyStyles: { fontSize: 8 },
                    columnStyles: {
                        0: { halign: "left" },
                        1: { halign: "right" },
                        2: { halign: "right" },
                        3: { halign: "right" },
                        4: { halign: "right" },
                        5: { halign: "right" },
                    },
                    margin: { left: margin, right: margin },
                    theme: "grid",
                    styles: { cellPadding: 0.5, lineWidth: 0.1, lineColor: 200 },
                    alternateRowStyles: { fillColor: [245, 245, 245] },
                    didParseCell: (data) => {
                        if (data.row.index === tableData.length - 1) {
                            data.cell.styles.fontStyle = "bold";
                        }
                    },
                });
                yPosition = doc.lastAutoTable.finalY + 3;
            }
        }

        // Dip Chart and Cumulative Tank Gain/Loss
        yPosition += 3;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        yPosition += 5;

        // --- START OF MODIFICATION ---

        let dipChartTableData = [];
        let cumulativeTankData = [];

        if (filteredDipChartData.length > 0 && tanks.length > 0) {
            dipChartTableData = filteredDipChartData.map((record) => {
                const tank = tanks.find((t) => t.id === record.tankId);
                const tankName = tank ? tank.tankName : "Unknown";
                const bookStock = Number(record.bookStock) || 0;
                const dipLiters = Number(record.dipLiters) || 0;
                const gain = dipLiters > bookStock ? (dipLiters - bookStock).toFixed(2) : "0.00";
                const loss = bookStock > dipLiters ? (bookStock - dipLiters).toFixed(2) : "0.00";
                // Return array without the bookStock value
                return [tankName, record.dipMm || "0", dipLiters.toFixed(2), gain, loss];
            });
        }

        if (dipChartData && tanks.length > 0) {
            cumulativeTankData = tanks.map((tank) => {
                const tankDipRecords = dipChartData.filter(
                    (record) => record.tankId === tank.id && record.bookStock !== undefined
                );
                tankDipRecords.sort(
                    (a, b) => parseDate(a.recordedAt) - parseDate(b.recordedAt)
                );
                const cumulativeGainLoss = tankDipRecords.reduce(
                    (acc, record) => acc + (Number(record.dipLiters || 0) - Number(record.bookStock || 0)),
                    0
                );
                return [tank.tankName, cumulativeGainLoss.toFixed(2)];
            });
        }

        autoTable(doc, {
            startY: yPosition,
            margin: { left: margin },
            tableWidth: sideBySideTableWidth,
            // Head updated to remove "Book Stock"
            head: [["Tank", "Dip (mm)", "Volume (L)", "Gain", "Loss"]],
            // Body for "no data" case updated to have one less column
            body: dipChartTableData.length > 0 ? dipChartTableData : [["No data", "", "", "", ""]],
            headStyles: {
                fontSize: 9,
                fontStyle: "bold",
                halign: "center",
                fillColor: [0, 0, 0],
                textColor: [255, 255, 255],
            },
            bodyStyles: { fontSize: 8 },
            // columnStyles updated to remove the style for the deleted column
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 15, halign: "right" },
                2: { cellWidth: 20, halign: "right" },
                3: { cellWidth: 20, halign: "right" },
                4: { cellWidth: 20, halign: "right" },
            },
            theme: "grid",
            styles: { cellPadding: 0.5, lineWidth: 0.1, lineColor: 200 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        // --- END OF MODIFICATION ---

        const dipChartFinalY = doc.lastAutoTable.finalY;

        autoTable(doc, {
            startY: yPosition,
            margin: { left: margin + sideBySideTableWidth + sideBySideGap + 25 },
            tableWidth: sideBySideTableWidth,
            head: [["Tank", "Cumulative Gain/Loss (L)"]],
            body: cumulativeTankData.length > 0 ? cumulativeTankData : [["No data", "0.00"]],
            headStyles: {
                fontSize: 9,
                fontStyle: "bold",
                halign: "center",
                fillColor: [0, 0, 0],
                textColor: [255, 255, 255],
            },
            bodyStyles: { fontSize: 8, halign: "center" },
            columnStyles: {
                0: { cellWidth: 30 },
                1: { cellWidth: 38, halign: "right" },
            },
            theme: "grid",
            styles: { cellPadding: 0.5, lineWidth: 0.1, lineColor: 200 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        const cumulativeTankFinalY = doc.lastAutoTable.finalY;
        yPosition = Math.max(dipChartFinalY, cumulativeTankFinalY) + 3;
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 3;

        // Sales and Purchase Invoices Side by Side
        if (filteredSalesInvoices.length > 0 || filteredPurchaseInvoices.length > 0) {
            let salesY = yPosition;
            let purchaseY = yPosition;

            if (filteredSalesInvoices.length > 0) {
                const salesData = filteredSalesInvoices.map((inv) => {
                    const total = (inv.quantity || 0) * (inv.unitPrice || 0);
                    const displayTotal = inv.source === 'singlePage'
                        ? '(Excluded)'
                        : total.toFixed(2);

                    return [
                        inv.productName || "Unknown",
                        inv.quantity || 0,
                        inv.unitPrice || 0,
                        displayTotal,
                    ];
                });

                const salesSubtotal = filteredSalesInvoices
                    .filter(inv => inv.source !== 'singlePage')
                    .reduce((sum, inv) => sum + ((inv.quantity || 0) * (inv.unitPrice || 0)), 0);

                salesData.push(["", "", "Subtotal:", salesSubtotal.toFixed(2)]);

                autoTable(doc, {
                    startY: salesY,
                    margin: { left: margin },
                    tableWidth: sideBySideTableWidth,
                    head: [["Product", "Qty", "Unit Price", "Total"]],
                    body: salesData,
                    headStyles: { fontSize: 9, fontStyle: "bold", halign: "center", fillColor: [0, 0, 0], textColor: [255, 255, 255] },
                    bodyStyles: { fontSize: 8 },
                    columnStyles: {
                        1: { halign: "right" },
                        2: { halign: "right" },
                        3: { halign: "right" },
                    },
                    didParseCell: (data) => {
                        if (data.cell.raw === '(Excluded)') {
                            data.cell.styles.fontStyle = 'italic';
                            data.cell.styles.textColor = [150, 150, 150];
                        }
                        if (data.row.index === salesData.length - 1) {
                            data.cell.styles.fontStyle = 'bold';
                        }
                    },
                    theme: "grid",
                    styles: { cellPadding: 0.5, lineWidth: 0.1, lineColor: 200 },
                    alternateRowStyles: { fillColor: [245, 245, 245] },
                });
                salesY = doc.lastAutoTable.finalY;
            }

            if (filteredPurchaseInvoices.length > 0) {
                const purchaseData = filteredPurchaseInvoices.map((inv) => [
                    inv.supplierName || "Unknown",
                    inv.productName || "Unknown",
                    inv.quantity || 0,
                    inv.unitPrice || 0,
                    (inv.amount ?? 0).toFixed(2),
                ]);
                purchaseData.push(["", "", "", "Subtotal:", (reportData.purchaseInvoicesTotal ?? 0).toFixed(2)]);

                autoTable(doc, {
                    startY: purchaseY,
                    margin: { left: margin + sideBySideTableWidth + sideBySideGap },
                    tableWidth: sideBySideTableWidth,
                    head: [["Supplier", "Product", "Qty", "Unit Price", "Total"]],
                    body: purchaseData,
                    headStyles: {
                        fontSize: 9,
                        fontStyle: "bold",
                        halign: "center",
                        fillColor: [0, 0, 0],
                        textColor: [255, 255, 255],
                    },
                    bodyStyles: { fontSize: 8 },
                    columnStyles: {
                        2: { halign: "right" },
                        3: { halign: "right" },
                        4: { halign: "right", fontStyle: "bold" },
                    },
                    theme: "grid",
                    styles: { cellPadding: 0.5, lineWidth: 0.1, lineColor: 200 },
                    alternateRowStyles: { fillColor: [245, 245, 245] },
                });
                purchaseY = doc.lastAutoTable.finalY;
            }

            yPosition = Math.max(salesY, purchaseY) + 3;
        }

        // Sales Return Invoices
        if (filteredSalesReturnInvoices.length > 0) {
            yPosition += 3;
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("SALES RETURN INVOICES", margin, yPosition);
            yPosition += 3;

            const salesReturnData = filteredSalesReturnInvoices.map((inv) => [
                inv.productName || "Unknown",
                inv.quantity || 0,
                inv.unitPrice || 0,
                ((inv.quantity || 0) * (inv.unitPrice || 0)).toFixed(2),
            ]);
            salesReturnData.push(["", "", "Subtotal:", (reportData.salesReturnInvoicesTotal ?? 0).toFixed(2)]);

            autoTable(doc, {
                startY: yPosition,
                head: [["Product", "Qty", "Unit Price", "Total"]],
                body: salesReturnData,
                headStyles: {
                    fontSize: 9,
                    fontStyle: "bold",
                    halign: "center",
                    fillColor: [0, 0, 0],
                    textColor: [255, 255, 255],
                },
                bodyStyles: { fontSize: 8 },
                columnStyles: {
                    1: { halign: "right" },
                    2: { halign: "right" },
                    3: { halign: "right", fontStyle: "bold" },
                },
                margin: { left: margin, right: margin },
                theme: "grid",
                styles: { cellPadding: 0.5, lineWidth: 0.1, lineColor: 200 },
                alternateRowStyles: { fillColor: [245, 245, 245] },
            });
            yPosition = doc.lastAutoTable.finalY + 3;
        }

        // Footer
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
            doc.setFont("helvetica", "italic");
            doc.text(`© ${new Date().getFullYear()} ${companyName} - Confidential`, margin, pageHeight - 10);
            const reportId = `REP-${moment().format("YYYYMMDD")}-${Math.floor(Math.random() * 10000)
                .toString()
                .padStart(4, "0")}`;
            doc.text(`Report ID: ${reportId}`, pageWidth - margin, pageHeight - 10, { align: "right" });
        }

        const filename = `${companyName.replace(/\s+/g, "_")}_${reportType.toUpperCase()}_Report_${moment().format("YYYYMMDD")}.pdf`;

        if (preview) {
            return doc.output("dataurlstring");
        } else {
            doc.save(filename);
            return true;
        }
    } catch (error) {
        console.error("PDF export failed:", error);
        throw new Error("PDF export failed: " + error.message);
    }
};

export default exportReportToPDF;