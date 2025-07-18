import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generates a professionally styled PDF document with company branding
 * @param {string} title - Document title
 * @param {array} columns - Column headers for the table
 * @param {array} data - Data rows for the table
 * @param {string} filename - Output filename with extension
 * @param {object} [summaryData={}] - Optional summary data to display above the table. e.g., { odhar: 10000, wasooli: 7500, remaining: 2500 }
 * @param {object} [options={}] - Custom table options for jspdf-autotable
 * @param {object} [settings={}] - Company settings and branding
 */
const generatePDF = (title, columns, data, filename, summaryData = {}, options = {}, settings = {}) => {
    // Initialize document
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
    });

    // Document properties for metadata
    pdf.setProperties({
        title: title,
        subject: 'Generated Report',
        author: settings.name || 'Company Report',
        creator: settings.name || 'PDF Generator'
    });

    // Brand colors - can be overridden in options
    const brandColors = {
        primary: options.primaryColor || [0, 74, 128], // Deep blue
        secondary: options.secondaryColor || [84, 101, 115], // Slate gray
        accent: options.accentColor || [52, 152, 219], // Bright blue
        background: [249, 250, 252], // Light gray background
        text: [45, 52, 54] // Dark text
    };

    // Add fonts if needed
    pdf.setFont('helvetica', 'normal');

    // Document layout measurements
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;

    // --- MODIFIED: Use a dynamic Y-position tracker ---
    let currentY = 0;

    // ===== HEADER SECTION =====

    // Top accent bar
    pdf.setFillColor(...brandColors.primary);
    pdf.rect(0, 0, pageWidth, 8, 'F');

    // Secondary accent line
    pdf.setFillColor(...brandColors.accent);
    pdf.rect(0, 8, pageWidth, 1, 'F');
    currentY = 15; // Set starting Y position below the accent bars

    // Logo placement
    const logoHeight = 20;
    let headerTextX = margin;
    let headerBottomY = currentY + logoHeight; // Tentative bottom of header

    if (settings.logoUrl) {
        try {
            pdf.addImage(settings.logoUrl, 'PNG', margin, currentY, 30, logoHeight);
            headerTextX = margin + 30 + 10; // Add spacing after logo
        } catch (e) {
            console.error('Error adding logo:', e);
        }
    }

    // Company info section
    const infoX = pageWidth - margin;
    let infoY = currentY;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...brandColors.secondary);
    if (settings.name) {
        pdf.text(settings.name, infoX, infoY, { align: 'right' });
    }

    // --- MODIFIED: Reduced vertical spacing from 7 to 6 ---
    infoY += 6;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);
    if (settings.location) {
        pdf.text(`Address: ${settings.location}`, infoX, infoY, { align: 'right' });
    }

    infoY += 6;
    if (settings.companyPhone) {
        pdf.text(`Phone: ${settings.companyPhone}`, infoX, infoY, { align: 'right' });
    }

    // --- MODIFIED: Calculate the actual bottom of the header ---
    headerBottomY = Math.max(headerBottomY, infoY);
    currentY = headerBottomY + 8; // Position title below the header with a smaller gap

    // Title with professional styling
    pdf.setTextColor(...brandColors.primary);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, headerTextX, currentY);

    // Subtle title underline
    pdf.setDrawColor(...brandColors.accent);
    pdf.setLineWidth(0.5);
    const titleWidth = pdf.getTextWidth(title);
    pdf.line(headerTextX, currentY + 2, headerTextX + titleWidth, currentY + 2);

    // --- MODIFIED: Position info box dynamically below the title ---
    currentY += 10;

    // ===== DOCUMENT INFO BOX =====

    // Clean background box for document info
    const dateBoxHeight = 15;
    pdf.setFillColor(...brandColors.background);
    pdf.setDrawColor(220, 220, 220);
    pdf.roundedRect(margin, currentY, pageWidth - (margin * 2), dateBoxHeight, 3, 3, 'FD');

    // Date and reference information
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(9);
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })}`, margin + 5, currentY + 6);

    // Reference number
    const refNumber = `Ref: ${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    pdf.text(refNumber, pageWidth - margin - 5, currentY + 6, { align: 'right' });

    // Document ID - bottom of info box
    pdf.setFontSize(9);
    pdf.setTextColor(130, 130, 130);
    pdf.text(`Document ID: ${Math.random().toString(36).substring(2, 15).toUpperCase()}`, margin + 5, currentY + 12);

    // --- MODIFIED: Calculate starting position for content with a smaller gap ---
    let contentStartY = currentY + dateBoxHeight + 10;

    // ===== SUMMARY SECTION (ODHAR, WASOOLI, REMAINING) =====
    const summaryItems = [
        { label: 'Odhar (Credit)', value: summaryData.odhar, color: [217, 30, 24] }, // Red-ish for debt
        { label: 'Wasooli (Recovered)', value: summaryData.wasooli, color: [39, 174, 96] }, // Green for recovered
        { label: 'Remaining', value: summaryData.remaining, color: brandColors.secondary } // Neutral
    ].filter(item => typeof item.value !== 'undefined' && item.value !== null);

    if (summaryItems.length > 0) {
        // --- MODIFIED: Reduced box height from 25 to 20 ---
        const boxHeight = 20;
        const gap = 5;
        const totalGapsWidth = (summaryItems.length - 1) * gap;
        const boxWidth = (pageWidth - (margin * 2) - totalGapsWidth) / summaryItems.length;
        let currentX = margin;

        summaryItems.forEach(item => {
            pdf.setFillColor(...brandColors.background);
            pdf.setDrawColor(220, 220, 220);
            pdf.roundedRect(currentX, contentStartY, boxWidth, boxHeight, 3, 3, 'FD');

            // --- MODIFIED: Adjusted text position for smaller box ---
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...brandColors.secondary);
            pdf.text(item.label, currentX + boxWidth / 2, contentStartY + 7, { align: 'center' });

            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...item.color);
            const formattedValue = typeof item.value === 'number' ? item.value.toLocaleString() : String(item.value);
            pdf.text(formattedValue, currentX + boxWidth / 2, contentStartY + 15, { align: 'center' });

            currentX += boxWidth + gap;
        });

        // --- MODIFIED: Reduced space after summary section from 10 to 8 ---
        contentStartY += boxHeight + 8;
    }


    // ===== TABLE SECTION =====

    autoTable(pdf, {
        head: [columns],
        body: data,
        startY: contentStartY,
        styles: {
            fontSize: 9,
            // --- MODIFIED: Reduced cell padding for a tighter table ---
            cellPadding: 3,
            lineColor: [220, 220, 220],
            lineWidth: 0.1,
        },
        headStyles: {
            fillColor: brandColors.primary,
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 10,
            // --- MODIFIED: Reduced header cell padding ---
            cellPadding: 3.5,
            lineWidth: 0,
        },
        alternateRowStyles: {
            fillColor: [245, 247, 250]
        },
        columnStyles: {
            0: {
                fontStyle: 'bold',
                textColor: brandColors.secondary
            }
        },
        didDrawPage: (data) => {
            pdf.setFontSize(8);
            pdf.setTextColor(150, 150, 150);
            pdf.text(`Page ${pdf.internal.getNumberOfPages()}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

            if (settings.name) {
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(...brandColors.primary);
                pdf.text(settings.name, margin, pageHeight - 10);
            }

            pdf.setFont('helvetica', 'italic');
            pdf.setTextColor(150, 150, 150);
            pdf.setFontSize(7);
            pdf.text('CONFIDENTIAL', pageWidth - margin, pageHeight - 10, { align: 'right' });

            pdf.setFillColor(...brandColors.primary);
            pdf.rect(0, pageHeight - 5, pageWidth, 5, 'F');
        },
        ...options,
    });

    // ===== SAVE DOCUMENT =====
    pdf.save(filename);
    return pdf;
};

export { generatePDF };