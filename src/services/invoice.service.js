const PDFDocument = require('pdfkit');
const { formatPrice } = require('../utils/format');

/**
 * Generates a clean, professional PDF invoice for an order.
 * @param {Object} order - Populated order document
 * @param {Object} stream - Writable stream (e.g. Express res)
 */
function generateInvoicePDF(order, stream) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(stream);

  // --- Header ---
  doc.fillColor('#4f46e5')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('ShopSphere', 50, 50);

  doc.fillColor('#6b7280')
    .fontSize(10)
    .font('Helvetica')
    .text('INVOICE / FACTURE', 50, 78)
    .text('ShopSphere E-Commerce Platform', 50, 92)
    .text('support@shopsphere.test', 50, 106);

  doc.fillColor('#111827')
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(`Invoice Number: ${order.orderNumber}`, 350, 50, { align: 'right' })
    .font('Helvetica')
    .text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 350, 65, { align: 'right' })
    .text(`Order Status: ${order.orderStatus}`, 350, 80, { align: 'right' })
    .text(`Payment: ${order.paymentMethod} (${order.paymentStatus})`, 350, 95, { align: 'right' });

  // Divider
  doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').lineWidth(1).stroke();

  // --- Bill / Ship To ---
  const addr = order.shippingAddress || {};
  const customerName = order.user ? `${order.user.firstName} ${order.user.lastName}` : (order.guestName || addr.fullName || 'Customer');
  const customerEmail = order.user ? order.user.email : (order.guestEmail || 'N/A');

  doc.fillColor('#4f46e5').fontSize(11).font('Helvetica-Bold').text('Billed & Shipped To:', 50, 145);
  doc.fillColor('#111827').fontSize(10).font('Helvetica')
    .text(customerName, 50, 162)
    .text(`Email: ${customerEmail}`, 50, 176)
    .text(`${addr.street || ''}`, 50, 190)
    .text(`${addr.city || ''} ${addr.postalCode || ''}, ${addr.country || ''}`, 50, 204)
    .text(`Phone: ${addr.phone || 'N/A'}`, 50, 218);

  // --- Items Table Header ---
  let y = 250;
  doc.rect(50, y, 495, 24).fillColor('#f8fafc').fill();
  doc.fillColor('#4b5563').fontSize(9).font('Helvetica-Bold')
    .text('ITEM / DESCRIPTION', 60, y + 7)
    .text('SKU', 250, y + 7)
    .text('QTY', 340, y + 7, { align: 'center', width: 40 })
    .text('UNIT PRICE', 390, y + 7, { align: 'right', width: 60 })
    .text('TOTAL', 465, y + 7, { align: 'right', width: 70 });

  y += 24;

  // --- Items Rows ---
  doc.font('Helvetica').fontSize(9).fillColor('#111827');
  (order.items || []).forEach((item) => {
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
    y += 8;
    doc.text(item.name || 'Product', 60, y, { width: 180, ellipsis: true })
      .text(item.sku || '-', 250, y)
      .text(String(item.quantity), 340, y, { align: 'center', width: 40 })
      .text(formatPrice(item.unitPrice), 390, y, { align: 'right', width: 60 })
      .text(formatPrice(item.lineTotal), 465, y, { align: 'right', width: 70 });
    y += 18;
  });

  doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
  y += 15;

  // --- Totals ---
  const totalsX = 350;
  doc.fontSize(10);

  doc.font('Helvetica').text('Subtotal:', totalsX, y)
    .text(formatPrice(order.subtotal), 465, y, { align: 'right', width: 70 });
  y += 16;

  if (order.discount && order.discount > 0) {
    doc.fillColor('#16a34a')
      .text(`Discount (${order.coupon?.code || 'Promo'}):`, totalsX, y)
      .text(`-${formatPrice(order.discount)}`, 465, y, { align: 'right', width: 70 });
    y += 16;
    doc.fillColor('#111827');
  }

  doc.font('Helvetica').text('Shipping:', totalsX, y)
    .text(order.shippingCost === 0 ? 'FREE' : formatPrice(order.shippingCost), 465, y, { align: 'right', width: 70 });
  y += 18;

  doc.rect(totalsX - 10, y - 4, 205, 26).fillColor('#f8fafc').fill();
  doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(12)
    .text('Total Paid:', totalsX, y + 2)
    .text(formatPrice(order.total), 465, y + 2, { align: 'right', width: 70 });

  // --- Footer ---
  doc.fillColor('#9ca3af').fontSize(8).font('Helvetica')
    .text('Thank you for shopping with ShopSphere! If you have any questions about this invoice, contact support@shopsphere.test.', 50, 740, { align: 'center', width: 495 });

  doc.end();
}

module.exports = { generateInvoicePDF };

