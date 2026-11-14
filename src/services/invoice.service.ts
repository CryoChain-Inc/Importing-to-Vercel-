import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { invoiceFileName, invoiceHtml, type InvoiceParty } from '../utils/pickupInvoice';
import type { Pickup } from './farmer.service';

/**
 * Makes the invoice PDF and hands it to the share sheet (save to Files, WhatsApp, email).
 * On web there is no file to share, so the browser's print dialog opens (choose "Save as PDF").
 */
export async function downloadInvoice(p: Pickup, farmer: InvoiceParty): Promise<void> {
  const html = invoiceHtml(p, farmer);
  if (Platform.OS === 'web') return printHtmlOnWeb(html, invoiceFileName(p));

  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  // The printer picks a random file name; the share sheet shows ours.
  const named = new File(Paths.cache, invoiceFileName(p));
  if (named.exists) named.delete();
  await new File(uri).move(named);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(named.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Pickup invoice',
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
      document.title = old;
      // print() returns once the dialog is open or closed, depending on the browser: the button is done either way.
      resolve();
      setTimeout(() => frame.remove(), 120_000);
    };
    document.body.appendChild(frame);
  });
}
