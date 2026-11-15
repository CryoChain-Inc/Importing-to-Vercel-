import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { receiptFileName, receiptHtml } from '../utils/orderReceipt';
import { invoiceFileName, invoiceHtml, type InvoiceParty } from '../utils/pickupInvoice';
import type { Order } from './buyer.service';
import type { Pickup } from './farmer.service';

/**
 * Makes the invoice PDF and hands it to the share sheet (save to Files, WhatsApp, email).
 * On web there is no file to share, so the browser's print dialog opens (choose "Save as PDF").
 */
export const downloadInvoice = (p: Pickup, farmer: InvoiceParty) =>
  savePdf(invoiceHtml(p, farmer), invoiceFileName(p), 'Pickup invoice');

/** The buyer's receipt for a paid order, same hand-off as the invoice. */
export const downloadReceipt = (o: Order) =>
  savePdf(receiptHtml(o), receiptFileName(o), 'Order receipt');

async function savePdf(html: string, fileName: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') return printHtmlOnWeb(html, fileName);

  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  // The printer picks a random file name; the share sheet shows ours.
  const named = new File(Paths.cache, fileName);
  if (named.exists) named.delete();
  await new File(uri).move(named);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(named.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle,
  });
}

// expo-print on web ignores `html` and prints the whole app page, so print the invoice in its own frame.
function printHtmlOnWeb(html: string, fileName: string): Promise<void> {
  return new Promise((resolve) => {
    const name = fileName.replace(/\.pdf$/, '');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.srcdoc = html.replace('<head>', `<head><title>${name}</title>`);
    frame.onload = () => {
      // Browsers suggest the page title as the PDF's file name; the title that counts is the top one.
      const old = document.title;
      document.title = name;
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
      // Some browsers return from print() while the dialog is still open and read the title later, so restore it after printing.
      const restore = () => {
        document.title = old;
      };
      frame.contentWindow!.addEventListener('afterprint', restore);
      setTimeout(restore, 120_000);
      // print() returns once the dialog is open or closed, depending on the browser: the button is done either way.
      resolve();
      setTimeout(() => frame.remove(), 120_000);
    };
    document.body.appendChild(frame);
  });
}
